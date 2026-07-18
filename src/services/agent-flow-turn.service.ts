import { env } from "../config/env.js";
import { HttpError } from "../utils/http.js";
import { logger } from "../utils/logger.js";
import { BotIntegrationService } from "./bot-integration.service.js";
import { PaymentProofValidationService } from "./payment-proof-validation.service.js";
import { TelegramService } from "./telegram.service.js";
import { BotQuoteService } from "./bot-quote.service.js";

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
  "Perdón, tuve un problema conectando el asistente. Te paso con el equipo para ayudarte.";

export class AgentFlowTurnService {
  constructor(
    private readonly botIntegrationService = new BotIntegrationService(),
    private readonly paymentProofValidationService = new PaymentProofValidationService(),
    private readonly telegramService = new TelegramService(),
    private readonly botQuoteService = new BotQuoteService()
  ) {}

  async handleTurn(input: BotTurnInput) {
    const text = input.text.trim();
    const hasAttachment = Boolean(input.hasAttachment || input.attachmentType || input.attachmentFileId);
    const agentsOwnDecisions = env.TURN_DECISION_OWNER === "agents";

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
        responseText: "Escríbeme tu pedido o dime si quieres ver el menú 🍓",
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
      !agentsOwnDecisions &&
      conversation.conversationState.next_expected === "confirmacion" &&
      this.shouldProceedFromConfirmation(text, conversation.conversationState.ultima_pregunta_bot)
    ) {
      const requiredContinuation = this.botIntegrationService.buildNextOrderStepReply(conversation.id);
      if (
        requiredContinuation?.source === "backend_required_options_guardrail" ||
        requiredContinuation?.nextExpected === "datos"
      ) {
        const updatedConversation = this.botIntegrationService.updateConversationState(
          conversation.id,
          {
            customerMessage: text,
            botMessage: requiredContinuation.responseText,
            mensaje_cliente: requiredContinuation.responseText,
            next_expected: requiredContinuation.nextExpected
          }
        );

        return {
          conversationId: conversation.id,
          sessionId: this.sessionId(input.channel, input.chatId, conversation.id),
          responseText: requiredContinuation.responseText,
          shouldSendReply: true,
          source: requiredContinuation.source,
          state: updatedConversation?.state ?? conversation.state,
          orderId: updatedConversation?.activeOrderId ?? null,
          reviewReadiness: this.botIntegrationService.getOrderReviewReadiness(conversation.id)
        };
      }
    }

    if (
      !agentsOwnDecisions &&
      conversation.conversationState.next_expected === "confirmacion" &&
      this.shouldProceedFromConfirmation(text, conversation.conversationState.ultima_pregunta_bot) &&
      !this.botIntegrationService.requiresPaymentProofForConversation(conversation.id)
    ) {
      const order = this.botIntegrationService.createOrderForReview(conversation.id);
      const responseText = order
        ? "Listo 😊 Tu pedido quedó en revisión con el equipo. Te confirmamos antes de prepararlo 🍓"
        : "Antes de pasarlo a revisión necesito que completemos los datos pendientes del pedido.";
      const updatedConversation = this.botIntegrationService.updateConversationState(
        conversation.id,
        {
          customerMessage: text,
          botMessage: responseText,
          mensaje_cliente: responseText,
          pedido_confirmado_por_cliente: Boolean(order),
          needs_human: Boolean(order),
          next_expected: order ? "humano" : "datos"
        }
      );

      return {
        conversationId: conversation.id,
        sessionId: this.sessionId(input.channel, input.chatId, conversation.id),
        responseText,
        shouldSendReply: true,
        source: order ? "backend_order_review" : "backend_missing_review_data",
        state: updatedConversation?.state ?? conversation.state,
        orderId: order?.id ?? updatedConversation?.activeOrderId ?? null,
        reviewReadiness: this.botIntegrationService.getOrderReviewReadiness(conversation.id)
      };
    }

    if (
      !agentsOwnDecisions &&
      conversation.conversationState.next_expected === "confirmacion" &&
      this.shouldProceedFromConfirmation(text, conversation.conversationState.ultima_pregunta_bot) &&
      this.botIntegrationService.requiresPaymentProofForConversation(conversation.id)
    ) {
      const responseText =
        this.botIntegrationService.buildPaymentInstructionsForConversation(conversation.id) ??
        "Para continuar con la revisión del pedido, envíame el comprobante del pago por aquí 😊";
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
        ? "Comprobante recibido 😊 Un operario te va a confirmar cuando tu pedido esté enviado."
        : hasAttachment
          ? "Recibí la imagen, pero no alcanzo a validar que sea un comprobante de pago. Envíame una captura donde se vea el valor, estado exitoso y referencia 😊"
        : this.botIntegrationService.buildPaymentInstructionsForConversation(conversation.id) ??
          "Para continuar con tu pedido, envíame el comprobante del pago por aquí.";
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

      const confirmedOrderInput = paymentProofReceived && agentsOwnDecisions
        ? this.botIntegrationService.getConfirmedOrderInput(
            conversation.id,
            true,
            this.buildPaymentProofNote(input, proofValidation)
          )
        : null;
      const order = paymentProofReceived
        ? agentsOwnDecisions && confirmedOrderInput
          ? this.botQuoteService.confirmOrder(confirmedOrderInput)
          : this.botIntegrationService.createOrderForReview(conversation.id)
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
      const responseText = "Claro 😊 Te envío el Menu 2026 por aquí 🍓";
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

    const directedModifierTurn = agentsOwnDecisions
      ? null
      : this.botIntegrationService.handleDirectedModifierTurn(conversation.id, text);
    if (directedModifierTurn) {
      const updatedConversation = this.botIntegrationService.getOrCreateActiveConversation(
        input.channel,
        input.chatId
      );

      return {
        conversationId: conversation.id,
        sessionId: this.sessionId(input.channel, input.chatId, conversation.id),
        responseText: directedModifierTurn.responseText,
        shouldSendReply: true,
        source: directedModifierTurn.source,
        state: updatedConversation.state,
        orderId: updatedConversation.activeOrderId ?? null,
        reviewReadiness: this.botIntegrationService.getOrderReviewReadiness(conversation.id)
      };
    }

    const requiredOptionsTurn = agentsOwnDecisions
      ? null
      : this.botIntegrationService.handleRequiredOptionsTurn(conversation.id, text);
    if (requiredOptionsTurn) {
      const updatedConversation = this.botIntegrationService.getOrCreateActiveConversation(
        input.channel,
        input.chatId
      );

      return {
        conversationId: conversation.id,
        sessionId: this.sessionId(input.channel, input.chatId, conversation.id),
        responseText: requiredOptionsTurn.responseText,
        shouldSendReply: true,
        source: requiredOptionsTurn.source,
        state: updatedConversation.state,
        orderId: updatedConversation.activeOrderId ?? null,
        reviewReadiness: this.botIntegrationService.getOrderReviewReadiness(conversation.id)
      };
    }

    const unavailableMatches = agentsOwnDecisions
      ? { products: [], modifiers: [] }
      : this.botIntegrationService.findUnavailableCatalogMatches(text);
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

    const oneLineOrderPatch = agentsOwnDecisions
      ? null
      : this.botIntegrationService.buildOneLineOrderPatch(text);
    if (
      oneLineOrderPatch &&
      String(conversation.conversationState.items ?? "[]") === "[]"
    ) {
      this.botIntegrationService.updateConversationState(conversation.id, {
        ...oneLineOrderPatch,
        customerMessage: text
      });
      const responseText =
        this.botIntegrationService.buildConfirmationSummary(conversation.id) ??
        "Listo, ya tengo tu pedido y tus datos. Confirmame si esta correcto.";
      const updatedConversation = this.botIntegrationService.updateConversationState(
        conversation.id,
        {
          botMessage: responseText,
          mensaje_cliente: responseText,
          next_expected: "confirmacion"
        }
      );

      return {
        conversationId: conversation.id,
        sessionId: this.sessionId(input.channel, input.chatId, conversation.id),
        responseText,
        shouldSendReply: true,
        source: "backend_one_line_order",
        state: updatedConversation?.state ?? conversation.state,
        orderId: updatedConversation?.activeOrderId ?? null,
        reviewReadiness: this.botIntegrationService.getOrderReviewReadiness(conversation.id)
      };
    }

    if (!agentsOwnDecisions && this.isOutOfScopeQuestion(text)) {
      const responseText = this.buildOutOfScopeReply();
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
        source: "backend_out_of_scope_guardrail",
        state: updatedConversation?.state ?? conversation.state,
        orderId: updatedConversation?.activeOrderId ?? null
      };
    }

    const catalogoDisponible = this.botIntegrationService.getAvailableCatalog();
    const sessionId = this.sessionId(input.channel, input.chatId, conversation.id);
    let rawFlowiseResponse = await this.callFlowise({
      question: text,
      sessionId,
      conversationState: conversation.conversationState,
      catalogoDisponible
    });
    let flowisePatch = this.extractFlowisePatch(rawFlowiseResponse);
    let responseText = this.extractResponseText(rawFlowiseResponse, flowisePatch);
    let updatedConversation = this.botIntegrationService.updateConversationState(
      conversation.id,
      {
        ...flowisePatch,
        customerMessage: text
      }
    );

    if (agentsOwnDecisions && this.isAgentAction(flowisePatch, "request_quote")) {
      const quoteRequest = this.botIntegrationService.getQuoteRequest(conversation.id);
      const quote = quoteRequest
        ? this.botQuoteService.createQuote(quoteRequest)
        : { quoteId: "", blockingErrors: ["conversation_draft_not_available"] };
      this.botIntegrationService.setActiveQuote(conversation.id, quote.quoteId || null);
      rawFlowiseResponse = await this.callFlowise({
        question: [
          "<tool_result_quote>",
          JSON.stringify(quote),
          "</tool_result_quote>",
          "Presenta el resumen validado o explica brevemente el bloqueo."
        ].join("\n"),
        sessionId,
        conversationState: {
          ...(updatedConversation?.conversationState ?? conversation.conversationState),
          validated_quote: JSON.stringify(quote)
        },
        catalogoDisponible
      });
      const quotePatch = this.extractFlowisePatch(rawFlowiseResponse);
      flowisePatch = { ...flowisePatch, ...quotePatch, validated_quote: JSON.stringify(quote) };
      responseText = this.extractResponseText(rawFlowiseResponse, quotePatch);
      updatedConversation = this.botIntegrationService.updateConversationState(conversation.id, {
        ...quotePatch,
        customerMessage: ""
      });
    }

    let agentsOrder = null;
    if (agentsOwnDecisions && this.isAgentAction(flowisePatch, "confirm_order")) {
      if (this.botIntegrationService.requiresPaymentProofForConversation(conversation.id)) {
        responseText =
          this.botIntegrationService.buildPaymentInstructionsForConversation(conversation.id) ??
          responseText;
        flowisePatch.next_expected = "comprobante_pago";
        updatedConversation = this.botIntegrationService.updateConversationState(conversation.id, {
          next_expected: "comprobante_pago",
          pedido_confirmado_por_cliente: true
        });
      } else {
        const confirmedOrderInput = this.botIntegrationService.getConfirmedOrderInput(conversation.id);
        if (confirmedOrderInput) agentsOrder = this.botQuoteService.confirmOrder(confirmedOrderInput);
      }
    }

    let order = agentsOrder;
    let reviewReadiness = null;
    if (!agentsOwnDecisions && this.shouldCreateReviewOrder(flowisePatch)) {
      reviewReadiness = this.botIntegrationService.getOrderReviewReadiness(conversation.id);
      order = this.botIntegrationService.createOrderForReview(conversation.id);
    }

    const guardedContinuation = agentsOwnDecisions
      ? null
      : this.buildBackendContinuationIfNeeded(
          conversation.id,
          text,
          responseText,
          String(updatedConversation?.conversationState?.next_expected ?? "")
        );
    const finalResponseText = guardedContinuation?.responseText ?? responseText;
    let finalConversation = updatedConversation;
    finalConversation = this.botIntegrationService.updateConversationState(conversation.id, {
      botMessage: finalResponseText,
      mensaje_cliente: finalResponseText,
      ...(guardedContinuation ? { next_expected: guardedContinuation.nextExpected } : {})
    });

    const result: Record<string, unknown> = {
      conversationId: conversation.id,
      sessionId,
      responseText: finalResponseText,
      shouldSendReply: Boolean(finalResponseText.trim()),
      source: guardedContinuation?.source ?? (agentsOwnDecisions ? "flowise_agentflow_agents" : "flowise_agentflow"),
      responseSourceField: this.extractResponseSource(rawFlowiseResponse, flowisePatch),
      state: finalConversation?.state ?? conversation.state,
      orderId: order?.id ?? finalConversation?.activeOrderId ?? null,
      reviewReadiness
    };

    if (env.BOT_TURN_INCLUDE_RAW) {
      result.rawFlowiseResponse = rawFlowiseResponse;
    }

    return result;
  }

  private isOutOfScopeQuestion(text: string) {
    const normalized = this.normalize(text);
    if (!normalized || !this.looksLikeQuestion(normalized)) {
      return false;
    }

    if (this.hasBusinessScopeSignal(normalized)) {
      return false;
    }

    return (
      /\b(venezuela|colombia|mundo|pais|paises|presidente|politica|gobierno|elecciones?|guerra|noticias?|ayer|hoy|manana|historia|geografia|capital|clima|temperatura|deporte|futbol|partido)\b/.test(
        normalized
      ) ||
      /\b(que paso|que sucedio|que ocurrio|cuantos dias|cuantos meses|cuantos anos|que hora es|hora exacta|dime la hora)\b/.test(
        normalized
      )
    );
  }

  private looksLikeQuestion(normalized: string) {
    return /^(que|quien|quienes|cuando|donde|cuanto|cuantos|cuantas|cual|cuales|como|por que)\b/.test(
      normalized
    );
  }

  private hasBusinessScopeSignal(normalized: string) {
    return /\b(menu|carta|catalogo|pedido|pedir|orden|comprar|quiero|fresas?|crema|helado|oreo|milo|chocolate|waffles?|wafles?|oblea|malteada|brownie|pavlova|vaso|toppings?|adiciones?|adicionales?|salsas?|sabores?|frutas?|precio|precios|vale|cuesta|cuestan|domicilio|envio|barrio|direccion|recoger|recogida|horario|abren|cierran|abierto|nequi|bancolombia|bre b|efectivo|pago|transferencia|comprobante|recomendacion|recomiendas)\b/.test(
      normalized
    );
  }

  private buildOutOfScopeReply() {
    return "Por ahora solo puedo ayudarte con pedidos, menu, precios, pagos y domicilios de I Love Fresas Barranquilla 🍓 ¿Qué se te antoja?";
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
        "<available_catalog>",
        JSON.stringify(input.catalogoDisponible),
        "</available_catalog>",
        "",
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
          available_catalog: JSON.stringify(input.catalogoDisponible),
          catalogo_disponible: JSON.stringify(input.catalogoDisponible)
        }
      }
    };
  }

  private extractFlowisePatch(response: FlowisePredictionResponse) {
    const merged: Record<string, unknown> = {};
    const executedData = response.agentFlowExecutedData;

    if (this.isRecord(response.json)) {
      this.mergeOutput(merged, response.json);
    }
    this.mergeOutput(merged, response);

    if (Array.isArray(executedData)) {
      for (const node of executedData) {
        const output = this.getPath(node, ["data", "output"]);
        if (this.isRecord(output)) {
          this.mergeOutput(merged, output);
          if (typeof output.content === "string") {
            const parsedContent = this.parseJsonRecord(output.content);
            if (parsedContent) this.mergeOutput(merged, parsedContent);
          }
        } else if (typeof output === "string") {
          const parsedOutput = this.parseJsonRecord(output);
          if (parsedOutput) this.mergeOutput(merged, parsedOutput);
        }
      }
    }

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

  private parseJsonRecord(value: string) {
    try {
      const parsed = JSON.parse(value);
      return this.isRecord(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  private isAgentAction(patch: Record<string, unknown>, action: string) {
    return patch.action === action || patch.tool_action === action;
  }

  private extractResponseText(response: FlowisePredictionResponse, patch: Record<string, unknown>) {
    const candidates = [
      patch.mensaje_cliente,
      patch.reply,
      patch.reply_draft,
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

  private buildBackendContinuationIfNeeded(
    conversationId: string,
    customerText: string,
    responseText: string,
    nextExpected: string
  ) {
    const normalizedResponse = this.normalize(responseText);
    const normalizedCustomerText = this.normalize(customerText);
    const requiredContinuation = this.botIntegrationService.buildNextOrderStepReply(conversationId);
    if (
      nextExpected !== "humano" &&
      (requiredContinuation?.source === "backend_required_options_guardrail" ||
        requiredContinuation?.source === "backend_waffle_variant_guardrail")
    ) {
      return requiredContinuation;
    }
    if (
      requiredContinuation?.nextExpected === "confirmacion"
    ) {
      return {
        ...requiredContinuation,
        source: "backend_confirmation_summary_guardrail"
      };
    }

    const noMoreResponse = ["no", "nope", "nada mas", "solo eso", "eso es todo"].some(
      (phrase) => normalizedCustomerText === phrase || normalizedCustomerText.includes(phrase)
    );
    const actionlessTransition =
      /seguimos con (la )?confirmacion/.test(normalizedResponse) ||
      (/^(perfecto|listo|ok)\b/.test(normalizedResponse) &&
        !/[?¿]/.test(responseText) &&
        !/\b(resumen|total|domicilio|direccion|barrio|referencia|comprobante|pago|nequi|bancolombia|bre|envia|enviame|mandame|confirma|confirmame|necesito|compartes)\b/.test(
          normalizedResponse
        ));

    if (
      this.botIntegrationService.requiresPaymentProofForConversation(conversationId) &&
      ((nextExpected === "confirmacion" && noMoreResponse && actionlessTransition) ||
        (nextExpected === "comprobante_pago" &&
          !/\b(comprobante|pago|nequi|bancolombia|bre|envia|enviame|mandame)\b/.test(
            normalizedResponse
          )))
    ) {
      return {
        responseText:
          this.botIntegrationService.buildPaymentInstructionsForConversation(conversationId) ??
          "Para continuar con la revisión del pedido, envíame el comprobante del pago por aquí 😊",
        nextExpected: "comprobante_pago",
        source: "backend_next_action_guardrail"
      };
    }

    if (nextExpected !== "humano" && actionlessTransition) {
      return this.botIntegrationService.buildNextOrderStepReply(conversationId);
    }

    return null;
  }

  private isCustomerConfirmation(text: string) {
    const normalized = this.normalize(text);
    return ["si", "correcto", "listo", "asi esta bien", "confirmo"].some(
      (phrase) => normalized === phrase || normalized.includes(phrase)
    );
  }

  private shouldProceedFromConfirmation(text: string, lastBotQuestion: unknown) {
    return (
      this.isCustomerConfirmation(text) ||
      this.isNoMoreItemsResponseToAddMoreQuestion(text, lastBotQuestion)
    );
  }

  private isNoMoreItemsResponseToAddMoreQuestion(text: string, lastBotQuestion: unknown) {
    const normalized = this.normalize(text);
    const normalizedQuestion = this.normalize(String(lastBotQuestion ?? ""));
    const isNoMore = [
      "no",
      "nope",
      "nada mas",
      "solo eso",
      "eso es todo",
      "asi esta bien"
    ].some((phrase) => normalized === phrase || normalized.includes(phrase));
    const wasAddMoreQuestion =
      /\b(algo mas|agregar|agregas|anadir|añadir|otro producto|otra cosa)\b/.test(
        normalizedQuestion
      );

    return isNoMore && wasAddMoreQuestion;
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
      `Validación: ${proofValidation.source}, confianza ${proofValidation.confidence.toFixed(2)}.`,
      proofValidation.reason
    ].filter(Boolean).join(" ");
  }

  private buildUnexpectedAttachmentReply(nextExpected: string) {
    return "Recibí la imagen, pero todavía no puedo recibir comprobantes. Primero cerramos el pedido, te doy el total y después te pido el comprobante 😊";
  }

  private buildPrematurePaymentProofReply(nextExpected: string) {
    if (nextExpected === "confirmacion") {
      return "Todavía no puedo recibir comprobantes. Primero confírmame si el resumen está correcto; después te doy el total y te pido el comprobante 😊";
    }

    if (nextExpected === "datos") {
      return "Todavía no puedo recibir comprobantes. Primero terminamos los datos del pedido, luego te muestro el total y ahí sí te pido el comprobante 😊";
    }

    return "Todavía no puedo recibir comprobantes. Primero armamos y cerramos el pedido; después te doy el total y te pido el comprobante 😊";
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
