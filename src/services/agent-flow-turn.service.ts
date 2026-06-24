import { env } from "../config/env.js";
import { HttpError } from "../utils/http.js";
import { logger } from "../utils/logger.js";
import { BotIntegrationService } from "./bot-integration.service.js";

type BotChannel = "telegram" | "whatsapp";

interface BotTurnInput {
  channel: BotChannel;
  chatId: string;
  text: string;
}

interface FlowisePredictionResponse {
  text?: unknown;
  answer?: unknown;
  response?: unknown;
  output?: unknown;
  json?: unknown;
  agentFlowExecutedData?: unknown;
  [key: string]: unknown;
}

const fallbackReply =
  "Perdon, tuve un problema conectando el asistente. Te paso con el equipo para ayudarte.";

export class AgentFlowTurnService {
  constructor(private readonly botIntegrationService = new BotIntegrationService()) {}

  async handleTurn(input: BotTurnInput) {
    const text = input.text.trim();
    if (!text) {
      return {
        responseText: "Escribeme tu pedido o dime si quieres ver el menu.",
        shouldSendReply: true,
        source: "empty_message"
      };
    }

    if (this.isNewChatCommand(text)) {
      const conversation = this.botIntegrationService.startNewConversation(input.channel, input.chatId);
      return {
        conversationId: conversation.id,
        sessionId: this.sessionId(input.channel, input.chatId, conversation.id),
        responseText: "Listo, abrimos un chat nuevo para probar desde cero.",
        shouldSendReply: true,
        source: "newchat"
      };
    }

    const conversation = this.botIntegrationService.getOrCreateActiveConversation(
      input.channel,
      input.chatId
    );
    const catalogoDisponible = this.botIntegrationService.getAvailableCatalog();
    const sessionId = this.sessionId(input.channel, input.chatId, conversation.id);
    const rawFlowiseResponse = await this.callFlowise({
      question: text,
      sessionId,
      conversationState: conversation.conversationState,
      catalogoDisponible
    });
    const flowisePatch = this.extractFlowisePatch(rawFlowiseResponse);
    const responseText = this.extractResponseText(rawFlowiseResponse, flowisePatch);
    const updatedConversation = this.botIntegrationService.updateConversationState(
      conversation.id,
      {
        ...flowisePatch,
        customerMessage: text,
        botMessage: responseText,
        mensaje_cliente: responseText
      }
    );

    let order = null;
    let reviewReadiness = null;
    if (this.shouldCreateReviewOrder(flowisePatch)) {
      reviewReadiness = this.botIntegrationService.getOrderReviewReadiness(conversation.id);
      order = this.botIntegrationService.createOrderForReview(conversation.id);
    }

    const result: Record<string, unknown> = {
      conversationId: conversation.id,
      sessionId,
      responseText,
      shouldSendReply: Boolean(responseText.trim()),
      source: "flowise_agentflow",
      responseSourceField: this.extractResponseSource(rawFlowiseResponse, flowisePatch),
      state: updatedConversation?.state ?? conversation.state,
      orderId: order?.id ?? updatedConversation?.activeOrderId ?? null,
      reviewReadiness
    };

    if (env.BOT_TURN_INCLUDE_RAW) {
      result.rawFlowiseResponse = rawFlowiseResponse;
    }

    return result;
  }

  private async callFlowise(input: {
    question: string;
    sessionId: string;
    conversationState: Record<string, unknown>;
    catalogoDisponible: unknown;
  }): Promise<FlowisePredictionResponse> {
    if (!env.FLOWISE_CHATFLOW_ID) {
      throw new HttpError(503, "FLOWISE_CHATFLOW_ID is not configured");
    }

    const baseUrl = env.FLOWISE_API_URL.replace(/\/+$/, "");
    const url = `${baseUrl}/api/v1/prediction/${encodeURIComponent(env.FLOWISE_CHATFLOW_ID)}`;
    const body = this.buildFlowiseBody(input);

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(env.FLOWISE_API_KEY ? { Authorization: `Bearer ${env.FLOWISE_API_KEY}` } : {})
      },
      body: JSON.stringify(body)
    });

    const payload = await response.text();
    if (!response.ok) {
      logger.warn("Flowise agentflow request failed", {
        status: response.status,
        body: payload.slice(0, 500)
      });
      throw new HttpError(502, `Flowise request failed with status ${response.status}`);
    }

    try {
      return JSON.parse(payload) as FlowisePredictionResponse;
    } catch {
      return { text: payload };
    }
  }

  private buildFlowiseBody(input: {
    question: string;
    sessionId: string;
    conversationState: Record<string, unknown>;
    catalogoDisponible: unknown;
  }) {
    const vars = Object.fromEntries(
      Object.entries(input.conversationState).map(([key, value]) => [key, this.stringifyVar(value)])
    );

    return {
      question: [
        "<contexto_externo_n8n_backend>",
        ...Object.entries(input.conversationState).map(
          ([key, value]) => `${key}: ${this.stringifyVar(value)}`
        ),
        "</contexto_externo_n8n_backend>",
        "",
        "<ultimo_mensaje_cliente>",
        input.question,
        "</ultimo_mensaje_cliente>"
      ].join("\n"),
      sessionId: input.sessionId,
      overrideConfig: {
        vars: {
          ...vars,
          catalogo_disponible: JSON.stringify(input.catalogoDisponible)
        }
      }
    };
  }

  private extractFlowisePatch(response: FlowisePredictionResponse) {
    const merged: Record<string, unknown> = {};
    const executedData = response.agentFlowExecutedData;

    if (Array.isArray(executedData)) {
      for (const node of executedData) {
        const output = this.getPath(node, ["data", "output"]);
        if (this.isRecord(output)) {
          this.mergeOutput(merged, output);
        }
      }
    }

    if (this.isRecord(response.json)) {
      this.mergeOutput(merged, response.json);
    }

    this.mergeOutput(merged, response);
    return merged;
  }

  private mergeOutput(target: Record<string, unknown>, output: Record<string, unknown>) {
    for (const [key, value] of Object.entries(output)) {
      if (!this.shouldMergeValue(value)) {
        continue;
      }

      if (key === "state_patch" && this.isRecord(value)) {
        this.mergeOutput(target, value);
        continue;
      }

      if (key === "datos" && this.isRecord(value)) {
        this.mergeOutput(target, value);
        continue;
      }

      if (key === "items_json") {
        target.items = value;
        continue;
      }

      target[key] = value;
    }
  }

  private extractResponseText(response: FlowisePredictionResponse, patch: Record<string, unknown>) {
    const candidates = [
      patch.mensaje_cliente,
      patch.respuesta,
      response.text,
      response.answer,
      response.response,
      response.output,
      this.getPath(response, ["data", "text"]),
      this.getPath(response, ["data", "mensaje_cliente"])
    ];

    for (const candidate of candidates) {
      if (typeof candidate === "string" && candidate.trim()) {
        return candidate.trim();
      }
    }

    return fallbackReply;
  }

  private extractResponseSource(response: FlowisePredictionResponse, patch: Record<string, unknown>) {
    if (typeof patch.mensaje_cliente === "string" && patch.mensaje_cliente.trim()) return "mensaje_cliente";
    if (typeof patch.respuesta === "string" && patch.respuesta.trim()) return "respuesta";
    if (typeof response.text === "string" && response.text.trim()) return "text";
    if (typeof response.answer === "string" && response.answer.trim()) return "answer";
    if (typeof response.response === "string" && response.response.trim()) return "response";
    return "fallback";
  }

  private shouldCreateReviewOrder(patch: Record<string, unknown>) {
    return (
      patch.pedido_confirmado_por_cliente === true ||
      patch.pedido_confirmado_por_cliente === "true" ||
      patch.pedido_confirmado === true ||
      patch.pedido_confirmado === "true" ||
      patch.send_to_review === true ||
      patch.send_to_review === "true"
    );
  }

  private shouldMergeValue(value: unknown) {
    if (value === undefined || value === null) return false;
    if (typeof value === "string") {
      const trimmed = value.trim();
      return Boolean(trimmed) && trimmed !== "[]";
    }
    return true;
  }

  private getPath(value: unknown, path: string[]) {
    return path.reduce<unknown>((current, key) => {
      if (!this.isRecord(current)) {
        return undefined;
      }

      return current[key];
    }, value);
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }

  private stringifyVar(value: unknown) {
    if (value === undefined || value === null) return "";
    if (typeof value === "string") return value;
    if (typeof value === "boolean" || typeof value === "number") return String(value);
    return JSON.stringify(value);
  }

  private sessionId(channel: BotChannel, chatId: string, conversationId: string) {
    return `${channel}:${chatId}:${conversationId}`;
  }

  private isNewChatCommand(text: string) {
    return /^\/(?:newchat|newbot)\b/i.test(text.trim());
  }
}
