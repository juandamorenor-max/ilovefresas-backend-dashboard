import { demoStore } from "../data/demoStore.js";
import { persistRuntimeStore } from "../data/runtime-store.js";
import type { Conversation, Message, ModifierOption, OrderDraft, OrderItem, Product } from "../types/index.js";
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
        ? `Te puedo ofrecer: ${alternatives.join(", ")}.`
        : "Si quieres, te comparto las opciones disponibles del menu."
    ].join(" ");
  }

  getOrCreateActiveConversation(channel: BotChannel, chatId: string) {
    return this.toBotConversation(
      this.findActiveConversation(channel, chatId) ?? this.createConversation(channel, chatId)
    );
  }

  startNewConversation(channel: BotChannel, chatId: string) {
    const active = this.findActiveConversation(channel, chatId);
    if (active) {
      active.state = "post_order_closed";
      active.activeOrderId = null;
      active.draftOrder = null;
      active.updatedAt = nowIso();
    }

    return this.toBotConversation(this.createConversation(channel, chatId));
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

    const total = draft.pricing.total;
    const method = this.findPaymentMethodSetting(draft.paymentMethod);
    if (!method?.requiresProof || !method.accountLabel || !method.accountValue) {
      return null;
    }

    return [
      `Perfecto. Para continuar con la revision del pedido, puedes hacer la transferencia por ${method.name}:`,
      "",
      `${method.accountLabel}: ${method.accountValue}`,
      `Total: ${total}`,
      "",
      "Cuando la hagas, enviame el comprobante por aqui."
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
    const customerPhone = this.customerPhone(channel, chatId);
    return (
      demoStore.conversations
        .filter((conversation) => conversation.customerPhone === customerPhone)
        .filter((conversation) => !CLOSED_STATES.has(conversation.state))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] ?? null
    );
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
      selectedOptions: item.sabor ? { sabor: [item.sabor] } : undefined,
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
    return `$${value.toLocaleString("es-CO")}`;
  }
}
