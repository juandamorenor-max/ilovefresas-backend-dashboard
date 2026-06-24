import { demoStore } from "../data/demoStore.js";
import { persistRuntimeStore } from "../data/runtime-store.js";
import { resolveBarranquillaZone } from "../data/geo/barranquilla-zone-resolver.js";
import { env } from "../config/env.js";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { formatCurrency } from "../utils/http.js";
import { createId, nowIso } from "../utils/id.js";
import { uniqueCaseInsensitive } from "../utils/json.js";
import { logger } from "../utils/logger.js";
import type {
  Business,
  Conversation,
  ConversationTurnResult,
  IncomingCustomerAttachmentMessage,
  IncomingWhatsAppTextMessage,
  Message,
  MessageClassification,
  ModifierOption,
  Order,
  OrderDraft,
  OrderItem,
  OutgoingAttachment,
  PendingSelection,
  PostOrderEvent,
  Product,
  ProductRequiredOption
} from "../types/index.js";
import { AdminNotificationService } from "./admin-notification.service.js";
import { AIPatchValidatorService } from "./ai-patch-validator.service.js";
import { BusinessService } from "./business.service.js";
import { BotReplyComposerService } from "./bot-reply-composer.service.js";
import { CatalogService } from "./catalog.service.js";
import { ConversationInterpreterService } from "./conversation-interpreter.service.js";
import {
  ConversationTraceService,
  type OpenAITraceEvent
} from "./conversation-trace.service.js";
import { MessageClassifierService } from "./message-classifier.service.js";
import { OrderService } from "./order.service.js";
import {
  OpenAIOrderEngineService,
  type OpenAIOrderEngineOutput
} from "./openai-order-engine.service.js";
import { MultiAgentOrderEngineService } from "./multi-agent-order-engine.service.js";
import {
  PostDispatchIntentService,
  type PostDispatchIntent
} from "./post-dispatch-intent.service.js";
import { PricingService } from "./pricing.service.js";
import { PaymentProofValidationService } from "./payment-proof-validation.service.js";

type TargetItemResolution =
  | { status: "resolved"; item: OrderItem }
  | { status: "ambiguous"; message: string };

type ModifierCandidate = {
  id: string;
  name: string;
  priceDelta: number;
  aliases?: string[];
};

type ItemAdjustmentOutcome = {
  incrementedExistingComponents: string[];
};

type ProductFamilyMetadata = {
  key: string;
  label: string;
  familyTerms: string[];
  productIds?: string[];
  category?: string;
  nameIncludes?: string[];
  question: string;
};

type ModifierFamilyMetadata = {
  key: string;
  label: string;
  familyTerms: string[];
  modifierIds: string[];
  question: string;
};

type ProductCompositionMetadata = {
  baseProductId: string;
  componentModifierId: string;
  preferredProductId: string;
};

const PRODUCT_FAMILIES: ProductFamilyMetadata[] = [
  {
    key: "fresas-con-crema",
    label: "tipo de fresas",
    familyTerms: ["fresas", "fresa", "fresas con crema", "fresa con crema", "algo de fresas"],
    productIds: [
      "prod_fresa_tradicional",
      "prod_fresa_helado",
      "prod_fresa_crema_oreo",
      "prod_fresa_oreo_milo",
      "prod_mix_oreo",
      "prod_mix_oreo_milo",
      "prod_fresas_chocolate",
      "prod_fresas_explosion_chocolate",
      "prod_fresas_frutos_rojos",
      "prod_combinado_fresa_durazno_crema",
      "prod_combinado_fresa_durazno_helado",
      "prod_combinado_fresa_banano_crema"
    ],
    question:
      "Claro. Tenemos varias opciones de fresas. Cual quieres? Por ejemplo: tradicional, Oreo, Oreo + Milo, Mix Oreo, Mix Oreo Milo, con helado o con chocolate."
  },
  {
    key: "obleas",
    label: "tipo de oblea",
    familyTerms: ["oblea", "obleas"],
    category: "obleas",
    question: "Claro. Para la oblea tenemos varias opciones. Cual quieres?"
  },
  {
    key: "malteadas",
    label: "sabor de malteada",
    familyTerms: ["malteada", "malteadas"],
    category: "malteadas",
    question: "Claro. Que sabor de malteada quieres?"
  },
  {
    key: "waffles",
    label: "tipo de waffle",
    familyTerms: ["waffle", "waffles", "wafle", "wafles"],
    nameIncludes: ["waffle", "wafle"],
    question: "Claro. Que waffle quieres?"
  },
  {
    key: "vasos-helados",
    label: "tipo de vaso helado",
    familyTerms: ["vaso helado", "vasos helados"],
    nameIncludes: ["vaso helado"],
    question: "Claro. El vaso helado lo quieres de un sabor o de dos sabores?"
  }
];

const MODIFIER_FAMILIES: ModifierFamilyMetadata[] = [
  {
    key: "chocolate",
    label: "topping de chocolate",
    familyTerms: ["chocolate"],
    modifierIds: [
      "mo_salsa_hershey",
      "mo_chips_chocolate",
      "mo_chips_negro",
      "mo_chips_blancos",
      "mo_chips_colores",
      "mo_nutella",
      "mo_chocorramo",
      "mo_choco_crispi"
    ],
    question:
      "Tambien hay varias opciones de chocolate. Cual quieres: Salsa Hershey, Chips de Chocolate, Nutella, Chocorramo o Choco Crispi?"
  },
  {
    key: "crema",
    label: "tipo de crema",
    familyTerms: ["crema"],
    modifierIds: ["mo_adicional_crema"],
    question: "Me confirmas si quieres crema adicional?"
  },
  {
    key: "helado",
    label: "adicion de helado",
    familyTerms: ["helado"],
    modifierIds: ["mo_helado"],
    question: "Me confirmas si quieres adicionar helado?"
  },
  {
    key: "salsas",
    label: "salsa",
    familyTerms: ["salsa", "salsas"],
    modifierIds: ["mo_salsa_hershey", "mo_arequipe", "mo_dulce_mora", "mo_nutella"],
    question: "Que salsa quieres agregar?"
  }
];

const PRODUCT_COMPOSITIONS: ProductCompositionMetadata[] = [
  {
    baseProductId: "prod_fresa_tradicional",
    componentModifierId: "mo_helado",
    preferredProductId: "prod_fresa_helado"
  }
];

type EngineAddItem = OpenAIOrderEngineOutput["draftPatch"]["addItems"][number];
type EngineUpdateItem = OpenAIOrderEngineOutput["draftPatch"]["updateItems"][number];
type SelectedOptionRoleGuard = {
  selectedOptions: Record<string, string[]>;
  pendingSelections: Array<Omit<PendingSelection, "id">>;
  createdBlockingSelection: boolean;
};

export class ConversationService {
  private readonly openAITraceEventsByConversation = new Map<string, OpenAITraceEvent>();

  constructor(
    private readonly businessService = new BusinessService(),
    private readonly catalogService = new CatalogService(),
    private readonly pricingService = new PricingService(),
    private readonly orderService = new OrderService(),
    private readonly classifierService = new MessageClassifierService(),
    private readonly interpreterService = new ConversationInterpreterService(),
    private readonly openAIOrderEngineService = new OpenAIOrderEngineService(),
    private readonly postDispatchIntentService = new PostDispatchIntentService(),
    private readonly replyComposerService = new BotReplyComposerService(),
    private readonly adminNotificationService = new AdminNotificationService(),
    private readonly conversationTraceService = new ConversationTraceService(),
    private readonly aiPatchValidatorService = new AIPatchValidatorService(),
    private readonly multiAgentOrderEngineService = new MultiAgentOrderEngineService(),
    private readonly paymentProofValidationService = new PaymentProofValidationService()
  ) {}

  getOrCreateConversation(businessId: string, customerPhone: string) {
    const existing = demoStore.conversations.find(
      (conversation) =>
        conversation.businessId === businessId && conversation.customerPhone === customerPhone
    );

    if (existing) {
      this.ensureConversationMemory(existing);
      return existing;
    }

    const timestamp = nowIso();
    const conversation: Conversation = {
      id: createId("conv"),
      createdAt: timestamp,
      updatedAt: timestamp,
      businessId,
      customerPhone,
      state: "idle",
      aiUsageCount: 0,
      draftOrder: null,
      activeOrderId: null,
      botPausedUntil: null,
      botPausedReason: null,
      postOrderEvents: [],
      memory: {
        recentMessages: [],
        summary: null,
        lastBotOffer: null
      }
    };

    demoStore.conversations.push(conversation);
    return conversation;
  }

  resetConversation(customerPhone: string) {
    const business = this.businessService.getDefaultBusiness();
    const conversationsToDelete = demoStore.conversations
      .filter(
        (conversation) =>
          conversation.businessId === business.id && conversation.customerPhone === customerPhone
      )
      .map((conversation) => conversation.id);

    demoStore.conversations = demoStore.conversations.filter(
      (conversation) => !conversationsToDelete.includes(conversation.id)
    );
    demoStore.messages = demoStore.messages.filter(
      (message) => !conversationsToDelete.includes(message.conversationId)
    );

    persistRuntimeStore();
    return { reset: true, customerPhone };
  }

  getWelcomeMessage() {
    return this.buildWelcomeMessage(this.businessService.getDefaultBusiness());
  }

  startNewConversation(customerPhone: string) {
    const business = this.businessService.getDefaultBusiness();
    this.resetConversation(customerPhone);
    const conversation = this.getOrCreateConversation(business.id, customerPhone);
    const welcomeMessage = this.buildWelcomeMessage(business);
    this.saveMessage(business.id, conversation.id, customerPhone, "bot", welcomeMessage);
    return welcomeMessage;
  }

  saveMessage(
    businessId: string,
    conversationId: string,
    customerPhone: string,
    role: Message["role"],
    text: string
  ) {
    const message: Message = {
      id: createId("msg"),
      createdAt: nowIso(),
      updatedAt: nowIso(),
      businessId,
      conversationId,
      customerPhone,
      role,
      text
    };
    demoStore.messages.push(message);

    const conversation = demoStore.conversations.find((entry) => entry.id === conversationId);
    if (conversation) {
      this.rememberTurn(conversation, role, text, message.createdAt);
    }

    return message;
  }

  async handleIncomingMessage(
    payload: IncomingWhatsAppTextMessage
  ): Promise<ConversationTurnResult> {
    const business = this.businessService.getDefaultBusiness();
    if (this.isNewChatCommand(payload.text)) {
      const reply = this.startNewConversation(payload.from);
      const conversation = this.getOrCreateConversation(business.id, payload.from);
      persistRuntimeStore();
      return this.buildTurnResult(conversation, reply, "stateful");
    }

    const conversation = this.getOrCreateConversation(business.id, payload.from);

    if (this.shouldStartFreshOrderSession(conversation, payload.text)) {
      this.resetConversation(payload.from);
      const freshConversation = this.getOrCreateConversation(business.id, payload.from);
      this.saveMessage(business.id, freshConversation.id, payload.from, "customer", payload.text);
      const freshResult = await this.advanceAndCompose(business, freshConversation, payload.text);
      this.applyDeliveryFeePendingCaveat(freshResult, freshConversation);
      if (freshResult.reply.trim()) {
        this.saveMessage(business.id, freshConversation.id, payload.from, "bot", freshResult.reply);
      }
      persistRuntimeStore();
      return freshResult;
    }

    this.saveMessage(business.id, conversation.id, payload.from, "customer", payload.text);

    const result = await this.advanceAndCompose(business, conversation, payload.text);
    this.applyDeliveryFeePendingCaveat(result, conversation);
    if (result.reply.trim()) {
      this.saveMessage(business.id, conversation.id, payload.from, "bot", result.reply);
    }
    persistRuntimeStore();
    return result;
  }

  async handleIncomingAttachment(
    payload: IncomingCustomerAttachmentMessage
  ): Promise<ConversationTurnResult> {
    const business = this.businessService.getDefaultBusiness();
    const conversation = this.getOrCreateConversation(business.id, payload.from);
    const attachmentLabel = payload.attachmentType === "image" ? "imagen" : "archivo";
    const customerMessage = payload.caption?.trim()
      ? `[${attachmentLabel} recibida] ${payload.caption.trim()}`
      : `[${attachmentLabel} recibida]`;

    this.saveMessage(business.id, conversation.id, payload.from, "customer", customerMessage);
    if (conversation.state !== "awaiting_payment_proof") {
      const reply =
        "Recibi la imagen, pero todavia no puedo recibir comprobantes. " +
        "Primero cerramos el pedido, te doy el total y despues te pido el comprobante.";
      this.saveMessage(business.id, conversation.id, payload.from, "bot", reply);
      persistRuntimeStore();
      return this.buildTurnResult(conversation, reply, "stateful");
    }

    const proofValidation = await this.paymentProofValidationService.validate({
      channel: "whatsapp",
      text: payload.caption ?? "",
      caption: payload.caption,
      attachmentType: payload.attachmentType,
      attachmentFileId: payload.fileId,
      mimeType: payload.mimeType,
      expectedPaymentMethod: conversation.draftOrder?.paymentMethod ?? null,
      expectedTotal: conversation.draftOrder?.pricing.total ?? null
    });

    if (!proofValidation.isLikelyPaymentProof) {
      const reply =
        "Recibi la imagen, pero no alcanzo a validar que sea un comprobante de pago. " +
        "Enviame una captura donde se vea el valor, estado exitoso y referencia.";
      this.saveMessage(business.id, conversation.id, payload.from, "bot", reply);
      persistRuntimeStore();
      return this.buildTurnResult(conversation, reply, "stateful");
    }

    this.markPaymentProofReceived(conversation, proofValidation);

    const reply =
      "✅ Comprobante recibido, muchas gracias 🍓\n\n" +
      "Un operario lo va a revisar y te avisaremos apenas tu pedido salga a despacho 🛵";
    this.saveMessage(business.id, conversation.id, payload.from, "bot", reply);

    persistRuntimeStore();
    return this.buildTurnResult(conversation, reply, "stateful");
  }

  private markPaymentProofReceived(
    conversation: Conversation,
    proofValidation?: Awaited<ReturnType<PaymentProofValidationService["validate"]>>
  ) {
    const note = [
      "Comprobante recibido por imagen/archivo. Operario debe revisarlo antes de despachar.",
      proofValidation
        ? `Validacion: ${proofValidation.source}, confianza ${proofValidation.confidence.toFixed(2)}. ${proofValidation.reason}`
        : null
    ].filter(Boolean).join(" ");
    const activeOrder = conversation.activeOrderId
      ? this.orderService.findOrder(conversation.activeOrderId)
      : null;
    const latestOrder =
      activeOrder ??
      this.orderService
        .listOrders()
        .filter((order) => order.customerPhone === conversation.customerPhone)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] ??
      null;

    if (latestOrder) {
      latestOrder.internalNotes = latestOrder.internalNotes?.includes(note)
        ? latestOrder.internalNotes
        : [latestOrder.internalNotes, note].filter(Boolean).join(" ");
      latestOrder.updatedAt = nowIso();
    }

    this.handoffConversationToHuman(
      conversation,
      "Comprobante recibido para revision del operario"
    );
  }

  private async advanceAndCompose(
    business: Business,
    conversation: Conversation,
    text: string
  ): Promise<ConversationTurnResult> {
    const result = await this.advanceConversation(business, conversation, text);
    if (this.shouldPreservePrimaryOrderEngineReply(result)) {
      result.replySource =
        result.classificationSource === "stateful" ? "template" : result.classificationSource;
      result.aiUsageCount = conversation.aiUsageCount;
      return result;
    }

    const composed = await this.replyComposerService.compose({
      business,
      conversation,
      customerMessage: text,
      classification: result.classification,
      safeDraftReply: result.reply,
      memoryContext: this.buildMemoryContext(conversation)
    });

    if (composed.source !== "template" && composed.source !== "heuristic") {
      conversation.aiUsageCount += 1;
      conversation.updatedAt = nowIso();
    }

    result.reply = composed.reply;
    result.replySource = composed.source;
    result.aiUsageCount = conversation.aiUsageCount;

    return result;
  }

  private shouldPreservePrimaryOrderEngineReply(result: ConversationTurnResult) {
    if (
      result.classificationSource === "stateful" &&
      (result.reply.trim() === "" || result.state === "pending_human")
    ) {
      return true;
    }

    return (
      env.AI_ORDER_ENGINE_MODE &&
      result.classification === null &&
      result.classificationSource !== "stateful"
    );
  }

  private applyDeliveryFeePendingCaveat(
    result: ConversationTurnResult,
    conversation: Conversation
  ) {
    result.reply = this.withDeliveryFeePendingCaveat(result.reply, conversation);
  }

  private withDeliveryFeePendingCaveat(reply: string, conversation: Conversation) {
    const trimmedReply = reply.trim();
    if (!trimmedReply || !this.hasPendingDeliveryFeeContext(conversation)) {
      return reply;
    }

    if (!this.replyLooksLikePriceAnswer(trimmedReply)) {
      return reply;
    }

    if (this.replyMentionsDeliveryCaveat(trimmedReply)) {
      return reply;
    }

    return [
      trimmedReply,
      "",
      "Ese valor es de productos; falta sumarle el domicilio, que lo confirma un asesor antes de despachar 🍓"
    ].join("\n");
  }

  private hasPendingDeliveryFeeContext(conversation: Conversation) {
    const draft = conversation.draftOrder;
    if (
      draft?.fulfillmentType === "delivery" &&
      draft.items.length > 0 &&
      draft.pricing.deliveryFee <= 0
    ) {
      return true;
    }

    const activeOrder = conversation.activeOrderId
      ? this.orderService.findOrder(conversation.activeOrderId)
      : null;
    const latestOrder =
      activeOrder ??
      this.orderService
        .listOrders()
        .filter((order) => order.customerPhone === conversation.customerPhone)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] ??
      null;

    return Boolean(
      latestOrder?.fulfillmentType === "delivery" &&
        latestOrder.status === "pending_review" &&
        latestOrder.pricing.deliveryFee <= 0
    );
  }

  private replyLooksLikePriceAnswer(reply: string) {
    const normalized = this.normalizeForMatching(reply);
    const mentionsMoney = /\$\s*\d|(?:\d{1,3}(?:[.,]\d{3})+)\b/.test(reply);
    const talksAboutPrice =
      /\b(?:queda|total|vale|cuesta|costo|precio|productos|subtotal|pagar|son|seria|serian)\b/.test(
        normalized
      );

    return mentionsMoney && talksAboutPrice;
  }

  private replyMentionsDeliveryCaveat(reply: string) {
    const normalized = this.normalizeForMatching(reply);
    return /\b(?:domi|domicilio|envio|domiciliario)\b/.test(normalized);
  }

  private async advanceConversation(
    business: Business,
    conversation: Conversation,
    text: string
  ): Promise<ConversationTurnResult> {
    if (this.isGlobalBotPaused(business)) {
      return this.buildSilentTurnResult(conversation, "stateful");
    }

    if (!this.businessService.isBusinessOpen(business)) {
      return this.buildTurnResult(
        conversation,
        this.buildClosedBusinessMessage(business),
        "stateful"
      );
    }

    const closedPostOrderTurn = this.tryHandleClosedPostOrderTurn(conversation, text);
    if (closedPostOrderTurn) {
      return closedPostOrderTurn;
    }

    if (this.isConversationBotPaused(conversation)) {
      return this.buildSilentTurnResult(conversation, "stateful");
    }

    const postDispatchTurn = await this.tryHandlePostDispatchTurn(conversation, text);
    if (postDispatchTurn) {
      return postDispatchTurn;
    }

    const engineResult = await this.tryHandleOpenAIOrderEngine(business, conversation, text);
    if (engineResult) {
      return engineResult;
    }

    if (this.shouldBlockLegacyConversationParser()) {
      return this.handoffFromEngine(
        conversation,
        "stateful",
        this.buildAgentTransferMessage(),
        "AI order engine unavailable in strict mode"
      );
    }

    this.logLegacyConversationParserFallback(conversation, "ai_order_engine_not_primary");
    const classification = await this.classifyConversationTurn(business, conversation, text);

    if (classification.source !== "heuristic") {
      conversation.aiUsageCount += 1;
      conversation.updatedAt = nowIso();
    }

    if (this.isCatalogOptionQuestion(text)) {
      const turnResult = this.buildTurnResult(
        conversation,
        this.buildCatalogOptionQuestionResponse(text, conversation),
        classification.source
      );
      turnResult.classification = classification;
      return turnResult;
    }

    if (conversation.state === "pending_human") {
      return this.buildSilentTurnResult(conversation, classification.source);
    }

    const aiNonOrderReply = this.tryHandleAiNonOrderIntent(
      business,
      conversation,
      text,
      classification
    );
    if (aiNonOrderReply) {
      const turnResult = this.buildTurnResult(
        conversation,
        aiNonOrderReply,
        classification.source,
        this.buildAttachmentsForClassification(classification)
      );
      turnResult.classification = classification;
      return turnResult;
    }

    if (conversation.state === "idle" && this.shouldCaptureLooseDeliveryDetails(text, classification, conversation)) {
      conversation.draftOrder = this.orderService.createEmptyDraft(
        conversation.businessId,
        conversation.customerPhone
      );
      this.applyExtractedDeliveryDetails(
        conversation.draftOrder,
        classification,
        this.buildLooseDetailsText(conversation, text)
      );
      conversation.state = "collecting_items";
      conversation.updatedAt = nowIso();
      const turnResult = this.buildTurnResult(
        conversation,
        "Listo, tengo esos datos. ¿Qué deseas ordenar?",
        classification.source
      );
      turnResult.classification = classification;
      return turnResult;
    }

    const shouldUseStatefulFirst = this.shouldUseStatefulDeliveryDetails(
      conversation,
      text,
      classification
    ) || (
      conversation.state === "collecting_items" &&
      this.shouldCaptureLooseDeliveryDetails(text, classification, conversation)
    ) || this.shouldPrioritizeOrderFlow(text, classification);
    const globalReply = shouldUseStatefulFirst || this.shouldSkipGreetingShortcut(text, classification)
      ? null
      : this.handleGlobalIntent(business, conversation, text, classification);
    if (globalReply) {
      const turnResult = this.buildTurnResult(
        conversation,
        globalReply,
        classification.source,
        this.buildAttachmentsForClassification(classification)
      );
      turnResult.classification = classification;
      return turnResult;
    }

    if (conversation.state !== "idle") {
      const turnResult = this.buildTurnResult(
        conversation,
        await this.handleStatefulFlow(conversation, text, classification),
        classification.source
      );
      turnResult.classification = classification;
      return turnResult;
    }

    const turnResult = this.buildTurnResult(
      conversation,
      await this.handleIdleIntent(business, conversation, text, classification),
      classification.source
    );
    turnResult.classification = classification;
    return turnResult;
  }

  private async tryHandleOpenAIOrderEngine(
    business: Business,
    conversation: Conversation,
    text: string
  ): Promise<ConversationTurnResult | null> {
    if (!this.shouldUseAIOrderEngineAsPrimary()) {
      return null;
    }

    const engineInput = {
      currentMessage: text,
      business,
      conversation,
      activeOrder: this.findActiveOrderForConversation(conversation),
      draftOrder: conversation.draftOrder,
      products: this.catalogService.listProducts(),
      modifiers: this.catalogService.listModifierOptions(),
      zones: this.catalogService.listDeliveryZones()
    };

    const engine =
      env.AI_ENGINE_ARCHITECTURE === "multi"
        ? await this.multiAgentOrderEngineService.interpret(engineInput)
        : await this.openAIOrderEngineService.interpret(engineInput);

    if (engine.source !== "heuristic") {
      conversation.aiUsageCount += 1;
      conversation.updatedAt = nowIso();
    }

    if (!engine.result || engine.source === "heuristic") {
      return this.handoffFromEngine(
        conversation,
        engine.source,
        this.buildAgentTransferMessage(),
        engine.error ?? "OpenAIOrderEngine unavailable"
      );
    }

    const result = engine.result;

    if (result.needsHuman) {
      return this.handoffFromEngine(
        conversation,
        engine.source,
        result.replyToCustomer || this.buildAgentTransferMessage(),
        result.humanReason ?? "OpenAI requested human handoff"
      );
    }

    if (!result.safeToApply && !this.enginePatchIsEmpty(result)) {
      return this.handoffFromEngine(
        conversation,
        engine.source,
        result.replyToCustomer || this.buildAgentTransferMessage(),
        "Engine result was not safe to apply"
      );
    }

    try {
      const reply = await this.applyOpenAIOrderEngineResult(conversation, result, text);
      return this.buildTurnResult(
        conversation,
        reply,
        engine.source,
        this.buildAttachmentsForEngineResult(conversation, result)
      );
    } catch (error) {
      return this.handoffFromEngine(
        conversation,
        engine.source,
        this.buildAgentTransferMessage(),
        error instanceof Error ? error.message : "OpenAIOrderEngine validation failed"
      );
    }
  }

  private async tryHandlePostDispatchTurn(
    conversation: Conversation,
    text: string
  ): Promise<ConversationTurnResult | null> {
    const order = this.findActiveOrderForConversation(conversation);
    if (!order || !this.isPostDispatchOrderStatus(order.status)) {
      return null;
    }

    const interpreted = await this.postDispatchIntentService.interpret({
      currentMessage: text,
      conversation,
      order
    });

    if (interpreted.source !== "heuristic") {
      conversation.aiUsageCount += 1;
      conversation.updatedAt = nowIso();
    }

    const intent = interpreted.intent;
    if (!intent) {
      const reply = this.buildPostDispatchHandoffReply(order);
      this.recordPostOrderEvent(conversation, order, {
        type: "unknown",
        severity: "medium",
        handledByBot: false,
        needsHuman: true,
        humanReason: "post_dispatch_intent_unavailable",
        customerMessage: text,
        suggestedAction: "Operario debe revisar mensaje post-envio."
      });
      this.handoffConversationToHuman(conversation, "post_dispatch_intent_unavailable");
      return this.buildTurnResult(conversation, reply, interpreted.source);
    }

    const latestEvent = this.latestPostOrderEvent(conversation, order.id);
    const shouldEscalateStatus =
      intent.type === "repeated_status_question" ||
      (intent.type === "delivery_status_question" &&
        latestEvent?.type === "delivery_status_question");
    const shouldEscalate =
      intent.shouldEscalate ||
      shouldEscalateStatus ||
      ["delivery_issue", "change_after_dispatch"].includes(intent.type);

    if (shouldEscalate) {
      const humanReason = this.postDispatchHumanReason(intent, shouldEscalateStatus);
      const reply = this.buildPostDispatchEscalationReply(order, intent);
      this.recordPostOrderEvent(conversation, order, {
        type: shouldEscalateStatus ? "repeated_status_question" : intent.type,
        severity: intent.severity === "low" ? "medium" : intent.severity,
        handledByBot: false,
        needsHuman: true,
        humanReason,
        customerMessage: text,
        suggestedAction: "Intervencion post-envio requerida."
      });
      this.handoffConversationToHuman(conversation, humanReason);
      if (conversation.draftOrder) {
        conversation.draftOrder.blockingIssue = "Intervencion post-envio requerida";
      }
      return this.buildTurnResult(conversation, reply, interpreted.source);
    }

    if (intent.type === "new_order_request") {
      if (latestEvent?.type === "new_order_request") {
        this.recordPostOrderEvent(conversation, order, {
          type: "new_order_request",
          severity: "low",
          handledByBot: true,
          needsHuman: false,
          humanReason: null,
          customerMessage: text,
          suggestedAction: "Nuevo pedido iniciado separado del pedido enviado."
        });
        conversation.activeOrderId = null;
        conversation.draftOrder = this.orderService.createEmptyDraft(
          conversation.businessId,
          conversation.customerPhone
        );
        conversation.state = "collecting_items";
        conversation.botPausedUntil = null;
        conversation.botPausedReason = null;
        conversation.updatedAt = nowIso();
        return this.buildTurnResult(
          conversation,
          "Listo 🍓 Empezamos un pedido nuevo aparte. ¿Qué se te antoja pedir?",
          interpreted.source
        );
      }

      this.recordPostOrderEvent(conversation, order, {
        type: "new_order_request",
        severity: "low",
        handledByBot: true,
        needsHuman: false,
        humanReason: null,
        customerMessage: text,
        suggestedAction: "Esperando confirmacion para iniciar pedido nuevo."
      });
      return this.buildTurnResult(
        conversation,
        "Claro 🍓 Como tu pedido anterior ya fue enviado, esto lo tomaría como un pedido nuevo. ¿Te lo empiezo aparte?",
        interpreted.source
      );
    }

    if (intent.type === "conversation_close") {
      conversation.state = "post_order_closed";
      if (order.status === "completed") {
        conversation.activeOrderId = null;
        conversation.draftOrder = null;
      }
      conversation.updatedAt = nowIso();
      this.recordPostOrderEvent(conversation, order, {
        type: "conversation_close",
        severity: "low",
        handledByBot: true,
        needsHuman: false,
        humanReason: null,
        customerMessage: text,
        suggestedAction: null
      });
      return this.buildTurnResult(
        conversation,
        order.status === "completed"
          ? "Qué bueno 🍓 Gracias por pedir en I Love Fresas."
          : "Con gusto 🍓 Tu pedido ya va en camino. Quedamos atentos por aquí si necesitas algo.",
        interpreted.source
      );
    }

    if (intent.type === "delivery_status_question") {
      this.recordPostOrderEvent(conversation, order, {
        type: "delivery_status_question",
        severity: "low",
        handledByBot: true,
        needsHuman: false,
        humanReason: null,
        customerMessage: text,
        suggestedAction: null
      });
      return this.buildTurnResult(
        conversation,
        this.buildPostDispatchStatusReply(order),
        interpreted.source
      );
    }

    this.recordPostOrderEvent(conversation, order, {
      type: intent.type,
      severity: intent.severity,
      handledByBot: true,
      needsHuman: false,
      humanReason: null,
      customerMessage: text,
      suggestedAction: null
    });
    return this.buildTurnResult(
      conversation,
      order.status === "dispatched"
        ? "Sí 🍓 Tu pedido ya va en camino. Si necesitas algo puntual, me dices."
        : "Con gusto 🍓 Quedo atento por aquí si necesitas algo.",
      interpreted.source
    );
  }

  private tryHandleClosedPostOrderTurn(
    conversation: Conversation,
    text: string
  ): ConversationTurnResult | null {
    const latestOrder = this.findLatestOrderForConversation(conversation);
    const isClosedCompletedConversation =
      !conversation.activeOrderId &&
      latestOrder?.status === "completed" &&
      (conversation.state === "post_order_closed" ||
        (conversation.postOrderEvents ?? []).some(
          (event) => event.orderId === latestOrder.id && event.type === "conversation_close"
        ));

    if (
      conversation.activeOrderId ||
      (conversation.state !== "post_order_closed" && !isClosedCompletedConversation)
    ) {
      return null;
    }

    if (this.isExplicitFreshOrderRequest(text)) {
      conversation.draftOrder = this.orderService.createEmptyDraft(
        conversation.businessId,
        conversation.customerPhone
      );
      conversation.state = "collecting_items";
      conversation.botPausedUntil = null;
      conversation.botPausedReason = null;
      conversation.updatedAt = nowIso();
      return this.buildTurnResult(
        conversation,
        "Listo 🍓 Empezamos un pedido nuevo. ¿Qué se te antoja pedir?",
        "stateful"
      );
    }

    return this.buildSilentTurnResult(conversation, "stateful");
  }

  private findLatestOrderForConversation(conversation: Conversation) {
    return (
      this.orderService
        .listOrders()
        .filter((order) => order.customerPhone === conversation.customerPhone)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] ?? null
    );
  }

  private engineResultOnlyAnswers(result: OpenAIOrderEngineOutput) {
    if (this.enginePatchIsEmpty(result)) {
      return true;
    }

    return (
      ["catalog_question", "small_talk", "business_question"].includes(result.intent) &&
      this.enginePatchIsEmpty(result)
    );
  }

  private enginePatchIsEmpty(result: OpenAIOrderEngineOutput) {
    return (
      result.draftPatch.addItems.length === 0 &&
      result.draftPatch.updateItems.length === 0 &&
      result.draftPatch.removeItems.length === 0 &&
      result.draftPatch.createPendingSelections.length === 0 &&
      result.draftPatch.resolvePendingSelections.length === 0 &&
      !result.draftPatch.setCustomerName &&
      !result.draftPatch.setAddress &&
      !result.draftPatch.setNeighborhood &&
      !result.draftPatch.setAddressReference &&
      !result.draftPatch.setZoneId &&
      !result.draftPatch.possibleNeighborhoodText &&
      !result.draftPatch.possibleLandmarkText &&
      !result.draftPatch.possibleCityText &&
      !result.draftPatch.rawAddressText &&
      !result.draftPatch.setFulfillmentType &&
      !result.draftPatch.setPaymentMethod &&
      !result.draftPatch.setCashAmount &&
      !result.draftPatch.setNotes
    );
  }

  private findActiveOrderForConversation(conversation: Conversation) {
    return conversation.activeOrderId
      ? this.orderService.findOrder(conversation.activeOrderId)
      : null;
  }

  private isPostDispatchOrderStatus(status: Order["status"]) {
    return ["dispatched", "completed", "cancelled"].includes(status);
  }

  private latestPostOrderEvent(conversation: Conversation, orderId: string) {
    return (conversation.postOrderEvents ?? [])
      .filter((event) => event.orderId === orderId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null;
  }

  private recordPostOrderEvent(
    conversation: Conversation,
    order: Order,
    event: Omit<PostOrderEvent, "id" | "createdAt" | "updatedAt" | "orderId" | "orderStatus">
  ) {
    const timestamp = nowIso();
    conversation.postOrderEvents ??= [];
    conversation.postOrderEvents.push({
      id: createId("postevt"),
      createdAt: timestamp,
      updatedAt: timestamp,
      orderId: order.id,
      orderStatus: order.status,
      ...event
    });
    conversation.updatedAt = timestamp;
  }

  private postDispatchHumanReason(intent: PostDispatchIntent, repeatedStatus: boolean) {
    if (repeatedStatus) {
      return "delivery_status_escalation";
    }

    switch (intent.requestedAction.type) {
      case "address_change":
        return "post_dispatch_address_change";
      case "item_change":
        return "post_dispatch_item_change";
      case "cancellation":
        return "post_dispatch_cancellation";
      case "payment_issue":
        return "post_dispatch_payment_issue";
      case "complaint":
        return "post_dispatch_delivery_issue";
      default:
        return intent.type;
    }
  }

  private buildPostDispatchStatusReply(order: Order) {
    if (order.status === "dispatched") {
      return "Tu pedido ya fue enviado 🍓 No tengo tracking en tiempo real, pero ya va en camino. Si necesitas que revisemos algo puntual, te paso con el operario.";
    }

    if (order.status === "completed") {
      return "Tu pedido aparece como entregado 🍓 Si tienes alguna novedad con lo recibido, te paso con un operario.";
    }

    return "Ese pedido aparece como cancelado. Si necesitas revisar algo, te paso con un operario.";
  }

  private buildPostDispatchEscalationReply(order: Order, intent: PostDispatchIntent) {
    if (order.status === "dispatched" && intent.type === "change_after_dispatch") {
      return "Como el pedido ya fue enviado, no puedo modificarlo automáticamente. Te paso con un operario para revisar si todavía se puede ajustar.";
    }

    if (order.status === "dispatched") {
      return "Entiendo. Te paso con un operario para revisar eso de inmediato y evitar darte información incorrecta.";
    }

    if (order.status === "completed") {
      return "Entiendo. Como el pedido ya aparece entregado, te paso con un operario para revisar la novedad.";
    }

    return "Te paso con un operario para revisar ese pedido.";
  }

  private buildPostDispatchHandoffReply(order: Order) {
    if (order.status === "dispatched") {
      return "Te paso con un operario para revisar el estado exacto del domicilio.";
    }

    return "Te paso con un operario para revisar ese pedido.";
  }

  private handoffFromEngine(
    conversation: Conversation,
    source: ConversationTurnResult["classificationSource"],
    reply: string,
    reason: string
  ) {
    this.handoffConversationToHuman(conversation, reason);
    if (conversation.draftOrder) {
      conversation.draftOrder.blockingIssue = reason;
    }
    return this.buildTurnResult(conversation, reply || this.buildAgentTransferMessage(), source);
  }

  private pauseConversationBot(conversation: Conversation, reason: string, minutes = 30) {
    conversation.botPausedUntil = new Date(Date.now() + minutes * 60_000).toISOString();
    conversation.botPausedReason = reason;
  }

  private handoffConversationToHuman(conversation: Conversation, reason: string) {
    conversation.state = "pending_human";
    conversation.botPausedUntil = null;
    conversation.botPausedReason = reason;
    conversation.updatedAt = nowIso();
  }

  private isGlobalBotPaused(business: Business) {
    return this.isPauseActive(
      business.status.botPausedUntil,
      () => {
        business.status.botPausedUntil = null;
        business.status.botPausedReason = null;
        business.updatedAt = nowIso();
      }
    );
  }

  private isConversationBotPaused(conversation: Conversation) {
    if (conversation.state === "pending_human" && !conversation.botPausedUntil) {
      return true;
    }

    return this.isPauseActive(
      conversation.botPausedUntil,
      () => {
        conversation.botPausedUntil = null;
        conversation.botPausedReason = null;
        if (conversation.state === "pending_human" && !conversation.draftOrder?.blockingIssue) {
          conversation.state = conversation.draftOrder?.items.length
            ? "collecting_items"
            : "idle";
        }
        conversation.updatedAt = nowIso();
      }
    );
  }

  private isPauseActive(pausedUntil: string | null | undefined, onExpired: () => void) {
    if (!pausedUntil) {
      return false;
    }

    if (new Date(pausedUntil).getTime() > Date.now()) {
      return true;
    }

    onExpired();
    return false;
  }

  private buildAgentTransferMessage() {
    return "Te estoy contactando con un agente para revisar eso y evitar tomar mal tu pedido. Ya le dejo el contexto.";
  }

  private shouldUseAIOrderEngineAsPrimary() {
    return env.AI_ORDER_ENGINE_MODE && env.LLM_PROVIDER !== "heuristic";
  }

  private shouldBlockLegacyConversationParser() {
    return env.AI_ORDER_ENGINE_MODE && env.AI_STRICT_PROVIDER;
  }

  private logLegacyConversationParserFallback(conversation: Conversation, reason: string) {
    logger.warn("Using legacy conversation parser fallback", {
      reason,
      provider: env.LLM_PROVIDER,
      aiOrderEngineMode: env.AI_ORDER_ENGINE_MODE,
      aiAgentMode: env.AI_AGENT_MODE,
      conversationState: conversation.state,
      conversationId: conversation.id
    });
  }

  private async applyOpenAIOrderEngineResult(
    conversation: Conversation,
    result: OpenAIOrderEngineOutput,
    currentMessage: string
  ) {
    const hasPatch = !this.engineResultOnlyAnswers(result);
    const draft =
      conversation.draftOrder ??
      (hasPatch
        ? this.orderService.createEmptyDraft(conversation.businessId, conversation.customerPhone)
        : null);

    if (!draft) {
      return result.replyToCustomer;
    }

    if (!hasPatch) {
      conversation.draftOrder = this.orderService.refreshDraft(draft);
      conversation.updatedAt = nowIso();
      const catalogInfoReply = this.catalogInfoReplyWhilePending(result, currentMessage, conversation);
      if (catalogInfoReply) {
        conversation.state = conversation.draftOrder.pendingSelections.some(
          (selection) => selection.blocking
        )
          ? "collecting_items"
          : conversation.state;
        return catalogInfoReply;
      }

      if (
        conversation.draftOrder.items.length > 0 &&
        this.getMissingDeliveryFields(conversation.draftOrder).length > 0 &&
        !["catalog_question", "business_question"].includes(result.intent)
      ) {
        conversation.state = "collecting_delivery_details";
        return this.pickOpenAIReply(
          result.replyToCustomer,
          this.buildDeliveryDetailsRequest(conversation.draftOrder)
        );
      }
      return this.pickOpenAICatalogReply(result);
    }

    const patchApplication = this.validateAndApplyAIPatch(draft, result, currentMessage);
    const validationIssues = this.aiPatchValidatorService.validateDraftIntegrity({
      draft,
      products: this.catalogService.listProducts(),
      modifiers: this.catalogService.listModifierOptionsForAdmin()
    });
    if (validationIssues.length > 0) {
      logger.warn("AI patch validation audit found draft integrity issues", {
        conversationId: conversation.id,
        issues: validationIssues
      });
    }

    conversation.draftOrder = this.orderService.refreshDraft(draft);
    this.sanitizeDraftItemNotes(conversation.draftOrder);

    const pendingSelection = conversation.draftOrder.pendingSelections.find(
      (selection) => selection.blocking
    );
    const pendingQuestion = pendingSelection?.question;
    if (pendingQuestion && pendingSelection) {
      const catalogInfoReply = this.catalogInfoReplyWhilePending(result, currentMessage, conversation);
      if (catalogInfoReply) {
        conversation.draftOrder.blockingIssue = pendingQuestion;
        conversation.state = "collecting_items";
        conversation.updatedAt = nowIso();
        return [catalogInfoReply, pendingQuestion].filter(Boolean).join("\n\n");
      }

      if (
        !this.engineChangedOrderItems(result) &&
        this.shouldEscalateRepeatedPendingSelection(conversation, pendingSelection)
      ) {
        return this.handoffFromEngine(
          conversation,
          "stateful",
          "Para no confundirte ni repetirte lo mismo, te voy a pasar con un operario para que te ayude a escoger y tomar bien el pedido 🍓",
          `Aclaracion repetida sin resolver: ${pendingSelection.label}`
        ).reply;
      }

      conversation.draftOrder.blockingIssue = pendingQuestion;
      conversation.state = "collecting_items";
      conversation.updatedAt = nowIso();
      return pendingQuestion;
    }

    if (conversation.draftOrder.blockingIssue) {
      this.handoffConversationToHuman(conversation, conversation.draftOrder.blockingIssue);
      return this.buildAgentTransferMessage();
    }

    if (conversation.draftOrder.items.length === 0) {
      conversation.state = "idle";
      conversation.updatedAt = nowIso();
      return result.replyToCustomer;
    }

    if (this.getMissingDeliveryFields(conversation.draftOrder).length === 0) {
      return this.finalizeOrderForReview(conversation);
    }

    conversation.state = "collecting_delivery_details";
    conversation.updatedAt = nowIso();
    return this.engineChangedOrderItems(result)
      ? this.buildCartSummaryWithDeliveryDetailsRequest(conversation.draftOrder)
      : this.buildDeliveryDetailsRequest(conversation.draftOrder);
  }

  private engineChangedOrderItems(result: OpenAIOrderEngineOutput) {
    return (
      result.draftPatch.addItems.length > 0 ||
      result.draftPatch.updateItems.length > 0 ||
      result.draftPatch.removeItems.length > 0
    );
  }

  private pickOpenAIReply(replyToCustomer: string | null | undefined, safeFallback: string) {
    const reply = replyToCustomer?.trim();
    return reply || safeFallback;
  }

  private pickOpenAICatalogReply(result: OpenAIOrderEngineOutput) {
    const catalogAnswer = result.catalogAnswer.answer?.trim();
    if (result.intent === "catalog_question" && catalogAnswer) {
      return catalogAnswer;
    }

    return result.replyToCustomer;
  }

  private catalogInfoReplyWhilePending(
    result: OpenAIOrderEngineOutput,
    currentMessage: string,
    conversation: Conversation
  ) {
    const isCatalogInfoIntent =
      ["catalog_question", "business_question"].includes(result.intent) &&
      result.catalogAnswer.topic !== "none";

    if (!isCatalogInfoIntent && !this.isCatalogOptionQuestion(currentMessage)) {
      return null;
    }

    const openAIAnswer = result.catalogAnswer.answer?.trim();
    if (openAIAnswer) {
      return openAIAnswer;
    }

    return this.buildCatalogOptionQuestionResponse(currentMessage, conversation);
  }

  private validateAndApplyAIPatch(
    draft: OrderDraft,
    result: OpenAIOrderEngineOutput,
    currentMessage: string
  ) {
    const existingPendingSelections = [...draft.pendingSelections];
    const defaultInferenceGuard = this.validateNoDefaultInference(result, draft, currentMessage);
    const guardedResult = defaultInferenceGuard.result;

    this.applyEnginePatchToDraft(draft, guardedResult, currentMessage);
    const backendResolvedPendingIds = [
      ...this.applyProductClarificationReplyToPendingSelections(draft, currentMessage),
      ...this.applyCatalogChoiceReplyToPendingSelections(draft, currentMessage),
      ...this.applyModifierReplyToPendingSelections(draft, currentMessage),
      ...this.applyExactRequiredOptionReply(draft, currentMessage),
      ...this.findStructurallyResolvedPendingSelectionIds(draft, existingPendingSelections)
    ];

    const incomingPendingSelections = [
      ...guardedResult.draftPatch.createPendingSelections,
      ...guardedResult.pendingSelections
    ];
    const recoveredRequiredOptionItem = this.recoverMissingItemsForRequiredOptions(
      draft,
      incomingPendingSelections
    );

    draft.pendingSelections = this.normalizePendingSelections([
      ...draft.pendingSelections,
      ...this.attachPendingSelectionsToDraftItems(draft, incomingPendingSelections)
    ]);

    const resolvedPendingIds = new Set(
      this.filterStructurallyResolvedPendingSelectionIds(
        draft,
        existingPendingSelections,
        guardedResult.draftPatch.resolvePendingSelections
      ).concat(backendResolvedPendingIds)
    );
    draft.pendingSelections = draft.pendingSelections.filter(
      (selection) => !resolvedPendingIds.has(selection.id)
    );

    const blockingBeforeRequiredGuardrail = draft.pendingSelections.some(
      (selection) => selection.blocking
    );
    this.syncPendingSelectionsFromRequiredOptions(draft);
    const pendingBlockingIssue = draft.pendingSelections.find((selection) => selection.blocking)?.question ?? null;
    const createdBackendRequiredSelection =
      recoveredRequiredOptionItem ||
        (!blockingBeforeRequiredGuardrail &&
        draft.pendingSelections.some((selection) => selection.type === "required_option" && selection.blocking));

    draft.blockingIssue = pendingBlockingIssue ?? draft.blockingIssue ?? null;

    return {
      createdBackendRequiredSelection
    };
  }

  private validateNoDefaultInference(
    result: OpenAIOrderEngineOutput,
    draft: OrderDraft,
    currentMessage: string
  ) {
    const pendingSelections: Array<Omit<PendingSelection, "id"> | PendingSelection> = [
      ...result.draftPatch.createPendingSelections
    ];
    const duplicateGuard = this.validateNoUnjustifiedDuplicateProductFamily(
      result.draftPatch.addItems,
      currentMessage
    );
    const addItems: EngineAddItem[] = [];
    const updateItems: EngineUpdateItem[] = [];
    let createdBlockingSelection = duplicateGuard.createdBlockingSelection;
    pendingSelections.push(...duplicateGuard.pendingSelections);

    for (const rawAddItem of duplicateGuard.addItems) {
      const addItem = this.preferSpecificProductComposition(rawAddItem, currentMessage);
      const product = this.requireProduct(addItem.productId);
      const normalizedAddItem = this.normalizeUnsupportedSelectedOptionsAsModifiers(addItem, product);
      const productFamily = this.productFamilyForProduct(product);
      const productIsSafe =
        !productFamily ||
        this.hasProductSelectionEvidence(product, productFamily, currentMessage, draft);

      const modifierGuard = this.guardModifierSelections(
        normalizedAddItem.modifierIds,
        currentMessage,
        productIsSafe ? { targetProductId: product.id } : {}
      );

      if (!productIsSafe && productFamily) {
        pendingSelections.push(this.buildProductFamilyPendingSelection(productFamily));
        pendingSelections.push(...modifierGuard.pendingSelections);
        createdBlockingSelection = true;
        createdBlockingSelection ||= modifierGuard.createdBlockingSelection;
        continue;
      }

      pendingSelections.push(...modifierGuard.pendingSelections);
      createdBlockingSelection ||= modifierGuard.createdBlockingSelection;

      const selectedOptionGuard = this.guardSelectedOptionRoles(
        draft,
        product,
        normalizedAddItem.selectedOptions,
        currentMessage,
        { targetProductId: product.id }
      );
      pendingSelections.push(...selectedOptionGuard.pendingSelections);
      createdBlockingSelection ||= selectedOptionGuard.createdBlockingSelection;
      addItems.push({
        ...normalizedAddItem,
        modifierIds: modifierGuard.safeModifierIds,
        selectedOptions: selectedOptionGuard.selectedOptions
      });
    }

    for (const update of result.draftPatch.updateItems) {
      const targetItem = this.tryResolveEngineTargetItem(draft, update.targetItemId, update.targetItemIndex);
      const targetProduct = targetItem ? this.requireProduct(targetItem.productId) : null;
      const modifierGuard = this.guardModifierSelections(
        update.modifierIdsToAdd,
        currentMessage,
        {
          targetItemId: targetItem?.id ?? update.targetItemId,
          targetProductId: targetProduct?.id ?? null
        }
      );

      pendingSelections.push(...modifierGuard.pendingSelections);
      createdBlockingSelection ||= modifierGuard.createdBlockingSelection;

      const selectedOptionGuard = targetProduct
        ? this.guardSelectedOptionRoles(
            draft,
            targetProduct,
            update.selectedOptions,
            currentMessage,
            {
              targetItemId: targetItem?.id ?? update.targetItemId,
              targetProductId: targetProduct.id
            }
          )
        : {
            selectedOptions: update.selectedOptions,
            pendingSelections: [],
            createdBlockingSelection: false
          };

      pendingSelections.push(...selectedOptionGuard.pendingSelections);
      createdBlockingSelection ||= selectedOptionGuard.createdBlockingSelection;

      updateItems.push({
        ...update,
        modifierIdsToAdd: modifierGuard.safeModifierIds,
        selectedOptions: selectedOptionGuard.selectedOptions
      });
    }

    return {
      result: {
        ...result,
        draftPatch: {
          ...result.draftPatch,
          addItems,
          updateItems,
          createPendingSelections: pendingSelections
        }
      },
      createdBlockingSelection
    };
  }

  private validateNoUnjustifiedDuplicateProductFamily(
    addItems: EngineAddItem[],
    currentMessage: string
  ) {
    const kept = [...addItems];
    const pendingSelections: Array<Omit<PendingSelection, "id">> = [];
    let createdBlockingSelection = false;

    for (let index = 0; index < kept.length; index += 1) {
      const first = kept[index];
      if (!first) {
        continue;
      }

      const firstProduct = this.requireProduct(first.productId);
      for (let nextIndex = index + 1; nextIndex < kept.length; nextIndex += 1) {
        const second = kept[nextIndex];
        if (!second) {
          continue;
        }

        const secondProduct = this.requireProduct(second.productId);
        const relation = this.resolveBaseVariantRelation(firstProduct, secondProduct);
        if (!relation || this.hasClearTwoProductEvidence(currentMessage, firstProduct, secondProduct)) {
          continue;
        }

        const specificItem =
          relation.specific.id === firstProduct.id ? first : second;
        const baseIndex =
          relation.base.id === firstProduct.id ? index : nextIndex;
        const specificIndex =
          relation.specific.id === firstProduct.id ? index : nextIndex;

        kept[specificIndex] = {
          ...specificItem,
          productId: relation.specific.id,
          modifierIds: uniqueCaseInsensitive(specificItem.modifierIds)
        };
        kept.splice(baseIndex, 1);
        if (baseIndex <= index) {
          index = Math.max(-1, index - 1);
        }
        createdBlockingSelection ||= this.productRequiresClarification(relation.specific);
        break;
      }
    }

    return {
      addItems: kept,
      pendingSelections,
      createdBlockingSelection
    };
  }

  private preferSpecificProductComposition(addItem: EngineAddItem, currentMessage: string): EngineAddItem {
    const composition = PRODUCT_COMPOSITIONS.find(
      (entry) =>
        entry.baseProductId === addItem.productId &&
        addItem.modifierIds.includes(entry.componentModifierId)
    );
    if (!composition) {
      return addItem;
    }

    const preferredProduct = this.requireProduct(composition.preferredProductId);
    const componentModifier = this.requireModifier(composition.componentModifierId);
    if (!this.hasAnyEvidenceTerm(currentMessage, [componentModifier.name, ...componentModifier.aliases])) {
      return addItem;
    }

    return {
      ...addItem,
      productId: preferredProduct.id,
      modifierIds: addItem.modifierIds.filter((modifierId) => modifierId !== composition.componentModifierId)
    };
  }

  private resolveBaseVariantRelation(first: Product, second: Product) {
    if (first.category !== second.category) {
      return null;
    }

    const firstComponents = this.normalizedDefaultComponentSet(first);
    const secondComponents = this.normalizedDefaultComponentSet(second);
    const firstIncludesSecond = this.setIncludes(firstComponents, secondComponents);
    const secondIncludesFirst = this.setIncludes(secondComponents, firstComponents);

    if (firstIncludesSecond && firstComponents.size > secondComponents.size) {
      return { base: second, specific: first };
    }

    if (secondIncludesFirst && secondComponents.size > firstComponents.size) {
      return { base: first, specific: second };
    }

    return null;
  }

  private normalizedDefaultComponentSet(product: Product) {
    return new Set(product.defaultComponents.map((component) => this.normalizeForMatching(component)));
  }

  private setIncludes(container: Set<string>, maybeSubset: Set<string>) {
    return [...maybeSubset].every((value) => container.has(value));
  }

  private hasClearTwoProductEvidence(text: string, first: Product, second: Product) {
    return (
      this.hasExactCatalogEvidence(text, [first.name, ...first.aliases]) &&
      this.hasExactCatalogEvidence(text, [second.name, ...second.aliases])
    );
  }

  private productRequiresClarification(product: Product) {
    return (product.requiredOptions ?? []).some((option) => option.required);
  }

  private guardModifierSelections(
    modifierIds: string[],
    currentMessage: string,
    target: { targetItemId?: string | null; targetProductId?: string | null }
  ) {
    const safeModifierIds: string[] = [];
    const pendingSelections: Array<Omit<PendingSelection, "id">> = [];
    let createdBlockingSelection = false;

    for (const modifierId of modifierIds) {
      const modifier = this.requireModifier(modifierId);
      const family = this.modifierFamilyForModifier(modifier);
      if (this.hasExactCatalogEvidence(currentMessage, [modifier.name, ...modifier.aliases])) {
        safeModifierIds.push(modifierId);
        continue;
      }

      if (!family) {
        continue;
      }

      pendingSelections.push(this.buildModifierFamilyPendingSelection(family, target));
      createdBlockingSelection = true;
    }

    return {
      safeModifierIds: uniqueCaseInsensitive(safeModifierIds),
      pendingSelections,
      createdBlockingSelection
    };
  }

  private normalizeUnsupportedSelectedOptionsAsModifiers(addItem: EngineAddItem, product: Product): EngineAddItem {
    const productOptionKeys = new Set((product.requiredOptions ?? []).map((option) => option.key));
    const unsupportedEntries = Object.entries(addItem.selectedOptions).filter(
      ([key]) => !productOptionKeys.has(key)
    );

    if (unsupportedEntries.length === 0) {
      return addItem;
    }

    const selectedOptions = Object.fromEntries(
      Object.entries(addItem.selectedOptions).filter(([key]) => productOptionKeys.has(key))
    );
    let modifierIds = [...addItem.modifierIds];
    let notes = addItem.notes;

    for (const [key, values] of unsupportedEntries) {
      const inferredModifier = this.modifierForUnsupportedSelectedOption(key, product);
      if (!inferredModifier) {
        continue;
      }

      modifierIds.push(inferredModifier.id);
      if (values.length > 0) {
        const detail = `${inferredModifier.name} sabor ${values.join(", ")}`;
        notes =
          notes && this.normalizeForMatching(notes).includes(this.normalizeForMatching(detail))
            ? notes
            : notes
              ? `${notes}. ${detail}`
              : detail;
      }
    }

    return {
      ...addItem,
      modifierIds: uniqueCaseInsensitive(modifierIds),
      selectedOptions,
      notes
    };
  }

  private modifierForUnsupportedSelectedOption(key: string, product: Product) {
    if (product.modifierGroupIds.length === 0) {
      return null;
    }

    const normalizedKey = this.normalizeForMatching(key);
    if (!normalizedKey.includes("icecream") && !normalizedKey.includes("helado")) {
      return null;
    }

    return this.catalogService.findModifierOptionByNameOrAlias("Helado");
  }

  private guardSelectedOptions(
    product: Product,
    selectedOptions: Record<string, string[]>,
    currentMessage: string
  ) {
    const guarded: Record<string, string[]> = {};

    for (const [key, values] of Object.entries(selectedOptions)) {
      const option = (product.requiredOptions ?? []).find((entry) => entry.key === key);
      if (!option) {
        continue;
      }

      const safeValues = values.filter((value) => this.hasAnyEvidenceTerm(currentMessage, [value]));
      if (safeValues.length > 0) {
        guarded[key] = safeValues;
      }
    }

    return guarded;
  }

  private guardSelectedOptionRoles(
    draft: OrderDraft,
    product: Product,
    selectedOptions: Record<string, string[]>,
    currentMessage: string,
    target: { targetItemId?: string | null; targetProductId?: string | null }
  ): SelectedOptionRoleGuard {
    const evidenceGuarded = this.guardSelectedOptions(product, selectedOptions, currentMessage);
    const guarded: Record<string, string[]> = {};
    const pendingSelections: Array<Omit<PendingSelection, "id">> = [];
    let createdBlockingSelection = false;

    for (const [key, values] of Object.entries(evidenceGuarded)) {
      const option = (product.requiredOptions ?? []).find((entry) => entry.key === key);
      if (!option) {
        continue;
      }

      const safeValues: string[] = [];
      for (const value of values) {
        const modifier = this.catalogService.findModifierOptionByNameOrAlias(value);
        const modifierCanApplyToProduct =
          Boolean(modifier) &&
          product.modifierGroupIds.includes(modifier?.modifierGroupId ?? "");

        if (
          modifier &&
          modifierCanApplyToProduct &&
          !this.hasActiveRequiredOptionPrompt(draft, option, target) &&
          !this.hasExplicitRequiredOptionRole(currentMessage, option, value) &&
          !this.hasExplicitModifierRole(currentMessage)
        ) {
          pendingSelections.push(
            this.buildAmbiguousCatalogRolePendingSelection(product, option, modifier, target)
          );
          createdBlockingSelection = true;
          continue;
        }

        safeValues.push(value);
      }

      if (safeValues.length > 0) {
        guarded[key] = safeValues;
      }
    }

    return {
      selectedOptions: guarded,
      pendingSelections,
      createdBlockingSelection
    };
  }

  private buildAmbiguousCatalogRolePendingSelection(
    product: Product,
    option: ProductRequiredOption,
    modifier: ModifierOption,
    target: { targetItemId?: string | null; targetProductId?: string | null }
  ): Omit<PendingSelection, "id"> {
    const roleLabel = this.humanizeRequiredOptionLabel(option.label);
    return {
      type: "catalog_choice",
      targetItemId: target.targetItemId ?? null,
      targetProductId: target.targetProductId ?? product.id,
      label: `uso de ${modifier.name}`,
      options: [`${modifier.name} como ${roleLabel}`, `${modifier.name} como topping/adicion`],
      blocking: true,
      question: `${modifier.name} puede ir como ${roleLabel} o como topping/adicion. Como lo quieres?`
    };
  }

  private humanizeRequiredOptionLabel(label: string) {
    const normalized = this.normalizeForMatching(label);
    if (normalized.includes("sabor") && normalized.includes("helado")) {
      return "sabor de helado";
    }
    return label.toLowerCase();
  }

  private hasActiveRequiredOptionPrompt(
    draft: OrderDraft,
    option: ProductRequiredOption,
    target: { targetItemId?: string | null; targetProductId?: string | null }
  ) {
    return draft.pendingSelections.some((selection) => {
      if (selection.type !== "required_option") {
        return false;
      }

      const sameTargetItem = target.targetItemId
        ? selection.targetItemId === target.targetItemId
        : true;
      const sameTargetProduct = target.targetProductId
        ? selection.targetProductId === target.targetProductId
        : true;

      return (
        sameTargetItem &&
        sameTargetProduct &&
        this.normalizeForMatching(selection.label) === this.normalizeForMatching(option.label)
      );
    });
  }

  private hasExplicitRequiredOptionRole(
    message: string,
    option: ProductRequiredOption,
    value: string
  ) {
    const normalizedMessage = this.normalizeForMatching(message);
    const normalizedValue = this.normalizeForMatching(value);
    const normalizedLabel = this.normalizeForMatching(option.label);
    if (!normalizedMessage || !normalizedValue || !normalizedLabel) {
      return false;
    }

    const labelWords = uniqueCaseInsensitive(normalizedLabel.split(/\s+/).filter(Boolean));
    const roleEvidence = [
      normalizedLabel,
      ...labelWords,
      normalizedLabel.includes("helado") ? "helado" : "",
      normalizedLabel.includes("sabor") ? "sabor" : "",
      normalizedLabel.includes("salsa") ? "salsa" : "",
      normalizedLabel.includes("fruta") ? "fruta" : ""
    ].filter(Boolean);

    return roleEvidence.some((role) =>
      [
        `${role} ${normalizedValue}`,
        `${role} de ${normalizedValue}`,
        `${normalizedValue} como ${role}`,
        `como ${role} ${normalizedValue}`,
        `${normalizedLabel} ${normalizedValue}`,
        `${normalizedLabel} de ${normalizedValue}`
      ].some((pattern) => normalizedMessage.includes(pattern))
    );
  }

  private hasExplicitModifierRole(message: string) {
    const normalizedMessage = this.normalizeForMatching(message);
    return /\b(topping|toppings|adicion|adicional|extra|agregar|agregale|ponle|echale|encima)\b/.test(
      normalizedMessage
    );
  }

  private productFamilyForProduct(product: Product) {
    return PRODUCT_FAMILIES.find((family) => {
      if (family.productIds?.includes(product.id)) {
        return true;
      }

      if (family.category && product.category === family.category) {
        return true;
      }

      return (family.nameIncludes ?? []).some((term) => this.hasAnyEvidenceTerm(product.name, [term]));
    }) ?? null;
  }

  private modifierFamilyForModifier(modifier: ModifierOption) {
    return MODIFIER_FAMILIES.find((family) => family.modifierIds.includes(modifier.id)) ?? null;
  }

  private hasProductSelectionEvidence(
    product: Product,
    family: ProductFamilyMetadata,
    currentMessage: string,
    draft: OrderDraft
  ) {
    if (this.hasExactCatalogEvidence(currentMessage, this.buildExactVariantEvidenceTerms(product, family))) {
      return true;
    }

    if (!this.hasPendingProductFamilyClarification(draft, family)) {
      return false;
    }

    return this.hasExactCatalogEvidence(
      currentMessage,
      this.buildVariantEvidenceTerms(product, family)
    );
  }

  private hasPendingProductFamilyClarification(draft: OrderDraft, family: ProductFamilyMetadata) {
    const familyProducts = this.productsForFamily(family).map((product) => product.name);
    return draft.pendingSelections.some(
      (selection) =>
        selection.type === "product_clarification" &&
        (selection.label === family.label ||
          selection.options.some((option) => familyProducts.includes(option)))
    );
  }

  private buildProductFamilyPendingSelection(family: ProductFamilyMetadata): Omit<PendingSelection, "id"> {
    return {
      type: "product_clarification",
      targetItemId: null,
      targetProductId: null,
      label: family.label,
      options: this.productsForFamily(family).map((product) => product.name),
      blocking: true,
      question: family.question
    };
  }

  private buildModifierFamilyPendingSelection(
    family: ModifierFamilyMetadata,
    target: { targetItemId?: string | null; targetProductId?: string | null }
  ): Omit<PendingSelection, "id"> {
    return {
      type: "modifier_clarification",
      targetItemId: target.targetItemId ?? null,
      targetProductId: target.targetProductId ?? null,
      label: family.label,
      options: this.modifiersForFamily(family).map((modifier) => modifier.name),
      blocking: true,
      question: family.question
    };
  }

  private productsForFamily(family: ProductFamilyMetadata) {
    return this.catalogService.listActiveProducts().filter((product) => {
      if (family.productIds) {
        return family.productIds.includes(product.id);
      }

      if (family.category && product.category === family.category) {
        return true;
      }

      return (family.nameIncludes ?? []).some((term) => this.hasAnyEvidenceTerm(product.name, [term]));
    });
  }

  private modifiersForFamily(family: ModifierFamilyMetadata) {
    const allowedIds = new Set(family.modifierIds);
    return this.catalogService.listModifierOptions().filter((modifier) => allowedIds.has(modifier.id));
  }

  private hasExactCatalogEvidence(text: string, candidates: string[]) {
    return candidates.some((candidate) => this.hasAnyEvidenceTerm(text, [candidate]));
  }

  private buildVariantEvidenceTerms(product: Product, family: ProductFamilyMetadata) {
    return uniqueCaseInsensitive(
      [product.name, ...product.aliases]
        .flatMap((candidate) => [
          candidate,
          this.stripFamilyPrefix(candidate, family.familyTerms)
        ])
        .filter((candidate): candidate is string => Boolean(candidate?.trim()))
        .filter((candidate) => !this.isGenericFamilyEvidence(candidate, family))
    );
  }

  private buildExactVariantEvidenceTerms(product: Product, family: ProductFamilyMetadata) {
    return uniqueCaseInsensitive(
      [product.name, ...product.aliases]
        .filter((candidate) => Boolean(candidate?.trim()))
        .filter((candidate) => !this.isGenericFamilyEvidence(candidate, family))
    );
  }

  private isGenericFamilyEvidence(candidate: string, family: ProductFamilyMetadata) {
    const normalizedCandidate = this.normalizeForMatching(candidate).trim();
    if (!normalizedCandidate) {
      return true;
    }

    return family.familyTerms.some(
      (term) => {
        const normalizedTerm = this.normalizeForMatching(term).trim();
        const candidateTokens = this.evidenceTokens(normalizedCandidate);
        const familyTokens = new Set(this.evidenceTokens(normalizedTerm));
        return (
          normalizedCandidate === normalizedTerm ||
          (candidateTokens.length > 0 && candidateTokens.every((token) => familyTokens.has(token)))
        );
      }
    );
  }

  private stripFamilyPrefix(candidate: string, familyTerms: string[]) {
    const candidateTokens = this.evidenceTokens(candidate);

    for (const familyTerm of familyTerms) {
      const familyTokens = this.evidenceTokens(familyTerm);
      const startsWithFamily = familyTokens.every((token, index) => candidateTokens[index] === token);
      if (!startsWithFamily) {
        continue;
      }

      const strippedTokens = candidateTokens.slice(familyTokens.length);
      while (["de", "con"].includes(strippedTokens[0] ?? "")) {
        strippedTokens.shift();
      }

      return strippedTokens.join(" ");
    }

    return null;
  }

  private hasAnyEvidenceTerm(text: string, candidates: string[]) {
    const textTokens = this.evidenceTokens(text);
    return candidates.some((candidate) => {
      const candidateTokens = this.evidenceTokens(candidate);
      if (candidateTokens.length === 0 || candidateTokens.length > textTokens.length) {
        return false;
      }

      return textTokens.some((_, startIndex) =>
        candidateTokens.every((token, offset) => textTokens[startIndex + offset] === token)
      );
    });
  }

  private evidenceTokens(text: string) {
    return this.normalizeForMatching(text)
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .split(/\s+/)
      .filter(Boolean);
  }

  private tryResolveEngineTargetItem(
    draft: OrderDraft,
    targetItemId: string | null,
    targetItemIndex: number | null
  ) {
    return (
      (targetItemId ? draft.items.find((entry) => entry.id === targetItemId) : null) ??
      (targetItemIndex ? draft.items[targetItemIndex - 1] : null) ??
      null
    );
  }

  private recoverMissingItemsForRequiredOptions(
    draft: OrderDraft,
    selections: Array<Omit<PendingSelection, "id"> | PendingSelection>
  ) {
    let recovered = false;

    for (const selection of selections) {
      if (selection.type !== "required_option" || !selection.blocking || !selection.targetProductId) {
        continue;
      }

      if (draft.items.some((item) => item.productId === selection.targetProductId)) {
        continue;
      }

      const product = this.requireProduct(selection.targetProductId);
      const hasRequiredOptions = (product.requiredOptions ?? []).some((option) => option.required);
      if (!hasRequiredOptions) {
        continue;
      }

      draft.items.push(this.buildDraftItem(product, 1, [], {}, [], null));
      recovered = true;
    }

    return recovered;
  }

  private attachPendingSelectionsToDraftItems(
    draft: OrderDraft,
    selections: Array<Omit<PendingSelection, "id"> | PendingSelection>
  ) {
    return selections.flatMap((selection) => {
      if (!this.pendingSelectionIsValidForDraft(draft, selection)) {
        return [];
      }

      if (selection.targetItemId || !selection.targetProductId) {
        return [selection];
      }

      const matches = draft.items.filter((item) => item.productId === selection.targetProductId);
      if (matches.length !== 1) {
        return [selection];
      }

      return [{
        ...selection,
        targetItemId: matches[0]!.id
      }];
    });
  }

  private pendingSelectionIsValidForDraft(
    draft: OrderDraft,
    selection: Omit<PendingSelection, "id"> | PendingSelection
  ) {
    if (selection.type !== "required_option") {
      return true;
    }

    const product =
      selection.targetProductId
        ? this.catalogService.findProductById(selection.targetProductId)
        : selection.targetItemId
          ? this.catalogService.findProductById(
              draft.items.find((item) => item.id === selection.targetItemId)?.productId ?? ""
            )
          : null;
    if (!product) {
      return false;
    }

    return (product.requiredOptions ?? []).some((option) => option.required);
  }

  /**
   * Legacy name kept private while the architecture migrates to OpenAI-first.
   * This method validates/applies structured AI patch data. Text is only used as
   * evidence to prevent options from leaking between different product clauses.
   */
  private applyEnginePatchToDraft(
    draft: OrderDraft,
    result: OpenAIOrderEngineOutput,
    currentMessage: string
  ) {
    for (const removal of result.draftPatch.removeItems) {
      const target = this.resolveEngineTargetItem(draft, removal.targetItemId, removal.targetItemIndex);
      draft.items = draft.items.filter((item) => item.id !== target.id);
    }

    const addedProducts = result.draftPatch.addItems.map((item) => this.requireProduct(item.productId));

    for (const addItem of result.draftPatch.addItems) {
      const product = this.requireProduct(addItem.productId);
      const modifiers = addItem.modifierIds.map((modifierId) => this.requireModifier(modifierId));
      this.validateProductModifiers(product, modifiers);
      const selectedOptions = this.filterSelectedOptionsByProductClause(
        product,
        this.validateSelectedOptions(product, addItem.selectedOptions, addItem.quantity),
        currentMessage,
        addedProducts
      );
      draft.items.push(
        this.withPerUnitSelectedOptionCounts(
          this.buildDraftItem(
            product,
            addItem.quantity,
            modifiers,
            selectedOptions,
            addItem.removals,
            addItem.notes
          ),
          product,
          selectedOptions
        )
      );
    }

    for (const update of result.draftPatch.updateItems) {
      const item = this.resolveEngineTargetItem(draft, update.targetItemId, update.targetItemIndex);
      const product = this.requireProduct(item.productId);
      const modifiers = update.modifierIdsToAdd.map((modifierId) => this.requireModifier(modifierId));
      this.validateProductModifiers(product, modifiers);
      if (update.quantity) {
        item.quantity = update.quantity;
      }
      if (update.quantityDelta) {
        item.quantity = Math.max(1, item.quantity + update.quantityDelta);
      }
      const selectedOptions = this.validateSelectedOptions(
        product,
        update.selectedOptions,
        item.quantity
      );
      item.selectedOptions = {
        ...(item.selectedOptions ?? {}),
        ...selectedOptions
      };
      this.incrementPerUnitSelectedOptionCounts(item, product, selectedOptions);
      for (const modifier of modifiers) {
        this.addModifierComponentIfMissing(item, modifier);
      }
      for (const removal of update.removals) {
        this.applyEngineRemovalToItem(item, removal);
      }
      if (update.notes) {
        item.notes = this.sanitizeOrderItemNotes(update.notes);
      }
    }

    if (result.draftPatch.setCustomerName) {
      const customerName = this.normalizeCustomerNameCandidate(result.draftPatch.setCustomerName);
      if (customerName) {
        draft.customerName = customerName;
      }
    }
    if (result.draftPatch.setFulfillmentType) {
      draft.fulfillmentType = result.draftPatch.setFulfillmentType;
      if (draft.fulfillmentType === "pickup") {
        draft.inferredZoneId = null;
        draft.neighborhood = null;
        draft.addressReference = null;
        draft.address = draft.address?.trim() || "Recoge en tienda";
      } else if (draft.address === "Recoge en tienda") {
        draft.address = null;
      }
    }
    if (result.draftPatch.setAddress && result.draftPatch.setFulfillmentType !== "pickup") {
      draft.fulfillmentType = "delivery";
      draft.address = result.draftPatch.setAddress;
    }
    if (result.draftPatch.setNeighborhood && result.draftPatch.setFulfillmentType !== "pickup") {
      draft.fulfillmentType = "delivery";
      draft.neighborhood = result.draftPatch.setNeighborhood.trim();
    }
    if (result.draftPatch.setAddressReference && result.draftPatch.setFulfillmentType !== "pickup") {
      draft.fulfillmentType = "delivery";
      draft.addressReference = result.draftPatch.setAddressReference.trim();
    }
    if (
      !draft.address?.trim() &&
      result.draftPatch.rawAddressText &&
      result.draftPatch.setFulfillmentType !== "pickup"
    ) {
      draft.fulfillmentType = "delivery";
      draft.address = result.draftPatch.rawAddressText;
    }
    if (
      !draft.neighborhood?.trim() &&
      result.draftPatch.possibleNeighborhoodText &&
      result.draftPatch.setFulfillmentType !== "pickup"
    ) {
      draft.fulfillmentType = "delivery";
      draft.neighborhood = result.draftPatch.possibleNeighborhoodText.trim();
    }
    if (
      !draft.addressReference?.trim() &&
      result.draftPatch.possibleLandmarkText &&
      result.draftPatch.setFulfillmentType !== "pickup"
    ) {
      draft.fulfillmentType = "delivery";
      draft.addressReference = result.draftPatch.possibleLandmarkText.trim();
    }
    if (result.draftPatch.setZoneId) {
      logger.warn("Ignoring direct setZoneId from OpenAIOrderEngine; zone must resolve from customer text", {
        setZoneId: result.draftPatch.setZoneId
      });
    }
    if (result.draftPatch.setPaymentMethod) {
      if (!this.businessService.getDefaultBusiness().paymentMethods.includes(result.draftPatch.setPaymentMethod)) {
        throw new Error(`Invalid payment method from OpenAIOrderEngine: ${result.draftPatch.setPaymentMethod}`);
      }
      draft.paymentMethod = result.draftPatch.setPaymentMethod;
      if (draft.paymentMethod !== "Contra entrega") {
        draft.cashAmount = null;
      }
    }
    if (result.draftPatch.setCashAmount) {
      draft.cashAmount = result.draftPatch.setCashAmount;
    }
    if (result.draftPatch.setNotes) {
      draft.notes = result.draftPatch.setNotes;
    }

    this.validateAndNormalizeNeighborhood(draft);
  }

  private buildDraftItem(
    product: Product,
    quantity: number,
    modifiers: Array<ReturnType<ConversationService["requireModifier"]>>,
    selectedOptions: Record<string, string[]>,
    removals: string[],
    notes: string | null
  ): OrderItem {
    return {
      id: createId("item"),
      productId: product.id,
      productName: product.name,
      quantity,
      unitBasePrice: product.basePrice,
      selectedOptions,
      components: [
        ...product.defaultComponents.map((component) => ({
          name: component,
          type: "default" as const,
          priceDelta: 0
        })),
        ...modifiers.map((modifier) => ({
          name: modifier.name,
          type: "added" as const,
          priceDelta: modifier.priceDelta
        })),
        ...removals.map((removal) => ({
          name: removal,
          type: "removed" as const,
          priceDelta: 0
        }))
      ],
      notes: this.sanitizeOrderItemNotes(notes)
    };
  }

  private addModifierComponentIfMissing(
    item: OrderItem,
    modifier: ReturnType<ConversationService["requireModifier"]>
  ) {
    const normalizedModifierName = this.normalizeForMatching(modifier.name);
    const alreadyPresent = item.components.some(
      (component) =>
        component.type !== "removed" &&
        this.normalizeForMatching(component.name) === normalizedModifierName
    );

    if (!alreadyPresent) {
      item.components.push({
        name: modifier.name,
        type: "added",
        priceDelta: modifier.priceDelta
      });
    }
  }

  private applyEngineRemovalToItem(item: OrderItem, removal: string) {
    if (this.removeAddedComponentMatchingRemoval(item, removal)) {
      return;
    }

    const removalCandidates = this.normalizedRemovalCandidates(removal);
    const matchingDefault = item.components.some(
      (component) =>
        component.type === "default" &&
        removalCandidates.has(this.normalizeForMatching(component.name))
    );
    if (!matchingDefault) {
      return;
    }

    const alreadyRemoved = item.components.some(
      (component) =>
        component.type === "removed" &&
        removalCandidates.has(this.normalizeForMatching(component.name))
    );
    if (!alreadyRemoved) {
      item.components.push({
        name: removal,
        type: "removed",
        priceDelta: 0
      });
    }
  }

  private removeAddedComponentMatchingRemoval(item: OrderItem, removal: string) {
    const removalCandidates = this.normalizedRemovalCandidates(removal);
    const matchingAdded = item.components.find(
      (component) =>
        component.type === "added" &&
        removalCandidates.has(this.normalizeForMatching(component.name))
    );

    if (!matchingAdded) {
      return false;
    }

    item.components = item.components.filter((component) => component !== matchingAdded);
    return true;
  }

  private normalizedRemovalCandidates(removal: string) {
    const modifier = this.catalogService.findModifierOptionByNameOrAlias(removal) ?? this.findModifierInSegment(removal);
    return new Set(
      uniqueCaseInsensitive([
        removal,
        modifier?.name,
        ...(modifier?.aliases ?? [])
      ].filter((candidate): candidate is string => Boolean(candidate?.trim()))).map((candidate) =>
        this.normalizeForMatching(candidate)
      )
    );
  }

  private applyProductClarificationReplyToPendingSelections(draft: OrderDraft, text: string) {
    if (draft.pendingSelections.length === 0) {
      return [];
    }

    const mentionedModifiers = this.catalogService.findModifierOptionsMentioned(text);
    const resolvedIds: string[] = [];

    for (const selection of draft.pendingSelections) {
      if (selection.type !== "product_clarification") {
        continue;
      }

      const product = this.findProductForPendingSelectionReply(selection, text, draft);
      if (!product) {
        continue;
      }

      const existingItem = draft.items.find((item) => item.productId === product.id);
      if (!existingItem) {
        const modifiers = mentionedModifiers.filter((modifier) =>
          this.hasExactCatalogEvidence(text, [modifier.name, ...modifier.aliases])
        );
        this.validateProductModifiers(product, modifiers);
        draft.items.push(this.buildDraftItem(product, 1, modifiers, {}, [], null));
      }

      resolvedIds.push(selection.id);
    }

    return resolvedIds;
  }

  private findProductForPendingSelectionReply(
    selection: PendingSelection,
    text: string,
    draft: OrderDraft
  ) {
    const allowedProducts = this.catalogService.listActiveProducts().filter((product) =>
      selection.options.some((option) => this.normalizeForMatching(option) === this.normalizeForMatching(product.name))
    );

    const matches = allowedProducts.filter((product) => {
      const family = this.productFamilyForProduct(product);
      return family
        ? this.hasProductSelectionEvidence(product, family, text, draft)
        : this.hasExactCatalogEvidence(text, [product.name, ...product.aliases]);
    });

    const uniqueMatches = matches.filter(
      (product, index, list) => list.findIndex((entry) => entry.id === product.id) === index
    );

    return uniqueMatches.length === 1 ? uniqueMatches[0] ?? null : null;
  }

  private applyModifierReplyToPendingSelections(draft: OrderDraft, text: string) {
    const mentionedModifiers = this.catalogService.findModifierOptionsMentioned(text);
    if (mentionedModifiers.length === 0 || draft.pendingSelections.length === 0) {
      return [];
    }

    const resolvedIds: string[] = [];
    for (const selection of draft.pendingSelections) {
      if (selection.type !== "modifier_clarification") {
        continue;
      }

      const targetItem = this.resolvePendingSelectionTargetItem(draft, selection);
      if (!targetItem) {
        continue;
      }

      const product = this.requireProduct(targetItem.productId);
      const selectedModifiers = this.filterModifiersAllowedByPendingSelection(
        mentionedModifiers,
        selection
      );
      if (selectedModifiers.length === 0) {
        continue;
      }

      this.validateProductModifiers(product, selectedModifiers);
      for (const modifier of selectedModifiers) {
        if (
          !targetItem.components.some(
            (component) => component.type === "added" && component.name === modifier.name
          )
        ) {
          targetItem.components.push({
            name: modifier.name,
            type: "added",
            priceDelta: modifier.priceDelta
          });
        }
      }
      resolvedIds.push(selection.id);
    }

    return resolvedIds;
  }

  private applyCatalogChoiceReplyToPendingSelections(draft: OrderDraft, text: string) {
    if (draft.pendingSelections.length === 0) {
      return [];
    }

    const wantsRequiredOption = this.messageChoosesRequiredOptionRole(text);
    const wantsModifier = this.messageChoosesModifierRole(text);
    if (wantsRequiredOption === wantsModifier) {
      return [];
    }

    const resolvedIds: string[] = [];
    for (const selection of draft.pendingSelections) {
      if (selection.type !== "catalog_choice") {
        continue;
      }

      const targetItem = this.resolvePendingSelectionTargetItem(draft, selection);
      const product = targetItem ? this.catalogService.findProductById(targetItem.productId) : null;
      const modifier = this.findModifierForCatalogChoiceSelection(selection);
      if (!targetItem || !product || !modifier) {
        continue;
      }

      if (wantsModifier) {
        this.validateProductModifiers(product, [modifier]);
        if (
          !targetItem.components.some(
            (component) => component.type === "added" && component.name === modifier.name
          )
        ) {
          targetItem.components.push({
            name: modifier.name,
            type: "added",
            priceDelta: modifier.priceDelta
          });
        }
        resolvedIds.push(selection.id);
        continue;
      }

      const option = (product.requiredOptions ?? []).find((entry) =>
        entry.options.some(
          (value) =>
            this.normalizeForMatching(value) === this.normalizeForMatching(modifier.name) ||
            modifier.aliases.some(
              (alias) => this.normalizeForMatching(value) === this.normalizeForMatching(alias)
            )
        )
      );
      if (!option) {
        continue;
      }

      const canonical = this.findCanonicalRequiredOptionValue(option, modifier.name) ?? modifier.name;
      targetItem.selectedOptions ??= {};
      const current = targetItem.selectedOptions[option.key] ?? [];
      const maxSelections = this.effectiveRequiredOptionMaxSelections(option, targetItem.quantity);
      targetItem.selectedOptions[option.key] = uniqueCaseInsensitive([...current, canonical]).slice(
        0,
        maxSelections
      );
      this.incrementPerUnitSelectedOptionCounts(targetItem, product, { [option.key]: [canonical] });
      resolvedIds.push(selection.id);
    }

    return resolvedIds;
  }

  private messageChoosesRequiredOptionRole(text: string) {
    const normalized = this.normalizeForMatching(text);
    return /\b(sabor|sabores|helado|fruta|salsa)\b/.test(normalized);
  }

  private messageChoosesModifierRole(text: string) {
    const normalized = this.normalizeForMatching(text);
    return /\b(topping|toppings|adicion|adicional|extra|agregalo|agregale|ponlo|ponle|encima)\b/.test(
      normalized
    );
  }

  private findModifierForCatalogChoiceSelection(selection: PendingSelection) {
    const candidates = [selection.label, ...selection.options];
    for (const candidate of candidates) {
      const modifier = this.catalogService.listModifierOptions().find((option) =>
        [option.name, ...option.aliases].some((alias) =>
          this.normalizeForMatching(candidate).includes(this.normalizeForMatching(alias))
        )
      );
      if (modifier) {
        return modifier;
      }
    }

    return null;
  }

  private reconcileIncludedRequiredOptionsFromModifiers(draft: OrderDraft, currentMessage: string) {
    for (const item of draft.items) {
      const product = this.catalogService.findProductById(item.productId);
      if (!product?.requiredOptions?.length) {
        continue;
      }

      item.selectedOptions ??= {};
      for (const option of product.requiredOptions) {
        const matchingAddedComponents = item.components.filter(
          (component) =>
            component.type === "added" &&
            option.options.some(
              (candidate) =>
                this.normalizeForMatching(candidate) === this.normalizeForMatching(component.name)
            )
        );

        if (matchingAddedComponents.length === 0) {
          continue;
        }

        const inferredValues = matchingAddedComponents
          .map((component) => this.findCanonicalRequiredOptionValue(option, component.name))
          .filter((value): value is string => Boolean(value));
        const currentValues = item.selectedOptions[option.key] ?? [];
        const effectiveMaxSelections = this.effectiveRequiredOptionMaxSelections(option, item.quantity);
        item.selectedOptions[option.key] = uniqueCaseInsensitive([
          ...currentValues,
          ...inferredValues
        ]).slice(0, effectiveMaxSelections);
        this.mergeRequiredOptionQuantityMap(
          item,
          option,
          this.extractRequiredOptionQuantityMap(option, currentMessage),
          effectiveMaxSelections
        );

        const selectedValues = new Set(
          (item.selectedOptions[option.key] ?? []).map((value) => this.normalizeForMatching(value))
        );
        item.components = item.components.filter((component) => {
          if (
            component.type !== "added" ||
            !selectedValues.has(this.normalizeForMatching(component.name))
          ) {
            return true;
          }

          const modifier =
            this.catalogService.findModifierOptionByNameOrAlias(component.name) ?? {
              name: component.name,
              aliases: []
            };
          return this.hasModifierIncrement(currentMessage, modifier);
        });
      }
    }
  }

  private findCanonicalRequiredOptionValue(option: ProductRequiredOption, value: string) {
    const normalizedValue = this.normalizeForMatching(value);
    return (
      option.options.find(
        (candidate) => this.normalizeForMatching(candidate) === normalizedValue
      ) ??
      this.findConservativeFuzzyRequiredOptionValue(option, normalizedValue) ??
      null
    );
  }

  private reconcileRequiredOptionsFromCurrentMessage(draft: OrderDraft, currentMessage: string) {
    const productsInMessage = this.getDraftProductsMentionedInMessage(draft, currentMessage);
    for (const item of draft.items) {
      const product = this.catalogService.findProductById(item.productId);
      if (!product?.requiredOptions?.length) {
        continue;
      }

      const sourceText =
        productsInMessage.length > 1
          ? this.extractProductClause(currentMessage, product, productsInMessage)
          : currentMessage;
      item.selectedOptions ??= {};

      for (const option of product.requiredOptions) {
        const currentValues = item.selectedOptions[option.key] ?? [];
        const effectiveMaxSelections = this.effectiveRequiredOptionMaxSelections(option, item.quantity);
        if (currentValues.length >= effectiveMaxSelections) {
          continue;
        }

        const inferredValues = this.extractSelectedValuesForRequiredOption(
          option,
          sourceText,
          product
        ).slice(0, effectiveMaxSelections);
        if (inferredValues.length === 0) {
          continue;
        }

        item.selectedOptions[option.key] = uniqueCaseInsensitive([
          ...currentValues,
          ...inferredValues
        ]).slice(0, effectiveMaxSelections);
        this.mergeRequiredOptionQuantityMap(
          item,
          option,
          this.extractRequiredOptionQuantityMap(option, currentMessage),
          effectiveMaxSelections
        );
      }
    }
  }

  private effectiveRequiredOptionMaxSelections(option: ProductRequiredOption, quantity: number) {
    return Math.max(option.maxSelections, option.maxSelections * Math.max(1, quantity));
  }

  private usesPerUnitRequiredOptionFlow(item: OrderItem, product: Product) {
    const requiredOptions = (product.requiredOptions ?? []).filter((option) => option.required);
    return item.quantity > 1 && item.quantity <= 3 && requiredOptions.length > 1;
  }

  private withPerUnitSelectedOptionCounts(
    item: OrderItem,
    product: Product,
    selectedOptions: Record<string, string[]>
  ) {
    this.incrementPerUnitSelectedOptionCounts(item, product, selectedOptions);
    return item;
  }

  private incrementPerUnitSelectedOptionCounts(
    item: OrderItem,
    product: Product,
    selectedOptions: Record<string, string[]>
  ) {
    if (!this.usesPerUnitRequiredOptionFlow(item, product)) {
      return;
    }

    for (const [key, values] of Object.entries(selectedOptions)) {
      const option = (product.requiredOptions ?? []).find((entry) => entry.key === key);
      if (!option) {
        continue;
      }

      const currentQuantityMap = item.selectedOptionQuantities?.[option.key] ?? {};
      const used = Object.values(currentQuantityMap).reduce((sum, quantity) => sum + quantity, 0);
      const available = Math.max(0, item.quantity - used);
      if (available === 0) {
        continue;
      }

      const quantityPatch: Record<string, number> = {};
      for (const value of values.slice(0, available)) {
        const canonical = this.findCanonicalRequiredOptionValue(option, value) ?? value;
        quantityPatch[canonical] = (quantityPatch[canonical] ?? 0) + 1;
      }

      this.mergeRequiredOptionQuantityMap(item, option, quantityPatch, item.quantity);
    }
  }

  private mergeRequiredOptionQuantityMap(
    item: OrderItem,
    option: ProductRequiredOption,
    quantities: Record<string, number>,
    maxSelections: number
  ) {
    const entries = Object.entries(quantities).filter(([, quantity]) => quantity > 0);
    if (entries.length === 0) {
      return;
    }

    item.selectedOptionQuantities ??= {};
    const current = item.selectedOptionQuantities[option.key] ?? {};
    const next: Record<string, number> = { ...current };
    let used = Object.values(next).reduce((sum, quantity) => sum + quantity, 0);

    for (const [value, quantity] of entries) {
      if (used >= maxSelections) {
        break;
      }

      const canonical = this.findCanonicalRequiredOptionValue(option, value) ?? value;
      const available = maxSelections - used;
      const safeQuantity = Math.min(quantity, available);
      next[canonical] = (next[canonical] ?? 0) + safeQuantity;
      used += safeQuantity;
    }

    item.selectedOptionQuantities[option.key] = next;
    item.selectedOptions ??= {};
    const explicitQuantityValues = Object.keys(next);
    const remainingValues = (item.selectedOptions[option.key] ?? []).filter(
      (value) =>
        !explicitQuantityValues.some(
          (explicit) => this.normalizeForMatching(explicit) === this.normalizeForMatching(value)
        )
    );
    item.selectedOptions[option.key] = uniqueCaseInsensitive([
      ...explicitQuantityValues,
      ...remainingValues
    ]).slice(0, maxSelections);
  }

  private extractRequiredOptionQuantityMap(option: ProductRequiredOption, text: string) {
    const normalized = this.normalizeForMatching(text);
    const matches: Array<{ value: string; quantity: number; index: number }> = [];

    for (const candidate of option.options) {
      const canonical = this.findCanonicalRequiredOptionValue(option, candidate) ?? candidate;
      const escaped = this.escapeRegex(this.normalizeForMatching(candidate));
      const quantityBefore = new RegExp(
        `\\b(${this.requiredOptionQuantityTokenPattern()})\\s*(?:de\\s+)?${escaped}\\b`,
        "i"
      );
      const quantityAfter = new RegExp(
        `\\b${escaped}\\s*(?:x|por)\\s*(${this.requiredOptionQuantityTokenPattern()})\\b`,
        "i"
      );
      const match = quantityBefore.exec(normalized) ?? quantityAfter.exec(normalized);
      const rawQuantity = match?.[1] ?? null;
      const quantity = rawQuantity ? this.parseSmallSpanishQuantity(rawQuantity) : null;

      if (match && quantity && quantity > 0) {
        matches.push({
          value: canonical,
          quantity,
          index: match.index
        });
      }
    }

    const quantities: Record<string, number> = {};
    for (const match of matches.sort((left, right) => left.index - right.index)) {
      quantities[match.value] = (quantities[match.value] ?? 0) + match.quantity;
    }

    return quantities;
  }

  private requiredOptionQuantityTokenPattern() {
    return "\\d+|un|una|uno|dos|par|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce";
  }

  private parseSmallSpanishQuantity(raw: string) {
    const normalized = this.normalizeForMatching(raw);
    const quantityWords: Record<string, number> = {
      un: 1,
      una: 1,
      uno: 1,
      dos: 2,
      par: 2,
      tres: 3,
      cuatro: 4,
      cinco: 5,
      seis: 6,
      siete: 7,
      ocho: 8,
      nueve: 9,
      diez: 10,
      once: 11,
      doce: 12
    };

    return /^\d+$/.test(normalized) ? Number(normalized) : quantityWords[normalized] ?? null;
  }

  private getDraftProductsMentionedInMessage(draft: OrderDraft, text: string) {
    const normalizedText = this.normalizeForMatching(text);
    return draft.items
      .map((item) => this.catalogService.findProductById(item.productId))
      .filter((product): product is Product => Boolean(product))
      .filter((product) =>
        [product.name, ...product.aliases].some((candidate) =>
          normalizedText.includes(this.normalizeForMatching(candidate))
        )
      );
  }

  private resolvePendingSelectionTargetItem(
    draft: OrderDraft,
    selection: PendingSelection
  ): OrderItem | null {
    if (selection.targetItemId) {
      return draft.items.find((item) => item.id === selection.targetItemId) ?? null;
    }

    if (selection.targetProductId) {
      const matches = draft.items.filter((item) => item.productId === selection.targetProductId);
      return matches.length === 1 ? matches[0] ?? null : null;
    }

    return draft.items.length === 1 ? draft.items[0] ?? null : null;
  }

  private applyExactRequiredOptionReply(draft: OrderDraft, currentMessage: string) {
    const selection = draft.pendingSelections.find(
      (entry) => entry.type === "required_option" && entry.blocking
    );
    if (!selection) {
      return [];
    }

    const targetItem = this.resolvePendingSelectionTargetItem(draft, selection);
    const product = targetItem ? this.catalogService.findProductById(targetItem.productId) : null;
    if (!targetItem || !product) {
      return [];
    }

    const allowedSelectionOptions = new Set(
      selection.options.map((option) => this.normalizeForMatching(option))
    );
    for (const option of product.requiredOptions ?? []) {
      const match = option.options.find((value) => {
        const normalizedValue = this.normalizeForMatching(value);
        return (
          allowedSelectionOptions.has(normalizedValue) &&
          this.requiredOptionReplyMatchesValue(currentMessage, value)
        );
      });

      if (!match) {
        continue;
      }

      targetItem.selectedOptions ??= {};
      const current = targetItem.selectedOptions[option.key] ?? [];
      const maxSelections = this.effectiveRequiredOptionMaxSelections(option, targetItem.quantity);
      targetItem.selectedOptions[option.key] = uniqueCaseInsensitive([...current, match]).slice(
        0,
        maxSelections
      );
      this.incrementPerUnitSelectedOptionCounts(targetItem, product, { [option.key]: [match] });
      return [selection.id];
    }

    return [];
  }

  private requiredOptionReplyMatchesValue(message: string, optionValue: string) {
    const normalizedMessage = this.normalizeForMatching(message);
    const normalizedValue = this.normalizeForMatching(optionValue);
    if (!normalizedMessage || !normalizedValue) {
      return false;
    }

    return [
      normalizedValue,
      `con ${normalizedValue}`,
      `de ${normalizedValue}`,
      `sabor ${normalizedValue}`,
      `salsa ${normalizedValue}`,
      `fruta ${normalizedValue}`,
      `topping ${normalizedValue}`
    ].includes(normalizedMessage);
  }

  private filterStructurallyResolvedPendingSelectionIds(
    draft: OrderDraft,
    existingSelections: PendingSelection[],
    requestedIds: string[]
  ) {
    return requestedIds.filter((id) => {
      const selection = existingSelections.find((entry) => entry.id === id);
      if (!selection) {
        return true;
      }

      return this.pendingSelectionIsStructurallyResolved(draft, selection);
    });
  }

  private pendingSelectionIsStructurallyResolved(draft: OrderDraft, selection: PendingSelection) {
    switch (selection.type) {
      case "modifier_clarification":
        return this.modifierClarificationIsApplied(draft, selection);
      case "product_clarification":
        return this.productClarificationIsApplied(draft, selection);
      case "required_option":
        return this.requiredOptionIsApplied(draft, selection);
      case "catalog_choice":
        return this.catalogChoiceIsApplied(draft, selection);
      default:
        return true;
    }
  }

  private findStructurallyResolvedPendingSelectionIds(
    draft: OrderDraft,
    existingSelections: PendingSelection[]
  ) {
    return existingSelections
      .filter((selection) => this.pendingSelectionIsStructurallyResolved(draft, selection))
      .map((selection) => selection.id);
  }

  private modifierClarificationIsApplied(draft: OrderDraft, selection: PendingSelection) {
    const targetItem = this.resolvePendingSelectionTargetItem(draft, selection);
    if (!targetItem) {
      return false;
    }

    const allowedOptions = selection.options.map((option) => this.normalizeForMatching(option));
    return targetItem.components.some((component) => {
      if (component.type !== "added") {
        return false;
      }

      const normalizedComponent = this.normalizeForMatching(component.name);
      return allowedOptions.some(
        (option) =>
          normalizedComponent === option ||
          normalizedComponent.includes(option) ||
          option.includes(normalizedComponent)
      );
    });
  }

  private productClarificationIsApplied(draft: OrderDraft, selection: PendingSelection) {
    const allowedOptions = selection.options.map((option) => this.normalizeForMatching(option));
    return draft.items.some((item) => allowedOptions.includes(this.normalizeForMatching(item.productName)));
  }

  private requiredOptionIsApplied(draft: OrderDraft, selection: PendingSelection) {
    const targetItem = this.resolvePendingSelectionTargetItem(draft, selection);
    if (!targetItem) {
      return false;
    }

    const allowedOptions = selection.options.map((option) => this.normalizeForMatching(option));
    return Object.values(targetItem.selectedOptions ?? {}).some((values) =>
      values.some((value) => allowedOptions.includes(this.normalizeForMatching(value)))
    );
  }

  private catalogChoiceIsApplied(draft: OrderDraft, selection: PendingSelection) {
    const targetItem = this.resolvePendingSelectionTargetItem(draft, selection);
    const modifier = this.findModifierForCatalogChoiceSelection(selection);
    if (!targetItem || !modifier) {
      return false;
    }

    const selectedAsModifier = targetItem.components.some(
      (component) =>
        component.type === "added" &&
        this.normalizeForMatching(component.name) === this.normalizeForMatching(modifier.name)
    );
    const selectedAsRequiredOption = Object.values(targetItem.selectedOptions ?? {}).some((values) =>
      values.some(
        (value) =>
          this.normalizeForMatching(value) === this.normalizeForMatching(modifier.name) ||
          modifier.aliases.some(
            (alias) => this.normalizeForMatching(value) === this.normalizeForMatching(alias)
          )
      )
    );

    return selectedAsModifier || selectedAsRequiredOption;
  }

  private filterModifiersAllowedByPendingSelection(
    modifiers: ModifierOption[],
    selection: PendingSelection
  ) {
    if (selection.options.length === 0) {
      return modifiers;
    }

    const allowedOptions = selection.options.map((option) => this.normalizeForMatching(option));
    return modifiers.filter((modifier) => {
      const candidates = [modifier.name, ...modifier.aliases].map((candidate) =>
        this.normalizeForMatching(candidate)
      );
      return candidates.some((candidate) =>
        allowedOptions.some(
          (allowedOption) =>
            candidate === allowedOption ||
            candidate.includes(allowedOption) ||
            allowedOption.includes(candidate)
        )
      );
    });
  }

  private normalizePendingSelections(
    selections: Array<Omit<PendingSelection, "id"> | PendingSelection>
  ): PendingSelection[] {
    const seen = new Set<string>();
    return selections
      .filter((selection) => selection.question?.trim())
      .map((selection) => ({
        ...selection,
        id: "id" in selection && selection.id ? selection.id : createId("pending"),
        options: uniqueCaseInsensitive(selection.options ?? []),
        question: this.normalizePendingSelectionQuestion(selection)
      }))
      .filter((selection) => {
        const key =
          selection.type === "required_option"
            ? [
                selection.type,
                selection.targetItemId,
                selection.targetProductId,
                selection.label
              ].join(":")
            : [
                selection.type,
                selection.targetItemId,
                selection.targetProductId,
                selection.label,
                selection.question
              ].join(":");
        if (seen.has(key)) {
          return false;
        }
        seen.add(key);
        return true;
      });
  }

  private normalizePendingSelectionQuestion(selection: Omit<PendingSelection, "id"> | PendingSelection) {
    const options = uniqueCaseInsensitive(selection.options ?? []);
    if (selection.type === "product_clarification" && options.length > 0) {
      const visibleOptions = options.slice(0, 8).join(", ");
      const suffix = options.length > 8 ? " u otra opcion del menu" : "";
      return `Tenemos varias opciones: ${visibleOptions}${suffix}. Cual quieres? Si prefieres, tambien te puedo mandar el menu.`;
    }

    if (selection.type === "required_option" && options.length > 0) {
      if (this.pendingQuestionAlreadyListsOptions(selection.question, options)) {
        return selection.question;
      }
      const visibleOptions = options.slice(0, 8).join(", ");
      const suffix = options.length > 8 ? " u otra opcion disponible" : "";
      return `${selection.question} Opciones: ${visibleOptions}${suffix}.`;
    }

    if (selection.type !== "modifier_clarification" || options.length === 0) {
      return selection.question;
    }

    const visibleOptions = options.slice(0, 6).join(", ");
    return `Cual opcion quieres agregar: ${visibleOptions}?`;
  }

  private pendingQuestionAlreadyListsOptions(question: string, options: string[]) {
    if (/\bopciones\b/i.test(question)) {
      return true;
    }

    const normalizedQuestion = this.normalizeForMatching(question);
    const listedCount = options.filter((option) =>
      normalizedQuestion.includes(this.normalizeForMatching(option))
    ).length;
    return listedCount >= Math.min(2, options.length);
  }

  private shouldEscalateRepeatedPendingSelection(conversation: Conversation, selection: PendingSelection) {
    const recentMatchingClarifications = conversation.memory.recentMessages.filter(
      (message) =>
        message.role === "bot" &&
        this.botMessageMatchesPendingSelection(message.text, selection)
    );

    return recentMatchingClarifications.length >= 2;
  }

  private botMessageMatchesPendingSelection(text: string, selection: PendingSelection) {
    const normalizedText = this.normalizeForMatching(text);
    const normalizedQuestion = this.normalizeForMatching(selection.question);

    if (normalizedQuestion && (normalizedText.includes(normalizedQuestion) || normalizedQuestion.includes(normalizedText))) {
      return true;
    }

    if (selection.type === "product_clarification") {
      return (
        /\b(cual|que tipo|opcion|opciones)\b/.test(normalizedText) &&
        /\b(producto|fresa|fresas|oblea|malteada|waffle|wafle|vaso|esas|estas)\b/.test(normalizedText)
      );
    }

    if (selection.type === "modifier_clarification") {
      return (
        /\b(cual|que|opcion|opciones)\b/.test(normalizedText) &&
        /\b(topping|adicion|salsa|chocolate|oreo|chips|agregar)\b/.test(normalizedText)
      );
    }

    if (selection.type === "required_option") {
      const label = this.normalizeForMatching(selection.label);
      return label ? normalizedText.includes(label) : false;
    }

    return false;
  }

  private syncPendingSelectionsFromRequiredOptions(draft: OrderDraft) {
    const missingOptions = this.getMissingRequiredOptions(draft);
    const generated = missingOptions.map(({ item, product, option }) => ({
      type: "required_option" as const,
      targetItemId: item.id,
      targetProductId: product.id,
      label: option.label,
      options: option.options,
      blocking: true,
      question: `Perfecto. Para ${item.productName}, dime ${option.label}.`
    }));

    const stillValidExisting = draft.pendingSelections.filter((selection) => {
      if (selection.type !== "required_option") {
        return true;
      }

      return missingOptions.some(
        ({ item, product, option }) =>
          selection.targetItemId === item.id &&
          selection.targetProductId === product.id &&
          selection.label === option.label
      );
    });

    draft.pendingSelections = this.normalizePendingSelections([
      ...stillValidExisting,
      ...generated
    ]);
    this.contextualizePendingSelectionQuestions(draft);
    draft.blockingIssue = draft.pendingSelections.find((selection) => selection.blocking)?.question ?? null;
  }

  private contextualizePendingSelectionQuestions(draft: OrderDraft) {
    draft.pendingSelections = draft.pendingSelections.map((selection) => {
      if (selection.type !== "required_option" || !selection.targetItemId) {
        return selection;
      }

      const item = draft.items.find((entry) => entry.id === selection.targetItemId);
      const product = item ? this.catalogService.findProductById(item.productId) : null;
      if (!item || !product || item.quantity <= 1) {
        return selection;
      }

      if (this.usesPerUnitRequiredOptionFlow(item, product)) {
        return {
          ...selection,
          question: this.buildPerUnitRequiredOptionsQuestion(item, product)
        };
      }

      const productName = this.pluralizeProductNameForQuantity(item.productName);
      const options = uniqueCaseInsensitive(selection.options ?? []);
      const visibleOptions = options.slice(0, 8).join(", ");
      const suffix = options.length > 8 ? " u otra opcion disponible" : "";
      const examples = this.buildPerUnitOptionExamples(item.quantity, options);
      const optionsText = visibleOptions ? ` Opciones: ${visibleOptions}${suffix}.` : "";
      const examplesText = examples ? ` Puedes responder: ${examples}.` : "";

      return {
        ...selection,
        question: `Para tus ${item.quantity} ${productName}, dime ${selection.label} para cada uno.${optionsText}${examplesText}`
      };
    });
  }

  private buildPerUnitRequiredOptionsQuestion(item: OrderItem, product: Product) {
    const unitIndex = this.nextPendingRequiredOptionUnitIndex(item, product);
    const productName = this.singularProductNameForUnitQuestion(item.productName);
    const ordinal = this.ordinalLabel(unitIndex);
    const requiredOptions = (product.requiredOptions ?? []).filter(
      (option) => option.required && this.getRequiredOptionResolvedUnitCount(item, option) < unitIndex
    );
    const requestedLabels = requiredOptions.map((option) => option.label).join(", ");
    const optionLines = requiredOptions.map(
      (option) => `- ${this.optionGroupLabel(option)}: ${option.options.join(", ")}`
    );

    return [
      `Para tu ${ordinal} ${productName}, dime ${requestedLabels}.`,
      "",
      "Opciones:",
      ...optionLines
    ].join("\n");
  }

  private nextPendingRequiredOptionUnitIndex(item: OrderItem, product: Product) {
    const counts = (product.requiredOptions ?? [])
      .filter((option) => option.required)
      .map((option) => this.getRequiredOptionResolvedUnitCount(item, option));
    return Math.min(item.quantity, Math.max(1, Math.min(...counts) + 1));
  }

  private getRequiredOptionResolvedUnitCount(item: OrderItem, option: ProductRequiredOption) {
    const quantityMap = item.selectedOptionQuantities?.[option.key] ?? {};
    const quantityTotal = Object.values(quantityMap).reduce((sum, quantity) => sum + quantity, 0);
    if (quantityTotal > 0) {
      return quantityTotal;
    }

    return item.selectedOptions?.[option.key]?.length ?? 0;
  }

  private singularProductNameForUnitQuestion(productName: string) {
    const normalized = this.normalizeForMatching(productName);
    if (normalized.includes("waffle") || normalized.includes("wafle")) {
      return "waffle";
    }
    if (normalized.includes("vaso")) {
      return "vaso";
    }
    return productName;
  }

  private ordinalLabel(index: number) {
    const labels: Record<number, string> = {
      1: "primer",
      2: "segundo",
      3: "tercer"
    };
    return labels[index] ?? `${index}.`;
  }

  private optionGroupLabel(option: ProductRequiredOption) {
    const normalized = this.normalizeForMatching(option.label);
    if (normalized.includes("fruta")) return "Frutas";
    if (normalized.includes("helado")) return "Helados";
    if (normalized.includes("salsa")) return "Salsas";
    if (normalized.includes("topping")) return "Toppings";
    return option.label;
  }

  private pluralizeProductNameForQuantity(productName: string) {
    const normalized = this.normalizeForMatching(productName);
    if (normalized.includes("waffle") || normalized.includes("wafle")) {
      return "waffles";
    }
    if (normalized.includes("fresa")) {
      return "fresas";
    }
    if (normalized.includes("vaso")) {
      return "vasos";
    }
    if (normalized.includes("malteada")) {
      return "malteadas";
    }
    if (normalized.includes("oblea")) {
      return "obleas";
    }

    return productName;
  }

  private buildPerUnitOptionExamples(quantity: number, options: string[]) {
    if (quantity <= 1 || options.length === 0) {
      return "";
    }

    const firstOption = options[0];
    const secondOption = options[1] ?? firstOption;
    if (quantity === 2) {
      return `${firstOption} para el primero y ${secondOption} para el segundo`;
    }

    return `${firstOption} para el primero, ${secondOption} para el segundo y ${firstOption} para el tercero`;
  }

  private requireProduct(productId: string) {
    const product = this.catalogService.findProductById(productId);
    if (!product || !product.isActive || product.isOutOfStock || product.basePrice <= 0) {
      throw new Error(`Invalid product id from OpenAIOrderEngine: ${productId}`);
    }
    return product;
  }

  private requireModifier(modifierId: string) {
    const modifier = this.catalogService.listModifierOptions().find((entry) => entry.id === modifierId);
    if (!modifier || !modifier.isActive || modifier.priceDelta <= 0) {
      throw new Error(`Invalid modifier id from OpenAIOrderEngine: ${modifierId}`);
    }
    return modifier;
  }

  private validateProductModifiers(
    product: Product,
    modifiers: Array<ReturnType<ConversationService["requireModifier"]>>
  ) {
    if (modifiers.length > 0 && product.modifierGroupIds.length === 0) {
      throw new Error(`Product does not accept modifiers: ${product.id}`);
    }
  }

  private validateSelectedOptions(
    product: Product,
    selectedOptions: Record<string, string[]>,
    quantity = 1
  ) {
    const validated: Record<string, string[]> = {};
    for (const [key, values] of Object.entries(selectedOptions)) {
      const option = (product.requiredOptions ?? []).find((entry) => entry.key === key);
      if (!option) {
        continue;
      }

      const allowed = values.filter((value) =>
        option.options.some((candidate) => this.normalizeForMatching(candidate) === this.normalizeForMatching(value))
      );
      if (allowed.length === 0) {
        continue;
      }
      validated[key] = uniqueCaseInsensitive(allowed).slice(
        0,
        this.effectiveRequiredOptionMaxSelections(option, quantity)
      );
    }
    return validated;
  }

  private filterSelectedOptionsByProductClause(
    product: Product,
    selectedOptions: Record<string, string[]>,
    currentMessage: string,
    addedProducts: Product[]
  ) {
    if (addedProducts.length <= 1 || Object.keys(selectedOptions).length === 0) {
      return selectedOptions;
    }

    const clause = this.extractProductClauseFromAddedProducts(product, currentMessage, addedProducts);
    if (!clause) {
      return selectedOptions;
    }

    const filtered: Record<string, string[]> = {};
    for (const [key, values] of Object.entries(selectedOptions)) {
      const safeValues = values.filter((value) =>
        this.normalizeForMatching(clause).includes(this.normalizeForMatching(value))
      );
      if (safeValues.length > 0) {
        filtered[key] = safeValues;
      }
    }

    return filtered;
  }

  private extractProductClauseFromAddedProducts(
    product: Product,
    currentMessage: string,
    addedProducts: Product[]
  ) {
    const normalizedMessage = this.normalizeForMatching(currentMessage);
    const mentions = addedProducts
      .map((candidate) => ({
        product: candidate,
        index: this.findProductMentionIndex(normalizedMessage, candidate)
      }))
      .filter((mention) => mention.index >= 0)
      .sort((left, right) => left.index - right.index);

    const targetMention = mentions.find((mention) => mention.product.id === product.id);
    if (!targetMention) {
      return null;
    }

    const nextMention = mentions.find((mention) => mention.index > targetMention.index);
    return normalizedMessage.slice(targetMention.index, nextMention?.index ?? normalizedMessage.length);
  }

  private findProductMentionIndex(normalizedMessage: string, product: Product) {
    const candidates = [product.name, ...product.aliases]
      .map((candidate) => this.normalizeForMatching(candidate))
      .filter(Boolean)
      .sort((left, right) => right.length - left.length);

    for (const candidate of candidates) {
      const index = normalizedMessage.indexOf(candidate);
      if (index >= 0) {
        return index;
      }
    }

    return -1;
  }

  private resolveEngineTargetItem(
    draft: OrderDraft,
    targetItemId: string | null,
    targetItemIndex: number | null
  ) {
    const item =
      (targetItemId ? draft.items.find((entry) => entry.id === targetItemId) : null) ??
      (targetItemIndex ? draft.items[targetItemIndex - 1] : null);

    if (!item) {
      throw new Error("OpenAIOrderEngine referenced a missing target item");
    }

    return item;
  }

  private classifyConversationTurn(
    business: Business,
    conversation: Conversation,
    text: string
  ) {
    const catalogContext = this.catalogService.buildAiCatalogContext();
    const memoryContext = this.buildMemoryContext(conversation);

    if (env.AI_AGENT_MODE && env.LLM_PROVIDER !== "heuristic") {
      return this.interpreterService.interpret({
        message: text,
        business,
        state: conversation.state,
        aiUsageCount: conversation.aiUsageCount,
        catalogContext,
        memoryContext,
        draftContext: this.buildDraftInterpreterContext(conversation.draftOrder)
      });
    }

    return this.classifierService.classify(
      text,
      business,
      conversation.state,
      conversation.aiUsageCount,
      catalogContext,
      memoryContext
    );
  }

  private tryHandleAiNonOrderIntent(
    business: Business,
    conversation: Conversation,
    text: string,
    classification: MessageClassification
  ) {
    if (!env.AI_AGENT_MODE || classification.source === "heuristic") {
      return null;
    }

    if (classification.confidence < 0.45 || classification.extracted.items.length > 0) {
      return null;
    }

    const intent = classification.intent;
    const nonOrderIntents = [
      "ask_menu",
      "ask_hours",
      "ask_recommendation",
      "business_question"
    ];

    if (intent === "small_talk" && !this.isConversationalMessage(text) && !this.isGreeting(text)) {
      return null;
    }

    if (intent === "ask_payment_methods" && !this.isPaymentInfoQuestion(text)) {
      return null;
    }

    if (intent === "ask_delivery_zones" && !this.isDeliveryZoneInfoQuestion(text)) {
      return null;
    }

    if (
      !nonOrderIntents.includes(intent) &&
      intent !== "small_talk" &&
      intent !== "ask_payment_methods" &&
      intent !== "ask_delivery_zones"
    ) {
      return null;
    }

    if (
      this.hasDeliveryOrPaymentDetailSignal(text, classification, conversation) &&
      intent !== "ask_payment_methods" &&
      intent !== "ask_delivery_zones"
    ) {
      return null;
    }

    return this.handleGlobalIntent(business, conversation, text, classification);
  }

  private handleGlobalIntent(
    business: Business,
    conversation: Conversation,
    text: string,
    classification: MessageClassification
  ) {
    switch (classification.intent) {
      case "greeting":
        return this.buildGreetingResponse(business, conversation);
      case "ask_menu":
        return this.buildMenuResponse(conversation);
      case "ask_hours":
        return [
          this.buildBusinessHoursResponseV2(business),
          this.promptForCurrentGoal(conversation)
        ].join("\n\n");
      case "ask_payment_methods":
        return [
          `Recibimos: ${business.paymentMethods.join(", ")}.`,
          this.promptForCurrentGoal(conversation)
        ].join("\n\n");
      case "ask_delivery_zones":
        return [
          "Por ahora el valor del domicilio lo confirma un asesor antes de despachar. Puedes dejarme direccion y barrio, y lo revisamos para darte el total final.",
          this.promptForCurrentGoal(conversation)
        ].join("\n\n");
      case "ask_recommendation":
        return this.buildRecommendationResponse(text, conversation);
      case "business_question":
        return this.buildBusinessQuestionResponse(text, conversation);
      case "talk_to_human":
        this.handoffConversationToHuman(conversation, "Cliente pidio hablar con un operario");
        return "Listo, dejo la conversacion marcada para que la revise un operario.";
      case "small_talk":
        return this.isGreeting(text)
          ? this.buildGreetingResponse(business, conversation)
          : this.buildConversationalResponse(text, conversation);
      case "cancel_order":
        conversation.state = "cancelled";
        conversation.updatedAt = nowIso();
        conversation.draftOrder = null;
        return "Listo, cancele el proceso del pedido. Si quieres empezar de nuevo, escribeme que te gustaria pedir.";
      default:
        if (this.isGreeting(text)) {
          return this.buildGreetingResponse(business, conversation);
        }

        if (this.isSocialCheckIn(text)) {
          return this.buildSocialCheckInResponse(conversation);
        }

        if (this.isConversationalMessage(text)) {
          return this.buildConversationalResponse(text, conversation);
        }

        return null;
    }
  }

  private shouldSkipGreetingShortcut(text: string, classification: MessageClassification) {
    return classification.intent === "greeting" && this.containsOrderIntent(text);
  }

  private shouldPrioritizeOrderFlow(text: string, classification: MessageClassification) {
    if (!["ask_menu", "ask_payment_methods", "ask_delivery_zones", "ask_recommendation", "business_question"].includes(classification.intent)) {
      return false;
    }

    return (
      this.hasOrderableProductSignal(text) ||
      classification.extracted.items.length > 0 ||
      (this.containsOrderIntent(text) && this.hasCatalogModifierSignal(text))
    );
  }

  private async handleIdleIntent(
    business: Business,
    conversation: Conversation,
    text: string,
    classification: MessageClassification
  ) {
    if (this.isAcceptingPriorRecommendation(text)) {
      const recommendedProduct = this.resolvePriorRecommendedProduct(conversation);
      if (recommendedProduct) {
        return this.startOrderFlow(conversation, `quiero una ${recommendedProduct}`, {
          ...classification,
          intent: "place_order"
        });
      }

      return "Claro. ¿Cuál producto quieres que te prepare?";
    }

    switch (classification.intent) {
      case "place_order":
      case "modify_order":
        return this.startOrderFlow(conversation, text, classification);
      default:
        if (this.hasOrderableProductSignal(text)) {
          return this.startOrderFlow(conversation, text, classification);
        }

        return this.buildUnknownMessage(business);
    }
  }

  private async startOrderFlow(
    conversation: Conversation,
    text: string,
    classification?: MessageClassification
  ) {
    const draft =
      conversation.draftOrder ??
      this.orderService.createEmptyDraft(conversation.businessId, conversation.customerPhone);

    if (this.isCatalogOptionQuestion(text)) {
      this.refreshConversationDraftState(conversation, draft, conversation.state);
      return this.buildCatalogOptionQuestionResponse(text, conversation);
    }

    const extractedItem = classification?.extracted.items[0] ?? null;
    const mentionedProducts = this.catalogService.findProductsMentioned(text);
    const extractedProduct = extractedItem?.productName
      ? this.catalogService.findProductByNameOrAlias(extractedItem.productName)
      : null;
    const product =
      mentionedProducts[0] ??
      (extractedProduct && this.shouldTrustExtractedProduct(text, extractedProduct)
        ? extractedProduct
        : null);
    const unavailableProducts = this.catalogService.findUnavailableProductsMentioned(text);
    const unavailableModifiers = this.catalogService.findUnavailableModifierOptionsMentioned(text);

    const quantityResult = this.resolveQuantity(text, extractedItem?.quantity ?? null);
    if (!quantityResult.ok) {
      this.setConversationDraftState(conversation, draft, "collecting_items");
      return quantityResult.message;
    }

    const mentionedModifiers = this.catalogService.findModifierOptionsMentioned(text);
    const activeItemAdjustment =
      draft.items.length > 0 && this.hasItemAdjustment(text, mentionedModifiers, extractedItem);
    const ambiguousCatalogRequest =
      product || (activeItemAdjustment && this.isTargetedItemAdjustmentPhrase(text))
        ? null
        : this.buildAmbiguousCatalogRequest(text);
    const contextualRemovalProduct = product ? null : this.findContextualDraftProductReference(draft, text);
    const textLooksLikeNewProductRequest =
      mentionedProducts.length > 0 ||
      Boolean(this.extractFreeTextProductName(text)) ||
      this.isAdditionalProductRequest(text);

    if ((!product && unavailableProducts.length > 0) || unavailableModifiers.length > 0) {
      this.setConversationDraftState(conversation, draft, "collecting_items");
      return this.buildUnavailableCatalogResponse(unavailableProducts, unavailableModifiers);
    }

    if (product && this.isUnsupportedPromotionOrderRequest(text)) {
      this.setConversationDraftState(conversation, draft, "collecting_items");
      return this.buildUnsupportedBusinessClaimResponse(text);
    }

    if (!product && contextualRemovalProduct && this.isContextualItemRemovalRequest(text)) {
      draft.items = draft.items.filter((item) => item.productId !== contextualRemovalProduct.id);
      this.clearDraftBlockingIssue(draft, "item");
      this.refreshConversationDraftState(
        conversation,
        draft,
        draft.items.length ? "collecting_delivery_details" : "collecting_items"
      );
      return draft.items.length
        ? this.buildCartSummaryWithDeliveryDetailsRequest(draft)
        : "Listo, lo quité. ¿Qué deseas ordenar?";
    }

    if (!product && ambiguousCatalogRequest) {
      this.setConversationDraftState(conversation, draft, "collecting_items");
      return ambiguousCatalogRequest;
    }

    if (
      draft.items.length > 0 &&
      !textLooksLikeNewProductRequest &&
      this.applyRequiredOptionReply(draft, text)
    ) {
      return this.continueAfterDraftUpdate(conversation, draft);
    }

    if (!product && draft.items.length > 0 && this.isAmbiguousItemAdjustment(text)) {
      draft.blockingIssue = "Me confirmas exactamente que ingrediente quieres quitar o cambiar?";
      this.refreshConversationDraftState(conversation, draft, "collecting_items");
      return draft.blockingIssue;
    }

    if (!product && draft.items.length > 0 && this.isUnsupportedActiveItemAdjustment(draft, text)) {
      draft.blockingIssue = "Ese cambio no está claro para el producto que tienes anotado. Me confirmas si quieres cambiar el producto o dejarlo como viene?";
      this.refreshConversationDraftState(conversation, draft, "collecting_items");
      return draft.blockingIssue;
    }

    if (!product && draft.items.length > 0 && this.hasUnknownComponentIncrementRequest(text, mentionedModifiers)) {
      draft.blockingIssue = "No tengo ese adicional registrado en el menú. Me confirmas otra opción?";
      this.refreshConversationDraftState(conversation, draft, "collecting_items");
      return draft.blockingIssue;
    }

    if (!product && draft.items.length === 0 && this.shouldCaptureLooseDeliveryDetails(text, classification, conversation)) {
      this.applyExtractedDeliveryDetails(draft, classification, this.buildLooseDetailsText(conversation, text));
      this.refreshConversationDraftState(conversation, draft, "collecting_items");
      return "Listo, tengo esos datos. ¿Qué deseas ordenar?";
    }

    if (!product && draft.items.length > 0 && this.hasQuantityAdjustment(text)) {
      const target = this.resolveTargetItemForModification(text, draft);
      if (target.status === "ambiguous") {
        draft.blockingIssue = target.message;
        this.refreshConversationDraftState(conversation, draft, "collecting_items");
        return target.message;
      }

      this.applyQuantityAdjustment(target.item, text);
      this.clearDraftBlockingIssue(draft, "item");
      return this.continueAfterDraftUpdate(conversation, draft);
    }

    if (!product && draft.items.length > 0 && activeItemAdjustment) {
      const target = this.resolveTargetItemForModification(text, draft);
      if (target.status === "ambiguous") {
        draft.blockingIssue = target.message;
        this.refreshConversationDraftState(conversation, draft, "collecting_items");
        return target.message;
      }

      const outcome = this.applyItemAdjustments(target.item, text, mentionedModifiers, extractedItem);
      this.clearDraftBlockingIssue(draft, "item");
      const nextStep = await this.continueAfterDraftUpdate(conversation, draft);
      return [
        this.buildItemAdjustmentAcknowledgement(outcome),
        nextStep
      ]
        .filter(Boolean)
        .join("\n\n");
    }

    if (!product && draft.items.length > 0 && this.shouldCaptureLooseDeliveryDetails(text, classification, conversation)) {
      this.applyExtractedDeliveryDetails(draft, classification, this.buildLooseDetailsText(conversation, text));
      return this.continueAfterDraftUpdate(conversation, draft);
    }

    if (!product && this.isOnlyModifierOrderCandidate(text, mentionedModifiers)) {
      this.setConversationDraftState(conversation, draft, "collecting_items");
      const modifierNames = mentionedModifiers.map((modifier) => modifier.name).join(", ");
      return `Claro. Sobre que producto quieres agregar ${modifierNames}?`;
    }

    if (!product && !this.hasFreeTextOrderCandidate(text, extractedItem)) {
      this.setConversationDraftState(conversation, draft, "collecting_items");
      return this.buildOpenOrderIntentResponse(text);
    }

    if (!product && this.isUnsupportedCustomProductText(text)) {
      this.setConversationDraftState(conversation, draft, "collecting_items");
      return "No tengo ese producto en el menú. Si quieres, te comparto las opciones disponibles.";
    }

    if (product && this.isUnsupportedCustomProductText(text)) {
      this.setConversationDraftState(conversation, draft, "collecting_items");
      return "Veo un producto del menú y otro que no manejamos. Me confirmas qué quieres dejar del pedido?";
    }

    if (!product && this.isUncertainProductText(text)) {
      this.setConversationDraftState(conversation, draft, "collecting_items");
      return "No quiero anotarlo mal. Me confirmas exactamente que producto quieres?";
    }

    if (product && this.isItemRemovalRequest(text, product) && draft.items.length > 0) {
      draft.items = draft.items.filter((item) => item.productId !== product.id);
      this.clearDraftBlockingIssue(draft, "item");
      this.refreshConversationDraftState(
        conversation,
        draft,
        draft.items.length ? "collecting_delivery_details" : "collecting_items"
      );
      return draft.items.length
        ? this.buildCartSummaryWithDeliveryDetailsRequest(draft)
        : "Listo, lo quité. ¿Qué deseas ordenar?";
    }

    if (product && this.isReplacementRequest(text) && draft.items.length > 0) {
      draft.items = [];
      this.clearDraftBlockingIssue(draft, "item");
    }

    if (
      product &&
      draft.items.length > 0 &&
      draft.items.some((item) => item.productId === product.id) &&
      activeItemAdjustment &&
      !this.isAdditionalProductRequest(text) &&
      !this.isReplacementRequest(text)
    ) {
      const target = this.resolveTargetItemForModification(text, draft);
      if (target.status === "ambiguous") {
        draft.blockingIssue = target.message;
        this.refreshConversationDraftState(conversation, draft, "collecting_items");
        return target.message;
      }

      const outcome = this.applyItemAdjustments(target.item, text, mentionedModifiers, extractedItem);
      this.clearDraftBlockingIssue(draft, "item");
      const nextStep = await this.continueAfterDraftUpdate(conversation, draft);
      return [
        this.buildItemAdjustmentAcknowledgement(outcome),
        nextStep
      ]
        .filter(Boolean)
        .join("\n\n");
    }

    if (mentionedProducts.length > 1 && !this.isReplacementRequest(text)) {
      for (const mentionedProduct of mentionedProducts) {
        const itemQuantityResult = this.resolveQuantityForProductMention(text, mentionedProduct);
        if (!itemQuantityResult.ok) {
          this.setConversationDraftState(conversation, draft, "collecting_items");
          return itemQuantityResult.message;
        }
        const productClause = this.extractProductClause(text, mentionedProduct, mentionedProducts);
        const productModifiers = this.resolveModifiersForNewItem(
          mentionedProduct,
          productClause,
          this.catalogService.findModifierOptionsMentioned(productClause),
          this.findExtractedItemForProduct(classification, mentionedProduct, productClause)
        );

        const item = this.buildCatalogOrderItem(
          mentionedProduct,
          itemQuantityResult.quantity,
          productModifiers.modifiers,
          [],
          extractedItem?.notes ?? null,
          productClause
        );
        this.orderService.addItem(draft, item);

        if (productModifiers.blockingIssue) {
          draft.blockingIssue = productModifiers.blockingIssue;
        }
      }

      this.applyExtractedDeliveryDetails(draft, classification, text);
      return this.continueAfterDraftUpdate(conversation, draft);
    }

    const modifierResolution = product
      ? this.resolveModifiersForNewItem(product, text, mentionedModifiers, extractedItem)
      : { modifiers: [] as ModifierCandidate[], blockingIssue: null };
    const removals = product
      ? uniqueCaseInsensitive([
          ...(draft.items.length === 0 ? this.extractRemovals(text) : []),
          ...(extractedItem?.removals ?? [])
        ])
      : [];
    const item = product
      ? this.buildCatalogOrderItem(product, quantityResult.quantity, modifierResolution.modifiers, removals, extractedItem?.notes ?? null, text)
      : this.buildCustomOrderItem(text, extractedItem, quantityResult.quantity);

    this.orderService.addItem(draft, item);
    if (product) {
      this.clearDraftBlockingIssue(draft, "item");
    }
    if (modifierResolution.blockingIssue) {
      draft.blockingIssue = modifierResolution.blockingIssue;
    }
    this.applyExtractedDeliveryDetails(draft, classification, text);
    return this.continueAfterDraftUpdate(conversation, draft);
  }

  private async handleStatefulFlow(
    conversation: Conversation,
    text: string,
    classification?: MessageClassification
  ) {
    if (conversation.state === "cancelled") {
      if (
        classification?.intent === "place_order" ||
        this.hasOrderableProductSignal(text) ||
        this.containsOrderIntent(text)
      ) {
        conversation.draftOrder = null;
        conversation.state = "idle";
        conversation.updatedAt = nowIso();
        return this.startOrderFlow(conversation, text, classification);
      }

      conversation.state = "idle";
      conversation.updatedAt = nowIso();
      return "Cuentame que te gustaria pedir y empezamos de nuevo.";
    }

    if (!conversation.draftOrder) {
      conversation.draftOrder = this.orderService.createEmptyDraft(
        conversation.businessId,
        conversation.customerPhone
      );
    }

    if (conversation.draftOrder.items.length === 0 && conversation.state !== "collecting_items") {
      conversation.state = "collecting_items";
      conversation.updatedAt = nowIso();
      return this.buildOpenOrderIntentResponse(text);
    }

    switch (conversation.state) {
      case "collecting_items":
        return this.startOrderFlow(conversation, text, classification);
      case "collecting_delivery_details":
      case "collecting_name":
      case "collecting_address":
      case "collecting_payment":
      case "collecting_notes":
      case "confirming_order": {
        const plannerClarification = this.buildPlannerClarificationQuestion(
          conversation.draftOrder,
          classification
        );
        if (plannerClarification) {
          conversation.draftOrder.blockingIssue = plannerClarification;
          conversation.state = "collecting_items";
          conversation.updatedAt = nowIso();
          return [this.buildCartSummary(conversation.draftOrder), plannerClarification].join("\n\n");
        }

        if (this.isUnresolvedItemEditRequest(conversation.draftOrder, text, classification)) {
          conversation.draftOrder.blockingIssue =
            "Me confirmas exactamente que topping o cambio quieres hacer y a cual producto va?";
          conversation.state = "collecting_items";
          conversation.updatedAt = nowIso();
          return [this.buildCartSummary(conversation.draftOrder), conversation.draftOrder.blockingIssue].join("\n\n");
        }

        const standaloneName = this.extractStandaloneNameFromText(conversation.draftOrder, text);
        const hasOtherDeliveryData =
          Boolean(this.extractAddressFromText(text)) ||
          Boolean(this.extractPaymentMethodFromText(text)) ||
          this.catalogService.findDeliveryZonesMentioned(text).length > 0;
        if (standaloneName && !conversation.draftOrder.customerName && !hasOtherDeliveryData) {
          conversation.draftOrder.customerName = standaloneName;
          conversation.draftOrder = this.orderService.refreshDraft(conversation.draftOrder);
          conversation.state = "collecting_delivery_details";
          conversation.updatedAt = nowIso();
          return this.buildDeliveryDetailsRequest(conversation.draftOrder);
        }

        if (this.isPayLaterQuestion(text)) {
          return [
            "Para despachar necesitamos dejar definido el metodo de pago.",
            this.buildDeliveryDetailsRequest(conversation.draftOrder)
          ].join("\n\n");
        }

        if (this.mentionsUnsupportedPaymentMethod(text)) {
          return [
            `Por ahora recibimos: ${this.businessService.getDefaultBusiness().paymentMethods.join(", ")}.`,
            this.buildDeliveryDetailsRequest(conversation.draftOrder)
          ].join("\n\n");
        }

        const hasDeliveryDetails = this.hasDeliveryOrPaymentDetailSignal(
          text,
          classification,
          conversation
        );
        const hasWeakFreeTextProductSignal =
          this.hasOrderableProductSignal(text) && !this.hasCatalogProductSignal(text, classification);

        if (
          this.hasActiveItemAdjustmentIntent(conversation.draftOrder, text, classification) ||
          this.hasCatalogProductSignal(text, classification) ||
          this.hasCatalogModifierSignal(text) ||
          this.hasQuantityAdjustment(text) ||
          (!hasDeliveryDetails && hasWeakFreeTextProductSignal) ||
          this.hasExplicitFreeTextOrderRequest(text, classification?.extracted.items[0] ?? null) ||
          (!hasDeliveryDetails &&
            (classification?.intent === "place_order" || classification?.intent === "modify_order") &&
            classification.extracted.items.length > 0)
        ) {
          return this.startOrderFlow(conversation, text, classification);
        }

        this.applyExtractedDeliveryDetails(conversation.draftOrder, classification, text);
        conversation.draftOrder = this.orderService.refreshDraft(conversation.draftOrder);
        conversation.state = "collecting_delivery_details";
        conversation.updatedAt = nowIso();

        const requiredOptionsMessage = this.syncRequiredOptionsBlockingIssue(conversation.draftOrder);
        if (requiredOptionsMessage) {
          conversation.state = "collecting_items";
          conversation.updatedAt = nowIso();
          return [this.buildCartSummary(conversation.draftOrder), requiredOptionsMessage].join("\n\n");
        }

        if (this.getMissingDeliveryFields(conversation.draftOrder).length === 0) {
          return this.finalizeOrderForReview(conversation);
        }

        return this.buildDeliveryDetailsRequest(conversation.draftOrder);
      }
      case "pending_human":
        if (classification?.intent === "cancel_order" || this.isCancelRequest(text)) {
          if (conversation.activeOrderId) {
            this.orderService.updateOrderStatus(
              conversation.activeOrderId,
              "cancelled",
              `Cancelado por solicitud del cliente: ${text}`
            );
          }

          conversation.state = "cancelled";
          conversation.draftOrder = null;
          conversation.updatedAt = nowIso();
          return "Listo, marque el pedido como cancelado para que no se despache.";
        }

        if (this.shouldStartFreshOrderSession(conversation, text)) {
          this.resetConversation(conversation.customerPhone);
          const freshConversation = this.getOrCreateConversation(
            conversation.businessId,
            conversation.customerPhone
          );
          freshConversation.state = "collecting_items";
          freshConversation.updatedAt = nowIso();
          return this.buildOpenOrderIntentResponse(text);
        }

        if (this.applyPendingOrderAmendment(conversation, text, classification)) {
          if (conversation.draftOrder?.blockingIssue) {
            return conversation.draftOrder.blockingIssue;
          }

          return "Listo, actualice el pedido pendiente. El operario revisa el cambio antes de despachar.";
        }

        return "Tu conversacion ya quedo marcada para revision humana. Si quieres hacer otro cambio, un operario lo vera en el panel.";
      case "completed":
      case "idle":
      default:
        conversation.state = "idle";
        return "Cuentame que te gustaria pedir y empezamos de nuevo.";
    }
  }

  private shouldUseStatefulDeliveryDetails(
    conversation: Conversation,
    text: string,
    classification: MessageClassification
  ) {
    if (
      ![
        "collecting_delivery_details",
        "collecting_name",
        "collecting_address",
        "collecting_payment",
        "collecting_notes",
        "confirming_order"
      ].includes(conversation.state)
    ) {
      return false;
    }

    const hasDeliveryDetails = this.hasDeliveryOrPaymentDetailSignal(
      text,
      classification,
      conversation
    );
    if (conversation.draftOrder?.items.length && hasDeliveryDetails) {
      return true;
    }

    if (conversation.draftOrder?.items.length && this.isPickupRequest(text)) {
      return true;
    }

    if (this.hasCatalogProductSignal(text, classification)) {
      return true;
    }

    if (["ask_menu", "ask_hours", "ask_delivery_zones", "talk_to_human", "cancel_order"].includes(classification.intent)) {
      return false;
    }

    if (classification.intent === "ask_payment_methods" && this.isPaymentInfoQuestion(text)) {
      return false;
    }

    if (this.hasQuantityAdjustment(text)) {
      return true;
    }

    const extracted = classification.extracted;
    const hasExtractedDeliveryData = Boolean(
      this.normalizeCustomerNameCandidate(extracted.customerName) ||
        extracted.address ||
        extracted.zone ||
        extracted.paymentMethod ||
        extracted.notes
    );

    return (
      this.hasActiveItemAdjustmentIntent(conversation.draftOrder, text, classification) ||
      hasExtractedDeliveryData ||
      Boolean(this.extractNameFromText(text)) ||
      Boolean(this.extractAddressFromText(text)) ||
      Boolean(this.extractPaymentMethodFromText(text)) ||
      this.isPickupRequest(text)
    );
  }

  private shouldCaptureLooseDeliveryDetails(
    text: string,
    classification: MessageClassification | undefined,
    conversation?: Conversation | null
  ) {
    const extractedItem = classification?.extracted.items[0] ?? null;
    const hasDeliveryDetails = this.hasDeliveryOrPaymentDetailSignal(
      text,
      classification,
      conversation
    );

    if (
      conversation?.draftOrder?.items.length &&
      hasDeliveryDetails &&
      !this.hasCatalogProductSignal(text, classification) &&
      !this.hasCatalogModifierSignal(text)
    ) {
      return true;
    }

    if (
      this.hasCatalogProductSignal(text, classification) ||
      this.hasCatalogModifierSignal(text) ||
      this.hasExplicitFreeTextOrderRequest(text, extractedItem) ||
      (!hasDeliveryDetails &&
        (this.hasOrderableProductSignal(text) || this.hasFreeTextOrderCandidate(text, extractedItem)))
    ) {
      return false;
    }

    if (
      ["small_talk", "ask_recommendation", "business_question"].includes(classification?.intent ?? "") ||
      this.isConversationalMessage(text) ||
      this.isSoftObjection(text) ||
      this.isUnsupportedBusinessClaimQuestion(text) ||
      this.isAcceptingPriorRecommendation(text)
    ) {
      return false;
    }

    if (
      ["ask_menu", "ask_hours", "ask_delivery_zones", "talk_to_human", "cancel_order"].includes(
        classification?.intent ?? ""
      )
    ) {
      return false;
    }

    if (this.isPaymentInfoQuestion(text)) {
      return false;
    }

    return hasDeliveryDetails;
  }

  private hasDeliveryOrPaymentDetailSignal(
    text: string,
    classification: MessageClassification | undefined,
    conversation?: Conversation | null
  ) {
    const tempDraft =
      conversation?.draftOrder ??
      this.orderService.createEmptyDraft(
        this.businessService.getDefaultBusiness().id,
        "loose-details-preview"
      );
    const textForExtraction = this.buildLooseDetailsText(conversation ?? null, text);

    return Boolean(
      this.normalizeCustomerNameCandidate(classification?.extracted.customerName) ||
        classification?.extracted.address ||
        classification?.extracted.zone ||
        classification?.extracted.paymentMethod ||
        classification?.extracted.notes ||
        this.extractNameFromText(textForExtraction) ||
        this.extractStandaloneNameFromText(tempDraft, textForExtraction) ||
        this.extractAddressFromText(textForExtraction) ||
        this.extractPaymentMethodFromText(textForExtraction) ||
        this.isPickupRequest(textForExtraction) ||
        this.catalogService.findDeliveryZonesMentioned(textForExtraction).length === 1
    );
  }

  private buildLooseDetailsText(conversation: Conversation | null, text: string) {
    const compact = text.replace(/\s+/g, " ").trim();
    if (!conversation) {
      return compact;
    }

    const customerMessages = conversation.memory?.recentMessages
      .filter((message) => message.role === "customer")
      .map((message) => message.text.replace(/\s+/g, " ").trim())
      .filter(Boolean) ?? [];
    const lastTwo = customerMessages.slice(-2);

    if (
      lastTwo.length === 2 &&
      lastTwo.every((message) => /^\p{L}+$/u.test(message)) &&
      this.looksLikePersonName(lastTwo.join(" ")) &&
      !this.looksLikeOperationalPhrase(lastTwo.join(" "))
    ) {
      return lastTwo.join(" ");
    }

    return compact;
  }

  private applyExtractedDeliveryDetails(
    draft: OrderDraft,
    classification: MessageClassification | undefined,
    text: string
  ) {
    if (this.isPickupRequest(text)) {
      draft.fulfillmentType = "pickup";
      draft.address = "Recoge en tienda";
      draft.inferredZoneId = null;
    }

    const extracted = classification?.extracted;
    const explicitDeliveryWithoutAddress =
      this.isDeliveryRequest(text) && !this.extractAddressFromText(text);
    if (explicitDeliveryWithoutAddress) {
      draft.blockingIssue = "Para cambiarlo a domicilio necesito la direccion completa con barrio o zona.";
    }

    const ignoreCustomerName = this.shouldIgnoreCustomerNameFromOrderText(text, extracted?.items[0] ?? null);
    const extractedCustomerName = ignoreCustomerName
      ? null
      : this.normalizeCustomerNameCandidate(extracted?.customerName);
    const customerName =
      extractedCustomerName ??
      (ignoreCustomerName ? null : this.extractNameFromText(text)) ??
      (ignoreCustomerName ? null : this.extractStandaloneNameFromText(draft, text));
    const addressCandidate = extracted?.address ?? this.extractAddressFromText(text);
    const address = addressCandidate && !this.isZonePaymentOnlyDeliveryText(text)
      ? addressCandidate
      : null;
    const mentionedPaymentMethods = this.extractPaymentMethodsMentioned(text);
    const paymentMethod =
      mentionedPaymentMethods.length > 1
        ? null
        : extracted?.paymentMethod ?? this.extractPaymentMethodFromText(text);
    const cashAmount = this.extractCashAmountFromText(text);
    const notes = extracted?.notes ?? this.extractNotesFromText(text);

    if (customerName) {
      if (this.shouldAppendCustomerName(draft.customerName, customerName, text)) {
        draft.customerName = `${draft.customerName} ${customerName}`;
      } else if (
        !draft.customerName ||
        this.hasExplicitNameSignal(text) ||
        this.isNameCorrectionText(text) ||
        this.shouldReplaceShortCustomerName(draft.customerName, customerName) ||
        this.looksLikeOperationalPhrase(draft.customerName)
      ) {
        draft.customerName = customerName;
      }
    }

    if (address) {
      draft.fulfillmentType = "delivery";
      draft.address = address;

      if (this.hasContradictoryUnitDetails(address)) {
        draft.blockingIssue = "Me aparecen dos apartamentos distintos. Confirmame cual es el correcto.";
      } else {
        this.clearDraftBlockingIssue(draft, "address");
      }
    }

    if (mentionedPaymentMethods.length > 1) {
      draft.paymentMethod = null;
      draft.cashAmount = null;
    } else if (paymentMethod) {
      draft.paymentMethod = paymentMethod;
      if (paymentMethod !== "Contra entrega") {
        draft.cashAmount = null;
      }
    }

    if (cashAmount) {
      draft.cashAmount = cashAmount;
    }

    if (notes && !this.isNegativeNotes(notes)) {
      draft.notes = notes;
    }

    if (notes && this.isNegativeNotes(notes)) {
      draft.notes = null;
    }

    this.validateAndNormalizeNeighborhood(draft);
  }

  private async finalizeOrderForReview(conversation: Conversation) {
    if (!conversation.draftOrder) {
      this.handoffConversationToHuman(conversation, "No hay borrador activo para cerrar pedido");
      return "No pude cerrar el pedido automaticamente. Lo dejo para que un operario lo revise.";
    }

    conversation.draftOrder = this.orderService.refreshDraft(conversation.draftOrder);
    this.sanitizeDraftItemNotes(conversation.draftOrder);
    const requiredOptionsMessage = this.syncRequiredOptionsBlockingIssue(conversation.draftOrder);
    if (requiredOptionsMessage) {
      conversation.state = "collecting_items";
      conversation.updatedAt = nowIso();
      return [this.buildCartSummary(conversation.draftOrder), requiredOptionsMessage].join("\n\n");
    }

    if (conversation.draftOrder.items.some((item) => item.unitBasePrice <= 0)) {
      conversation.state = "collecting_items";
      conversation.updatedAt = nowIso();
      return [
        "No puedo dejar listo un pedido con productos sin precio del menu.",
        "Me confirmas el producto exacto que quieres pedir?"
      ].join("\n");
    }

    const order = this.orderService.createOrderFromConversation(conversation);
    this.handoffConversationToHuman(conversation, "Pedido listo para revision del operario");

    if (!order) {
      return "No pude crear el pedido final. Lo dejo marcado para revision humana.";
    }

    conversation.activeOrderId = order.id;
    await this.adminNotificationService.notifyNewOrder(order);

    return this.buildCustomerOrderReviewSummary(order);
  }

  private buildCustomerOrderReviewSummary(order: Order) {
    const customerFirstName = order.customerName?.trim().split(/\s+/)[0] ?? null;

    return [
      customerFirstName ? `Listo, ${customerFirstName} 😊🍓` : "Listo 😊🍓",
      "Tu pedido quedó listo para revisión.",
      "",
      order.fulfillmentType === "delivery"
        ? "En un momento un asesor te confirma el valor del domicilio y te envía el total final antes de despachar 🏍️"
        : "En un momento un asesor revisa los datos y te confirma antes de preparar tu pedido.",
      "",
      "Gracias por pedir en I Love Fresas 🍓"
    ]
      .filter(Boolean)
      .join("\n");
  }

  private buildCatalogOrderItem(
    product: NonNullable<ReturnType<CatalogService["findProductByNameOrAlias"]>>,
    quantity: number,
    modifiers: Array<{ name: string; priceDelta: number }>,
    removals: string[],
    notes: string | null,
    sourceText = ""
  ): OrderItem {
    return {
      id: createId("item"),
      productId: product.id,
      productName: product.name,
      quantity,
      unitBasePrice: product.basePrice,
      selectedOptions: this.extractSelectedOptionsForProduct(product, sourceText),
      components: [
        ...product.defaultComponents.map((component) => ({
          name: component,
          type: "default" as const,
          priceDelta: 0
        })),
        ...modifiers.map((modifier) => ({
          name: modifier.name,
          type: "added" as const,
          priceDelta: modifier.priceDelta
        })),
        ...removals.map((removal) => ({
          name: removal,
          type: "removed" as const,
          priceDelta: 0
        }))
      ],
      notes: this.sanitizeOrderItemNotes(notes)
    };
  }

  private sanitizeOrderItemNotes(notes: string | null) {
    if (!notes?.trim()) {
      return null;
    }

    const normalized = this.normalizeForMatching(notes);
    if (this.isOperationalItemNote(normalized)) {
      return null;
    }

    return notes.trim();
  }

  private sanitizeDraftItemNotes(draft: OrderDraft) {
    for (const item of draft.items) {
      item.notes = this.sanitizeOrderItemNotes(item.notes);
    }
  }

  private isOperationalItemNote(normalizedNote: string) {
    return /\b(falta|pendiente|definir|confirmar|confirme|aclarar|aclaracion|por revisar|no especific|no especifico|cliente dijo|cliente pidio|requiere|necesita|missing|required|undefined)\b/.test(
      normalizedNote
    );
  }

  private extractSelectedOptionsForProduct(product: Product, text: string) {
    const selectedOptions: Record<string, string[]> = {};

    for (const option of product.requiredOptions ?? []) {
      const values = this.extractSelectedValuesForRequiredOption(option, text, product)
        .slice(0, option.maxSelections);
      if (values.length > 0) {
        selectedOptions[option.key] = values;
      }
    }

    return selectedOptions;
  }

  private extractSelectedValuesForRequiredOption(
    option: ProductRequiredOption,
    text: string,
    product?: Product
  ) {
    const normalized = this.normalizeForMatching(text);
      (this.catalogService.findProductsMentioned(text).length > 0 && !/[?Â¿]/.test(text));
    const productTextRemoved = product
      ? this.removeProductMentionFromText(normalized, product)
      : normalized;

    const exactMatches = uniqueCaseInsensitive(
      option.options.filter((candidate) => {
        const normalizedOption = this.normalizeForMatching(candidate);
        return this.requiredOptionValueMentioned(option, normalizedOption, normalized, productTextRemoved);
      })
    );

    if (exactMatches.length > 0) {
      return exactMatches;
    }

    const fuzzyMatch = this.findConservativeFuzzyRequiredOptionValue(
      option,
      this.cleanShortRequiredOptionAnswer(productTextRemoved)
    );
    return fuzzyMatch ? [fuzzyMatch] : [];
  }

  private cleanShortRequiredOptionAnswer(value: string) {
    return value
      .replace(/\b(de|el|la|un|una|sabor|sabores|helado|quiero|ponle|pongale|agregale)\b/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  private findConservativeFuzzyRequiredOptionValue(
    option: ProductRequiredOption,
    normalizedValue: string
  ) {
    const candidateText = normalizedValue.trim();
    if (!candidateText || candidateText.includes(" ") || candidateText.length < 4) {
      return null;
    }

    const matches = option.options
      .map((candidate) => ({
        candidate,
        distance: this.levenshteinDistance(candidateText, this.normalizeForMatching(candidate))
      }))
      .filter(({ candidate, distance }) => {
        const normalizedCandidate = this.normalizeForMatching(candidate);
        const maxDistance = normalizedCandidate.length >= 7 ? 2 : 1;
        return distance > 0 && distance <= maxDistance;
      })
      .sort((a, b) => a.distance - b.distance);

    if (matches.length !== 1) {
      return null;
    }

    return matches[0]!.candidate;
  }

  private levenshteinDistance(left: string, right: string) {
    const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
    const current = Array.from({ length: right.length + 1 }, () => 0);

    for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
      current[0] = leftIndex;
      for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
        const cost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
        current[rightIndex] = Math.min(
          current[rightIndex - 1]! + 1,
          previous[rightIndex]! + 1,
          previous[rightIndex - 1]! + cost
        );
      }
      previous.splice(0, previous.length, ...current);
    }

    return previous[right.length]!;
  }

  private requiredOptionValueMentioned(
    option: ProductRequiredOption,
    normalizedOption: string,
    normalizedFullText: string,
    normalizedProductTextRemoved: string
  ) {
    const escapedOption = this.escapeRegex(normalizedOption);
    const shortAnswerPattern = new RegExp(`^(?:de\\s+)?${escapedOption}$`, "i");
    if (shortAnswerPattern.test(normalizedFullText)) {
      return true;
    }

    const text = normalizedProductTextRemoved;
    switch (option.key) {
      case "iceCreamFlavor":
        return (
          new RegExp(
          `\\b(?:helado|sabor|sabores|sabor\\s+de\\s+helado|sabores\\s+de\\s+helado)\\s+(?:de\\s+)?${escapedOption}\\b|\\b(?:de\\s+)?${escapedOption}\\s+(?:de\\s+helado|como\\s+sabor)\\b`,
          "i"
          ).test(text) ||
          (!/\b(fruta|frutas|salsa|salsas|topping|toppings|adicion|adiciones)\b/.test(text) &&
            new RegExp(`\\b(?:de|y)\\s+${escapedOption}\\b`, "i").test(text))
        );
      case "fruit":
        return new RegExp(
          `\\b(?:fruta|frutas)\\s+(?:de\\s+)?${escapedOption}\\b|\\b${escapedOption}\\s+(?:de\\s+fruta|como\\s+fruta)\\b`,
          "i"
        ).test(text);
      case "sauce":
        return new RegExp(
          `\\b(?:salsa|salsas)\\s+(?:de\\s+)?${escapedOption}\\b|\\b${escapedOption}\\s+(?:de\\s+salsa|como\\s+salsa)\\b`,
          "i"
        ).test(text);
      case "includedTopping":
        return new RegExp(
          `\\b(?:topping|toppings|adicion|adiciones)\\s+(?:de\\s+)?${escapedOption}\\b|\\b${escapedOption}\\s+(?:de\\s+topping|como\\s+topping)\\b`,
          "i"
        ).test(text);
      default:
        return new RegExp(`\\b(?:${this.escapeRegex(option.label)}|con)\\s+(?:de\\s+)?${escapedOption}\\b`, "i").test(
          text
        );
    }
  }

  private removeProductMentionFromText(normalizedText: string, product: Product) {
    const candidates = [product.name, ...product.aliases]
      .map((candidate) => this.normalizeForMatching(candidate))
      .filter(Boolean)
      .sort((a, b) => b.length - a.length);

    const candidate = candidates.find((entry) => normalizedText.includes(entry));
    if (!candidate) {
      return normalizedText;
    }

    return normalizedText.replace(candidate, " ").replace(/\s+/g, " ").trim();
  }

  private buildCustomOrderItem(
    text: string,
    extractedItem: MessageClassification["extracted"]["items"][number] | null | undefined,
    quantity: number
  ): OrderItem {
    return {
      id: createId("item"),
      productId: "custom_pending_review",
      productName: this.buildFreeTextProductName(text, extractedItem),
      quantity,
      unitBasePrice: 0,
      selectedOptions: {},
      components: [],
      notes: [
        this.extractFreeTextProductNotes(text),
        "Producto tomado del texto del cliente; precio/disponibilidad por revisar."
      ]
        .filter(Boolean)
        .join(" ")
    };
  }

  private applyPendingOrderAmendment(
    conversation: Conversation,
    text: string,
    classification?: MessageClassification
  ) {
    if (!conversation.activeOrderId || !conversation.draftOrder) {
      return false;
    }

    const activeOrder = this.orderService.findOrder(conversation.activeOrderId);
    if (activeOrder && this.isPostDispatchOrderStatus(activeOrder.status)) {
      this.recordPostOrderEvent(conversation, activeOrder, {
        type: "change_after_dispatch",
        severity: activeOrder.status === "dispatched" ? "high" : "medium",
        handledByBot: false,
        needsHuman: true,
        humanReason: "post_dispatch_change_blocked",
        customerMessage: text,
        suggestedAction: "Operario debe revisar solicitud de cambio sobre pedido no editable."
      });
      this.handoffConversationToHuman(conversation, "post_dispatch_change_blocked");
      return false;
    }

    const before = JSON.stringify(this.buildDraftOperationalSnapshot(conversation.draftOrder));

    const itemChanged = this.applyPendingItemAmendment(conversation.draftOrder, text, classification);
    this.applyExtractedDeliveryDetails(conversation.draftOrder, classification, text);
    conversation.draftOrder = this.orderService.refreshDraft(conversation.draftOrder);

    const after = JSON.stringify(this.buildDraftOperationalSnapshot(conversation.draftOrder));

    if (before === after && !itemChanged) {
      return false;
    }

    this.orderService.syncOrderFromDraft(
      conversation.activeOrderId,
      conversation.draftOrder,
      `Cambio solicitado por el cliente despues de pasar a revision: ${text}`
    );
    conversation.updatedAt = nowIso();
    return true;
  }

  private applyPendingItemAmendment(
    draft: OrderDraft,
    text: string,
    classification?: MessageClassification
  ) {
    const extractedItem = classification?.extracted.items[0] ?? null;
    const mentionedProducts = this.catalogService.findProductsMentioned(text);
    const extractedProduct = extractedItem?.productName
      ? this.catalogService.findProductByNameOrAlias(extractedItem.productName)
      : null;
    const product =
      mentionedProducts[0] ??
      (extractedProduct && this.shouldTrustExtractedProduct(text, extractedProduct)
        ? extractedProduct
        : null);
    const mentionedModifiers = this.catalogService.findModifierOptionsMentioned(text);
    const contextualRemovalProduct = product ? null : this.findContextualDraftProductReference(draft, text);

    if (!product && contextualRemovalProduct && this.isContextualItemRemovalRequest(text)) {
      const beforeLength = draft.items.length;
      draft.items = draft.items.filter((item) => item.productId !== contextualRemovalProduct.id);
      return draft.items.length !== beforeLength;
    }

    if (!product && draft.items.length > 0 && this.hasItemAdjustment(text, mentionedModifiers, extractedItem)) {
      const target = this.resolveTargetItemForModification(text, draft);
      if (target.status === "ambiguous") {
        draft.blockingIssue = target.message;
        return true;
      }

      this.applyItemAdjustments(target.item, text, mentionedModifiers, extractedItem);
      this.clearDraftBlockingIssue(draft, "item");
      return true;
    }

    if (!product && draft.items.length > 0 && this.hasQuantityAdjustment(text)) {
      const target = this.resolveTargetItemForModification(text, draft);
      if (target.status === "ambiguous") {
        draft.blockingIssue = target.message;
        return true;
      }

      this.applyQuantityAdjustment(target.item, text);
      this.clearDraftBlockingIssue(draft, "item");
      return true;
    }

    if (!product) {
      return false;
    }

    const quantityResult = this.resolveQuantity(text, extractedItem?.quantity ?? null);
    if (!quantityResult.ok) {
      return false;
    }

    if (this.isItemRemovalRequest(text, product) && draft.items.length > 0) {
      const beforeLength = draft.items.length;
      draft.items = draft.items.filter((item) => item.productId !== product.id);
      return draft.items.length !== beforeLength;
    }

    if (this.isReplacementRequest(text) && draft.items.length > 0) {
      draft.items = [];
    }

    if (
      draft.items.length > 0 &&
      draft.items.some((item) => item.productId === product.id) &&
      this.hasItemAdjustment(text, mentionedModifiers, extractedItem) &&
      !this.isAdditionalProductRequest(text) &&
      !this.isReplacementRequest(text)
    ) {
      const target = this.resolveTargetItemForModification(text, draft);
      if (target.status === "ambiguous") {
        draft.blockingIssue = target.message;
        return true;
      }

      this.applyItemAdjustments(target.item, text, mentionedModifiers, extractedItem);
      this.clearDraftBlockingIssue(draft, "item");
      return true;
    }

    const modifierResolution = this.resolveModifiersForNewItem(product, text, mentionedModifiers, extractedItem);
    const item = this.buildCatalogOrderItem(
      product,
      quantityResult.quantity,
      modifierResolution.modifiers,
      [],
      extractedItem?.notes ?? null,
      text
    );
    draft.items.push(item);
    if (modifierResolution.blockingIssue) {
      draft.blockingIssue = modifierResolution.blockingIssue;
    }
    this.syncRequiredOptionsBlockingIssue(draft);
    return true;
  }

  private buildDraftOperationalSnapshot(draft: OrderDraft) {
    return {
      items: draft.items.map((item) => ({
        productId: item.productId,
        quantity: item.quantity,
        selectedOptions: item.selectedOptions ?? {},
        selectedOptionQuantities: item.selectedOptionQuantities ?? {},
        components: item.components.map((component) => ({
          name: component.name,
          type: component.type,
          priceDelta: component.priceDelta
        }))
      })),
      fulfillmentType: draft.fulfillmentType,
      customerName: draft.customerName,
      address: draft.address,
      neighborhood: draft.neighborhood ?? null,
      addressReference: draft.addressReference ?? null,
      inferredZoneId: draft.inferredZoneId,
      paymentMethod: draft.paymentMethod,
      cashAmount: draft.cashAmount,
      notes: draft.notes,
      blockingIssue: draft.blockingIssue
    };
  }

  private setConversationDraftState(
    conversation: Conversation,
    draft: OrderDraft,
    state: Conversation["state"]
  ) {
    conversation.draftOrder = draft;
    conversation.state = state;
    conversation.updatedAt = nowIso();
  }

  private refreshConversationDraft(conversation: Conversation, draft: OrderDraft) {
    conversation.draftOrder = this.orderService.refreshDraft(draft);
    conversation.updatedAt = nowIso();
  }

  private refreshConversationDraftState(
    conversation: Conversation,
    draft: OrderDraft,
    state: Conversation["state"]
  ) {
    conversation.draftOrder = this.orderService.refreshDraft(draft);
    conversation.state = state;
    conversation.updatedAt = nowIso();
  }

  private buildCartSummaryWithDeliveryDetailsRequest(draft: OrderDraft) {
    return [this.buildCartSummary(draft), this.buildDeliveryDetailsRequest(draft)].join("\n\n");
  }

  private async continueAfterDraftUpdate(conversation: Conversation, draft: OrderDraft) {
    conversation.draftOrder = this.orderService.refreshDraft(draft);
    this.sanitizeDraftItemNotes(conversation.draftOrder);
    const requiredOptionsMessage = this.syncRequiredOptionsBlockingIssue(conversation.draftOrder);

    if (requiredOptionsMessage) {
      conversation.state = "collecting_items";
      conversation.updatedAt = nowIso();
      return [this.buildCartSummary(conversation.draftOrder), requiredOptionsMessage].join("\n\n");
    }

    if (this.getMissingDeliveryFields(conversation.draftOrder).length === 0) {
      return this.finalizeOrderForReview(conversation);
    }

    conversation.state = "collecting_delivery_details";
    conversation.updatedAt = nowIso();
    return this.buildCartSummaryWithDeliveryDetailsRequest(conversation.draftOrder);
  }

  private syncRequiredOptionsBlockingIssue(draft: OrderDraft) {
    const message = this.buildRequiredOptionsRequest(draft);
    if (message) {
      draft.blockingIssue = message;
      return message;
    }

    if (draft.blockingIssue && this.isRequiredOptionsBlockingIssue(draft.blockingIssue)) {
      draft.blockingIssue = null;
    }

    return null;
  }

  private buildRequiredOptionsRequest(draft: OrderDraft) {
    const missingOptions = this.getMissingRequiredOptions(draft);
    if (missingOptions.length === 0) {
      return null;
    }

    if (missingOptions.length === 1) {
      const missing = missingOptions[0];
      if (this.usesPerUnitRequiredOptionFlow(missing.item, missing.product)) {
        return this.buildPerUnitRequiredOptionsQuestion(missing.item, missing.product);
      }
      return `Perfecto. Para ${missing.item.productName}, dime ${missing.option.label}.`;
    }

    const perUnitMissing = missingOptions.find((missing) =>
      this.usesPerUnitRequiredOptionFlow(missing.item, missing.product)
    );
    if (perUnitMissing) {
      return this.buildPerUnitRequiredOptionsQuestion(perUnitMissing.item, perUnitMissing.product);
    }

    return [
      "Perfecto. Antes de pedir datos de entrega necesito completar estas opciones del pedido:",
      "",
      ...missingOptions.map((missing) => `- ${missing.option.label} para ${missing.item.productName}`)
    ].join("\n");
  }

  private isRequiredOptionsBlockingIssue(value: string) {
    return /^Perfecto\. Para .+, dime /i.test(value) || /opciones del pedido/i.test(value);
  }

  private getMissingRequiredOptions(draft: OrderDraft) {
    return draft.items.flatMap((item) => {
      const product = this.catalogService.findProductById(item.productId);
      if (!product) {
        return [];
      }

      return (product.requiredOptions ?? [])
        .filter((option) => option.required)
        .filter((option) => {
          if (this.usesPerUnitRequiredOptionFlow(item, product)) {
            return this.getRequiredOptionResolvedUnitCount(item, option) < item.quantity;
          }

          return (item.selectedOptions?.[option.key]?.length ?? 0) < option.minSelections;
        })
        .map((option) => ({ item, product, option }));
    });
  }

  private applyRequiredOptionReply(draft: OrderDraft, text: string) {
    const missingOptions = this.getMissingRequiredOptions(draft);
    if (missingOptions.length === 0) {
      return false;
    }

    const matches = missingOptions
      .map((missing) => {
        const quantityValues = Object.keys(
          this.extractRequiredOptionQuantityMap(missing.option, text)
        );
        return {
          ...missing,
          values: uniqueCaseInsensitive([
            ...quantityValues,
            ...this.extractSelectedValuesForRequiredOption(missing.option, text)
          ])
        };
      })
      .filter((entry) => entry.values.length > 0);

    if (matches.length === 0) {
      return false;
    }

    const targetedItem = this.resolveTargetItemForRequiredOption(text, draft);
    const targetableMatches = targetedItem
      ? matches.filter((match) => match.item.id === targetedItem.id)
      : matches;

    if (targetableMatches.length === 0) {
      draft.blockingIssue = "No encontre esa opcion pendiente en el producto que mencionaste. Me confirmas a cual va?";
      return true;
    }

    const uniqueItemIds = new Set(targetableMatches.map((match) => match.item.id));
    const uniqueOptionKeys = new Set(targetableMatches.map((match) => match.option.key));
    if (!targetedItem && (uniqueItemIds.size > 1 || uniqueOptionKeys.size > 1)) {
      draft.blockingIssue = "Para no aplicarlo al producto equivocado, me confirmas a cual producto va esa opcion?";
      return true;
    }

    for (const match of targetableMatches) {
      match.item.selectedOptions ??= {};
      const current = match.item.selectedOptions[match.option.key] ?? [];
      const effectiveMaxSelections = this.effectiveRequiredOptionMaxSelections(
        match.option,
        match.item.quantity
      );
      match.item.selectedOptions[match.option.key] = uniqueCaseInsensitive([
        ...current,
        ...match.values
      ]).slice(0, effectiveMaxSelections);
      this.mergeRequiredOptionQuantityMap(
        match.item,
        match.option,
        this.extractRequiredOptionQuantityMap(match.option, text),
        effectiveMaxSelections
      );
      if (this.usesPerUnitRequiredOptionFlow(match.item, match.product)) {
        this.incrementPerUnitSelectedOptionCounts(match.item, match.product, {
          [match.option.key]: match.values
        });
      }
    }

    this.syncRequiredOptionsBlockingIssue(draft);
    return true;
  }

  private resolveTargetItemForRequiredOption(text: string, draft: OrderDraft) {
    const ordinalTarget = this.resolveOrdinalTargetItem(text, draft);
    if (ordinalTarget?.status === "resolved") {
      return ordinalTarget.item;
    }

    const targetPhrases = this.extractModificationTargetPhrases(text);
    if (targetPhrases.length === 0) {
      return null;
    }

    const matches = targetPhrases.flatMap((phrase) =>
      this.findDraftItemsMatchingTargetPhrase(draft, phrase)
    );
    const uniqueMatches = matches.filter(
      (item, index, list) => list.findIndex((entry) => entry.id === item.id) === index
    );

    return uniqueMatches.length === 1 ? uniqueMatches[0] : null;
  }

  private buildCartSummary(draft: OrderDraft) {
    const hasUnknownPrice = draft.items.some((item) => item.unitBasePrice === 0);
    const itemLines = draft.items
      .map((item) => {
        const additions = item.components
          .filter((component) => component.type === "added")
          .map((component) => `   + ${component.name} - ${formatCurrency(component.priceDelta)}`);
        const removals = item.components
          .filter((component) => component.type === "removed")
          .map((component) => `   Sin ${component.name}`);
        const selectedOptions = this.formatSelectedOptions(item);
        const itemBaseTotal = item.unitBasePrice * item.quantity;

        return [
          item.unitBasePrice === 0
            ? `🍓 ${item.quantity} x ${item.productName} - precio por revisar`
            : `🍓 ${item.quantity} x ${item.productName} - ${formatCurrency(itemBaseTotal)}`,
          selectedOptions ? `   Opciones: ${selectedOptions}` : null,
          ...additions,
          ...removals,
          item.notes ? `   Nota: ${item.notes}` : null
        ]
          .filter(Boolean)
          .join("\n");
      })
      .join("\n");

    return [
      "Tengo anotado:",
      itemLines,
      hasUnknownPrice
        ? "Subtotal parcial: por revisar"
        : `Subtotal parcial: ${formatCurrency(draft.pricing.subtotal)}`,
      draft.fulfillmentType === "delivery" ? "Domicilio: lo confirma un asesor" : null,
      !hasUnknownPrice ? `Total productos: ${formatCurrency(draft.pricing.subtotal)}` : null
    ]
      .filter(Boolean)
      .join("\n");
  }

  private formatSelectedOptions(item: OrderItem) {
    const product = this.catalogService.findProductById(item.productId);
    const options = product?.requiredOptions ?? [];

    return options
      .map((option) => {
        const values = item.selectedOptions?.[option.key] ?? [];
        const formattedValues = this.formatSelectedOptionValues(item, option, values);
        return formattedValues ? `${option.label}: ${formattedValues}` : null;
      })
      .filter(Boolean)
      .join("; ");
  }

  private formatSelectedOptionValues(
    item: OrderItem,
    option: ProductRequiredOption,
    values: string[]
  ) {
    const quantityMap = item.selectedOptionQuantities?.[option.key] ?? {};
    const quantityEntries = Object.entries(quantityMap).filter(([, quantity]) => quantity > 0);
    if (quantityEntries.length > 0) {
      return quantityEntries
        .map(([value, quantity]) => (quantity > 1 ? `${value} x${quantity}` : value))
        .join(", ");
    }

    return values.length ? values.join(", ") : "";
  }

  private buildDeliveryDetailsRequest(draft: OrderDraft) {
    const missing = this.getMissingDeliveryFields(draft);

    if (missing.length === 0) {
      return "Ya tengo los datos necesarios para pasarlo a revision.";
    }

    const neighborhoodNeedsCorrection =
      draft.fulfillmentType === "delivery" &&
      Boolean(draft.neighborhood?.trim()) &&
      !this.isValidBarranquillaNeighborhood(draft.neighborhood);
    const labels: Record<string, string> = {
      customerName: "Nombre completo",
      address: "Direccion completa",
      neighborhood: neighborhoodNeedsCorrection
        ? `Barrio valido de Barranquilla (no pude validar "${draft.neighborhood}")`
        : "Barrio",
      addressReference: "Referencia de direccion (casa, apartamento, torre, conjunto o indicaciones)",
      zone: "Barrio o zona de entrega",
      paymentMethod: `Metodo de pago (${this.businessService
        .getDefaultBusiness()
        .paymentMethods.join(", ")})`,
      cashAmount: "Con cuanto pagas en efectivo",
      blockingIssue: draft.blockingIssue ?? "Aclaracion pendiente del pedido"
    };

    const visibleMissing = this.simplifyVisibleDeliveryFields(missing, draft);

    return [
      "Dale, para completar tu pedido necesitamos tus siguientes datos:",
      "",
      ...visibleMissing.map((field) => `- ${labels[field]}`),
      "",
      "Si quieres agregar algo mas al pedido, escribelo. Si no, con esos datos lo dejo listo."
    ].join("\n");
  }

  private simplifyVisibleDeliveryFields(missing: string[], draft: OrderDraft) {
    const visible = new Set(missing);

    return [
      "customerName",
      "address",
      "neighborhood",
      "addressReference",
      "zone",
      "paymentMethod",
      "cashAmount",
      "blockingIssue"
    ]
      .filter((field) => visible.has(field));
  }

  private getMissingDeliveryFields(draft: OrderDraft) {
    const missing: string[] = [];

    if (draft.blockingIssue) {
      missing.push("blockingIssue");
    }

    if (!draft.customerName?.trim()) {
      missing.push("customerName");
    }

    if (draft.fulfillmentType === "delivery" && !draft.address?.trim()) {
      missing.push("address");
    }

    if (
      draft.fulfillmentType === "delivery" &&
      (!draft.neighborhood?.trim() || !this.isValidBarranquillaNeighborhood(draft.neighborhood))
    ) {
      missing.push("neighborhood");
    }

    if (draft.fulfillmentType === "delivery" && !draft.addressReference?.trim()) {
      missing.push("addressReference");
    }

    if (!draft.paymentMethod?.trim()) {
      missing.push("paymentMethod");
    }

    return missing;
  }

  private validateAndNormalizeNeighborhood(draft: OrderDraft) {
    if (draft.fulfillmentType !== "delivery" || !draft.neighborhood?.trim()) {
      return;
    }

    const resolution = resolveBarranquillaZone(draft.neighborhood);
    if (resolution.status === "match") {
      draft.neighborhood = resolution.zone.name;
      draft.inferredZoneId = resolution.zone.id;
      return;
    }

    draft.inferredZoneId = null;
  }

  private isValidBarranquillaNeighborhood(value: string | null | undefined) {
    if (!value?.trim()) {
      return false;
    }

    return resolveBarranquillaZone(value).status === "match";
  }

  private hasDeliveryReferenceOrUnitDetail(address: string) {
    const normalized = this.normalizeForMatching(address);
    return /\b(apto|apartamento|torre|edificio|edif|conjunto|unidad|residencia|casa|local|porter[ií]a|porteria|piso|interior|bloque|manzana|mz|referencia|frente|al frente|cerca|junto|al lado|esquina|diagonal)\b/.test(
      normalized
    );
  }

  private extractNameFromText(text: string) {
    if (this.isPickupRequest(text)) {
      return null;
    }

    const patterns = [
      /\ba nombre de\s+([^,.;\n]+)/i,
      /\b(?:el\s+)?nombre\s*(?:es|:)?\s*([^,.;\n]+)/i,
      /\b(?:es\s+)?para\s+mi\s+(?:hermana|hermano|mama|papa|novia|novio)\s+(\p{L}+(?:\s+\p{L}+){1,4})/iu,
      /\bsoy\s+([^,.;\n]+)/i
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      const value = match?.[1] ? this.cleanNameCandidate(match[1]) : null;
      if (
        value &&
        value.length >= 2 &&
        value.length <= 60 &&
        this.looksLikePersonName(value) &&
        !this.looksLikeOperationalPhrase(value)
      ) {
        return value;
      }
    }

    const embeddedName = text.match(
      /\b(?:para|soy)\s+(\p{L}+(?:\s+\p{L}+){1,4})(?=\s+(?:en|a|calle|cll|cra|carrera|avenida|av|barrio|pago|nequi|daviplata|efectivo|transferencia)\b|[,.;\n]|$)/iu
    );
    const embeddedNameValue = embeddedName?.[1] ? this.cleanNameCandidate(embeddedName[1]) : null;
    if (
      embeddedNameValue &&
      embeddedNameValue.length >= 2 &&
      embeddedNameValue.length <= 60 &&
      this.looksLikePersonName(embeddedNameValue) &&
      !this.looksLikeOperationalPhrase(embeddedNameValue)
    ) {
      return embeddedNameValue;
    }

    if (!this.looksLikeAddress(text) && !this.extractPaymentMethodFromText(text)) {
      return null;
    }

    const compact = text.replace(/\s+/g, " ").trim();
    const firstSegment = compact.split(",")[0]?.trim();
    const addressStart = compact.search(
      /\b(calle|cll|cra|carrera|avenida|av|apto|apartamento|torre|edificio|edif|conjunto|unidad|residencia|barrio|manzana|mz|casa|#)\b/i
    );
    const beforeAddress = addressStart > 0 ? compact.slice(0, addressStart).trim() : null;
    const segmentBeforeAddress =
      beforeAddress
        ?.split(",")
        .map((segment) => segment.trim())
        .filter(Boolean)
        .at(-1) ?? null;
    const nameSource = segmentBeforeAddress || beforeAddress || firstSegment || "";
    const zoneTrailingName = beforeAddress ? this.extractNameAfterZoneMention(beforeAddress) : null;
    const trailingName = beforeAddress ? this.extractTrailingPersonName(beforeAddress) : null;
    const candidate = this.cleanNameCandidate(zoneTrailingName ?? trailingName ?? nameSource);

    if (
      candidate &&
      candidate.length >= 2 &&
      candidate.length <= 60 &&
      this.looksLikePersonName(candidate) &&
      !this.looksLikeOperationalPhrase(candidate) &&
      !this.looksLikeAddress(candidate) &&
      !this.extractPaymentMethodFromText(candidate) &&
      !/\b(pago|metodo|direccion|dir|nota|notas|observacion)\b/i.test(candidate)
    ) {
      return candidate;
    }

    return null;
  }

  private hasExplicitNameSignal(text: string) {
    return /\b(a nombre de|nombre|soy|para mi hermana|para mi hermano|para mi mama|para mi papa|para mi novia|para mi novio)\b/i.test(text);
  }

  private isNameCorrectionText(text: string) {
    const normalized = this.normalizeForMatching(text);
    return /^(?:no|perdon|corrijo|correccion)\b/.test(normalized);
  }

  private shouldAppendCustomerName(existing: string | null, candidate: string, text: string) {
    if (!existing || this.isNameCorrectionText(text) || this.catalogService.findDeliveryZonesMentioned(text).length > 0) {
      return false;
    }

    const existingWords = this.normalizedNameWords(existing);
    const candidateWords = this.normalizedNameWords(candidate);

    return existingWords.length === 1 && candidateWords.length === 1 && existingWords[0] !== candidateWords[0];
  }

  private shouldReplaceShortCustomerName(existing: string | null, candidate: string) {
    if (!existing) {
      return false;
    }

    return this.normalizedNameWords(existing).length === 1 && this.normalizedNameWords(candidate).length > 1;
  }

  private normalizedNameWords(value: string) {
    return this.normalizeForMatching(value)
      .replace(/[^a-zÃ±\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .split(" ")
      .filter(Boolean);
  }

  private looksLikePersonName(value: string) {
    const candidate = value.trim();
    if (!/^\p{L}+(?:\s+\p{L}+){0,4}$/u.test(candidate)) {
      return false;
    }

    const readableWords = this.normalizeForMatching(candidate)
      .replace(/[^a-zñ\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .split(" ")
      .filter(Boolean);

    if (readableWords.length === 1 && readableWords[0]!.length < 3) {
      return false;
    }

    return readableWords.length > 0 && readableWords.every((word) => word.length >= 2);
  }

  private normalizeCustomerNameCandidate(value: string | null | undefined) {
    if (!value) {
      return null;
    }

    const candidate = this.cleanNameCandidate(value);

    if (
      !candidate ||
      candidate.length < 2 ||
      candidate.length > 60 ||
      !this.looksLikePersonName(candidate) ||
      this.looksLikeOperationalPhrase(candidate) ||
      this.looksLikeAddress(candidate) ||
      this.extractPaymentMethodFromText(candidate)
    ) {
      return null;
    }

    return candidate;
  }

  private shouldIgnoreCustomerNameFromOrderText(
    text: string,
    extractedItem?: MessageClassification["extracted"]["items"][number] | null
  ) {
    const looksLikeOrderText =
      this.hasOrderableProductSignal(text) ||
      this.hasCatalogModifierSignal(text) ||
      this.hasFreeTextOrderCandidate(text, extractedItem);

    return (
      looksLikeOrderText &&
      !this.hasExplicitNameSignal(text) &&
      !this.looksLikeAddress(text) &&
      !this.extractPaymentMethodFromText(text)
    );
  }

  private looksLikeOperationalPhrase(value: string) {
    const normalized = this.normalizeForMatching(value);
    if (
      /^(?:que|q|como|cuanto|cuando|donde|cual)\b/.test(normalized) ||
      /\b(?:vale|valen|cuesta|cuestan|precio|precios|pagos|reciben|menu|horario|horarios|abierto|abiertos|domicilio|envio|envios)\b/.test(normalized)
    ) {
      return true;
    }

    if (
      /^(?:hola+|holi|buenas|buenos dias|buenas tardes|buenas noches|hey|ey|oye|responde|sticker|foto|audio|mmm+|eh+|aja|ok|okay|listo)$/.test(normalized) ||
      /^(?:ja|je|ji|jo|ju){2,}$/.test(normalized)
    ) {
      return true;
    }

    // Safety filter: avoid persisting conversational fragments as customer names.
    // Natural-language interpretation should stay in IA/classification, not here.
    if (/\b(quiero|quisiera|pedir|ordenar|luego|miro)\b/.test(normalized)) {
      return true;
    }
    return /\b(aun|todavia|dije|digo|mande|envie|falta|listo|bueno|dale|ok|si|no|mas|crema|cambia|cambiar|cambiala|cambialo|direccion|pedido|pago|metodo|mejor|agrega|quita|cancelar|cancela|hermana|hermano|mama|papa|novia|novio|perdon|demore|fui|rato|trabajando|gracias|estan|mentira|mentiras|solo|sin|porfa|tarde|escribo|mando|ubicacion|ubicación|esa|ese|oblea|obleas|fresa|fresas|tradicional|malteada|waffle|milo|brownie|oreo|nutella|helado)\b/.test(
      normalized
    );
  }

  private extractAddressFromText(text: string) {
    const labeled = text.match(/\b(?:direccion|dir)\s*:?\s*([^.;\n]+)/i);
    if (labeled?.[1]) {
      return this.cleanAddressSegment(labeled[1]);
    }

    const compact = text.replace(/\s+/g, " ").trim();
    const addressStart = compact.search(
      /\b(calle|cll|cra|carrera|avenida|av|apto|apartamento|torre|edificio|edif|conjunto|unidad|residencia|barrio|manzana|mz|casa|#)\b/i
    );

    if (addressStart >= 0) {
      return this.cleanAddressSegment(compact.slice(addressStart));
    }

    if (this.looksLikeAddress(text)) {
      return this.cleanAddressSegment(text);
    }

    return null;
  }

  private extractPaymentMethodFromText(text: string) {
    const normalized = this.normalizeForMatching(text);
    const business = this.businessService.getDefaultBusiness();
    const exactMethod = business.paymentMethods.find((method) =>
      normalized.includes(this.normalizeForMatching(method))
    );

    if (exactMethod) {
      return exactMethod;
    }

    const aliases: Array<[string, string[]]> = [
      ["Contra entrega", ["efectivo", "efectiv", "cash", "contra entrega", "contraentrega"]],
      ["Nequi", ["nequi"]],
      ["Bancolombia", ["banco", "bancol", "bancolombia"]]
    ];

    for (const [label, candidates] of aliases) {
      if (candidates.some((candidate) => normalized.includes(candidate))) {
        return label;
      }
    }

    return null;
  }

  private extractPaymentMethodsMentioned(text: string) {
    const normalized = this.normalizeForMatching(text);
    const methods = new Set<string>();

    if (/\befectivo|efectiv|cash|contra\s?entrega\b/.test(normalized)) {
      methods.add("Contra entrega");
    }

    if (/\bnequi\b/.test(normalized)) {
      methods.add("Nequi");
    }

    if (/\bbanco|bancol|bancolombia\b/.test(normalized)) {
      methods.add("Bancolombia");
    }

    return [...methods];
  }

  private isCashAmountLowerThanTotal(draft: OrderDraft) {
    if (!draft.cashAmount || draft.cashAmount === "exacto") {
      return false;
    }

    const amount = this.parseMoneyAmount(draft.cashAmount);
    return amount !== null && amount < draft.pricing.total;
  }

  private parseMoneyAmount(value: string) {
    const normalized = this.normalizeForMatching(value).replace(/\s+/g, "");
    const milMatch = normalized.match(/^(\d+)mil$/);
    if (milMatch?.[1]) {
      return Number(milMatch[1]) * 1000;
    }

    const digits = normalized.replace(/[^\d]/g, "");
    if (!digits) {
      return null;
    }

    return Number(digits);
  }

  private extractCashAmountFromText(text: string) {
    const normalized = this.normalizeForMatching(text);

    if (/\b(exacto|sencillo|justo)\b/.test(normalized)) {
      return "exacto";
    }

    const match = normalized.match(
      /\b(?:con|de)\s*(\d{2,3}(?:[.,]?\d{3})*|\d+\s*mil)\b|\b(\d{2,3}(?:[.,]?\d{3})*)\s*(?:de cambio|en efectivo|efectivo)\b/
    );
    const rawAmount = match?.[1] ?? match?.[2] ?? null;

    if (!rawAmount) {
      return null;
    }

    return rawAmount.replace(/\s+/g, " ").trim();
  }

  private extractNotesFromText(text: string) {
    if (/\b(sin notas|sin observaciones|no tengo notas|no tengo observaciones|ninguna nota)\b/i.test(text)) {
      return "sin notas";
    }

    const match = text.match(
      /\b(?:notas|nota|observaciones|observacion)\b\s*:?\s*([^.;\n,]+)/i
    );
    return match?.[1] ? this.cleanExtractedSegment(match[1]) : null;
  }

  private extractStandaloneNameFromText(draft: OrderDraft, text: string) {
    if (this.isPickupRequest(text) || this.isPayLaterQuestion(text)) {
      return null;
    }

    if (
      this.extractAddressFromText(text) ||
      this.extractPaymentMethodFromText(text) ||
      this.hasOrderableProductSignal(text) ||
      this.hasCatalogModifierSignal(text) ||
      this.catalogService.findDeliveryZonesMentioned(text).length > 0
    ) {
      return null;
    }

    const candidate = this.cleanNameCandidate(text);
    if (!candidate || candidate.length < 3 || candidate.length > 60) {
      return null;
    }

    if (!this.looksLikePersonName(candidate) || this.looksLikeOperationalPhrase(candidate)) {
      return null;
    }

    if (
      draft.customerName &&
      !this.isNameCorrectionText(text) &&
      !this.shouldAppendCustomerName(draft.customerName, candidate, text)
    ) {
      return null;
    }

    return candidate;
  }

  private isPickupRequest(text: string) {
    const normalized = this.normalizeForMatching(text);
    return /\b(recoger|recojo|paso por|paso a recoger|recogida|para recoger|lo recojo)\b/.test(
      normalized
    );
  }

  private isDeliveryRequest(text: string) {
    const normalized = this.normalizeForMatching(text);
    return /\b(domicilio|a domicilio|envio|envios|enviar|mandamelo|mandamela|mandar|llevar|lleven)\b/.test(
      normalized
    );
  }

  private isPayLaterQuestion(text: string) {
    const normalized = this.normalizeForMatching(text);
    return /\b(pagar despues|pago despues|fiado|me fias|te pago luego|pagar luego)\b/.test(
      normalized
    );
  }

  private isCancelRequest(text: string) {
    const normalized = this.normalizeForMatching(text);
    return /\b(cancelar|cancela|cancelalo|cancelar pedido|ya no quiero|anular)\b/.test(
      normalized
    );
  }

  private mentionsUnsupportedPaymentMethod(text: string) {
    const normalized = this.normalizeForMatching(text);
    return /\b(tarjeta|datafono|dataphone|credito|debito|paypal)\b/.test(normalized);
  }

  private cleanExtractedSegment(value: string) {
    return value
      .replace(/\b(?:direccion|dir|pago|metodo|nombre|nota|notas|observacion|observaciones)\b.*$/i, "")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/[,.;]+$/g, "")
      .trim();
  }

  private cleanNameCandidate(value: string) {
    return this.cleanExtractedSegment(value)
      .replace(/^(?:no|perdon|perd[oó]n|corrijo|correccion|correcci[oó]n)\s*,?\s*/i, "")
      .replace(/^(?:es|para)\s+/i, "")
      .replace(/^(?:mi\s+)?(?:hermana|hermano|mama|mam[aá]|papa|pap[aá]|novia|novio)\s+/i, "")
      .replace(/[\u00c2\u00d0\u00de\u00e2\u00ef\u00f0\u00fe\u00ff\u0178]+/g, " ")
      .replace(/[^\p{L}\s]/gu, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  private extractNameAfterZoneMention(value: string) {
    const compact = value.replace(/\s+/g, " ").trim();
    const normalized = this.normalizeForMatching(compact);
    let bestMatch: { index: number; length: number } | null = null;

    for (const zone of this.catalogService.listDeliveryZones()) {
      for (const candidate of [zone.name, ...zone.aliases]) {
        const normalizedCandidate = this.normalizeForMatching(candidate);
        const index = normalized.lastIndexOf(normalizedCandidate);
        if (index >= 0 && (!bestMatch || index > bestMatch.index)) {
          bestMatch = { index, length: normalizedCandidate.length };
        }
      }
    }

    if (!bestMatch) {
      return null;
    }

    const suffix = compact.slice(bestMatch.index + bestMatch.length).trim();
    return suffix && this.looksLikePersonName(suffix) && !this.looksLikeOperationalPhrase(suffix)
      ? suffix
      : null;
  }

  private extractTrailingPersonName(value: string) {
    const words = value
      .replace(/[^\p{L}\s]/gu, " ")
      .replace(/\s+/g, " ")
      .trim()
      .split(" ")
      .filter(Boolean);

    for (const size of [4, 3, 2]) {
      const candidate = words.slice(-size).join(" ");
      if (
        candidate &&
        this.looksLikePersonName(candidate) &&
        !this.looksLikeOperationalPhrase(candidate)
      ) {
        return candidate;
      }
    }

    return null;
  }

  private replaceKnownZoneInAddress(address: string, newZoneName: string) {
    let updatedAddress = address;
    for (const zone of this.catalogService.listDeliveryZones()) {
      for (const candidate of [zone.name, ...zone.aliases]) {
        updatedAddress = updatedAddress.replace(new RegExp(`\\b${this.escapeRegex(candidate)}\\b`, "i"), newZoneName);
      }
    }

    return updatedAddress;
  }

  private cleanAddressSegment(value: string) {
    return this.cleanExtractedSegment(value)
      .replace(/^\s*a\s+/i, "")
      .replace(/\s*,?\s*(?:pago\s*(?:con|por)?\s*)?(?:nequi|neqi|neky|daviplata|davi plata|efectivo|cash|transferencia(?:\s+bancolombia)?|bancolombia)\b.*$/i, "")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/[,.;]+$/g, "")
      .trim();
  }

  private hasContradictoryUnitDetails(value: string) {
    const normalized = this.normalizeForMatching(value);
    const apartmentMatches = [...normalized.matchAll(/\b(?:apto|apartamento)\s+([a-z0-9-]+)/g)]
      .map((match) => match[1])
      .filter(Boolean);

    return new Set(apartmentMatches).size > 1;
  }

  private looksLikeAddress(text: string) {
    const normalized = this.normalizeForMatching(text);
    return /\b(calle|cll|cra|carrera|avenida|av|apto|apartamento|torre|edificio|edif|conjunto|unidad|residencia|barrio|manzana|mz|casa|#)\b/.test(
      normalized
    );
  }

  private isZonePaymentOnlyDeliveryText(text: string) {
    const normalized = this.normalizeForMatching(text);
    const hasConcreteAddressSignal = /\b(calle|cll|cra|carrera|avenida|av|apto|apartamento|torre|edificio|edif|conjunto|unidad|residencia|manzana|mz|casa|#)\b/.test(
      normalized
    );
    const hasZoneSignal =
      /\bbarrio\b/.test(normalized) ||
      this.catalogService.findDeliveryZonesMentioned(text).length === 1;

    return hasZoneSignal && !hasConcreteAddressSignal;
  }

  private isPaymentInfoQuestion(text: string) {
    const normalized = this.normalizeForMatching(text);
    return (
      /\b(cuales|que|como|reciben|aceptan|puedo|metodos)\b/.test(normalized) &&
      /\b(pago|pagar|pagos|nequi|daviplata|efectivo|transferencia)\b/.test(normalized)
    );
  }

  private isDeliveryZoneInfoQuestion(text: string) {
    const normalized = this.normalizeForMatching(text);
    return (
      /[?Â¿]/.test(text) ||
      /\b(cuales|que|como|cuanto|cuanta|manejan|cubren|llegan|hacen|vale|cuesta|domicilio|envio|zona|zonas|barrios|cobertura)\b/.test(
        normalized
      )
    ) && /\b(domicilio|envio|zona|zonas|barrio|barrios|cobertura)\b/.test(normalized);
  }

  private isNegativeNotes(text: string) {
    const normalized = this.normalizeForMatching(text).trim();
    return /^(no|nada|ninguna|sin notas|sin observaciones)$/.test(normalized);
  }

  private normalizeForMatching(text: string) {
    return text
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\bkiero\b/g, "quiero")
      .replace(/\bcn\b/g, "con")
      .replace(/\bkrema\b/g, "crema")
      .replace(/\boreoo+\b/g, "oreo")
      .replace(/\bneqi\b/g, "nequi")
      .replace(/\bneky\b/g, "nequi");
  }

  private escapeRegex(value: string) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  private buildConfirmationMessage(conversation: Conversation) {
    const draft = conversation.draftOrder!;
    const itemLines = draft.items
      .map((item) => {
        const additions = item.components.filter((component) => component.type === "added");
        const removals = item.components.filter((component) => component.type === "removed");
        const selectedOptions = this.formatSelectedOptions(item);
        return [
          `- ${item.quantity} x ${item.productName}`,
          selectedOptions ? `  Opciones: ${selectedOptions}` : null,
          additions.length ? `  + ${additions.map((entry) => entry.name).join(", ")}` : null,
          removals.length ? `  sin ${removals.map((entry) => entry.name).join(", ")}` : null
        ]
          .filter(Boolean)
          .join("\n");
      })
      .join("\n");

    return [
      "Te resumo el pedido para confirmar:",
      "",
      itemLines,
      "",
      `Nombre: ${draft.customerName ?? "Pendiente"}`,
      `Dirección: ${draft.address ?? "Pendiente"}`,
      `Método de pago: ${draft.paymentMethod ?? "Pendiente"}`,
      `Subtotal: ${formatCurrency(draft.pricing.subtotal)}`,
      `Domicilio: ${formatCurrency(draft.pricing.deliveryFee)}`,
      `Total estimado: ${formatCurrency(draft.pricing.total)}`,
      "",
      "Responde 'si' para confirmar o dime que quieres cambiar."
    ].join("\n");
  }

  private resolveQuantity(text: string, extractedQuantity: number | null | undefined) {
    const rawQuantity = extractedQuantity && extractedQuantity > 0
      ? extractedQuantity
      : this.extractQuantity(text);

    return this.validateQuantity(rawQuantity);
  }

  private resolveQuantityForProductMention(text: string, product: Product) {
    return this.validateQuantity(this.extractQuantityForProductMention(text, product));
  }

  private validateQuantity(rawQuantity: number) {
    if (rawQuantity <= 0) {
      return {
        ok: false as const,
        message: "La cantidad debe ser mayor a cero. Dime cuantas unidades quieres pedir."
      };
    }

    if (rawQuantity > 20) {
      return {
        ok: false as const,
        message:
          "Para esa cantidad prefiero dejarlo con un operario antes de confirmar. Quieres que lo marque para revision?"
      };
    }

    return { ok: true as const, quantity: rawQuantity };
  }

  private extractQuantityForProductMention(text: string, product: Product) {
    const normalized = this.normalizeForMatching(text);
    const candidates = [product.name, ...product.aliases]
      .map((candidate) => this.normalizeForMatching(candidate))
      .filter(Boolean)
      .sort((a, b) => b.length - a.length);
    const occurrences = candidates
      .map((candidate) => ({ candidate, index: normalized.indexOf(candidate) }))
      .filter((entry) => entry.index >= 0)
      .sort((a, b) => a.index - b.index || b.candidate.length - a.candidate.length);
    const occurrence = occurrences[0];

    if (!occurrence) {
      return 1;
    }

    const prefix = normalized.slice(0, occurrence.index).trim();
    const quantityWords: Record<string, number> = {
      un: 1,
      una: 1,
      uno: 1,
      dos: 2,
      par: 2,
      tres: 3,
      cuatro: 4,
      cinco: 5,
      seis: 6,
      siete: 7,
      ocho: 8,
      nueve: 9,
      diez: 10,
      once: 11,
      doce: 12
    };
    const match = prefix.match(/(?:^|[\s,;])(\d+|un|una|uno|dos|par|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce)\s*$/);
    const raw = match?.[1] ?? null;

    if (!raw) {
      return 1;
    }

    return /^\d+$/.test(raw) ? Number(raw) : quantityWords[raw] ?? 1;
  }

  private extractQuantity(text: string) {
    const normalized = this.normalizeForMatching(text);
    const productTerm =
      "(?:obleas?|fresas?|fresa|tradicional(?:es)?|malteadas?|malteada|waffles?|waffle)";
    const negativeMatch = normalized.match(new RegExp(`-\\s*(\\d+)\\s+${productTerm}\\b`));
    if (negativeMatch?.[1]) {
      return -Number(negativeMatch[1]);
    }

    const numericMatch = normalized.match(new RegExp(`\\b(\\d+)\\s+${productTerm}\\b`));
    if (numericMatch?.[1]) {
      return Number(numericMatch[1]);
    }

    const wordQuantities: Array<[RegExp, number]> = [
      [new RegExp(`\\b(una|un)\\s+${productTerm}\\b`), 1],
      [new RegExp(`\\b(dos|par)\\s+${productTerm}\\b`), 2],
      [new RegExp(`\\b(tres)\\s+${productTerm}\\b`), 3],
      [new RegExp(`\\b(cuatro)\\s+${productTerm}\\b`), 4],
      [new RegExp(`\\b(cinco)\\s+${productTerm}\\b`), 5],
      [new RegExp(`\\b(seis)\\s+${productTerm}\\b`), 6],
      [new RegExp(`\\b(siete)\\s+${productTerm}\\b`), 7],
      [new RegExp(`\\b(ocho)\\s+${productTerm}\\b`), 8],
      [new RegExp(`\\b(nueve)\\s+${productTerm}\\b`), 9],
      [new RegExp(`\\b(diez)\\s+${productTerm}\\b`), 10]
    ];

    return wordQuantities.find(([pattern]) => pattern.test(normalized))?.[1] ?? 1;
  }

  private buildOpenOrderIntentResponse(text: string) {
    if (this.containsOrderIntent(text)) {
      return "Si claro. Si quieres ver opciones, escribe menu. Si ya sabes, dime que deseas ordenar.";
    }

    return "Cuentame que producto quieres pedir. Si quieres ver opciones, escribe menu.";
  }

  private buildAmbiguousCatalogRequest(text: string) {
    const candidate = this.normalizeForMatching(this.extractFreeTextProductName(text) ?? text)
      .replace(/\b(?:rapido|normal|porfa|por favor|pls|please)\b/g, "")
      .replace(/\s+/g, " ")
      .trim();

    const groups = [
      {
        pattern: /^(?:oblea|obleas)(?:\s+.+)?$/,
        label: "oblea",
        products: this.catalogService
          .listActiveProducts()
          .filter((product) => product.category === "obleas")
      },
      {
        pattern: /^(?:malteada|malteadas|batido|batidos)(?:\s+.+)?$/,
        label: "malteada",
        products: this.catalogService
          .listActiveProducts()
          .filter((product) => product.category === "malteadas")
      },
      {
        pattern: /^(?:waffle|waffles|wafle|wafles)(?:\s+.+)?$/,
        label: "waffle",
        products: this.catalogService
          .listActiveProducts()
          .filter((product) => this.normalizeForMatching(product.name).includes("waffle"))
      },
      {
        pattern: /^(?:vaso helado|helado)(?:\s+.+)?$/,
        label: "helado",
        products: this.catalogService
          .listActiveProducts()
          .filter((product) => this.normalizeForMatching(product.name).startsWith("vaso helado"))
      },
      {
        pattern: /^(?:combinado|combinados)(?:\s+.+)?$/,
        label: "combinado",
        products: this.catalogService
          .listActiveProducts()
          .filter((product) => this.normalizeForMatching(product.name).startsWith("combinado"))
      }
    ];

    const group = groups.find((entry) => entry.pattern.test(candidate));
    if (!group || group.products.length < 2) {
      return null;
    }

    const examples = group.products.slice(0, 4).map((product) => product.name).join(", ");
    return `Tenemos varias opciones de ${group.label}. Me confirmas cual quieres? Por ejemplo: ${examples}.`;
  }

  private hasFreeTextOrderCandidate(
    text: string,
    extractedItem?: MessageClassification["extracted"]["items"][number] | null
  ) {
    const aiProductName = this.cleanAiNullableText(extractedItem?.productName);
    if (aiProductName) {
      return !this.isGenericOrderPhrase(aiProductName) && this.looksLikeFreeTextProductPhrase(aiProductName);
    }

    const candidate = this.extractFreeTextProductName(text);
    return Boolean(
      candidate && !this.isGenericOrderPhrase(candidate) && this.looksLikeFreeTextProductPhrase(candidate)
    );
  }

  private shouldTrustExtractedProduct(
    text: string,
    product: ReturnType<CatalogService["findProductByNameOrAlias"]>
  ) {
    if (!product) {
      return false;
    }

    const normalizedText = this.normalizeForMatching(text);
    const productWasMentioned = [product.name, ...product.aliases].some((candidate) =>
      normalizedText.includes(this.normalizeForMatching(candidate))
    );

    if (productWasMentioned) {
      return true;
    }

    // If the client wrote a free-form product name, do not let the model force it
    // into a different catalog item just because one word overlaps.
    return !this.extractFreeTextProductName(text);
  }

  private buildFreeTextProductName(
    text: string,
    extractedItem?: MessageClassification["extracted"]["items"][number] | null
  ) {
    const aiProductName = this.cleanAiNullableText(extractedItem?.productName);
    const aiProductInCatalog = aiProductName
      ? this.catalogService.findProductByNameOrAlias(aiProductName)
      : null;

    if (aiProductName && !aiProductInCatalog) {
      return aiProductName;
    }

    return this.extractFreeTextProductName(text) || text.trim();
  }

  private cleanAiNullableText(value: string | null | undefined) {
    const cleaned = value?.trim();
    if (!cleaned || /^(null|undefined|n\/a|na|none)$/i.test(cleaned)) {
      return null;
    }

    return cleaned;
  }

  private extractFreeTextProductName(text: string) {
    const normalizedText = this.normalizeForMatching(text).replace(/\s+/g, " ").trim();
    const patterns = [
      /\bquiero\s+(?:pedir|ordenar)\s+(?:unas|unos|una|un|las|los|la|el)?\s*(.+)$/i,
      /\bme\s+gustaria\s+(?:pedir|ordenar)\s+(?:unas|unos|una|un|las|los|la|el)?\s*(.+)$/i,
      /\bquiero\s+(?:unas|unos|una|un|las|los|la|el)?\s*(.+)$/i,
      /\bme\s+(?:das|regalas|mandas)\s+(?:unas|unos|una|un|las|los|la|el)?\s*(.+)$/i,
      /\bdame\s+(?:unas|unos|una|un|las|los|la|el)?\s*(.+)$/i,
      /\b(?:pido|pide)\s+(?:unas|unos|una|un|las|los|la|el)?\s*(.+)$/i,
      /\b(?:ademas|adicional)\s+(?:unas|unos|una|un|las|los|la|el)?\s*(.+)$/i,
      /\b(?:y|tambien|también|agrega|agregame|agrégame|añade|sumale|súmale|otro|otra)\s+(?:unas|unos|una|un|las|los|la|el)?\s*(.+)$/i
    ];

    for (const pattern of patterns) {
      const match = normalizedText.match(pattern);
      const candidate = match?.[1] ? this.cleanFreeTextProductCandidate(match[1]) : null;
      if (candidate && candidate.length >= 3) {
        return candidate;
      }
    }

    const fallbackCandidate = this.cleanFreeTextProductCandidate(normalizedText);
    if (
      fallbackCandidate &&
      fallbackCandidate.length >= 3 &&
      !this.isGenericOrderPhrase(fallbackCandidate) &&
      this.looksLikeFreeTextProductPhrase(fallbackCandidate)
    ) {
      return fallbackCandidate;
    }

    return null;
  }

  private cleanFreeTextProductCandidate(value: string) {
    return value
      .replace(/^(?:hola+|buenas|buenos dias|buenas tardes|buenas noches|hey|holi)[,!\s]+/i, "")
      .replace(/^(?:ademas|adicional|tambien)\s+/i, "")
      .replace(/^(?:quiero|quisiera|me gustaria|voy a)\s+(?:pedir|ordenar)?\s*/i, "")
      .replace(/^(?:pedir|ordenar)\s+/i, "")
      .replace(/^(?:unas|unos|una|un|las|los|la|el|uno)\s+/i, "")
      .replace(/,.*$/g, "")
      .replace(/\bcon todo\b/gi, "")
      .replace(/\b(a domicilio|para domicilio|porfa|por favor)\b/gi, "")
      .replace(/[.?!]+$/g, "")
      .trim();
  }

  private looksLikeFreeTextProductPhrase(value: string) {
    const normalized = this.normalizeForMatching(value);
    return /\b(mix|fresa|fresas|oblea|waffle|waffles|malteada|malteadas|postre|oreo|brownie|milo|nutella|helado|banana)\b/.test(
      normalized
    );
  }

  private isUncertainProductText(text: string) {
    const normalized = this.normalizeForMatching(text);
    return /\b(no se|creo|espera|eh|mmm|no estoy seguro|no estoy segura|o algo asi|como que)\b/.test(
      normalized
    );
  }

  private isUnsupportedCustomProductText(text: string) {
    const normalized = this.normalizeForMatching(text);
    return /\b(sushi|pizza|hamburguesa|perro caliente|salchipapa|arroz|pollo|carne|cerveza|licor|producto secreto|combo secreto)\b/.test(
      normalized
    );
  }

  private isUnsupportedPromotionOrderRequest(text: string) {
    const normalized = this.normalizeForMatching(text);
    const hasActivePromotions = demoStore.promotions.some((promotion) => promotion.isActive);

    return (
      !hasActivePromotions &&
      /\b(promo|promocion|2x1|descuento|combo)\b/.test(normalized)
    );
  }

  private extractFreeTextProductNotes(text: string) {
    if (/\bcon todo\b/i.test(text)) {
      return "Personalizacion: con todo.";
    }

    return null;
  }

  private shouldAddModifierForProduct(
    product: { defaultComponents: string[] },
    text: string,
    modifier: { name: string; aliases?: string[] }
  ) {
    const modifierName = this.normalizeForMatching(modifier.name);
    const alreadyIncluded = product.defaultComponents.some(
      (component) => this.normalizeForMatching(component) === modifierName
    );

    if (!alreadyIncluded) {
      return true;
    }

    return this.hasModifierIncrement(text, modifier);
  }

  private resolveModifiersForNewItem(
    product: Product,
    text: string,
    mentionedModifiers: ModifierCandidate[],
    extractedItem?: MessageClassification["extracted"]["items"][number] | null
  ) {
    const extractedModifiers =
      extractedItem?.additions
        .map((addition) => this.catalogService.findModifierOptionByNameOrAlias(addition))
        .filter((modifier) => modifier !== null) ?? [];
    const modifiers = [...mentionedModifiers, ...extractedModifiers]
      .filter(
        (modifier, index, list) => list.findIndex((entry) => entry.id === modifier.id) === index
      )
      .filter((modifier) => this.shouldAddModifierForProduct(product, text, modifier))
      .filter((modifier) => !this.isSelectedRequiredOptionValue(product, text, modifier.name));

    if (modifiers.length > 0 && product.modifierGroupIds.length === 0) {
      return {
        modifiers: [] as ModifierCandidate[],
        blockingIssue:
          "Ese producto no tiene adiciones configuradas en el menu. Me confirmas si quieres dejarlo como viene?"
      };
    }

    if (this.isAmbiguousModifierFamilyRequest(product, text, modifiers)) {
      return {
        modifiers: [] as ModifierCandidate[],
        blockingIssue:
          "Hay varias opciones relacionadas con chocolate. Me confirmas cual quieres agregar?"
      };
    }

    if (this.hasUnknownModifierRequestForProduct(product, text, modifiers)) {
      return {
        modifiers: [] as ModifierCandidate[],
        blockingIssue:
          "No tengo clara esa adicion en el menu. Me confirmas cual topping o salsa quieres agregar?"
      };
    }

    return { modifiers, blockingIssue: null };
  }

  private findExtractedItemForProduct(
    classification: MessageClassification | undefined,
    product: Product,
    productClause: string
  ) {
    const extractedItems = classification?.extracted.items ?? [];
    if (extractedItems.length === 0) {
      return null;
    }

    const direct = extractedItems.find((item) => {
      const extractedProduct = item.productName
        ? this.catalogService.findProductByNameOrAlias(item.productName)
        : null;
      return extractedProduct?.id === product.id;
    });

    if (direct) {
      return direct;
    }

    const normalizedClause = this.normalizeForMatching(productClause);
    return extractedItems.find((item) =>
      item.productName
        ? normalizedClause.includes(this.normalizeForMatching(item.productName))
        : false
    ) ?? null;
  }

  private isSelectedRequiredOptionValue(product: Product, text: string, modifierName: string) {
    const selectedOptions = this.extractSelectedOptionsForProduct(product, text);
    const normalizedModifier = this.normalizeForMatching(modifierName);

    return Object.values(selectedOptions).some((values) =>
      values.some((value) => this.normalizeForMatching(value) === normalizedModifier)
    );
  }

  private hasUnknownModifierRequestForProduct(
    product: Product,
    text: string,
    modifiers: ModifierCandidate[]
  ) {
    if (modifiers.length > 0) {
      return false;
    }

    const normalizedWithoutProduct = this.removeProductMentionFromText(
      this.normalizeForMatching(text),
      product
    );
    const selectedOptions = this.extractSelectedOptionsForProduct(product, text);
    const hasSelectedRequiredOption = Object.values(selectedOptions).some((values) => values.length > 0);
    if (hasSelectedRequiredOption) {
      return false;
    }

    return /\b(?:con|ponle|agregale|toppings?|adiciones?|salsa)\s+(?!todo\b)([\p{L}0-9\s]+)/u.test(
      normalizedWithoutProduct
    );
  }

  private isAmbiguousModifierFamilyRequest(
    product: Product,
    text: string,
    modifiers: ModifierCandidate[]
  ) {
    const normalizedWithoutProduct = this.removeProductMentionFromText(
      this.normalizeForMatching(text),
      product
    );
    const asksChocolateFamily = /\b(?:toppings?|adiciones?|salsas?)\s+de\s+chocolate\b|\bcon\s+chocolate\b/.test(
      normalizedWithoutProduct
    );

    if (!asksChocolateFamily) {
      return false;
    }

    const chocolateModifiers = this.catalogService
      .listModifierOptions()
      .filter((modifier) => this.isChocolateRelatedModifier(modifier.name));
    const explicitlyNamed = chocolateModifiers.filter((modifier) =>
      [modifier.name, ...modifier.aliases].some((candidate) =>
        normalizedWithoutProduct.includes(this.normalizeForMatching(candidate))
      )
    );

    return explicitlyNamed.length === 0 && (modifiers.length !== 1 || chocolateModifiers.length > 1);
  }

  private isChocolateRelatedModifier(name: string) {
    const normalized = this.normalizeForMatching(name);
    return /\b(chocolate|hershey|choco|chips)\b/.test(normalized);
  }

  private extractProductClause(text: string, product: Product, productsInMessage: Product[]) {
    const normalizedText = this.normalizeForMatching(text);
    const current = this.findProductOccurrence(normalizedText, product);
    if (!current) {
      return text;
    }

    const otherOccurrences = productsInMessage
      .filter((entry) => entry.id !== product.id)
      .map((entry) => this.findProductOccurrence(normalizedText, entry))
      .filter((entry) => entry !== null)
      .sort((a, b) => a.start - b.start);
    const next = otherOccurrences.find((entry) => entry.start > current.start);
    const previous = [...otherOccurrences].reverse().find((entry) => entry.start < current.start);
    const start = previous ? current.start : 0;
    const end = next?.start ?? normalizedText.length;

    return normalizedText.slice(start, end).trim();
  }

  private findProductOccurrence(normalizedText: string, product: Product) {
    return [product.name, ...product.aliases]
      .map((candidate) => this.normalizeForMatching(candidate))
      .filter(Boolean)
      .map((candidate) => ({
        candidate,
        start: normalizedText.indexOf(candidate),
        end: normalizedText.indexOf(candidate) + candidate.length
      }))
      .filter((entry) => entry.start >= 0)
      .sort((a, b) => a.start - b.start || b.candidate.length - a.candidate.length)[0] ?? null;
  }

  private hasActiveItemAdjustmentIntent(
    draft: OrderDraft | null,
    text: string,
    classification?: MessageClassification
  ) {
    if (!draft || draft.items.length === 0) {
      return false;
    }

    const mentionedModifiers = this.catalogService.findModifierOptionsMentioned(text);
    const extractedItem = classification?.extracted.items[0] ?? null;

    return (
      this.hasQuantityAdjustment(text) ||
      this.isAmbiguousItemAdjustment(text) ||
      this.isUnsupportedActiveItemAdjustment(draft, text) ||
      this.hasItemAdjustment(text, mentionedModifiers, extractedItem)
    );
  }

  private buildPlannerClarificationQuestion(
    draft: OrderDraft,
    classification?: MessageClassification
  ) {
    const planner = classification?.planner;
    if (
      !env.AI_AGENT_MODE ||
      classification?.source === "heuristic" ||
      !planner ||
      planner.action !== "ask_clarification"
    ) {
      return null;
    }

    const question = planner.ambiguity?.question?.trim();
    if (question) {
      return question;
    }

    const candidates = planner.ambiguity?.candidates ?? [];
    const component = planner.requestedComponent ?? "ese cambio";
    const target =
      planner.targetItemIndex && draft.items[planner.targetItemIndex - 1]
        ? ` para ${draft.items[planner.targetItemIndex - 1]!.productName}`
        : "";

    if (candidates.length > 0) {
      return `Claro. Para ${component}${target}, cual opcion quieres: ${candidates.join(", ")}?`;
    }

    return `Me confirmas exactamente como quieres aplicar ${component}${target}?`;
  }

  private isUnresolvedItemEditRequest(
    draft: OrderDraft | null,
    text: string,
    classification?: MessageClassification
  ) {
    if (!draft || draft.items.length === 0 || this.looksLikeAddress(text)) {
      return false;
    }

    if (this.hasCatalogProductSignal(text, classification)) {
      return false;
    }

    const hasConcreteDeliveryDetails =
      Boolean(classification?.extracted.address) ||
      Boolean(classification?.extracted.zone) ||
      Boolean(classification?.extracted.paymentMethod) ||
      Boolean(this.extractAddressFromText(text)) ||
      Boolean(this.extractPaymentMethodFromText(text)) ||
      this.catalogService.findDeliveryZonesMentioned(text).length > 0;
    if (hasConcreteDeliveryDetails) {
      return false;
    }

    const normalized = this.normalizeForMatching(text);
    const hasEditIntent =
      classification?.intent === "modify_order" ||
      /\b(ponle|ponles|agregale|agregales|agrega|agregarle|quitale|quita|sin|cambia|cambiale|topping|adicion|adiciones|salsa|chocolate)\b/.test(
        normalized
      );

    if (!hasEditIntent) {
      return false;
    }

    const extractedItem = classification?.extracted.items[0] ?? null;
    const mentionedModifiers = this.catalogService.findModifierOptionsMentioned(text);
    const recognizedExtractedAdditions =
      extractedItem?.additions.filter((addition) =>
        this.catalogService.findModifierOptionByNameOrAlias(addition)
      ) ?? [];
    const hasKnownEdit =
      mentionedModifiers.length > 0 ||
      this.extractRemovals(text).length > 0 ||
      this.hasQuantityAdjustment(text) ||
      this.hasComponentReplacementIntent(text) ||
      recognizedExtractedAdditions.length > 0 ||
      Boolean(extractedItem?.removals.length);

    return !hasKnownEdit;
  }

  private hasItemAdjustment(
    text: string,
    mentionedModifiers: ModifierCandidate[],
    extractedItem?: MessageClassification["extracted"]["items"][number] | null
  ) {
    return (
      this.isResetCustomizationRequest(text) ||
      this.hasComponentReplacementIntent(text) ||
      mentionedModifiers.length > 0 ||
      this.extractRemovals(text).length > 0 ||
      Boolean(extractedItem?.additions?.length) ||
      Boolean(extractedItem?.removals?.length)
    );
  }

  private isTargetedItemAdjustmentPhrase(text: string) {
    const normalized = this.normalizeForMatching(text);
    return (
      /\b(?:ponle|ponles|agregale|agregales|agrega|agregarle|anade|sumale|quitale|quitales|quita|quitarle|sin|doble|otro|otra|mas|extra)\b.*\b(?:a|al|en|para|sobre)\s+(?:el|la|las|los)?\s*[\p{L}0-9]+/u.test(
        normalized
      ) ||
      /\b(?:al|a la|a las|a los|en el|en la|en las|en los)\s+[\p{L}0-9\s]+?\s+(?:ponle|ponles|agregale|agregales|quitale|quitales)\b/u.test(
        normalized
      )
    );
  }

  private hasUnknownComponentIncrementRequest(text: string, mentionedModifiers: ModifierCandidate[]) {
    if (mentionedModifiers.length > 0 || this.looksLikeAddress(text)) {
      return false;
    }

    const normalized = this.normalizeForMatching(text);
    return (
      this.hasIncrementLanguage(text) &&
      /\b(ponle|ponles|agregale|agregales|agrega|agregarle|anade|sumale|con)\b/.test(normalized)
    );
  }

  private hasIncrementLanguage(text: string) {
    const normalized = this.normalizeForMatching(text);
    return /\b(otro|otra|otros|otras|mas|extra|adicional|adicionalmente|doble)\b/.test(normalized);
  }

  private hasModifierIncrement(text: string, modifier: { name: string; aliases?: string[] }) {
    if (!this.hasIncrementLanguage(text)) {
      return false;
    }

    const normalized = this.normalizeForMatching(text);
    const candidates = this.buildModifierIncrementCandidates(modifier);

    return candidates.some((candidate) => {
      const escapedCandidate = this.escapeRegex(candidate);
      return new RegExp(
        `\\b(?:otro|otra|otros|otras|mas|extra|adicional|adicionalmente|doble)\\s+${escapedCandidate}\\b|\\b${escapedCandidate}\\s+(?:extra|adicional|doble|de\\s+mas)\\b`,
        "i"
      ).test(normalized);
    });
  }

  private buildModifierIncrementCandidates(modifier: { name: string; aliases?: string[] }) {
    const rawCandidates = [modifier.name, ...(modifier.aliases ?? [])];
    return uniqueCaseInsensitive(
      rawCandidates
        .map((candidate) =>
          this.normalizeForMatching(candidate)
            .replace(/\b(?:otro|otra|otros|otras|mas|extra|adicional|adicionalmente|doble)\b/g, "")
            .replace(/\s+/g, " ")
            .trim()
        )
        .filter((candidate) => candidate.length > 0)
    );
  }

  private hasComponentReplacementIntent(text: string) {
    const normalized = this.normalizeForMatching(text);
    return /\b(cambia|cambiale|cambiar|reemplaza|reemplazale|reemplazar|sustituye|sustituyeme)\b.+\bpor\b/.test(
      normalized
    );
  }

  private isAmbiguousItemAdjustment(text: string) {
    // Guardrail only: block unsafe item edits when the reference is ambiguous.
    // Do not grow this into a catalog parser.
    if (this.looksLikeAddress(text) || this.catalogService.findDeliveryZonesMentioned(text).length > 0) {
      return false;
    }

    const normalized = this.normalizeForMatching(text).trim();
    return /\b(sin|quita|quitale|quitar|no)\s+(eso|esa|ese|lo mismo|esa cosa)\b/.test(normalized);
  }

  private isUnsupportedActiveItemAdjustment(draft: OrderDraft, text: string) {
    const target = this.resolveTargetItemForModification(text, draft);
    if (target.status === "ambiguous") {
      return false;
    }

    const item = target.item;
    const product = this.catalogService.findProductById(item.productId);
    if (!product) {
      return false;
    }

    const normalized = this.normalizeForMatching(text);
    const mentionsMoreCream = /\b(mas|extra|doble|adicional)\s+crema\b|\bcrema\s+(extra|doble|adicional)\b/.test(
      normalized
    );

    if (!mentionsMoreCream) {
      return false;
    }

    const productHasCream = product.defaultComponents.some(
      (component) => this.normalizeForMatching(component) === "crema"
    );
    const productAcceptsModifiers = product.modifierGroupIds.length > 0;

    return !productHasCream && !productAcceptsModifiers;
  }

  private resolveTargetItemForModification(
    text: string,
    draft: OrderDraft
  ): TargetItemResolution {
    const fallbackItem = draft.items[draft.items.length - 1];
    if (!fallbackItem) {
      return {
        status: "ambiguous",
        message: "No tengo un producto claro para aplicar ese cambio."
      };
    }

    const ordinalResult = this.resolveOrdinalTargetItem(text, draft);
    if (ordinalResult) {
      return ordinalResult;
    }

    const targetPhrases = this.extractModificationTargetPhrases(text);
    if (targetPhrases.length === 0) {
      return { status: "resolved", item: fallbackItem };
    }

    const matches = targetPhrases.flatMap((phrase) =>
      this.findDraftItemsMatchingTargetPhrase(draft, phrase)
    );
    const uniqueMatches = matches.filter(
      (item, index, list) => list.findIndex((entry) => entry.id === item.id) === index
    );

    if (uniqueMatches.length === 1) {
      return { status: "resolved", item: uniqueMatches[0] };
    }

    return {
      status: "ambiguous",
      message: "Para no aplicarlo al producto equivocado, me confirmas a cual producto va ese cambio?"
    };
  }

  private resolveOrdinalTargetItem(
    text: string,
    draft: OrderDraft
  ): TargetItemResolution | null {
    const normalized = this.normalizeForMatching(text);
    const ordinalPatterns: Array<[RegExp, number | "last"]> = [
      [/\b(?:al|a la|a el|a|en la|en el)?\s*(?:primer|primero|primera|1(?:ro|ra)?|#1)\b/, 0],
      [/\b(?:al|a la|a el|a|en la|en el)?\s*(?:segundo|segunda|2(?:do|da)?|#2)\b/, 1],
      [/\b(?:al|a la|a el|a|en la|en el)?\s*(?:tercer|tercero|tercera|3(?:ro|ra)?|#3)\b/, 2],
      [/\b(?:al|a la|a el|a|en la|en el)?\s*(?:ultimo|ultima)\b/, "last"]
    ];

    for (const [pattern, target] of ordinalPatterns) {
      if (!pattern.test(normalized)) {
        continue;
      }

      const index = target === "last" ? draft.items.length - 1 : target;
      const item = draft.items[index];
      if (item) {
        return { status: "resolved", item };
      }

      return {
        status: "ambiguous",
        message: "No encuentro ese numero de producto en el pedido. Me confirmas a cual producto va el cambio?"
      };
    }

    return null;
  }

  private extractModificationTargetPhrases(text: string) {
    const normalized = this.normalizeForMatching(text);
    const phrases: string[] = [];
    const targetMarkerPattern =
      /\b(?:al|a la|a las|a los|a|en el|en la|en las|en los|en|para el|para la|para las|para los|para|sobre el|sobre la|sobre)\s+([\p{L}0-9\s]+?)(?=$|\s+(?:ponle|ponles|agregale|agregales|agrega|agregarle|anade|sumale|quitale|quitales|quita|quitarle|porfa|por favor|please|pls)\b)/gu;

    for (const match of normalized.matchAll(targetMarkerPattern)) {
      const phrase = this.cleanModificationTargetPhrase(match[1] ?? "");
      if (phrase) {
        phrases.push(phrase);
      }
    }

    const leadingTargetMatch = normalized.match(
      /^(?:al|a la|a las|a los|en el|en la|en las|en los)?\s*([\p{L}0-9\s]+?)\s+(?:ponle|ponles|agregale|agregales|quitale|quitales)\b/u
    );
    const leadingPhrase = leadingTargetMatch?.[1]
      ? this.cleanModificationTargetPhrase(leadingTargetMatch[1])
      : null;
    if (leadingPhrase) {
      phrases.push(leadingPhrase);
    }

    return uniqueCaseInsensitive(phrases);
  }

  private cleanModificationTargetPhrase(value: string) {
    const cleaned = value
      .replace(/\b(?:ponle|ponles|agregale|agregales|agrega|agregarle|anade|sumale|quitale|quitales|quita|quitarle)\b.*$/u, "")
      .replace(/\b(?:porfa|por favor|please|pls)\b/gu, "")
      .replace(/^(?:el|la|las|los|un|una|unas|unos)\s+/u, "")
      .replace(/\s+/g, " ")
      .trim();

    if (!cleaned || /^(?:eso|esa|ese|ellos|ellas|producto|pedido|orden)$/.test(cleaned)) {
      return null;
    }

    return cleaned;
  }

  private findDraftItemsMatchingTargetPhrase(draft: OrderDraft, phrase: string) {
    const normalizedPhrase = this.normalizeForMatching(phrase);
    const candidates = draft.items
      .map((item) => ({
        item,
        product: this.catalogService.findProductById(item.productId)
      }))
      .filter((entry): entry is { item: OrderItem; product: Product } => entry.product !== null);

    const exactMatches = candidates.filter(({ product }) =>
      [product.name, ...product.aliases].some((candidate) => {
        const normalizedCandidate = this.normalizeForMatching(candidate);
        return normalizedPhrase === normalizedCandidate || normalizedPhrase.includes(normalizedCandidate);
      })
    );

    if (exactMatches.length > 0) {
      const scoredMatches = exactMatches.map((entry) => {
        const bestMatchLength = [entry.product.name, ...entry.product.aliases]
          .map((candidate) => this.normalizeForMatching(candidate))
          .filter((candidate) => normalizedPhrase === candidate || normalizedPhrase.includes(candidate))
          .sort((a, b) => b.length - a.length)[0]?.length ?? 0;

        return { ...entry, bestMatchLength };
      });
      const longestMatch = Math.max(...scoredMatches.map((entry) => entry.bestMatchLength));

      return scoredMatches
        .filter((entry) => entry.bestMatchLength === longestMatch)
        .map((entry) => entry.item);
    }

    return candidates
      .filter(({ product }) => this.matchesModificationTargetFamily(product, normalizedPhrase))
      .map((entry) => entry.item);
  }

  private matchesModificationTargetFamily(product: Product, normalizedText: string) {
    const normalizedName = this.normalizeForMatching(product.name);
    const normalizedAliases = product.aliases.map((alias) => this.normalizeForMatching(alias));
    const normalizedComponents = product.defaultComponents.map((component) =>
      this.normalizeForMatching(component)
    );
    const mentionsProductWord = (value: string) =>
      normalizedName.includes(value) ||
      normalizedAliases.some((alias) => alias.includes(value)) ||
      normalizedComponents.includes(value);

    return (
      (/\boblea(s)?\b/.test(normalizedText) && product.category === "obleas") ||
      (/\b(malteada|malteadas|batido|batidos)\b/.test(normalizedText) &&
        product.category === "malteadas") ||
      (/\b(waffle|waffles|wafle|wafles)\b/.test(normalizedText) && normalizedName.includes("waffle")) ||
      (/\bvaso\s+helado\b/.test(normalizedText) && normalizedName.startsWith("vaso helado")) ||
      (/\bcombinado(s)?\b/.test(normalizedText) && normalizedName.startsWith("combinado")) ||
      (/\bmix\b/.test(normalizedText) && normalizedName.startsWith("mix")) ||
      (/\bpavlova\b/.test(normalizedText) && normalizedName === "pavlova") ||
      (/\bmaracutfresa\b|\bmaracufresa\b/.test(normalizedText) && normalizedName === "maracufresa") ||
      (/\blove\s+banana\b/.test(normalizedText) && normalizedName === "love banana") ||
      (/\bbanana\b/.test(normalizedText) && mentionsProductWord("banana")) ||
      (/\btradicional\b/.test(normalizedText) && normalizedName.includes("tradicional")) ||
      (/\bfresas?\b/.test(normalizedText) && mentionsProductWord("fresa"))
    );
  }

  private clearDraftBlockingIssue(draft: OrderDraft, scope: "item" | "address") {
    if (!draft.blockingIssue) {
      return;
    }

    const issue = draft.blockingIssue;

    if (scope === "item" && /\b(ingrediente|producto|cambio|anotado|adicion|topping|salsa)\b/i.test(issue)) {
      draft.blockingIssue = null;
    }

    if (scope === "address" && /\b(apartamento|direccion)\b/i.test(issue)) {
      draft.blockingIssue = null;
    }
  }

  private applyItemAdjustments(
    item: OrderItem,
    text: string,
    mentionedModifiers: ModifierCandidate[],
    extractedItem?: MessageClassification["extracted"]["items"][number] | null
  ) {
    const outcome: ItemAdjustmentOutcome = {
      incrementedExistingComponents: []
    };

    if (this.isResetCustomizationRequest(text)) {
      item.components = item.components.filter((component) => component.type === "default");
      return outcome;
    }

    const replacement = this.resolveComponentReplacement(text);
    if (replacement) {
      this.applyComponentReplacement(item, replacement.fromName, replacement.toModifier);
      return outcome;
    }

    const extractedModifiers =
      extractedItem?.additions
        .map((addition) => this.catalogService.findModifierOptionByNameOrAlias(addition))
        .filter((modifier) => modifier !== null) ?? [];
    const modifiers = [...mentionedModifiers, ...extractedModifiers].filter(
      (modifier, index, list) => list.findIndex((entry) => entry.id === modifier.id) === index
    );

    for (const modifier of modifiers) {
      const incrementRequested = this.hasModifierIncrement(text, modifier);
      const alreadyAdded = item.components.some(
        (component) =>
          component.type === "added" &&
          this.normalizeForMatching(component.name) === this.normalizeForMatching(modifier.name)
      );
      const alreadyDefault = item.components.some(
        (component) =>
          component.type === "default" &&
          this.normalizeForMatching(component.name) === this.normalizeForMatching(modifier.name)
      );

      if (incrementRequested || (!alreadyAdded && !alreadyDefault)) {
        item.components.push({
          name: modifier.name,
          type: "added",
          priceDelta: modifier.priceDelta
        });

        if (incrementRequested && (alreadyAdded || alreadyDefault)) {
          outcome.incrementedExistingComponents.push(modifier.name);
        }
      }
    }

    const removals = uniqueCaseInsensitive([
      ...this.extractRemovals(text),
      ...(extractedItem?.removals ?? [])
    ]);

    for (const removal of removals) {
      const matchingAdded = item.components.find(
        (component) =>
          component.type === "added" &&
          this.normalizeForMatching(component.name) === this.normalizeForMatching(removal)
      );
      if (matchingAdded) {
        item.components = item.components.filter((component) => component !== matchingAdded);
        continue;
      }

      const matchingDefault = item.components.some(
        (component) =>
          component.type === "default" &&
          this.normalizeForMatching(component.name) === this.normalizeForMatching(removal)
      );
      if (!matchingDefault) {
        continue;
      }

      const alreadyRemoved = item.components.some(
        (component) =>
          component.type === "removed" &&
          this.normalizeForMatching(component.name) === this.normalizeForMatching(removal)
      );

      if (!alreadyRemoved) {
        item.components.push({
          name: removal,
          type: "removed",
          priceDelta: 0
        });
      }
    }

    return outcome;
  }

  private buildItemAdjustmentAcknowledgement(outcome: ItemAdjustmentOutcome) {
    const incremented = uniqueCaseInsensitive(outcome.incrementedExistingComponents);
    if (incremented.length === 0) {
      return null;
    }

    if (incremented.length === 1) {
      return `Perfecto. Ese producto ya incluye ${incremented[0]}, asi que lo anote como adicional.`;
    }

    return `Perfecto. Ese producto ya incluye ${incremented.join(", ")}, asi que los anote como adicionales.`;
  }

  private resolveComponentReplacement(text: string) {
    if (!this.hasComponentReplacementIntent(text)) {
      return null;
    }

    const normalized = this.normalizeForMatching(text);
    const match = normalized.match(
      /\b(?:cambia|cambiale|cambiar|reemplaza|reemplazale|reemplazar|sustituye|sustituyeme)\b\s+(?:el|la|los|las)?\s*([\p{L}0-9\s]+?)\s+\bpor\b\s+(?:el|la|los|las)?\s*([\p{L}0-9\s]+?)(?=$|\s+(?:a|al|en|para|porfa|por favor|please|pls)\b)/u
    );
    const fromSegment = match?.[1]?.trim();
    const toSegment = match?.[2]?.trim();

    if (!fromSegment || !toSegment) {
      return null;
    }

    const fromModifier = this.findModifierInSegment(fromSegment);
    const toModifier = this.findModifierInSegment(toSegment);
    if (!fromModifier || !toModifier) {
      return null;
    }

    return {
      fromName: fromModifier.name,
      toModifier
    };
  }

  private findModifierInSegment(segment: string): ModifierCandidate | null {
    const normalizedSegment = this.normalizeForMatching(segment);
    return (
      this.catalogService.listModifierOptions().find((modifier) =>
        [modifier.name, ...modifier.aliases].some((candidate) => {
          const normalizedCandidate = this.normalizeForMatching(candidate);
          return (
            normalizedSegment === normalizedCandidate ||
            normalizedSegment.includes(normalizedCandidate) ||
            normalizedCandidate.includes(normalizedSegment)
          );
        })
      ) ?? null
    );
  }

  private applyComponentReplacement(item: OrderItem, fromName: string, toModifier: ModifierCandidate) {
    const normalizedFromName = this.normalizeForMatching(fromName);
    const matchingAdded = item.components.find(
      (component) =>
        component.type === "added" &&
        this.normalizeForMatching(component.name) === normalizedFromName
    );

    if (matchingAdded) {
      item.components = item.components.filter((component) => component !== matchingAdded);
    } else {
      const matchingDefault = item.components.some(
        (component) =>
          component.type === "default" &&
          this.normalizeForMatching(component.name) === normalizedFromName
      );
      const alreadyRemoved = item.components.some(
        (component) =>
          component.type === "removed" &&
          this.normalizeForMatching(component.name) === normalizedFromName
      );

      if (matchingDefault && !alreadyRemoved) {
        item.components.push({
          name: fromName,
          type: "removed",
          priceDelta: 0
        });
      }
    }

    const normalizedToName = this.normalizeForMatching(toModifier.name);
    const alreadyPresent = item.components.some(
      (component) =>
        component.type !== "removed" &&
        this.normalizeForMatching(component.name) === normalizedToName
    );
    if (!alreadyPresent) {
      item.components.push({
        name: toModifier.name,
        type: "added",
        priceDelta: toModifier.priceDelta
      });
    }
  }

  private isResetCustomizationRequest(text: string) {
    const normalized = this.normalizeForMatching(text).trim();
    return /^(?:mejor\s+)?(normal|asi normal|dejalo normal|dejala normal|como viene|como sale|sin cambios)$/.test(
      normalized
    );
  }

  private isOnlyModifierOrderCandidate(
    text: string,
    mentionedModifiers: Array<{ name: string }>
  ) {
    if (mentionedModifiers.length === 0 || this.catalogService.findProductsMentioned(text).length > 0) {
      return false;
    }

    const candidate = this.extractFreeTextProductName(text) ?? text;
    const normalizedCandidate = this.normalizeForMatching(candidate).replace(/\b(con|y|de)\b/g, "").trim();
    return mentionedModifiers.some((modifier) => {
      const normalizedModifier = this.normalizeForMatching(modifier.name);
      return normalizedCandidate === normalizedModifier || normalizedCandidate === `${normalizedModifier}s`;
    });
  }

  private isReplacementRequest(text: string) {
    const normalized = this.normalizeForMatching(text);
    return (
      /\b(mejor|cambia|cambiala|cambialo|cambiar|en vez de|reemplaza|reemplazalo)\b/.test(
        normalized
      ) ||
      /\b(no|mentira|perdon|perdona)\b.*\b(oblea|fresa|fresas|tradicional|malteada|waffle|helado)\b/.test(
        normalized
      )
    );
  }

  private isItemRemovalRequest(
    text: string,
    product: NonNullable<ReturnType<CatalogService["findProductByNameOrAlias"]>>
  ) {
    const normalized = this.normalizeForMatching(text);
    const productNames = [product.name, ...product.aliases].map((candidate) =>
      this.normalizeForMatching(candidate)
    );
    return productNames.some((productName) => {
      const escaped = this.escapeRegex(productName);
      return new RegExp(
        `\\b(?:quita|quitar|saca|sacar|elimina|eliminar|sin)\\b.*\\b${escaped}\\b|\\b${escaped}\\b\\s+(?:no|tampoco)\\b`,
        "i"
      ).test(normalized);
    });
  }

  private isContextualItemRemovalRequest(text: string) {
    const normalized = this.normalizeForMatching(text);
    return /\b(no|quita|quitale|quitar|saca|sacar|elimina|eliminar|tampoco)\b/.test(normalized);
  }

  private findContextualDraftProductReference(draft: OrderDraft, text: string) {
    const normalized = this.normalizeForMatching(text);
    const candidateProducts = draft.items
      .map((item) => this.catalogService.findProductById(item.productId))
      .filter((product) => product !== null)
      .filter((product) => this.matchesContextualProductFamily(product, normalized));

    const uniqueProducts = candidateProducts.filter(
      (product, index, list) => list.findIndex((entry) => entry.id === product.id) === index
    );

    return uniqueProducts.length === 1 ? uniqueProducts[0] : null;
  }

  private matchesContextualProductFamily(
    product: NonNullable<ReturnType<CatalogService["findProductById"]>>,
    normalizedText: string
  ) {
    const normalizedName = this.normalizeForMatching(product.name);
    const startsWithName = (value: string) => normalizedName.startsWith(value);
    const includesName = (value: string) => normalizedName.includes(value);

    return (
      (/\boblea(s)?\b/.test(normalizedText) && product.category === "obleas") ||
      (/\b(malteada|malteadas|batido|batidos)\b/.test(normalizedText) &&
        product.category === "malteadas") ||
      (/\b(waffle|waffles|wafle|wafles)\b/.test(normalizedText) && includesName("waffle")) ||
      (/\bvaso\s+helado\b/.test(normalizedText) && startsWithName("vaso helado")) ||
      (/\bcombinado(s)?\b/.test(normalizedText) && startsWithName("combinado")) ||
      (/\bmix\b/.test(normalizedText) && startsWithName("mix")) ||
      (/\bpavlova\b/.test(normalizedText) && normalizedName === "pavlova") ||
      (/\bmaracutfresa\b|\bmaracufresa\b/.test(normalizedText) && normalizedName === "maracufresa") ||
      (/\blove\s+banana\b|\bbanana\b/.test(normalizedText) && normalizedName === "love banana") ||
      (/\btradicional\b/.test(normalizedText) && normalizedName.includes("tradicional")) ||
      (/\bfresas?\b/.test(normalizedText) && product.category === "fresas-con-crema")
    );
  }

  private hasQuantityAdjustment(text: string) {
    const normalized = this.normalizeForMatching(text);
    return /\b(?:solo|solamente|mejor|dejame|dejeme|dejalo|dejala|que sea)\s+(?:una|un|1|dos|2|tres|3)\b|\b(?:una|un|1|dos|2|tres|3)\s+(?:sola|solo|nomas|nom[aá]s)\b/.test(
      normalized
    );
  }

  private applyQuantityAdjustment(item: OrderItem, text: string) {
    const normalized = this.normalizeForMatching(text);
    const quantity =
      /\b(?:dos|2)\b/.test(normalized) ? 2 :
      /\b(?:tres|3)\b/.test(normalized) ? 3 :
      1;
    item.quantity = quantity;
  }

  private hasCatalogProductSignal(text: string, classification?: MessageClassification) {
    const extractedProduct = classification?.extracted.items.find((item) =>
      this.catalogService.findProductByNameOrAlias(item.productName)
    );

    return this.catalogService.findProductsMentioned(text).length > 0 || Boolean(extractedProduct);
  }

  private hasExplicitFreeTextOrderRequest(
    text: string,
    extractedItem?: MessageClassification["extracted"]["items"][number] | null
  ) {
    if (!this.hasFreeTextOrderCandidate(text, extractedItem)) {
      return false;
    }

    const normalized = this.normalizeForMatching(text);
    return /\b(quiero|quisiera|dame|regalame|regálame|mandame|mándame|pido|pedir|ordenar|agrega|agregame|agrégame|sumale|súmale|otro|otra|tambien|también)\b/.test(
      normalized
    );
  }

  private hasOrderableProductSignal(text: string) {
    return (
      this.catalogService.findProductsMentioned(text).length > 0 ||
      Boolean(this.extractFreeTextProductName(text))
    );
  }

  private isAdditionalProductRequest(text: string) {
    const normalized = this.normalizeForMatching(text);
    return /\b(?:ademas|tambien|agregame|agrega|sumale|anade|otro|otra|adicional)\b\s+(?:unas|unos|una|un|las|los|la|el)?\s*\b(?:mix|fresa|fresas|oblea|waffle|wafle|malteada|vaso|brownie|pavlova|love|maracutfresa|maracufresa|tradicional)\b/.test(
      normalized
    );
  }

  private hasCatalogModifierSignal(text: string) {
    return this.catalogService.findModifierOptionsMentioned(text).length > 0;
  }

  private isGenericOrderPhrase(value: string) {
    const normalized = this.normalizeForMatching(value);
    return /^(hacer pedido|hacer un pedido|un pedido|pedido|orden|ordenar|pedir|quiero pedir|quiero ordenar|algo|algo rico|comida|postre)$/.test(
      normalized
    );
  }

  private containsOrderIntent(text: string) {
    const normalized = this.normalizeForMatching(text);
    return /\b(quiero hacer un pedido|hacer un pedido|voy a pedir|quiero pedir|me gustaria pedir|tomar pedido|pedido|ordenar|ordeno)\b/.test(
      normalized
    );
  }

  private extractRemovals(text: string) {
    const lower = this.normalizeForMatching(text);
    const removals: string[] = [];
    const candidates = ["crema", "helado", "nutella", "oreo", "brownie", "milo"];
    for (const candidate of candidates) {
      const escaped = this.escapeRegex(candidate);
      if (
        new RegExp(`\\b(?:sin|quita|quitale|quitar|saca|sacale|elimina|eliminale)\\s+(?:el|la|los|las)?\\s*${escaped}\\b`).test(lower)
      ) {
        removals.push(candidate);
      }
    }
    return removals;
  }

  private buildWelcomeMessage(business: Business) {
    return [
      "I Love Fresas te da la bienvenida! \u{1F353}",
      "",
      "Para un mejor servicio puedes encontrar la carta en el perfil o pedirme el men\u00fa por aqu\u00ed.",
      "",
      "Si deseas realizar un domicilio, dime qu\u00e9 se te antoja y te ayudo a armarlo."
    ].join("\n");
  }

  private buildGreetingResponse(business: Business, conversation: Conversation) {
    if (conversation.state === "idle") {
      if (this.hasPriorBotMessage(conversation)) {
        return "Hola \u{1F60A} \u00bfQu\u00e9 se te antoja hoy?";
      }

      return this.buildWelcomeMessage(business);
    }

    return this.buildInProgressGreeting(conversation);
  }

  private buildBusinessHoursResponse(business: Business) {
    const days = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
    const hours = this.businessService
      .getBusinessHours(business.id)
      .slice()
      .sort((a, b) => a.dayOfWeek - b.dayOfWeek);

    if (!hours.length) {
      return "Un asesor te confirma el horario de atención.";
    }

    const lines = hours.map((hour) => {
      const day = days[hour.dayOfWeek] ?? `día ${hour.dayOfWeek}`;
      return hour.isOpen === false
        ? `- ${day}: cerrado`
        : `- ${day}: ${this.formatHour(hour.opensAt)} a ${this.formatHour(hour.closesAt)}`;
    });

    return ["Nuestro horario es:", ...lines].join("\n");
  }

  private formatHour(value: string) {
    const [rawHours, rawMinutes] = value.split(":").map(Number);
    const hours = Number.isFinite(rawHours) ? rawHours : 0;
    const minutes = Number.isFinite(rawMinutes) ? rawMinutes : 0;
    const period = hours >= 12 ? "p. m." : "a. m.";
    const displayHour = hours % 12 || 12;
    return `${displayHour}:${String(minutes).padStart(2, "0")} ${period}`;
  }

  private buildBusinessHoursResponseV2(business: Business) {
    const status = this.businessService.getBusinessOpenStatus(business);
    const statusLine = status.isOpen
      ? `Ahora estamos atendiendo pedidos (${status.localTime}, hora Colombia).`
      : `En este momento estamos cerrados. ${status.nextOpen ? `Volvemos ${status.nextOpen.label}.` : "Un asesor confirma el proximo horario."}`;

    return [
      "Horario de atencion 🍓",
      "",
      statusLine,
      "",
      ...status.weeklySummary.map((item) => `- ${item.label}`)
    ].join("\n");
  }

  private buildClosedBusinessMessage(business: Business) {
    const status = this.businessService.getBusinessOpenStatus(business);
    const nextOpenLine = status.nextOpen
      ? `Volvemos ${status.nextOpen.label} para atender tus antojos 🍓`
      : "Muy pronto estaremos listos para atender tus antojos 🍓";

    return [
      "En este momento estamos cerrados para pedidos.",
      nextOpenLine,
      "",
      "Si quieres, puedes dejarme tu mensaje por aqui y se lo paso a un operario para que lo revise apenas estemos disponibles."
    ].join("\n");
  }

  private buildMenuResponse(conversation: Conversation) {
    if (env.MENU_PDF_PATH) {
      return "Ac\u00e1 tienes nuestro men\u00fa.";
    }

    return [
      "Claro, te comparto el men\u00fa actual:",
      "",
      this.catalogService.buildMenuSummary(),
      "",
      "Puedes pedir, por ejemplo: una tradicional con milo y sin crema.",
      this.promptForCurrentGoal(conversation)
    ]
      .filter(Boolean)
      .join("\n");
  }

  private buildUnavailableCatalogResponse(products: Product[], modifiers: ModifierOption[]) {
    const names = [...products.map((product) => product.name), ...modifiers.map((modifier) => modifier.name)];
    const alternatives = products[0]
      ? this.catalogService
        .listActiveProducts()
        .filter((candidate) => candidate.category === products[0]!.category && candidate.id !== products[0]!.id)
        .slice(0, 4)
        .map((candidate) => `${candidate.name} (${formatCurrency(candidate.basePrice)})`)
      : [];

    return [
      names.length === 1
        ? `${names[0]} esta agotado en este momento.`
        : `${names.join(", ")} estan agotados en este momento.`,
      alternatives.length
        ? `Te puedo ofrecer: ${alternatives.join(", ")}.`
        : "Si quieres, te comparto las opciones disponibles del menu."
    ].join(" ");
  }

  private isCatalogOptionQuestion(text: string) {
    if (this.looksLikeAddress(text)) {
      return false;
    }

    const normalized = this.normalizeForMatching(text);
    const hasClearOrderRequest =
      this.containsOrderIntent(text) ||
      (this.catalogService.findProductsMentioned(text).length > 0 && !/[?Â¿]/.test(text));
    if (hasClearOrderRequest) {
      return false;
    }

    const asksAboutOptions = /\b(toppings?|adiciones?|adicionales?|salsas?|sabores?|frutas?|opciones?|helados?)\b/.test(
      normalized
    );
    const isQuestion =
      /[?¿]/.test(text) ||
      /\b(?:que|cual|cuales|tienes|manejan|hay|dime|cuentame|puedo ponerle|se le puede poner)\b/.test(
        normalized
      );
    const isExplicitOrderMutation = /\b(?:ponle|agregale|agregales|agrega|agregame|anade|sumale|con|sin|quita|quitale)\b/.test(
      normalized
    ) && !/\b(?:que|cual|cuales|tienes|manejan|hay|opciones|sabores|puedo|se le puede)\b/.test(normalized);

    return asksAboutOptions && isQuestion && !isExplicitOrderMutation;
  }

  private buildCatalogOptionQuestionResponse(text: string, conversation: Conversation) {
    const normalized = this.normalizeForMatching(text);
    const lines: string[] = [];
    const asksToppings = /\b(toppings?|adiciones?|adicionales?|opciones?)\b/.test(normalized);
    const asksSauces = /\b(salsas?)\b/.test(normalized);
    const asksFruit = /\b(frutas?)\b/.test(normalized);
    const asksIceCream = /\b(helados?|sabores?)\b/.test(normalized);

    if (asksIceCream) {
      const flavors = this.requiredOptionValues("iceCreamFlavor");
      if (flavors.length > 0) {
        lines.push(`Sabores de helado: ${flavors.join(", ")}.`);
      }
    }

    if (asksFruit) {
      const fruits = this.requiredOptionValues("fruit");
      if (fruits.length > 0) {
        lines.push(`Frutas disponibles para productos que las piden: ${fruits.join(", ")}.`);
      }
    }

    if (asksSauces) {
      const sauces = this.requiredOptionValues("sauce");
      if (sauces.length > 0) {
        lines.push(`Salsas disponibles: ${sauces.join(", ")}.`);
      }
    }

    if (asksToppings || (!lines.length && /\b(topping|adicion|adicional|ponerle)\b/.test(normalized))) {
      const target = this.optionQuestionTargetLabel(text, conversation);
      const modifierNames = this.catalogService
        .listModifierOptions()
        .map((modifier) => modifier.name);
      lines.push(
        `${target ? `Para ${target}, p` : "P"}uedes agregar: ${modifierNames.join(", ")}.`
      );
    }

    if (lines.length === 0) {
      lines.push("Claro. Puedo contarte opciones del menu sin cambiar tu pedido.");
    }

    const nextStep = this.nextPromptAfterCatalogInfo(conversation);
    return [lines.join("\n"), nextStep].filter(Boolean).join("\n\n");
  }

  private requiredOptionValues(key: string) {
    return uniqueCaseInsensitive(
      this.catalogService
        .listActiveProducts()
        .flatMap((product) => product.requiredOptions ?? [])
        .filter((option) => option.key === key)
        .flatMap((option) => option.options)
    );
  }

  private optionQuestionTargetLabel(text: string, conversation: Conversation) {
    const normalized = this.normalizeForMatching(text);
    if (/\bobleas?\b/.test(normalized)) {
      return "la oblea";
    }

    if (/\b(?:fresas?|tradicional)\b/.test(normalized)) {
      return "las fresas";
    }

    if (/\b(?:waffle|wafle)s?\b/.test(normalized)) {
      return "el waffle";
    }

    if (/\bmalteadas?\b/.test(normalized)) {
      return "la malteada";
    }

    const latestItem = conversation.draftOrder?.items.at(-1);
    return latestItem ? latestItem.productName : null;
  }

  private nextPromptAfterCatalogInfo(conversation: Conversation) {
    const draft = conversation.draftOrder;
    if (!draft || draft.items.length === 0) {
      return "Si quieres, te ayudo a escoger o puedes decirme que deseas ordenar.";
    }

    return this.syncRequiredOptionsBlockingIssue(draft) ?? this.nextPromptForState(conversation);
  }

  private buildUnknownMessage(business: Business) {
    return [
      `Estoy listo para ayudarte con tu pedido de ${business.name}.`,
      "Dime qué deseas ordenar hoy, o escribe menú si quieres ver opciones."
    ].join("\n");
  }

  private buildSocialCheckInResponse(conversation: Conversation) {
    if (!conversation.draftOrder || conversation.draftOrder.items.length === 0) {
      return "Muy bien, gracias por preguntar. Si quieres, te ayudo a escoger algo del menu.";
    }

    return [
      "Todo bien, gracias.",
      this.nextPromptForState(conversation)
    ].join("\n");
  }

  private buildRecommendationResponse(text: string, conversation: Conversation) {
    const intro = this.isRankingOrSalesQuestion(text)
      ? "No tengo un ranking exacto aqui, pero si quieres algo clasico puedes empezar por unas fresas con crema tradicional."
      : "Si quieres algo clasico, puedes empezar por unas fresas con crema tradicional.";
    const reply = `${intro} Si te provoca mas dulce, le puedes agregar Milo, Oreo o brownie.`;

    if (!conversation.draftOrder || conversation.draftOrder.items.length === 0) {
      return `${reply} Si te gusta esa opcion, me dices y la vamos armando.`;
    }

    return [reply, this.nextPromptForState(conversation)].join("\n");
  }

  private buildBusinessQuestionResponse(text: string, conversation: Conversation) {
    if (this.isCatalogOptionQuestion(text)) {
      return this.buildCatalogOptionQuestionResponse(text, conversation);
    }

    if (!conversation.draftOrder || conversation.draftOrder.items.length === 0) {
      if (this.isUnsupportedBusinessClaimQuestion(text)) {
        return this.buildUnsupportedBusinessClaimResponse(text);
      }

      if (this.isSoftObjection(text)) {
        return this.buildSoftObjectionResponse(text);
      }

      return this.buildConversationalResponse(text, conversation);
    }

    return [
      "Si, antoja bastante. Hay opciones mas cremosas, mas chocolatosas y mas frutales.",
      this.nextPromptForState(conversation)
    ].join("\n");
  }

  private buildConversationalResponse(text: string, conversation: Conversation) {
    const prompt = conversation.draftOrder?.items.length
      ? this.nextPromptForState(conversation)
      : null;
    const cue = this.getConversationalCue(text);
    let reply: string;

    switch (cue) {
      case "first_purchase":
        reply = "Bienvenido. Si quieres algo clasico para empezar, puedes probar unas fresas con crema tradicional.";
        break;
      case "positive_reaction":
        reply = "Gracias, nos alegra que te guste. Que fue lo que mas te llamo la atencion?";
        break;
      case "taste_interest":
        reply = "Jajaja, si. Hay varias opciones que antojan bastante. Que te llamo la atencion?";
        break;
      case "social_checkin":
        reply = "Muy bien, gracias por preguntar. Si quieres, te ayudo a escoger algo del menu.";
        break;
      default:
        reply = "Claro. Si quieres, te puedo orientar con el menu o recomendarte algo segun lo que se te antoje.";
        break;
    }

    return prompt ? [reply, prompt].join("\n") : reply;
  }

  private buildUnsupportedBusinessClaimResponse(text: string) {
    const normalized = this.normalizeForMatching(text);

    if (/\b(promo|promocion|2x1|descuento)\b/.test(normalized)) {
      return "No tengo una promocion 2x1 registrada en este momento. Si quieres, te comparto el menu o te ayudo a escoger algo.";
    }

    if (/\b(premio|premios|ganaron|ganado)\b/.test(normalized)) {
      return "No tengo informacion de premios para prometerte eso. Lo que si puedo hacer es ayudarte a escoger algo que se te antoje.";
    }

    if (/\b(clientes|cuantos|cuantas|famosos|famosas|mejores de|mejor de)\b/.test(normalized)) {
      return "No quiero inventarte cifras ni rankings. Si quieres, te ayudo a elegir segun si prefieres algo clasico, chocolatoso o frutal.";
    }

    return "No quiero inventarte informacion que no tengo confirmada. Si quieres, te ayudo a escoger algo del menu.";
  }

  private buildSoftObjectionResponse(text: string) {
    const normalized = this.normalizeForMatching(text);

    if (/\b(caro|costoso|costosa)\b/.test(normalized)) {
      return "Te entiendo, a veces el antojo pega duro. Lo dejamos con el valor del menu y del domicilio confirmado; si quieres bajar un poco el total, te ayudo a ajustar productos o adiciones.";
    }

    return "Tranquilo, te ayudo a escoger. Si quieres algo clasico, puedes empezar por unas fresas con crema tradicional.";
  }

  private buildInProgressGreeting(conversation: Conversation) {
    if (!conversation.draftOrder || conversation.draftOrder.items.length === 0) {
      conversation.state = "collecting_items";
      conversation.updatedAt = nowIso();
      return this.buildWelcomeMessage(this.businessService.getDefaultBusiness());
    }

    const itemSummary = conversation.draftOrder.items
      .map((item) => `${item.quantity} x ${item.productName}`)
      .join(", ");

    return [
      "Hola, seguimos con tu pedido en borrador.",
      `Tengo anotado: ${itemSummary}.`,
      "",
      this.nextPromptForState(conversation)
    ].join("\n");
  }

  private nextPromptForState(conversation: Conversation) {
    switch (conversation.state) {
      case "collecting_delivery_details":
        return conversation.draftOrder
          ? this.buildDeliveryDetailsRequest(conversation.draftOrder)
          : "Para continuar, mándame nombre, dirección completa y método de pago.";
      case "collecting_name":
        return "Para continuar, dime a nombre de quien va el pedido.";
      case "collecting_address":
        return "Para continuar, envíame la dirección completa de entrega.";
      case "collecting_payment":
        return `Para continuar, dime el metodo de pago: ${this.businessService
          .getDefaultBusiness()
          .paymentMethods.join(", ")}.`;
      case "collecting_notes":
        return "Quieres agregar alguna observacion? Si no, responde 'no'.";
      case "confirming_order":
        return "Responde 'si' para confirmar o dime que quieres cambiar.";
      default:
        return "Dime que quieres agregar o cambiar.";
    }
  }

  private promptForCurrentGoal(conversation: Conversation) {
    if (!conversation.draftOrder || conversation.draftOrder.items.length === 0) {
      return "¿Qué deseas ordenar?";
    }

    return this.nextPromptForState(conversation);
  }

  private isGreeting(text: string) {
    const normalized = text
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");

    return /^(hola+|buenas|buenos dias|buenas tardes|buenas noches|hey|holi|hello|hi)[!. ]*$/.test(
      normalized
    );
  }

  private isSocialCheckIn(text: string) {
    const normalized = text
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");

    return /\b(como estas|como esta|que tal|como va|todo bien|como te va)\b/.test(normalized);
  }

  private isRankingOrSalesQuestion(text: string) {
    const normalized = this.normalizeForMatching(text);
    return /\b(mas vendido|mas venden|mas piden|favorito|favorita|ranking|popular)\b/.test(normalized);
  }

  private isUnsupportedBusinessClaimQuestion(text: string) {
    const normalized = this.normalizeForMatching(text);
    return /\b(promo|promocion|2x1|descuento|premio|premios|ganaron|ganado|famosos|famosas|mejores de|mejor de|clientes tienen|cuantos clientes|cuantas personas)\b/.test(
      normalized
    );
  }

  private isSoftObjection(text: string) {
    const normalized = this.normalizeForMatching(text);
    return /\b(caro|costoso|costosa|no se que pedir|no se que ordenar|que pedir|que me recomiendas|cual recomiendas)\b/.test(
      normalized
    );
  }

  private isAcceptingPriorRecommendation(text: string) {
    const normalized = this.normalizeForMatching(text);
    return /^(?:bueno\s+)?(?:quiero esa|dame esa|me convenciste|listo\s*,?\s*pido una|pido una|esa)$/.test(
      normalized
    );
  }

  private resolvePriorRecommendedProduct(conversation: Conversation) {
    const botMessages = conversation.memory.recentMessages
      .filter((message) => message.role === "bot")
      .map((message) => this.normalizeForMatching(message.text))
      .reverse();

    const priorRecommendation = botMessages.find((message) =>
      message.includes("fresas con crema tradicional")
    );

    return priorRecommendation ? "fresas con crema tradicional" : null;
  }

  private isConversationalMessage(text: string) {
    return this.getConversationalCue(text) !== null;
  }

  private getConversationalCue(text: string):
    | "first_purchase"
    | "positive_reaction"
    | "taste_interest"
    | "social_checkin"
    | null {
    const normalized = this.normalizeForMatching(text);

    if (this.isSocialCheckIn(text)) {
      return "social_checkin";
    }

    if (
      /\b(primera vez|nuevo comprando|nueva comprando|nunca he pedido|nunca he comprado|nunca les he pedido|nunca les he comprado|no he comprado|soy nuevo|soy nueva)\b/.test(
        normalized
      )
    ) {
      return "first_purchase";
    }

    if (/\b(rico|rica|ricos|ricas|delicioso|deliciosa|deliciosos|antoja|antojo|antojable|hambre)\b/.test(normalized)) {
      return "taste_interest";
    }

    if (/\b(wow|cool|brutal|bacano|bacana|lindo|linda|bonito|bonita|se ve|se ven|me gusta|esta bueno|esta buena|amo las fresas)\b/.test(normalized)) {
      return "positive_reaction";
    }

    return null;
  }

  private buildTurnResult(
    conversation: Conversation,
    reply: string,
    classificationSource: ConversationTurnResult["classificationSource"],
    attachments: OutgoingAttachment[] = []
  ): ConversationTurnResult {
    return {
      reply,
      conversationId: conversation.id,
      state: conversation.state,
      classificationSource,
      classification: null,
      replySource: "template",
      aiUsageCount: conversation.aiUsageCount,
      attachments
    };
  }

  private buildSilentTurnResult(
    conversation: Conversation,
    classificationSource: ConversationTurnResult["classificationSource"]
  ): ConversationTurnResult {
    return this.buildTurnResult(conversation, "", classificationSource);
  }

  private buildAttachmentsForClassification(classification: MessageClassification) {
    if (classification.intent !== "ask_menu") {
      return [];
    }

    return this.buildMenuAttachments();
  }

  private buildAttachmentsForEngineResult(
    conversation: Conversation,
    result: OpenAIOrderEngineOutput
  ) {
    const topic = result.catalogAnswer.topic;
    if (topic === "menu") {
      return this.buildMenuAttachments();
    }

    const hasProductClarification = [
      ...result.draftPatch.createPendingSelections,
      ...result.pendingSelections
    ].some((selection) => selection.type === "product_clarification" && selection.blocking);

    if (hasProductClarification && !this.hasSharedMenuInConversation(conversation)) {
      return this.buildMenuAttachments();
    }

    if (["modifiers", "flavors", "products", "price"].includes(topic)) {
      if (!this.hasSharedMenuInConversation(conversation)) {
        return this.buildMenuAttachments();
      }

      return this.buildSpecificationAttachments(topic);
    }

    return [];
  }

  private buildMenuAttachments() {
    if (!env.MENU_PDF_PATH) {
      return [];
    }

    return [
      {
        type: "document" as const,
        pathOrUrl: env.MENU_PDF_PATH,
        filename: "Menu I Love Fresas.pdf",
        caption: "Menu actual de I Love Fresas"
      }
    ];
  }

  private buildSpecificationAttachments(topic: OpenAIOrderEngineOutput["catalogAnswer"]["topic"]) {
    const candidates = this.specificationAssetCandidates(topic);
    const assetPath = candidates.find((candidate) => existsSync(candidate));
    if (!assetPath) {
      return [];
    }

    return [
      {
        type: "photo" as const,
        pathOrUrl: assetPath,
        filename: assetPath.split(/[\\/]/).at(-1) ?? "especificacion.png",
        caption: this.specificationCaption(topic)
      }
    ];
  }

  private specificationAssetCandidates(topic: OpenAIOrderEngineOutput["catalogAnswer"]["topic"]) {
    const baseNames: Record<string, string[]> = {
      modifiers: ["toppings", "adiciones"],
      flavors: ["sabores", "salsas", "frutas"],
      products: ["productos"],
      price: ["precios"]
    };
    const extensions = ["png", "jpg", "jpeg", "webp"];

    return (baseNames[topic] ?? []).flatMap((baseName) =>
      extensions.map((extension) => join(env.SPEC_ASSETS_DIR, `${baseName}.${extension}`))
    );
  }

  private specificationCaption(topic: OpenAIOrderEngineOutput["catalogAnswer"]["topic"]) {
    switch (topic) {
      case "modifiers":
        return "Opciones de toppings y adiciones";
      case "flavors":
        return "Opciones del menu";
      case "products":
        return "Productos del menu";
      case "price":
        return "Precios del menu";
      default:
        return "Especificaciones del menu";
    }
  }

  private hasSharedMenuInConversation(conversation: Conversation) {
    this.ensureConversationMemory(conversation);
    return conversation.memory.recentMessages.some(
      (message) =>
        message.role === "bot" &&
        /\b(?:menu|men[uú]|carta|opciones)\b/i.test(message.text)
    );
  }

  private mergeAttachments(
    first: ConversationTurnResult["attachments"],
    second: ConversationTurnResult["attachments"]
  ) {
    const seen = new Set<string>();
    return [...first, ...second].filter((attachment) => {
      const key = `${attachment.type}:${attachment.pathOrUrl}`;
      if (seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    });
  }

  private hasPriorBotMessage(conversation: Conversation) {
    this.ensureConversationMemory(conversation);
    return conversation.memory.recentMessages.some((message) => message.role === "bot");
  }

  private rememberTurn(
    conversation: Conversation,
    role: Message["role"],
    text: string,
    createdAt: string
  ) {
    this.ensureConversationMemory(conversation);

    conversation.memory.recentMessages.push({ role, text, createdAt });
    conversation.memory.recentMessages = conversation.memory.recentMessages.slice(
      -env.CONVERSATION_MEMORY_MESSAGE_LIMIT
    );

    if (role === "bot") {
      conversation.memory.lastBotOffer = this.detectBotOffer(text);
    }

    conversation.memory.summary = this.buildSessionSummary(conversation);
  }

  private buildMemoryContext(conversation: Conversation) {
    this.ensureConversationMemory(conversation);
    const memory = conversation.memory;

    return JSON.stringify({
      activeOrderId: conversation.activeOrderId,
      state: conversation.state,
      summary: memory.summary,
      lastBotOffer: memory.lastBotOffer,
      recentMessages: memory.recentMessages.map((message) => ({
        role: message.role,
        text: message.text
      }))
    });
  }

  private buildDraftInterpreterContext(draft: OrderDraft | null) {
    if (!draft) {
      return JSON.stringify({
        hasActiveDraft: false,
        items: [],
        missingFields: []
      });
    }

    const zone = draft.inferredZoneId
      ? this.catalogService.listDeliveryZones().find((entry) => entry.id === draft.inferredZoneId)
      : null;

    return JSON.stringify({
      hasActiveDraft: true,
      fulfillmentType: draft.fulfillmentType,
      items: draft.items.map((item, index) => ({
        index: index + 1,
        productName: item.productName,
        quantity: item.quantity,
        selectedOptions: item.selectedOptions ?? {},
        selectedOptionQuantities: item.selectedOptionQuantities ?? {},
        additions: item.components
          .filter((component) => component.type === "added")
          .map((component) => component.name),
        removals: item.components
          .filter((component) => component.type === "removed")
          .map((component) => component.name),
        defaultComponents: item.components
          .filter((component) => component.type === "default")
          .map((component) => component.name),
        notes: item.notes
      })),
      customerName: draft.customerName,
      address: draft.address,
      neighborhood: draft.neighborhood ?? null,
      addressReference: draft.addressReference ?? null,
      zoneName: zone?.name ?? null,
      paymentMethod: draft.paymentMethod,
      cashAmount: draft.cashAmount,
      notes: draft.notes,
      blockingIssue: draft.blockingIssue,
      pricing: draft.pricing,
      missingFields: this.getMissingDeliveryFields(draft)
    });
  }

  private buildSessionSummary(conversation: Conversation) {
    const draft = conversation.draftOrder;
    const items =
      draft?.items.map((item) => `${item.quantity} x ${item.productName}`).join(", ") ??
      "sin productos";
    const missing = draft ? this.getMissingDeliveryFields(draft) : [];

    return [
      `Estado: ${conversation.state}`,
      `Items: ${items}`,
      draft?.customerName ? `Cliente: ${draft.customerName}` : null,
      draft?.address ? `Direccion: ${draft.address}` : null,
      draft?.neighborhood ? `Barrio: ${draft.neighborhood}` : null,
      draft?.addressReference ? `Referencia: ${draft.addressReference}` : null,
      draft?.paymentMethod ? `Pago: ${draft.paymentMethod}` : null,
      missing.length ? `Faltan: ${missing.join(", ")}` : null
    ]
      .filter(Boolean)
      .join(" | ");
  }

  private ensureConversationMemory(conversation: Conversation) {
    conversation.activeOrderId ??= null;
    conversation.memory ??= {
      recentMessages: [],
      summary: null,
      lastBotOffer: null
    };
  }

  private detectBotOffer(text: string): Conversation["memory"]["lastBotOffer"] {
    const normalized = this.normalizeForMatching(text);

    if (/\b(menu|carta|opciones)\b/.test(normalized)) {
      return "menu";
    }

    if (/\b(que deseas ordenar|que quieres pedir|se te antoja|escribirmelo|producto)\b/.test(normalized)) {
      return "order";
    }

    if (/\b(nombre|direccion|barrio|referencia|datos)\b/.test(normalized)) {
      return "delivery_details";
    }

    if (/\b(metodo de pago|pago|nequi|daviplata|efectivo)\b/.test(normalized)) {
      return "payment_methods";
    }

    if (/\b(operario|humano|asesor)\b/.test(normalized)) {
      return "human_help";
    }

    return null;
  }

  private shouldStartFreshOrderSession(conversation: Conversation, text: string) {
    if (conversation.state !== "pending_human" && conversation.state !== "completed") {
      return false;
    }

    const normalized = this.normalizeForMatching(text);
    if (/\bnewchat\b/.test(normalized)) {
      return true;
    }

    const activeOrder = this.findActiveOrderForConversation(conversation);
    if (activeOrder && this.isPostDispatchOrderStatus(activeOrder.status)) {
      return false;
    }

    return /\b(nuevo pedido|otro pedido|hacer otro|quiero pedir otra vez|quiero hacer otro pedido|newchat)\b/.test(
      normalized
    );
  }

  private isExplicitFreshOrderRequest(text: string) {
    const normalized = this.normalizeForMatching(text);
    return /\b(nuevo pedido|otro pedido|hacer otro|quiero pedir otra vez|quiero hacer otro pedido|newchat)\b/.test(
      normalized
    );
  }

  private isNewChatCommand(text: string) {
    return /^\/(?:newchat|newbot)\b/i.test(text.trim());
  }
}
