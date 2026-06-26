import { demoStore } from "../data/demoStore.js";
import { persistRuntimeStore } from "../data/runtime-store.js";
import type { Conversation, Message, ModifierOption, OrderDraft, OrderItem, Product } from "../types/index.js";
import { formatCurrency } from "../utils/http.js";
import { createId, nowIso } from "../utils/id.js";
import { CatalogService } from "./catalog.service.js";
import { OrderService } from "./order.service.js";
import { normalizePaymentMethodSetting, paymentMethodMatches } from "./payment-method-settings.js";

type BotChannel = "telegram" | "whatsapp";

interface FlowisePedidoItem {
  producto?: string;
  cantidad?: number;
  variante?: string;
  sabor?: string;
  selectedOptions?: Record<string, string[]>;
  toppings?: string[];
  adiciones?: string[];
  observaciones?: string;
  precio_unitario?: number;
}

interface BotConversationStatePatch {
  items?: FlowisePedidoItem[] | string;
  nombre?: string;
  telefono?: string;
  direccion?: string;
  barrio?: string;
  referencia?: string;
  metodo_pago?: string;
  modalidad_entrega?: string;
  pedido_confirmado?: boolean | string;
  pedido_confirmado_por_cliente?: boolean | string;
  comprobante_pago_pendiente?: boolean | string;
  comprobante_pago_recibido?: boolean | string;
  payment_proof_note?: string;
  needs_human?: boolean | string;
  ultimo_agente?: string;
  ultima_pregunta_bot?: string;
  next_expected?: string;
  mensaje_cliente?: string;
  customerMessage?: string;
  botMessage?: string;
}

const CLOSED_STATES = new Set(["post_order_closed", "completed", "cancelled"]);
type MissingRequiredOption = {
  item: OrderItem;
  product: Product;
  option: NonNullable<Product["requiredOptions"]>[number];
};

export class BotIntegrationService {
  constructor(
    private readonly catalogService = new CatalogService(),
    private readonly orderService = new OrderService()
  ) {}

  getAvailableCatalog() {
    return this.catalogService.getBotAvailableCatalog();
  }

  findUnavailableCatalogMatches(text: string) {
    return {
      products: this.catalogService.findUnavailableProductsMentioned(text),
      modifiers: this.catalogService.findUnavailableModifierOptionsMentioned(text)
    };
  }

  buildUnavailableCatalogReply(matches: {
    products: Product[];
    modifiers: ModifierOption[];
  }) {
    const productNames = matches.products.map((product) => product.name);
    const modifierNames = matches.modifiers.map((modifier) => modifier.name);
    const unavailableNames = [...productNames, ...modifierNames];
    const alternatives = this.availableAlternativesFor(matches.products[0] ?? null);

    return [
      unavailableNames.length === 1
        ? `${unavailableNames[0]} esta agotado en este momento.`
        : `${unavailableNames.join(", ")} estan agotados en este momento.`,
      alternatives.length
        ? `Te puedo ofrecer: ${alternatives.join(", ")} 🍓`
        : "Si quieres, te comparto las opciones disponibles del menu 🍓"
    ].join(" ");
  }

  getOrCreateActiveConversation(channel: BotChannel, chatId: string) {
    return this.toBotConversation(
      this.findActiveConversation(channel, chatId) ?? this.createConversation(channel, chatId)
    );
  }

  startNewConversation(channel: BotChannel, chatId: string) {
    for (const active of this.findActiveConversations(channel, chatId)) {
      this.closeConversation(active);
    }

    return this.toBotConversation(this.createConversation(channel, chatId));
  }

  buildOneLineOrderPatch(text: string): BotConversationStatePatch | null {
    const products = this.catalogService.findProductsMentioned(text);
    const address = this.extractAddress(text);
    const neighborhood = this.extractNeighborhood(text);
    const customerName = this.extractCustomerName(text);
    const addressReference = this.extractReference(text);
    const paymentMethod = this.extractPaymentMethod(text);

    if (!products.length || !address || !neighborhood || !customerName || !paymentMethod) {
      return null;
    }

    return {
      items: products.map((product) => ({
        producto: product.name,
        cantidad: 1,
        precio_unitario: product.basePrice
      })),
      nombre: customerName,
      direccion: address,
      barrio: neighborhood,
      referencia: addressReference ?? "Sin referencia",
      metodo_pago: paymentMethod,
      modalidad_entrega: "domicilio",
      next_expected: "confirmacion"
    };
  }

  buildConfirmationSummary(conversationId: string) {
    const conversation = this.findConversation(conversationId);
    const draft = conversation?.draftOrder;
    if (!draft) {
      return null;
    }

    const itemLines = draft.items.map((item) => this.formatSummaryItemLine(item));

    return [
      "Resumen de tu pedido:",
      "",
      "Producto:",
      ...itemLines,
      "",
      "Tus datos:",
      `- Nombre: ${draft.customerName ?? "Por confirmar"}`,
      `- Direccion: ${draft.address ?? "Por confirmar"}`,
      `- Barrio: ${draft.neighborhood ?? "Por confirmar"}`,
      `- Referencia: ${draft.addressReference ?? "Por confirmar"}`,
      `- Metodo de pago: ${draft.paymentMethod ?? "Por confirmar"}`,
      "",
      `Subtotal productos: ${this.money(draft.pricing.subtotal)}`,
      `Domicilio: ${this.money(draft.pricing.deliveryFee)}`,
      `Total: ${this.money(draft.pricing.total)}`,
      "",
      "Esta correcto para dejarlo en revision con el equipo?"
    ].join("\n");
  }

  buildNextOrderStepReply(conversationId: string) {
    const conversation = this.findConversation(conversationId);
    const draft = conversation?.draftOrder;
    if (!draft) {
      return null;
    }

    if (draft.items.length === 0) {
      return {
        responseText: "Perfecto. Que producto quieres pedir? ðŸ“",
        nextExpected: "pedido",
        source: "backend_next_action_guardrail"
      };
    }

    if (draft.items.some((item) => item.unitBasePrice <= 0)) {
      return {
        responseText:
          "Tengo el pedido, pero necesito que el equipo revise un precio antes de darte el total.",
        nextExpected: "humano",
        source: "backend_next_action_guardrail"
      };
    }

    const waffleVariantQuestion = this.buildWaffleVariantQuestionIfNeeded(conversation, draft);
    if (waffleVariantQuestion) {
      return {
        responseText: waffleVariantQuestion,
        nextExpected: "pedido",
        source: "backend_waffle_variant_guardrail"
      };
    }

    const requiredOptionsQuestion = this.buildRequiredOptionsQuestion(draft);
    if (requiredOptionsQuestion) {
      return {
        responseText: requiredOptionsQuestion,
        nextExpected: "pedido",
        source: "backend_required_options_guardrail"
      };
    }

    const missingFields = this.buildReviewReadiness(draft).missingFields.filter(
      (field) =>
        field !== "comprobante_pago" &&
        field !== "precios" &&
        field !== "productos" &&
        field !== "opciones_obligatorias"
    );

    if (missingFields.length === 0) {
      const summary = this.buildConfirmationSummary(conversationId);
      return summary
        ? {
            responseText: summary,
            nextExpected: "confirmacion",
            source: "backend_next_action_guardrail"
          }
        : null;
    }

    return {
      responseText: this.buildMissingDataTemplate(missingFields),
      nextExpected: "datos",
      source: "backend_next_action_guardrail"
    };
  }

  handleRequiredOptionsTurn(conversationId: string, customerText: string) {
    const conversation = this.findConversation(conversationId);
    const draft = conversation?.draftOrder;
    if (!conversation || !draft || this.getMissingRequiredOptions(draft).length === 0) {
      return null;
    }

    const appliedWaffleVariantCounts = this.applyWaffleVariantCounts(draft, customerText);
    if (!appliedWaffleVariantCounts) {
      this.applyRequiredOptionAnswers(draft, customerText);
    }
    conversation.draftOrder = this.orderService.refreshDraft(draft);

    const nextStep = this.buildNextOrderStepReply(conversationId) ?? {
      responseText: "Perfecto. Sigamos con tu pedido.",
      nextExpected: "pedido",
      source: "backend_required_options_guardrail"
    };

    this.saveMessage(conversation, "customer", customerText);
    this.saveMessage(conversation, "bot", nextStep.responseText);
    conversation.state = this.nextConversationState(conversation, {
      next_expected: nextStep.nextExpected
    });
    conversation.updatedAt = nowIso();

    persistRuntimeStore();
    return nextStep;
  }

  updateConversationState(conversationId: string, patch: BotConversationStatePatch) {
    const conversation = this.findConversation(conversationId);
    if (!conversation) {
      return null;
    }

    conversation.draftOrder ??= this.orderService.createEmptyDraft(
      conversation.businessId,
      conversation.customerPhone
    );

    const safePatch = this.sanitizePrematurePaymentProofPatch(conversation, patch);
    this.applyDraftPatch(conversation.draftOrder, safePatch);
    this.captureMessages(conversation, safePatch);
    this.captureMemory(conversation, safePatch);

    conversation.draftOrder = this.orderService.refreshDraft(conversation.draftOrder);
    conversation.state = this.nextConversationState(conversation, safePatch);
    conversation.updatedAt = nowIso();

    persistRuntimeStore();
    return this.toBotConversation(conversation);
  }

  getOrderReviewReadiness(conversationId: string) {
    const conversation = this.findConversation(conversationId);
    if (!conversation?.draftOrder) {
      return {
        ready: false,
        missingFields: ["pedido"]
      };
    }

    return this.buildReviewReadiness(conversation.draftOrder);
  }

  createOrderForReview(conversationId: string) {
    const conversation = this.findConversation(conversationId);
    if (!conversation?.draftOrder) {
      return null;
    }

    const readiness = this.buildReviewReadiness(conversation.draftOrder);
    if (!readiness.ready) {
      conversation.draftOrder.blockingIssue = `Faltan datos para revision: ${readiness.missingFields.join(", ")}`;
      conversation.updatedAt = nowIso();
      return null;
    }

    const order = conversation.activeOrderId
      ? this.orderService.syncOrderFromDraft(
          conversation.activeOrderId,
          conversation.draftOrder,
          "Actualizado desde integracion bot/Flowise."
        )
      : this.orderService.createOrderFromConversation(conversation);

    if (!order) {
      return null;
    }

    conversation.activeOrderId = order.id;
    conversation.state = "completed";
    conversation.updatedAt = nowIso();

    persistRuntimeStore();
    return order;
  }

  requiresPaymentProofForConversation(conversationId: string) {
    const conversation = this.findConversation(conversationId);
    return this.requiresPaymentProof(conversation?.draftOrder?.paymentMethod);
  }

  buildPaymentInstructionsForConversation(conversationId: string) {
    const conversation = this.findConversation(conversationId);
    const draft = conversation?.draftOrder;
    if (!draft?.paymentMethod) {
      return null;
    }

    const method = this.findPaymentMethodSetting(draft.paymentMethod);
    if (!method?.requiresProof || !method.accountLabel || !method.accountValue) {
      return null;
    }

    return [
      `Perfecto 😊 Para continuar con la revision del pedido, puedes hacer la transferencia por ${method.name}:`,
      "",
      `${method.accountLabel}: ${method.accountValue}`,
      `Total: ${this.money(draft.pricing.total)}`,
      "",
      "Cuando la hagas, enviame el comprobante por aqui 🍓"
    ].join("\n");
  }

  getPaymentProofContext(conversationId: string) {
    const conversation = this.findConversation(conversationId);
    const draft = conversation?.draftOrder;
    const method = draft?.paymentMethod
      ? this.findPaymentMethodSetting(draft.paymentMethod)
      : null;

    return {
      expectedPaymentMethod: draft?.paymentMethod ?? null,
      expectedTotal: draft?.pricing.total ?? null,
      accountLabel: method?.accountLabel ?? null,
      accountValue: method?.accountValue ?? null
    };
  }

  private findActiveConversation(channel: BotChannel, chatId: string) {
    const active = this.findActiveConversations(channel, chatId);
    const [latest, ...duplicates] = active;
    for (const duplicate of duplicates) {
      this.closeConversation(duplicate);
    }
    if (duplicates.length > 0) {
      persistRuntimeStore();
    }

    return latest ?? null;
  }

  private findActiveConversations(channel: BotChannel, chatId: string) {
    const customerPhone = this.customerPhone(channel, chatId);
    return demoStore.conversations
      .filter((conversation) => conversation.customerPhone === customerPhone)
      .filter((conversation) => !CLOSED_STATES.has(conversation.state))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  private closeConversation(conversation: Conversation) {
    conversation.state = "post_order_closed";
    conversation.activeOrderId = null;
    conversation.draftOrder = null;
    conversation.updatedAt = nowIso();
  }

  private findConversation(conversationId: string) {
    return demoStore.conversations.find((conversation) => conversation.id === conversationId) ?? null;
  }

  private createConversation(channel: BotChannel, chatId: string): Conversation {
    const timestamp = nowIso();
    const business = demoStore.businesses[0];
    const conversation: Conversation = {
      id: createId("conv"),
      createdAt: timestamp,
      updatedAt: timestamp,
      businessId: business.id,
      customerPhone: this.customerPhone(channel, chatId),
      state: "idle",
      aiUsageCount: 0,
      draftOrder: this.orderService.createEmptyDraft(business.id, this.customerPhone(channel, chatId)),
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
    persistRuntimeStore();
    return conversation;
  }

  private applyDraftPatch(draft: OrderDraft, patch: BotConversationStatePatch) {
    const items = this.parseItems(patch.items);
    if (items.length > 0) {
      draft.items = items
        .map((item) => this.toOrderItem(item))
        .filter((item): item is OrderItem => Boolean(item));
    }

    if (patch.nombre) draft.customerName = patch.nombre.trim();
    if (patch.direccion) draft.address = patch.direccion.trim();
    if (patch.barrio) draft.neighborhood = patch.barrio.trim();
    if (patch.referencia) draft.addressReference = patch.referencia.trim();
    if (patch.metodo_pago) draft.paymentMethod = this.normalizePaymentMethod(patch.metodo_pago);
    if (patch.modalidad_entrega) draft.fulfillmentType = this.normalizeFulfillment(patch.modalidad_entrega);
    if (patch.comprobante_pago_recibido === true || patch.comprobante_pago_recibido === "true") {
      draft.paymentProofReceived = true;
      draft.paymentProofNote = patch.payment_proof_note?.trim() || "Comprobante reportado por el cliente.";
    }
    if (patch.comprobante_pago_pendiente === true || patch.comprobante_pago_pendiente === "true") {
      draft.paymentProofReceived = false;
      draft.paymentProofNote = null;
    }
    this.refreshInferredZone(draft);
    if (patch.needs_human === true || patch.needs_human === "true") {
      draft.blockingIssue = "Requiere revision humana segun Flowise.";
    }
  }

  private sanitizePrematurePaymentProofPatch(
    conversation: Conversation,
    patch: BotConversationStatePatch
  ): BotConversationStatePatch {
    const wantsToMarkProof =
      patch.comprobante_pago_recibido === true || patch.comprobante_pago_recibido === "true";
    if (!wantsToMarkProof) {
      return patch;
    }

    if (this.canAcceptPaymentProof(conversation)) {
      return patch;
    }

    return {
      ...patch,
      comprobante_pago_recibido: false,
      payment_proof_note: undefined,
      needs_human: patch.needs_human,
      next_expected:
        patch.next_expected === "humano"
          ? this.toNextExpected(conversation)
          : patch.next_expected
    };
  }

  private canAcceptPaymentProof(conversation: Conversation) {
    const draft = conversation.draftOrder;
    return Boolean(
      conversation.state === "awaiting_payment_proof" &&
        draft?.items.length &&
        draft.paymentMethod &&
        this.requiresPaymentProof(draft.paymentMethod) &&
        draft.pricing.total > 0
    );
  }

  private parseItems(value: BotConversationStatePatch["items"]): FlowisePedidoItem[] {
    if (!value) {
      return [];
    }

    if (Array.isArray(value)) {
      return value;
    }

    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  private toOrderItem(item: FlowisePedidoItem): OrderItem | null {
    const product = this.catalogService.findProductByNameOrAlias(item.producto ?? "");
    if (!product) {
      return null;
    }

    const modifiers = [...(item.toppings ?? []), ...(item.adiciones ?? [])]
      .map((modifierName) => this.catalogService.findModifierOptionByNameOrAlias(modifierName))
      .filter((modifier): modifier is ModifierOption => Boolean(modifier));

    return {
      id: createId("item"),
      productId: product.id,
      productName: product.name,
      quantity: Math.max(1, Number(item.cantidad ?? 1)),
      unitBasePrice: Number(item.precio_unitario ?? product.basePrice),
      components: [
        ...product.defaultComponents.map((name) => ({ name, type: "default" as const, priceDelta: 0 })),
        ...modifiers.map((modifier) => ({
          name: modifier.name,
          type: "added" as const,
          priceDelta: modifier.priceDelta
        }))
      ],
      selectedOptions: this.normalizeSelectedOptions(product, item),
      notes: [item.variante, item.observaciones].filter(Boolean).join(" ") || null
    };
  }

  private captureMessages(conversation: Conversation, patch: BotConversationStatePatch) {
    if (patch.customerMessage) {
      this.saveMessage(conversation, "customer", patch.customerMessage);
    }

    if (patch.botMessage ?? patch.mensaje_cliente) {
      this.saveMessage(conversation, "bot", patch.botMessage ?? patch.mensaje_cliente ?? "");
    }
  }

  private captureMemory(conversation: Conversation, patch: BotConversationStatePatch) {
    if (patch.ultima_pregunta_bot) {
      conversation.memory.summary = [
        conversation.memory.summary,
        `Ultima pregunta bot: ${patch.ultima_pregunta_bot}`
      ].filter(Boolean).join("\n");
    }

    if (patch.next_expected === "datos") {
      conversation.memory.lastBotOffer = "delivery_details";
    }

    if (patch.next_expected === "comprobante_pago") {
      conversation.memory.lastBotOffer = "payment_methods";
    }
  }

  private saveMessage(conversation: Conversation, role: Message["role"], text: string) {
    const messageText = text.trim();
    if (!messageText) {
      return;
    }

    const timestamp = nowIso();
    const message: Message = {
      id: createId("msg"),
      createdAt: timestamp,
      updatedAt: timestamp,
      businessId: conversation.businessId,
      conversationId: conversation.id,
      customerPhone: conversation.customerPhone,
      role,
      text: messageText
    };

    demoStore.messages.push(message);
    conversation.memory.recentMessages.push({ role, text: messageText, createdAt: timestamp });
    conversation.memory.recentMessages = conversation.memory.recentMessages.slice(-24);
    persistRuntimeStore();
  }

  private nextConversationState(conversation: Conversation, patch: BotConversationStatePatch) {
    if (patch.comprobante_pago_recibido === true || patch.comprobante_pago_recibido === "true") {
      return "pending_human";
    }
    if (patch.next_expected === "comprobante_pago") return "awaiting_payment_proof";
    if (patch.comprobante_pago_pendiente === true || patch.comprobante_pago_pendiente === "true") {
      return "awaiting_payment_proof";
    }
    if (patch.needs_human === true || patch.needs_human === "true") return "pending_human";
    if (
      conversation.draftOrder?.items.length &&
      this.getMissingRequiredOptions(conversation.draftOrder).length > 0
    ) {
      return "collecting_items";
    }
    if (patch.pedido_confirmado === true || patch.pedido_confirmado === "true") return "confirming_order";
    if (
      patch.pedido_confirmado_por_cliente === true ||
      patch.pedido_confirmado_por_cliente === "true"
    ) {
      return this.requiresPaymentProof(conversation.draftOrder?.paymentMethod) &&
        !conversation.draftOrder?.paymentProofReceived
        ? "awaiting_payment_proof"
        : "confirming_order";
    }
    if (!conversation.draftOrder?.items.length) return "collecting_items";
    if (!this.hasRequiredDeliveryData(conversation.draftOrder)) return "collecting_delivery_details";
    if (
      this.requiresPaymentProof(conversation.draftOrder.paymentMethod) &&
      !conversation.draftOrder.paymentProofReceived &&
      conversation.state === "awaiting_payment_proof"
    ) {
      return "awaiting_payment_proof";
    }
    return "confirming_order";
  }

  private hasRequiredDeliveryData(draft: OrderDraft) {
    if (!draft.customerName || !draft.paymentMethod) return false;
    if (draft.fulfillmentType === "pickup") return true;
    return Boolean(draft.address && draft.neighborhood && draft.addressReference);
  }

  private buildReviewReadiness(draft: OrderDraft) {
    const missingFields: string[] = [];

    if (draft.items.length === 0) missingFields.push("productos");
    if (draft.items.some((item) => item.unitBasePrice <= 0)) missingFields.push("precios");
    if (this.getMissingRequiredOptions(draft).length > 0) {
      missingFields.push("opciones_obligatorias");
    }
    if (!draft.customerName) missingFields.push("nombre");
    if (!draft.paymentMethod) missingFields.push("metodo_pago");
    if (this.requiresPaymentProof(draft.paymentMethod) && !draft.paymentProofReceived) {
      missingFields.push("comprobante_pago");
    }

    if (draft.fulfillmentType === "delivery") {
      if (!draft.address) missingFields.push("direccion");
      if (!draft.neighborhood) missingFields.push("barrio");
      if (!draft.addressReference) missingFields.push("referencia");
    }

    return {
      ready: missingFields.length === 0,
      missingFields
    };
  }

  private refreshInferredZone(draft: OrderDraft) {
    if (draft.fulfillmentType !== "delivery") {
      draft.inferredZoneId = null;
      return;
    }

    const zone = this.catalogService.inferDeliveryZone(
      [draft.neighborhood, draft.address].filter(Boolean).join(" ")
    );
    if (zone) {
      draft.inferredZoneId = zone.id;
    }
  }

  private toBotConversation(conversation: Conversation) {
    const draft = conversation.draftOrder;
    return {
      id: conversation.id,
      customerPhone: conversation.customerPhone,
      state: conversation.state,
      activeOrderId: conversation.activeOrderId,
      conversationState: {
        items: JSON.stringify(
          draft?.items.map((item) => ({
            producto: item.productName,
            cantidad: item.quantity,
            precio_unitario: item.unitBasePrice,
            toppings: item.components
              .filter((component) => component.type === "added")
              .map((component) => component.name)
          })) ?? []
        ),
        nombre: draft?.customerName ?? "",
        direccion: draft?.address ?? "",
        barrio: draft?.neighborhood ?? "",
        referencia: draft?.addressReference ?? "",
        metodo_pago: draft?.paymentMethod ?? "",
        comprobante_pago_pendiente: Boolean(
          draft?.paymentMethod &&
            this.requiresPaymentProof(draft.paymentMethod) &&
            !draft.paymentProofReceived
        ),
        comprobante_pago_recibido: Boolean(draft?.paymentProofReceived),
        modalidad_entrega: draft?.fulfillmentType === "pickup" ? "recoger" : "domicilio",
        pedido_en_progreso: Boolean(draft?.items.length),
        ultima_pregunta_bot: this.extractLastBotQuestion(conversation),
        next_expected: this.toNextExpected(conversation)
      },
      draftOrder: draft
    };
  }

  private extractLastBotQuestion(conversation: Conversation) {
    return [...conversation.memory.recentMessages].reverse().find((message) => message.role === "bot")?.text ?? "";
  }

  private toNextExpected(conversation: Conversation) {
    if (conversation.state === "collecting_delivery_details") return "datos";
    if (conversation.state === "awaiting_payment_proof") return "comprobante_pago";
    if (conversation.state === "confirming_order") return "confirmacion";
    if (conversation.state === "pending_human") return "humano";
    return conversation.draftOrder?.items.length ? "datos" : "pedido";
  }

  private normalizePaymentMethod(value: string) {
    const normalized = value.trim().toLowerCase();
    if (normalized.includes("nequi")) return "Nequi";
    if (normalized.includes("bancolombia") || normalized.includes("banco")) return "Bancolombia";
    if (normalized.includes("bre")) return "Bre-B";
    if (normalized.includes("efectivo") || normalized.includes("contra")) return "Contra entrega";
    return value.trim();
  }

  private extractPaymentMethod(text: string) {
    const normalized = text.toLowerCase();
    if (normalized.includes("nequi")) return "Nequi";
    if (normalized.includes("bancolombia") || normalized.includes("banco")) return "Bancolombia";
    if (normalized.includes("bre")) return "Bre-B";
    if (normalized.includes("efectivo") || normalized.includes("contra")) return "Contra entrega";
    return null;
  }

  private normalizeSelectedOptions(product: Product, item: FlowisePedidoItem) {
    const selectedOptions: Record<string, string[]> = {};
    const incoming = item.selectedOptions ?? {};

    for (const option of product.requiredOptions ?? []) {
      const rawValues = [
        ...(incoming[option.key] ?? []),
        ...(option.key === "iceCreamFlavor" && item.sabor ? [item.sabor] : [])
      ];
      const values = rawValues
        .map((value) => this.canonicalRequiredOptionValue(option, value))
        .filter((value): value is string => Boolean(value));

      if (values.length > 0) {
        selectedOptions[option.key] = [...new Set(values)].slice(0, option.maxSelections);
      }
    }

    return Object.keys(selectedOptions).length ? selectedOptions : undefined;
  }

  private getMissingRequiredOptions(draft: OrderDraft): MissingRequiredOption[] {
    return draft.items.flatMap((item) => {
      const product = this.catalogService.findProductById(item.productId);
      if (!product) {
        return [];
      }

      return (product.requiredOptions ?? [])
        .filter((option) => option.required)
        .filter((option) => (item.selectedOptions?.[option.key]?.length ?? 0) < option.minSelections)
        .map((option) => ({ item, product, option }));
    });
  }

  private buildRequiredOptionsQuestion(draft: OrderDraft) {
    const missing = this.getMissingRequiredOptions(draft);
    if (missing.length === 0) {
      return null;
    }

    const grouped = new Map<string, MissingRequiredOption[]>();
    for (const entry of missing) {
      grouped.set(entry.item.id, [...(grouped.get(entry.item.id) ?? []), entry]);
    }

    const lines = [...grouped.values()].map((entries) => {
      const item = entries[0].item;
      const labels = entries.map((entry) => entry.option.label).join(", ");
      return `- Para ${item.quantity} x ${item.productName}: ${labels}.`;
    });

    return [
      "Perfecto. Antes de tomar los datos me faltan estas opciones del pedido:",
      ...lines,
      "",
      "Me las compartes en un mensaje? ðŸ“"
    ].join("\n");
  }

  private applyRequiredOptionAnswers(draft: OrderDraft, text: string) {
    const globalAnswers = this.extractRequiredOptionAnswers(text);

    for (const item of draft.items) {
      const product = this.catalogService.findProductById(item.productId);
      if (!product?.requiredOptions?.length) {
        continue;
      }

      const scopedText = this.scopeTextForRequiredOptions(item, text);
      const scopedAnswers = scopedText ? this.extractRequiredOptionAnswers(scopedText) : {};
      const answers = { ...globalAnswers, ...scopedAnswers };

      item.selectedOptions ??= {};
      for (const option of product.requiredOptions) {
        if (!option.required) {
          continue;
        }
        if ((item.selectedOptions[option.key]?.length ?? 0) >= option.minSelections) {
          continue;
        }

        const answer = answers[option.key];
        if (answer) {
          item.selectedOptions[option.key] = [answer].slice(0, option.maxSelections);
        }
      }
    }
  }

  private buildWaffleVariantQuestionIfNeeded(conversation: Conversation, draft: OrderDraft) {
    const latestCustomerText = [...conversation.memory.recentMessages]
      .reverse()
      .find((message) => message.role === "customer")?.text ?? "";
    const normalizedText = this.normalizeForMatching(latestCustomerText);
    const mentionedWaffleVariant =
      /\bwaffles?\s+(?:tradicional(?:es)?|chocolate)\b/.test(normalizedText) ||
      /\b(?:\d+|un|uno|una|dos|tres|cuatro|cinco)\s+(?:waffles?\s+)?(?:tradicional(?:es)?|chocolate)\b/.test(
        normalizedText
      );
    const mentionedGenericWaffles =
      /\bwaffles?\b/.test(normalizedText) &&
      !mentionedWaffleVariant;
    if (!mentionedGenericWaffles) {
      return null;
    }

    const traditionalWaffle = draft.items.find((item) => item.productName === "Waffle Tradicional");
    const chocolateWaffle = draft.items.find((item) => item.productName === "Waffle Chocolate");
    if (!traditionalWaffle || chocolateWaffle || traditionalWaffle.quantity < 2) {
      return null;
    }

    return `Perfecto. Para los ${traditionalWaffle.quantity} waffles, cuantos son tradicionales y cuantos de chocolate?`;
  }

  private applyWaffleVariantCounts(draft: OrderDraft, text: string) {
    const counts = this.extractWaffleVariantCounts(text);
    if (!counts || counts.traditional + counts.chocolate === 0) {
      return false;
    }

    const waffleItems = draft.items.filter((item) =>
      item.productName === "Waffle Tradicional" || item.productName === "Waffle Chocolate"
    );
    const currentTotal = waffleItems.reduce((sum, item) => sum + item.quantity, 0);
    if (currentTotal === 0) {
      return false;
    }

    const requestedTotal = counts.traditional + counts.chocolate;
    if (requestedTotal !== currentTotal) {
      return false;
    }

    draft.items = draft.items.filter(
      (item) => item.productName !== "Waffle Tradicional" && item.productName !== "Waffle Chocolate"
    );

    const nextWaffleItems = [
      counts.traditional > 0
        ? this.toOrderItem({
            producto: "Waffle Tradicional",
            cantidad: counts.traditional
          })
        : null,
      counts.chocolate > 0
        ? this.toOrderItem({
            producto: "Waffle Chocolate",
            cantidad: counts.chocolate
          })
        : null
    ].filter((item): item is OrderItem => Boolean(item));

    draft.items = [...nextWaffleItems, ...draft.items];
    return true;
  }

  private extractWaffleVariantCounts(text: string) {
    const normalized = this.normalizeForMatching(text);
    const traditional = this.extractCountBeforeVariant(normalized, "tradicional");
    const chocolate = this.extractCountBeforeVariant(normalized, "chocolate");
    if (traditional === null && chocolate === null) {
      return null;
    }

    return {
      traditional: traditional ?? 0,
      chocolate: chocolate ?? 0
    };
  }

  private extractCountBeforeVariant(text: string, variant: "tradicional" | "chocolate") {
    const match = text.match(
      new RegExp(`(?:^|\\s)(\\d+|un|uno|una|dos|tres|cuatro|cinco)\\s+(?:waffles?\\s+)?${variant}(?:es)?\\b`)
    );
    if (!match?.[1]) {
      return null;
    }

    return this.parseSmallCount(match[1]);
  }

  private parseSmallCount(value: string) {
    const normalized = this.normalizeForMatching(value);
    const words: Record<string, number> = {
      un: 1,
      uno: 1,
      una: 1,
      dos: 2,
      tres: 3,
      cuatro: 4,
      cinco: 5
    };
    return words[normalized] ?? Number(normalized);
  }

  private extractRequiredOptionAnswers(text: string) {
    const allOptions = this.catalogService
      .listProducts()
      .flatMap((product) => product.requiredOptions ?? []);
    const uniqueOptions = new Map(allOptions.map((option) => [option.key, option]));
    const answers: Record<string, string> = {};

    for (const option of uniqueOptions.values()) {
      const matches = option.options
        .map((value) => ({
          value,
          index: this.findOptionMentionIndex(text, value)
        }))
        .filter((match) => match.index >= 0)
        .sort((a, b) => a.index - b.index);

      if (matches.length === 0) {
        continue;
      }

      const selected =
        option.key === "iceCreamFlavor"
          ? matches[matches.length - 1]
          : matches[0];
      answers[option.key] = selected.value;
    }

    return answers;
  }

  private scopeTextForRequiredOptions(item: OrderItem, text: string) {
    const normalizedProduct = this.normalizeForMatching(item.productName);
    const normalizedText = this.normalizeForMatching(text);

    if (normalizedProduct.includes("waffle")) {
      const match = normalizedText.match(
        /\bwaffles?\b(.+?)(?=\b(?:las|unas?|los)?\s*fresas\s+(?:con\s+helado|tradicionales?\s+con\s+helado)\b|$)/
      );
      return match?.[0] ?? null;
    }

    if (normalizedProduct.includes("fresas con helado")) {
      const match = normalizedText.match(
        /\b(?:las|unas?)?\s*fresas\s+(?:con\s+helado|tradicionales?\s+con\s+helado)\b.+$/
      );
      return match?.[0] ?? null;
    }

    return null;
  }

  private findOptionMentionIndex(text: string, value: string) {
    const normalizedText = this.normalizeForMatching(text);
    const normalizedValue = this.normalizeForMatching(value);
    const match = normalizedText.match(new RegExp(`(^|\\s)${this.escapeRegExp(normalizedValue)}(\\s|$)`));
    return match?.index ?? -1;
  }

  private canonicalRequiredOptionValue(
    option: NonNullable<Product["requiredOptions"]>[number],
    value: string
  ) {
    const normalizedValue = this.normalizeForMatching(value);
    return option.options.find(
      (candidate) => this.normalizeForMatching(candidate) === normalizedValue
    ) ?? null;
  }

  private formatSummaryItemLine(item: OrderItem) {
    const product = this.catalogService.findProductById(item.productId);
    const options = Object.entries(item.selectedOptions ?? {})
      .flatMap(([key, values]) => {
        const label = product?.requiredOptions?.find((option) => option.key === key)?.label ?? key;
        return values.map((value) => `${label}: ${value}`);
      })
      .join("; ");
    const optionsText = options ? ` (${options})` : "";

    return `- ${item.quantity} x ${item.productName}${optionsText}: ${this.money(
      item.unitBasePrice * item.quantity
    )}`;
  }

  private normalizeForMatching(value: string) {
    return value
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\p{L}0-9]+/gu, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  private escapeRegExp(value: string) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  private buildMissingDataTemplate(missingFields: string[]) {
    const lines = [
      "Perfecto. Para el domicilio me compartes estos datos, por favor:",
      ""
    ];

    if (missingFields.includes("nombre")) lines.push("Nombre:");
    if (missingFields.includes("direccion")) lines.push("Direccion:");
    if (missingFields.includes("barrio")) lines.push("Barrio:");
    if (missingFields.includes("referencia")) lines.push("Referencia:");
    if (missingFields.includes("metodo_pago")) {
      lines.push("Metodo de pago: Nequi, Bancolombia, Bre-B o efectivo");
    }

    return lines.join("\n");
  }

  private extractAddress(text: string) {
    const match = text.match(
      /\b(cra|carrera|calle|cll|cl|avenida|av|diagonal|transversal)\.?\s+(.+?)(?=\s+(?:a|en)\s+[\p{L}\s]+,|,\s*[\p{Lu}][\p{L}]+|\s+y\s+te\s+pago|$)/iu
    );
    if (!match) {
      return null;
    }

    return `${match[1]} ${match[2]}`.replace(/\s+/g, " ").trim();
  }

  private extractNeighborhood(text: string) {
    const match = text.match(/\b(?:a|en)\s+([\p{L}\s]+?)(?:,|$)/iu);
    return match?.[1]?.replace(/\s+/g, " ").trim() || null;
  }

  private extractCustomerName(text: string) {
    const match = text.match(/,\s*([\p{Lu}][\p{L}]+(?:\s+[\p{Lu}][\p{L}]+)+)\s*,/u);
    return match?.[1]?.trim() || null;
  }

  private extractReference(text: string) {
    const match = text.match(/\b(es|referencia|ref)\s+(.+?)(?:\s+y\s+te\s+pago|\s+te\s+pago|$)/iu);
    if (!match?.[2]) {
      return null;
    }

    return match[1].toLowerCase() === "es"
      ? `es ${match[2].trim()}`
      : match[2].trim();
  }

  private requiresPaymentProof(paymentMethod?: string | null) {
    if (!paymentMethod) {
      return false;
    }

    return Boolean(this.findPaymentMethodSetting(paymentMethod)?.requiresProof);
  }

  private findPaymentMethodSetting(paymentMethod: string) {
    return demoStore.businesses[0].paymentMethodSettings
      .map(normalizePaymentMethodSetting)
      .find((method) => method.isActive && paymentMethodMatches(method, paymentMethod));
  }

  private normalizeFulfillment(value: string) {
    return value.trim().toLowerCase().includes("recog") ? "pickup" : "delivery";
  }

  private customerPhone(channel: BotChannel, chatId: string) {
    return `${channel}:${chatId}`;
  }

  private availableAlternativesFor(product: Product | null) {
    if (!product) {
      return [];
    }

    return this.catalogService
      .listActiveProducts()
      .filter((candidate) => candidate.category === product.category && candidate.id !== product.id)
      .slice(0, 4)
      .map((candidate) => `${candidate.name} (${this.money(candidate.basePrice)})`);
  }

  private money(value: number) {
    return formatCurrency(value);
  }
}
