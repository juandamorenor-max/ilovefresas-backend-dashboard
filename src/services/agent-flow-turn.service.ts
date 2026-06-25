import { env } from "../config/env.js";
import { HttpError } from "../utils/http.js";
import { logger } from "../utils/logger.js";
import { BotIntegrationService } from "./bot-integration.service.js";
import { PaymentProofValidationService } from "./payment-proof-validation.service.js";
import { TelegramService } from "./telegram.service.js";

type BotChannel = "telegram" | "whatsapp";

interface BotTurnInput {
  channel: BotChannel;
  chatId: string;
  text: string;
  appBaseUrl?: string;
  hasAttachment?: boolean;
  attachmentType?: "image" | "document" | null;
  attachmentFileId?: string | null;
  caption?: string | null;
  mimeType?: string | null;
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
  constructor(
    private readonly botIntegrationService = new BotIntegrationService(),
    private readonly paymentProofValidationService = new PaymentProofValidationService(),
    private readonly telegramService = new TelegramService()
  ) {}

  async handleTurn(input: BotTurnInput) {
    const text = input.text.trim();
    const hasAttachment = Boolean(input.hasAttachment || input.attachmentType || input.attachmentFileId);

    if (this.isNewChatCommand(text)) {
      const conversation = this.botIntegrationService.startNewConversation(input.channel, input.chatId);
      return {
        conversationId: conversation.id,
        sessionId: this.sessionId(input.channel, input.chatId, conversation.id),
        responseText: "Listo 😊 Abrimos un chat nuevo para probar desde cero.",
        shouldSendReply: true,
        source: "newchat"
      };
    }

    const conversation = this.botIntegrationService.getOrCreateActiveConversation(
      input.channel,
      input.chatId
    );

    if (!text && !hasAttachment && conversation.conversationState.next_expected !== "comprobante_pago") {
      return {
        conversationId: conversation.id,
        sessionId: this.sessionId(input.channel, input.chatId, conversation.id),
        responseText: "Escribeme tu pedido o dime si quieres ver el menu 🍓",
        shouldSendReply: true,
        source: "empty_message",
        state: conversation.state,
        orderId: conversation.activeOrderId ?? null
      };
    }

    if (hasAttachment && conversation.conversationState.next_expected !== "comprobante_pago") {
      const responseText = this.buildUnexpectedAttachmentReply(
        String(conversation.conversationState.next_expected ?? "")
      );
      const updatedConversation = this.botIntegrationService.updateConversationState(
        conversation.id,
        {
          customerMessage:
            text ||
            `[${input.attachmentType === "image" ? "imagen" : "archivo"} recibido desde ${input.channel}]`,
          botMessage: responseText,
          mensaje_cliente: responseText,
          next_expected: String(conversation.conversationState.next_expected ?? "pedido")
        }
      );

      return {
        conversationId: conversation.id,
        sessionId: this.sessionId(input.channel, input.chatId, conversation.id),
        responseText,
        shouldSendReply: true,
        source: "backend_unexpected_attachment",
        state: updatedConversation?.state ?? conversation.state,
        orderId: updatedConversation?.activeOrderId ?? null
      };
    }

    if (this.isPaymentProof(text) && conversation.conversationState.next_expected !== "comprobante_pago") {
      const responseText = this.buildPrematurePaymentProofReply(
        String(conversation.conversationState.next_expected ?? "")
      );
      const updatedConversation = this.botIntegrationService.updateConversationState(
        conversation.id,
        {
          customerMessage: text,
          botMessage: responseText,
          mensaje_cliente: responseText,
          next_expected: String(conversation.conversationState.next_expected ?? "pedido")
        }
      );

      return {
        conversationId: conversation.id,
        sessionId: this.sessionId(input.channel, input.chatId, conversation.id),
        responseText,
        shouldSendReply: true,
        source: "backend_premature_payment_proof",
        state: updatedConversation?.state ?? conversation.state,
        orderId: updatedConversation?.activeOrderId ?? null
      };
    }

    if (
      conversation.conversationState.next_expected === "confirmacion" &&
      this.isCustomerConfirmation(text) &&
      this.botIntegrationService.requiresPaymentProofForConversation(conversation.id)
    ) {
      const responseText =
        this.botIntegrationService.buildPaymentInstructionsForConversation(conversation.id) ??
        "Para continuar con la revision del pedido, enviame el comprobante del pago por aqui 😊";
      const updatedConversation = this.botIntegrationService.updateConversationState(
        conversation.id,
        {
          customerMessage: text,
          botMessage: responseText,
          mensaje_cliente: responseText,
          pedido_confirmado_por_cliente: true,
          comprobante_pago_pendiente: true,
          next_expected: "comprobante_pago"
        }
      );

      return {
        conversationId: conversation.id,
        sessionId: this.sessionId(input.channel, input.chatId, conversation.id),
        responseText,
        shouldSendReply: true,
        source: "backend_payment_instructions",
        state: updatedConversation?.state ?? conversation.state,
        orderId: updatedConversation?.activeOrderId ?? null
      };
    }

    if (conversation.conversationState.next_expected === "comprobante_pago") {
      const proofContext = this.botIntegrationService.getPaymentProofContext(conversation.id);
      const proofValidation = await this.paymentProofValidationService.validate({
        channel: input.channel,
        text,
        caption: input.caption,
        attachmentType: input.attachmentType,
        attachmentFileId: input.attachmentFileId,
        mimeType: input.mimeType,
        expectedPaymentMethod: proofContext.expectedPaymentMethod,
        expectedTotal: proofContext.expectedTotal
      });
      const paymentProofReceived = proofValidation.isLikelyPaymentProof;
      const responseText = paymentProofReceived
        ? "Comprobante recibido! 😊 Un operario te va a confirmar cuando tu pedido este enviado."
        : hasAttachment
          ? "Recibi la imagen, pero no alcanzo a validar que sea un comprobante de pago. Enviame una captura donde se vea el valor, estado exitoso y referencia 😊"
        : this.botIntegrationService.buildPaymentInstructionsForConversation(conversation.id) ??
          "Para continuar con tu pedido, enviame el comprobante del pago por aqui.";
      const updatedConversation = this.botIntegrationService.updateConversationState(
        conversation.id,
        {
          customerMessage: text,
          botMessage: responseText,
          mensaje_cliente: responseText,
          comprobante_pago_recibido: paymentProofReceived,
          payment_proof_note: paymentProofReceived
            ? this.buildPaymentProofNote(input, proofValidation)
            : undefined,
          next_expected: paymentProofReceived ? "humano" : "comprobante_pago",
          needs_human: paymentProofReceived
        }
      );

      const order = paymentProofReceived
        ? this.botIntegrationService.createOrderForReview(conversation.id)
        : null;

      return {
        conversationId: conversation.id,
        sessionId: this.sessionId(input.channel, input.chatId, conversation.id),
        responseText,
        shouldSendReply: true,
        source: paymentProofReceived
          ? "backend_payment_proof_received"
          : "backend_waiting_payment_proof",
        paymentProofValidation: proofValidation,
        state: updatedConversation?.state ?? conversation.state,
        orderId: order?.id ?? updatedConversation?.activeOrderId ?? null,
        reviewReadiness: this.botIntegrationService.getOrderReviewReadiness(conversation.id)
      };
    }

    if (this.isMenuPdfRequest(text)) {
      const responseText = "Claro 😊 Te envio el Menu 2026 por aqui 🍓";
      const menuAttachment = this.buildMenuAttachment(input.appBaseUrl);
      const menuPdfSent = await this.sendMenuPdfIfPossible(input.channel, input.chatId, menuAttachment);
      const updatedConversation = this.botIntegrationService.updateConversationState(
        conversation.id,
        {
          customerMessage: text,
          botMessage: responseText,
          mensaje_cliente: responseText,
          next_expected: String(conversation.conversationState.next_expected ?? "pedido")
        }
      );

      return {
        conversationId: conversation.id,
        sessionId: this.sessionId(input.channel, input.chatId, conversation.id),
        responseText,
        shouldSendReply: true,
        source: "backend_menu_pdf",
        menuPdfSent,
        attachments: menuAttachment ? [menuAttachment] : [],
        state: updatedConversation?.state ?? conversation.state,
        orderId: updatedConversation?.activeOrderId ?? null
      };
    }

    const unavailableMatches = this.botIntegrationService.findUnavailableCatalogMatches(text);
    if (unavailableMatches.products.length > 0 || unavailableMatches.modifiers.length > 0) {
      const responseText = this.botIntegrationService.buildUnavailableCatalogReply(unavailableMatches);
      const updatedConversation = this.botIntegrationService.updateConversationState(
        conversation.id,
        {
          customerMessage: text,
          botMessage: responseText,
          mensaje_cliente: responseText,
          next_expected: "pedido"
        }
      );

      return {
        conversationId: conversation.id,
        sessionId: this.sessionId(input.channel, input.chatId, conversation.id),
        responseText,
        shouldSendReply: true,
        source: "backend_catalog_availability",
        state: updatedConversation?.state ?? conversation.state,
        orderId: updatedConversation?.activeOrderId ?? null
      };
    }

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

  private isCustomerConfirmation(text: string) {
    const normalized = this.normalize(text);
    return ["si", "correcto", "listo", "asi esta bien", "confirmo"].some(
      (phrase) => normalized === phrase || normalized.includes(phrase)
    );
  }

  private isPaymentProof(text: string) {
    const normalized = this.normalize(text);
    return [
      "comprobante",
      "soporte",
      "transferencia hecha",
      "ya pague",
      "ya lo pague",
      "te envio el pago",
      "adjunto"
    ].some((phrase) => normalized.includes(phrase));
  }

  private buildPaymentProofNote(
    input: BotTurnInput,
    proofValidation: Awaited<ReturnType<PaymentProofValidationService["validate"]>>
  ) {
    return [
      input.text.trim() || input.caption?.trim() || `Comprobante recibido por ${input.attachmentType ?? "archivo"} desde ${input.channel}.`,
      `Validacion: ${proofValidation.source}, confianza ${proofValidation.confidence.toFixed(2)}.`,
      proofValidation.reason
    ].filter(Boolean).join(" ");
  }

  private buildUnexpectedAttachmentReply(nextExpected: string) {
    return "Recibi la imagen, pero todavia no puedo recibir comprobantes. Primero cerramos el pedido, te doy el total y despues te pido el comprobante 😊";
  }

  private buildPrematurePaymentProofReply(nextExpected: string) {
    if (nextExpected === "confirmacion") {
      return "Todavia no puedo recibir comprobantes. Primero confirmame si el resumen esta correcto; despues te doy el total y te pido el comprobante 😊";
    }

    if (nextExpected === "datos") {
      return "Todavia no puedo recibir comprobantes. Primero terminamos los datos del pedido, luego te muestro el total y ahi si te pido el comprobante 😊";
    }

    return "Todavia no puedo recibir comprobantes. Primero armamos y cerramos el pedido; despues te doy el total y te pido el comprobante 😊";
  }

  private isMenuPdfRequest(text: string) {
    const normalized = this.normalize(text);
    if (!normalized) {
      return false;
    }

    return (
      /\b(menu|carta|catalogo|pdf)\b/.test(normalized) ||
      /\b(que venden|que productos tienen|que opciones tienen|muestrame las opciones)\b/.test(normalized)
    );
  }

  private buildMenuAttachment(appBaseUrl?: string) {
    if (!env.MENU_PDF_PATH) {
      return null;
    }

    return {
      type: "document" as const,
      pathOrUrl: this.publicMenuPdfUrl(appBaseUrl),
      filename: "Menu 2026.pdf",
      caption: "Menu 2026 I Love Fresas 🍓"
    };
  }

  private publicMenuPdfUrl(appBaseUrl?: string) {
    const baseUrl = appBaseUrl?.trim() || env.APP_BASE_URL;
    return `${baseUrl.replace(/\/+$/, "")}/bot/menu/pdf`;
  }

  private async sendMenuPdfIfPossible(
    channel: BotChannel,
    chatId: string,
    attachment: ReturnType<AgentFlowTurnService["buildMenuAttachment"]>
  ) {
    if (channel !== "telegram" || !attachment || !env.TELEGRAM_CLIENT_BOT_TOKEN) {
      return false;
    }

    try {
      await this.telegramService.sendDocument(
        env.TELEGRAM_CLIENT_BOT_TOKEN,
        chatId,
        attachment.pathOrUrl,
        attachment.caption
      );
      return true;
    } catch (error) {
      logger.warn("Menu PDF send failed", {
        channel,
        chatId,
        error: error instanceof Error ? error.message : "unknown"
      });
      return false;
    }
  }

  private normalize(text: string) {
    return text
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .trim();
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
