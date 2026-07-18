import { demoStore } from "../data/demoStore.js";
import { env } from "../config/env.js";
import { persistRuntimeStore } from "../data/runtime-store.js";
import type { Conversation, Message, ModifierOption, OrderDraft, OrderItem, Product } from "../types/index.js";
import { formatCurrency } from "../utils/http.js";
import { createId, nowIso } from "../utils/id.js";
import { CatalogService } from "./catalog.service.js";
import { OrderService } from "./order.service.js";
import { normalizePaymentMethodSetting, paymentMethodMatches } from "./payment-method-settings.js";

type BotChannel = "telegram" | "whatsapp";

interface FlowisePedidoItem {
  id?: string;
  productId?: string;
  productName?: string;
  producto?: string;
  quantity?: number;
  cantidad?: number;
  variante?: string;
  sabor?: string;
  selectedOptions?: Record<string, string[]>;
  toppings?: string[];
  adiciones?: string[];
  modifierIds?: string[];
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
  stage?: string;
  action?: string;
  pending_action?: string;
  target_item_id?: string | null;
  target_option_key?: string | null;
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

type RequiredOptionFocus = MissingRequiredOption & {
  missingForItem: MissingRequiredOption[];
  itemIndex: number;
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
      `- Dirección: ${draft.address ?? "Por confirmar"}`,
      `- Barrio: ${draft.neighborhood ?? "Por confirmar"}`,
      `- Referencia: ${draft.addressReference ?? "Por confirmar"}`,
      `- Método de pago: ${draft.paymentMethod ?? "Por confirmar"}`,
      "",
      `Subtotal productos: ${this.money(draft.pricing.subtotal)}`,
      `Domicilio: ${this.money(draft.pricing.deliveryFee)}`,
      `Total: ${this.money(draft.pricing.total)}`,
      "",
      "¿Está correcto para dejarlo en revisión con el equipo?"
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
        responseText: "Perfecto. ¿Qué producto quieres pedir? 🍓",
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

  handleDirectedModifierTurn(conversationId: string, customerText: string) {
    const conversation = this.findConversation(conversationId);
    const draft = conversation?.draftOrder;
    if (!conversation || !draft || draft.items.length === 0) {
      return null;
    }

    const pendingModifierTurn = this.handlePendingModifierSelection(draft, customerText);
    if (pendingModifierTurn) {
      return this.persistBackendTurn(conversation, customerText, pendingModifierTurn);
    }

    const modifiers = this.catalogService.findModifierOptionsMentioned(customerText);
    if (modifiers.length === 0 || !this.isModifierRequest(customerText)) {
      return null;
    }

    if (this.looksLikeNewProductRequest(customerText)) {
      return null;
    }

    const modifier = modifiers[0];
    const targetedItems = this.findTargetItemsForModifier(draft, customerText);
    if (targetedItems.length === 1) {
      const nextStep = this.applyModifierToItem(draft, targetedItems[0], modifier, customerText);
      return this.persistBackendTurn(conversation, customerText, nextStep);
    }

    const candidates = targetedItems.length > 1 ? targetedItems : draft.items;
    if (candidates.length === 1) {
      const nextStep = this.applyModifierToItem(draft, candidates[0], modifier, customerText);
      return this.persistBackendTurn(conversation, customerText, nextStep);
    }

    draft.pendingSelections = draft.pendingSelections.filter(
      (selection) => selection.label !== "modifier_target"
    );
    draft.pendingSelections.push({
      id: createId("sel"),
      type: "modifier_clarification",
      targetItemId: null,
      targetProductId: modifier.id,
      label: "modifier_target",
      options: candidates.map((item) => item.id),
      blocking: true,
      question: this.buildModifierTargetQuestion(modifier, candidates)
    });

    const nextStep = {
      responseText: this.buildModifierTargetQuestion(modifier, candidates),
      nextExpected: "pedido",
      source: "backend_directed_modifier_guardrail"
    };
    return this.persistBackendTurn(conversation, customerText, nextStep);
  }

  handleRequiredOptionsTurn(conversationId: string, customerText: string) {
    const conversation = this.findConversation(conversationId);
    const draft = conversation?.draftOrder;
    if (!conversation || !draft || this.getMissingRequiredOptions(draft).length === 0) {
      return null;
    }

    const waffleVariantHelp = this.buildWaffleVariantHelpIfNeeded(draft, customerText);
    if (waffleVariantHelp) {
      const nextStep = {
        responseText: waffleVariantHelp,
        nextExpected: "pedido",
        source: "backend_waffle_variant_guardrail"
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

    const ambiguousRequiredOptionQuestion = this.buildAmbiguousRequiredOptionQuestion(draft, customerText);
    if (ambiguousRequiredOptionQuestion) {
      const nextStep = {
        responseText: ambiguousRequiredOptionQuestion,
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

    const appliedWaffleVariantCounts = this.applyWaffleVariantCounts(draft, customerText);
    this.applyExplicitRequiredOptionRemovals(draft, customerText);
    if (!appliedWaffleVariantCounts && !this.applySameRequiredOptionsAsPrevious(draft, customerText)) {
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

    const safePatch = this.normalizeAgentOwnedPatch(
      this.sanitizePrematurePaymentProofPatch(conversation, patch)
    );
    if (
      safePatch.items !== undefined ||
      safePatch.nombre !== undefined ||
      safePatch.direccion !== undefined ||
      safePatch.barrio !== undefined ||
      safePatch.referencia !== undefined ||
      safePatch.metodo_pago !== undefined ||
      safePatch.modalidad_entrega !== undefined
    ) {
      conversation.activeQuoteId = null;
    }
    this.applyDraftPatch(conversation.draftOrder, safePatch);
    if (env.TURN_DECISION_OWNER === "legacy") {
      this.recoverMentionedProducts(conversation.draftOrder, safePatch.customerMessage);
      this.normalizeSingleProductHeladoMentions(conversation.draftOrder, safePatch.customerMessage);
    }
    this.captureMessages(conversation, safePatch);
    this.captureMemory(conversation, safePatch);
    this.captureAgentFlowState(conversation, safePatch);

    conversation.draftOrder = this.orderService.refreshDraft(conversation.draftOrder);
    conversation.state = this.nextConversationState(conversation, safePatch);
    conversation.updatedAt = nowIso();

    persistRuntimeStore();
    return this.toBotConversation(conversation);
  }

  getQuoteRequest(conversationId: string) {
    const conversation = this.findConversation(conversationId);
    const draft = conversation?.draftOrder;
    if (!conversation || !draft) return null;
    return {
      conversationId,
      fulfillmentType: draft.fulfillmentType,
      neighborhood: draft.neighborhood ?? "",
      items: draft.items.map((item) => ({
        id: item.id,
        productId: item.productId,
        quantity: item.quantity,
        selectedOptions: item.selectedOptions ?? {},
        modifiers: item.components
          .filter((component) => component.type === "added")
          .map((component) => component.name),
        notes: item.notes
      }))
    };
  }

  setActiveQuote(conversationId: string, quoteId: string | null) {
    const conversation = this.findConversation(conversationId);
    if (!conversation) return null;
    conversation.activeQuoteId = quoteId;
    conversation.updatedAt = nowIso();
    persistRuntimeStore();
    return conversation;
  }

  getConfirmedOrderInput(
    conversationId: string,
    paymentProofReceived = false,
    paymentProofNote?: string
  ) {
    const conversation = this.findConversation(conversationId);
    const draft = conversation?.draftOrder;
    if (!conversation || !draft || !conversation.activeQuoteId) return null;
    return {
      quoteId: conversation.activeQuoteId,
      conversationId,
      customer: {
        name: draft.customerName ?? "",
        phone: conversation.customerPhone,
        address: draft.address ?? "",
        neighborhood: draft.neighborhood ?? "",
        reference: draft.addressReference ?? ""
      },
      paymentMethod: draft.paymentMethod ?? "",
      paymentProof: {
        received: paymentProofReceived || draft.paymentProofReceived,
        note: paymentProofNote ?? draft.paymentProofNote ?? undefined
      }
    };
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
      `Perfecto 😊 Para continuar con la revisión del pedido, puedes hacer la transferencia por ${method.name}:`,
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
      activeQuoteId: null,
      agentFlowState: {
        stage: "pedido",
        pendingAction: "",
        targetItemId: "",
        targetOptionKey: ""
      },
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
    const hasAgentItemsPatch = env.TURN_DECISION_OWNER === "agents" && patch.items !== undefined;
    if ((items.length > 0 || hasAgentItemsPatch) && this.shouldApplyItemsPatch(draft, patch)) {
      const nextItems = items
        .map((item) => this.toOrderItem(item))
        .filter((item): item is OrderItem => Boolean(item));
      draft.items = this.mergeExistingItemDetails(draft.items, nextItems);
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
    const product = item.productId
      ? this.catalogService.findProductById(item.productId)
      : this.catalogService.findProductByNameOrAlias(item.productName ?? item.producto ?? "");
    if (!product) {
      return null;
    }

    const modifiers = [
      ...(item.modifierIds ?? []),
      ...(item.toppings ?? []),
      ...(item.adiciones ?? [])
    ]
      .map(
        (modifier) =>
          this.catalogService.findModifierOptionById(modifier) ??
          this.catalogService.findModifierOptionByNameOrAlias(modifier)
      )
      .filter((modifier): modifier is ModifierOption => Boolean(modifier));

    return {
      id: item.id?.trim() || createId("item"),
      productId: product.id,
      productName: product.name,
      quantity: Math.max(1, Number(item.quantity ?? item.cantidad ?? 1)),
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

  private shouldApplyItemsPatch(draft: OrderDraft, patch: BotConversationStatePatch) {
    if (env.TURN_DECISION_OWNER === "agents") {
      return patch.items !== undefined;
    }
    if (draft.items.length === 0) {
      return true;
    }

    const customerMessage = patch.customerMessage?.trim();
    if (!customerMessage) {
      return true;
    }

    return this.customerMessageMentionsProducts(customerMessage);
  }

  private customerMessageMentionsProducts(customerMessage: string) {
    const normalized = this.normalizeForMatching(customerMessage);
    return (
      this.catalogService.findProductsMentioned(customerMessage).length > 0 ||
      /\bwaffles?\b/.test(normalized) ||
      /\bfresas?\b/.test(normalized) ||
      /\boblea(s)?\b/.test(normalized) ||
      /\bmalteada(s)?\b/.test(normalized) ||
      /\bbrownie\b/.test(normalized) ||
      /\bpavlova\b/.test(normalized)
    );
  }

  private mergeExistingItemDetails(existingItems: OrderItem[], nextItems: OrderItem[]) {
    const usedExistingIndexes = new Set<number>();

    return nextItems.map((item) => {
      const existingIndex = existingItems.findIndex(
        (existingItem, index) =>
          !usedExistingIndexes.has(index) &&
          existingItem.productName === item.productName
      );
      if (existingIndex < 0) {
        return item;
      }

      usedExistingIndexes.add(existingIndex);
      const existingItem = existingItems[existingIndex];
      const itemHasAddedComponents = item.components.some((component) => component.type === "added");
      const existingHasAddedComponents = existingItem.components.some(
        (component) => component.type === "added"
      );

      return {
        ...item,
        unitBasePrice: item.unitBasePrice > 0 ? item.unitBasePrice : existingItem.unitBasePrice,
        components:
          itemHasAddedComponents || !existingHasAddedComponents
            ? item.components
            : existingItem.components,
        selectedOptions: item.selectedOptions ?? existingItem.selectedOptions
      };
    });
  }

  private persistBackendTurn(
    conversation: Conversation,
    customerText: string,
    nextStep: { responseText: string; nextExpected: string; source: string }
  ) {
    conversation.draftOrder = this.orderService.refreshDraft(conversation.draftOrder!);
    this.saveMessage(conversation, "customer", customerText);
    this.saveMessage(conversation, "bot", nextStep.responseText);
    conversation.state = this.nextConversationState(conversation, {
      next_expected: nextStep.nextExpected
    });
    conversation.updatedAt = nowIso();
    persistRuntimeStore();
    return nextStep;
  }

  private handlePendingModifierSelection(draft: OrderDraft, customerText: string) {
    const pending = draft.pendingSelections.find(
      (selection) =>
        selection.blocking &&
        (selection.label === "modifier_target" || selection.label === "modifier_helado_flavor")
    );
    if (!pending) {
      return null;
    }

    if (pending.label === "modifier_target") {
      const modifier = pending.targetProductId
        ? this.catalogService.findModifierOptionById(pending.targetProductId)
        : null;
      if (!modifier) {
        draft.pendingSelections = draft.pendingSelections.filter((selection) => selection.id !== pending.id);
        return null;
      }

      const candidates = pending.options
        .map((itemId) => draft.items.find((item) => item.id === itemId))
        .filter((item): item is OrderItem => Boolean(item));
      const targetedItems = this.findTargetItemsForModifier(draft, customerText, candidates);
      if (targetedItems.length !== 1) {
        return {
          responseText: this.buildModifierTargetQuestion(modifier, candidates),
          nextExpected: "pedido",
          source: "backend_directed_modifier_guardrail"
        };
      }

      draft.pendingSelections = draft.pendingSelections.filter((selection) => selection.id !== pending.id);
      return this.applyModifierToItem(draft, targetedItems[0], modifier, "");
    }

    const targetItem = pending.targetItemId
      ? draft.items.find((item) => item.id === pending.targetItemId)
      : null;
    if (!targetItem) {
      draft.pendingSelections = draft.pendingSelections.filter((selection) => selection.id !== pending.id);
      return null;
    }

    const flavor = this.extractIceCreamFlavor(customerText);
    if (!flavor) {
      return {
        responseText: this.buildHeladoFlavorQuestion(targetItem),
        nextExpected: "pedido",
        source: "backend_directed_modifier_guardrail"
      };
    }

    targetItem.selectedOptions ??= {};
    targetItem.selectedOptions.iceCreamFlavor = [flavor];
    draft.pendingSelections = draft.pendingSelections.filter((selection) => selection.id !== pending.id);
    return {
      responseText: `Perfecto, helado de ${flavor} para ${targetItem.productName}. ¿Quieres agregar otro producto al pedido? 🍓`,
      nextExpected: "pedido",
      source: "backend_directed_modifier_guardrail"
    };
  }

  private isModifierRequest(text: string) {
    const normalized = this.normalizeForMatching(text);
    return /\b(agrega|agregale|agregar|ponle|echale|con|adicion|adicional|extra|tambien)\b/.test(
      normalized
    );
  }

  private looksLikeNewProductRequest(text: string) {
    const mentionedProducts = this.catalogService.findProductsMentioned(text);
    if (mentionedProducts.length === 0) {
      return false;
    }

    const normalized = this.normalizeForMatching(text);
    const hasDirectedModifierVerb = /\b(agrega|agregar|agregale|ponle|echale)\b/.test(normalized);
    const hasTargetPreposition = /\b(?:a|al|a la|a las|para|pa)\b/.test(normalized);
    if (hasDirectedModifierVerb && hasTargetPreposition) {
      return false;
    }

    return /\b(y|quiero|dame|mandame|pideme|agrega|agregar|una|un|unas|unos|otro|otra|tambien)\b/.test(
      normalized
    );
  }

  private findTargetItemsForModifier(
    draft: OrderDraft,
    text: string,
    candidates = draft.items
  ) {
    const normalizedText = this.normalizeForMatching(text);
    const matches = candidates
      .map((item) => {
        const product = this.catalogService.findProductById(item.productId);
        const names = [item.productName, ...(product?.aliases ?? [])];
        const match = names
          .map((name) => this.normalizeForMatching(name))
          .filter(Boolean)
          .filter((candidate) => this.textMentionsCandidate(normalizedText, candidate))
          .sort((a, b) => b.length - a.length)[0];
        return match ? { item, length: match.length } : null;
      })
      .filter((entry): entry is { item: OrderItem; length: number } => Boolean(entry))
      .sort((a, b) => b.length - a.length);

    if (matches.length === 0) {
      return [];
    }

    const bestLength = matches[0].length;
    return matches.filter((match) => match.length === bestLength).map((match) => match.item);
  }

  private textMentionsCandidate(normalizedText: string, candidate: string) {
    return new RegExp(`(^|\\s)${this.escapeRegExp(candidate)}(\\s|$)`).test(normalizedText);
  }

  private applyModifierToItem(
    draft: OrderDraft,
    item: OrderItem,
    modifier: ModifierOption,
    customerText: string
  ) {
    item.components = item.components.filter(
      (component) => !(component.type === "added" && component.name === modifier.name)
    );
    item.components.push({
      name: modifier.name,
      type: "added",
      priceDelta: modifier.priceDelta
    });

    if (modifier.name === "Helado") {
      const flavor = this.extractIceCreamFlavor(customerText);
      if (flavor) {
        item.selectedOptions ??= {};
        item.selectedOptions.iceCreamFlavor = [flavor];
        this.clearPendingHeladoFlavor(draft, item.id);
        return {
          responseText: `Listo, le agrego helado de ${flavor} a ${item.productName}. ¿Quieres agregar otro producto al pedido? 🍓`,
          nextExpected: "pedido",
          source: "backend_directed_modifier_guardrail"
        };
      }

      this.setPendingHeladoFlavor(draft, item);
      return {
        responseText: this.buildHeladoFlavorQuestion(item),
        nextExpected: "pedido",
        source: "backend_directed_modifier_guardrail"
      };
    }

    return {
      responseText: `Listo, le agrego ${modifier.name} a ${item.productName}. ¿Quieres agregar otro producto al pedido? 🍓`,
      nextExpected: "pedido",
      source: "backend_directed_modifier_guardrail"
    };
  }

  private setPendingHeladoFlavor(draft: OrderDraft, item: OrderItem) {
    this.clearPendingHeladoFlavor(draft, item.id);
    draft.pendingSelections.push({
      id: createId("sel"),
      type: "required_option",
      targetItemId: item.id,
      targetProductId: item.productId,
      label: "modifier_helado_flavor",
      options: ["Fresa", "Chocolate", "Vainilla", "Oreo"],
      blocking: true,
      question: this.buildHeladoFlavorQuestion(item)
    });
  }

  private clearPendingHeladoFlavor(draft: OrderDraft, itemId: string) {
    draft.pendingSelections = draft.pendingSelections.filter(
      (selection) =>
        !(selection.label === "modifier_helado_flavor" && selection.targetItemId === itemId)
    );
  }

  private extractIceCreamFlavor(text: string) {
    const normalized = this.normalizeForMatching(text);
    const explicitFlavor = normalized.match(
      /\b(?:helado|sabor)\s+(?:de\s+)?(fresa|chocolate|vainilla|oreo)\b/
    )?.[1];
    const option = {
      key: "iceCreamFlavor",
      label: "sabor de helado",
      options: ["Fresa", "Chocolate", "Vainilla", "Oreo"],
      required: true,
      minSelections: 1,
      maxSelections: 1
    };
    if (explicitFlavor) {
      return option.options.find(
        (value) => this.normalizeForMatching(value) === explicitFlavor
      ) ?? null;
    }
    if (/\bhelado\b/.test(normalized)) {
      return null;
    }
    return option.options.find((value) => this.findOptionMentionIndex(text, value) >= 0) ?? null;
  }

  private buildModifierTargetQuestion(modifier: ModifierOption, candidates: OrderItem[]) {
    return `¿A cuál producto le agregamos ${modifier.name}? ${this.formatHumanList(
      candidates.map((item) => item.productName)
    )}.`;
  }

  private buildHeladoFlavorQuestion(item: OrderItem) {
    return `Listo, le agrego helado a ${item.productName} 🍓 ¿Qué sabor quieres: Fresa, Chocolate, Vainilla u Oreo?`;
  }

  private recoverMentionedProducts(draft: OrderDraft, customerMessage?: string) {
    if (!customerMessage || draft.items.length === 0) {
      return;
    }

    const mentionedProducts = this.catalogService.findProductsMentioned(customerMessage);
    for (const product of mentionedProducts) {
      if (draft.items.some((item) => item.productId === product.id)) {
        continue;
      }

      const item = this.toOrderItem({
        producto: product.name,
        cantidad: 1,
        precio_unitario: product.basePrice
      });
      if (item) {
        draft.items.push(item);
      }
    }

    this.recoverGenericWaffles(draft, customerMessage);
  }

  private recoverGenericWaffles(draft: OrderDraft, customerMessage: string) {
    if (draft.items.some((item) => item.productName === "Waffle Tradicional" || item.productName === "Waffle Chocolate")) {
      return;
    }

    const normalized = this.normalizeForMatching(customerMessage);
    const match = normalized.match(/\b(\d+|un|uno|una|dos|tres|cuatro|cinco)\s+waffles?\b/);
    if (!match?.[1]) {
      return;
    }

    const quantity = this.parseSmallCount(match[1]);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      return;
    }

    const item = this.toOrderItem({
      producto: "Waffle Tradicional",
      cantidad: quantity
    });
    if (item) {
      draft.items.push(item);
    }
  }

  private normalizeSingleProductHeladoMentions(draft: OrderDraft, customerMessage?: string) {
    if (!customerMessage) {
      return;
    }

    const normalized = this.normalizeForMatching(customerMessage);
    const singleTraditionalWithHelado =
      /\bfresas tradicionales con helado\b/.test(normalized) ||
      /\btradicionales con helado\b/.test(normalized) ||
      /\bfresas con crema tradicional con helado\b/.test(normalized);
    if (!singleTraditionalWithHelado) {
      return;
    }

    const hasFresasConHelado = draft.items.some((item) => item.productName === "Fresas con helado");
    if (!hasFresasConHelado) {
      return;
    }

    draft.items = draft.items.filter((item) => item.productName !== "Fresas con crema tradicional");
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

  private normalizeAgentOwnedPatch(patch: BotConversationStatePatch): BotConversationStatePatch {
    if (env.TURN_DECISION_OWNER !== "agents") return patch;

    const pendingAction = patch.pending_action ?? patch.action;
    if (["configure_item", "ask_more_products", "clarify"].includes(pendingAction ?? "")) {
      return {
        ...patch,
        stage: "pedido",
        next_expected: "pedido",
        ...(pendingAction === "ask_more_products"
          ? { target_item_id: null, target_option_key: null }
          : {})
      };
    }
    if (pendingAction === "collect_data") {
      return {
        ...patch,
        stage: "datos",
        next_expected: "datos",
        target_item_id: null,
        target_option_key: null
      };
    }
    if (pendingAction === "request_quote") {
      return { ...patch, stage: "confirmacion", next_expected: "confirmacion" };
    }
    if (patch.needs_human === true || patch.needs_human === "true") {
      return { ...patch, stage: "humano", next_expected: "humano" };
    }
    return patch;
  }

  private captureAgentFlowState(conversation: Conversation, patch: BotConversationStatePatch) {
    if (env.TURN_DECISION_OWNER !== "agents") return;

    const current = conversation.agentFlowState ?? {
      stage: "pedido",
      pendingAction: "",
      targetItemId: "",
      targetOptionKey: ""
    };
    const pendingAction = patch.pending_action ?? patch.action;
    conversation.agentFlowState = {
      stage: patch.stage?.trim() || patch.next_expected?.trim() || current.stage,
      pendingAction: pendingAction?.trim() || current.pendingAction,
      targetItemId:
        patch.target_item_id === null
          ? ""
          : patch.target_item_id?.trim() ?? current.targetItemId,
      targetOptionKey:
        patch.target_option_key === null
          ? ""
          : patch.target_option_key?.trim() ?? current.targetOptionKey
    };
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
    if (
      env.TURN_DECISION_OWNER === "agents" &&
      patch.next_expected === undefined &&
      patch.stage === undefined &&
      patch.pending_action === undefined &&
      patch.action === undefined &&
      patch.needs_human === undefined &&
      patch.comprobante_pago_recibido === undefined &&
      patch.comprobante_pago_pendiente === undefined
    ) {
      return conversation.state;
    }
    if (env.TURN_DECISION_OWNER === "agents" && patch.next_expected) {
      const agentOwnedState = {
        pedido: "collecting_items",
        datos: "collecting_delivery_details",
        confirmacion: "confirming_order",
        comprobante_pago: "awaiting_payment_proof",
        humano: "pending_human",
        postventa: "completed",
        cerrado: "post_order_closed"
      } as const;
      const mapped = agentOwnedState[patch.next_expected as keyof typeof agentOwnedState];
      if (mapped) return mapped;
    }
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
      (this.getMissingRequiredOptions(conversation.draftOrder).length > 0 ||
        this.hasBlockingPendingSelection(conversation.draftOrder))
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
    if (this.getMissingRequiredOptions(draft).length > 0 || this.hasBlockingPendingSelection(draft)) {
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

  private hasBlockingPendingSelection(draft: OrderDraft) {
    return draft.pendingSelections.some((selection) => selection.blocking);
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
            id: item.id,
            productId: item.productId,
            productName: item.productName,
            producto: item.productName,
            quantity: item.quantity,
            cantidad: item.quantity,
            precio_unitario: item.unitBasePrice,
            toppings: item.components
              .filter((component) => component.type === "added")
              .map((component) => component.name),
            selectedOptions: item.selectedOptions ?? {}
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
        next_expected: this.toNextExpected(conversation),
        stage: conversation.agentFlowState?.stage ?? this.toNextExpected(conversation),
        pending_action: conversation.agentFlowState?.pendingAction ?? "",
        target_item_id: conversation.agentFlowState?.targetItemId ?? "",
        target_option_key: conversation.agentFlowState?.targetOptionKey ?? ""
      },
      draftOrder: draft
    };
  }

  private extractLastBotQuestion(conversation: Conversation) {
    return [...conversation.memory.recentMessages].reverse().find((message) => message.role === "bot")?.text ?? "";
  }

  private toNextExpected(conversation: Conversation) {
    if (conversation.state === "collecting_items") return "pedido";
    if (conversation.state === "collecting_delivery_details") return "datos";
    if (conversation.state === "awaiting_payment_proof") return "comprobante_pago";
    if (conversation.state === "confirming_order") return "confirmacion";
    if (conversation.state === "pending_human") return "humano";
    if (conversation.state === "completed") return "postventa";
    if (conversation.state === "post_order_closed") return "cerrado";
    return "pedido";
  }

  private normalizePaymentMethod(value: string) {
    const normalized = this.normalizeForMatching(value);
    if (normalized.includes("nequi")) return "Nequi";
    if (normalized.includes("bancolombia") || normalized.includes("banco")) return "Bancolombia";
    if (normalized.includes("bre")) return "Bre-B";
    if (normalized.includes("efectivo") || normalized.includes("contra")) return "Contra entrega";
    return value.trim();
  }

  private extractPaymentMethod(text: string) {
    const normalized = this.normalizeForMatching(text);
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
        .filter((option) => !this.itemExplicitlySkipsRequiredOption(item, product, option.key))
        .filter((option) => (item.selectedOptions?.[option.key]?.length ?? 0) < option.minSelections)
        .map((option) => ({ item, product, option }));
    });
  }

  private applyExplicitRequiredOptionRemovals(draft: OrderDraft, text: string) {
    const focus = this.getRequiredOptionFocus(draft);
    if (!focus) {
      return false;
    }

    const requestedKeys = this.explicitRequiredOptionRemovalKeys(text);
    if (requestedKeys.length === 0) {
      return false;
    }

    const applyToCompatibleItems = /\b(?:ambos|todos|todas|los dos|las dos)\b/.test(
      this.normalizeForMatching(text)
    );
    const targets = applyToCompatibleItems
      ? draft.items.filter((item) => {
          const product = this.catalogService.findProductById(item.productId);
          return product && this.requiredOptionSignature(product) === this.requiredOptionSignature(focus.product);
        })
      : [focus.item];
    let applied = false;

    for (const item of targets) {
      const product = this.catalogService.findProductById(item.productId);
      if (!product) continue;

      for (const optionKey of requestedKeys) {
        const componentName = this.requiredOptionComponentName(optionKey);
        if (
          !componentName ||
          !product.removableComponents.some(
            (component) => this.normalizeForMatching(component) === this.normalizeForMatching(componentName)
          )
        ) {
          continue;
        }

        item.selectedOptions ??= {};
        delete item.selectedOptions[optionKey];
        const alreadyRemoved = item.components.some(
          (component) =>
            component.type === "removed" &&
            this.normalizeForMatching(component.name) === this.normalizeForMatching(componentName)
        );
        if (!alreadyRemoved) {
          item.components.push({ name: componentName, type: "removed", priceDelta: 0 });
        }
        applied = true;
      }
    }

    return applied;
  }

  private explicitRequiredOptionRemovalKeys(text: string) {
    const normalized = this.normalizeForMatching(text);
    const negative = "(?:sin|no quiero|quitale|quitar|retira|retirale)";
    const keys: string[] = [];
    if (new RegExp(`\\b${negative}\\s+(?:el\\s+|sabor\\s+de\\s+)?helado\\b`).test(normalized)) {
      keys.push("iceCreamFlavor");
    }
    if (new RegExp(`\\b${negative}\\s+(?:la\\s+)?fruta\\b`).test(normalized)) {
      keys.push("fruit");
    }
    if (new RegExp(`\\b${negative}\\s+(?:la\\s+)?salsa\\b`).test(normalized)) {
      keys.push("sauce");
    }
    if (new RegExp(`\\b${negative}\\s+(?:el\\s+)?topping\\b`).test(normalized)) {
      keys.push("includedTopping");
    }
    return keys;
  }

  private requiredOptionComponentName(optionKey: string) {
    if (optionKey === "iceCreamFlavor") return "helado";
    if (optionKey === "fruit") return "fruta";
    if (optionKey === "sauce") return "salsa";
    if (optionKey === "includedTopping") return "topping";
    return null;
  }

  private itemExplicitlySkipsRequiredOption(item: OrderItem, product: Product, optionKey: string) {
    const componentName = this.requiredOptionComponentName(optionKey);
    if (!componentName) return false;
    const isRemovable = product.removableComponents.some(
      (component) => this.normalizeForMatching(component) === this.normalizeForMatching(componentName)
    );
    return isRemovable && item.components.some(
      (component) =>
        component.type === "removed" &&
        this.normalizeForMatching(component.name) === this.normalizeForMatching(componentName)
    );
  }

  private buildRequiredOptionsQuestion(draft: OrderDraft) {
    const focus = this.getRequiredOptionFocus(draft);
    if (!focus) {
      return null;
    }

    return this.buildRequiredOptionFocusQuestion(draft, focus);

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

    const missingOptionKeys = [...new Set(missing.map((entry) => entry.option.key))];
    const optionLines = this.buildRequiredOptionChoices(missingOptionKeys);

    return [
      "Perfecto. Antes de tomar los datos me faltan estas opciones del pedido:",
      ...lines,
      ...optionLines,
      "",
      "Me las compartes en un mensaje? 🍓"
    ].join("\n");
  }

  private getRequiredOptionFocus(draft: OrderDraft): RequiredOptionFocus | null {
    const missing = this.getMissingRequiredOptions(draft);
    const current = missing[0];
    if (!current) {
      return null;
    }

    return {
      ...current,
      missingForItem: missing.filter((entry) => entry.item.id === current.item.id),
      itemIndex: draft.items.findIndex((item) => item.id === current.item.id)
    };
  }

  private buildRequiredOptionFocusQuestion(draft: OrderDraft, focus: RequiredOptionFocus) {
    const prefix = this.buildCompletedRequiredOptionPrefix(draft, focus);
    const overview = this.buildRequiredOptionsOverview(draft, focus);
    const question = this.buildRequiredOptionQuestionText(draft, focus);
    const choices = overview ? "" : this.buildRequiredOptionChoiceLine(focus.option);
    return [prefix, overview, question, choices].filter(Boolean).join("\n\n");
  }

  private buildRequiredOptionsOverview(draft: OrderDraft, focus: RequiredOptionFocus) {
    if (!this.isFirstMissingOptionForItem(focus) || this.itemHasAnyRequiredOptionValue(focus.item)) {
      return "";
    }

    const requiredOptions = (focus.product.requiredOptions ?? []).filter((option) => option.required);
    const signature = this.requiredOptionSignature(focus.product);
    const hasEarlierCompatibleItem = draft.items
      .slice(0, focus.itemIndex)
      .some((item) => {
        const product = this.catalogService.findProductById(item.productId);
        return product && this.requiredOptionSignature(product) === signature;
      });
    if (hasEarlierCompatibleItem) {
      return "";
    }

    const compatibleItemCount = draft.items.filter((item) => {
      const product = this.catalogService.findProductById(item.productId);
      return product && this.requiredOptionSignature(product) === signature;
    }).length;
    const subject = this.requiredOptionSubject(focus.item);
    const selectionLabels = requiredOptions.map((option) => this.requiredOptionSelectionLabel(option));
    const intro = compatibleItemCount > 1
      ? `Para cada ${subject} debes escoger ${this.formatRequiredSelectionList(selectionLabels)}.`
      : `Para este ${subject} debes escoger ${this.formatRequiredSelectionList(selectionLabels)}.`;
    const optionLines = requiredOptions.map((option) =>
      `${this.requiredOptionEmoji(option.key)} ${this.optionGroupLabel(option)}: ${this.formatHumanList(option.options)}`
    );

    return [
      `${intro} 🍓`,
      ...optionLines,
      "Puedes enviarme todas las opciones juntas o responder una por una."
    ].join("\n");
  }

  private itemHasAnyRequiredOptionValue(item: OrderItem) {
    return Object.values(item.selectedOptions ?? {}).some((values) => values.length > 0);
  }

  private requiredOptionSignature(product: Product) {
    return (product.requiredOptions ?? [])
      .filter((option) => option.required)
      .map((option) => option.key)
      .sort()
      .join("|");
  }

  private requiredOptionSubject(item: OrderItem) {
    if (this.isWaffleItem(item)) return "waffle";
    if (this.normalizeForMatching(item.productName).includes("vaso fantasia")) return "vaso fantasia";
    if (item.productName === "Fresas con helado") return "pedido de fresas con helado";
    return item.productName.toLowerCase();
  }

  private requiredOptionSelectionLabel(option: NonNullable<Product["requiredOptions"]>[number]) {
    if (option.key === "fruit") return "una fruta";
    if (option.key === "iceCreamFlavor") return option.minSelections > 1
      ? `${option.minSelections} sabores de helado`
      : "un sabor de helado";
    if (option.key === "sauce") return "una salsa";
    if (option.key === "includedTopping") return "un topping";
    return option.label;
  }

  private formatRequiredSelectionList(values: string[]) {
    if (values.length <= 1) return values.join("");
    return `${values.slice(0, -1).join(", ")} y ${values[values.length - 1]}`;
  }

  private requiredOptionEmoji(optionKey: string) {
    if (optionKey === "fruit") return "🍓";
    if (optionKey === "iceCreamFlavor") return "🍦";
    if (optionKey === "sauce") return "🍫";
    if (optionKey === "includedTopping") return "✨";
    return "•";
  }

  private optionGroupLabel(option: NonNullable<Product["requiredOptions"]>[number]) {
    if (option.key === "fruit") return "Frutas";
    if (option.key === "iceCreamFlavor") return "Helados";
    if (option.key === "sauce") return "Salsas";
    if (option.key === "includedTopping") return "Toppings";
    return option.label;
  }

  private buildRequiredOptionQuestionText(draft: OrderDraft, focus: RequiredOptionFocus) {
    if (this.isWaffleItem(focus.item)) {
      const waffleLabel = this.requiredOptionItemLabel(draft, focus.item);
      if (focus.option.key === "fruit") {
        const sameProductCount = draft.items.filter((item) => item.productName === focus.item.productName).length;
        const variant = focus.item.productName === "Waffle Chocolate" ? "de chocolate" : "tradicional";
        const firstWaffleIndex = draft.items.findIndex((item) => this.isWaffleItem(item));

        if (focus.itemIndex === firstWaffleIndex) {
          return sameProductCount > 1
            ? `Listo, los ${sameProductCount} waffles ${variant}. Vamos con el ${waffleLabel} 😊 ¿Qué fruta quieres?`
            : `Listo. Vamos con el ${waffleLabel} 😊 ¿Qué fruta quieres?`;
        }

        return `Vamos con el ${waffleLabel} 😊 ¿Qué fruta quieres?`;
      }
      if (focus.option.key === "iceCreamFlavor") {
        return `Perfecto 😊 ¿Qué sabor de helado para el ${waffleLabel}?`;
      }
      if (focus.option.key === "sauce") {
        return `¿Qué salsa le ponemos al ${waffleLabel}?`;
      }
    }

    if (focus.product.name === "Fresas con helado" && focus.option.key === "iceCreamFlavor") {
      return "Para las fresas con helado, ¿qué sabor de helado quieres?";
    }

    return `Para ${focus.item.productName}, ¿qué ${focus.option.label} quieres?`;
  }

  private buildRequiredOptionChoiceLine(option: NonNullable<Product["requiredOptions"]>[number]) {
    if (option.key === "fruit") {
      return "Opciones: Fresa, Durazno, Banano, Kiwi, Mango o Maracuya.";
    }
    if (option.key === "iceCreamFlavor") {
      return "Opciones: Fresa, Chocolate, Vainilla u Oreo.";
    }
    if (option.key === "sauce") {
      return "Opciones: Arequipe, Leche Condensada, Salsa Hershey, Dulce de mora o Nutella.";
    }
    if (option.key === "includedTopping") {
      return "Opciones: Oreo, Brownie, Milo, Merengue, Chips de Chocolate, Krispi, Mym, Chokis o Coco.";
    }
    return option.options.length ? `Opciones: ${this.formatHumanList(option.options)}.` : "";
  }

  private buildCompletedRequiredOptionPrefix(draft: OrderDraft, focus: RequiredOptionFocus) {
    if (!this.isFirstMissingOptionForItem(focus)) {
      return "";
    }

    const previousItem = draft.items
      .slice(0, focus.itemIndex)
      .reverse()
      .find((item) => this.hasRequiredOptions(item) && this.itemRequiredOptionsAreComplete(item));
    if (!previousItem) {
      return "";
    }

    const label = this.requiredOptionItemLabel(draft, previousItem);
    const options = this.formatSelectedRequiredOptions(previousItem);
    if (!options) {
      return "";
    }

    return this.isWaffleItem(previousItem)
      ? `${this.capitalizeFirst(label)} listo: ${options}.`
      : `${previousItem.productName} listo: ${options}.`;
  }

  private isFirstMissingOptionForItem(focus: RequiredOptionFocus) {
    return focus.missingForItem[0]?.option.key === focus.option.key;
  }

  private hasRequiredOptions(item: OrderItem) {
    return Boolean(this.catalogService.findProductById(item.productId)?.requiredOptions?.length);
  }

  private itemRequiredOptionsAreComplete(item: OrderItem) {
    const product = this.catalogService.findProductById(item.productId);
    return (product?.requiredOptions ?? [])
      .filter((option) => option.required)
      .every((option) => (item.selectedOptions?.[option.key]?.length ?? 0) >= option.minSelections);
  }

  private formatSelectedRequiredOptions(item: OrderItem) {
    const product = this.catalogService.findProductById(item.productId);
    return (product?.requiredOptions ?? [])
      .flatMap((option) => item.selectedOptions?.[option.key] ?? [])
      .join(", ");
  }

  private requiredOptionItemLabel(draft: OrderDraft, item: OrderItem) {
    if (!this.isWaffleItem(item)) {
      return item.productName.toLowerCase();
    }

    const waffleItems = draft.items.filter((candidate) => this.isWaffleItem(candidate));
    const index = waffleItems.findIndex((candidate) => candidate.id === item.id);
    return `${this.ordinalWord(index + 1)} waffle`;
  }

  private ordinalWord(value: number) {
    const words: Record<number, string> = {
      1: "primer",
      2: "segundo",
      3: "tercer",
      4: "cuarto",
      5: "quinto"
    };
    return words[value] ?? `${value}.`;
  }

  private capitalizeFirst(value: string) {
    return value ? `${value[0].toUpperCase()}${value.slice(1)}` : value;
  }

  private formatHumanList(values: string[]) {
    if (values.length <= 1) {
      return values.join("");
    }
    return `${values.slice(0, -1).join(", ")} o ${values[values.length - 1]}`;
  }

  private buildRequiredOptionChoices(optionKeys: string[]) {
    const lines: string[] = [];
    if (optionKeys.includes("fruit")) {
      lines.push("- Frutas: Fresa, Durazno, Banano, Kiwi, Mango, Maracuya.");
    }
    if (optionKeys.includes("iceCreamFlavor")) {
      lines.push("- Helados: Fresa, Chocolate, Vainilla, Oreo.");
    }
    if (optionKeys.includes("sauce")) {
      lines.push("- Salsas: Arequipe, Leche Condensada, Salsa Hershey, Dulce de mora, Nutella.");
    }
    if (optionKeys.includes("includedTopping")) {
      lines.push("- Toppings: Oreo, Brownie, Milo, Merengue, Chips de Chocolate, Krispi, Mym, Chokis, Coco.");
    }

    return lines.length ? ["", "Opciones disponibles:", ...lines] : [];
  }

  private applyRequiredOptionAnswers(draft: OrderDraft, text: string) {
    const globalAnswers = this.extractRequiredOptionAnswers(text);
    const targetedWaffleItemIds = this.findTargetedWaffleItemIds(draft, text);
    const implicitTarget = targetedWaffleItemIds
      ? null
      : this.findImplicitRequiredOptionTarget(draft, text, globalAnswers);
    const allowOverwrite = this.isCorrectionText(text);

    for (const item of draft.items) {
      const product = this.catalogService.findProductById(item.productId);
      if (!product?.requiredOptions?.length) {
        continue;
      }
      if (
        targetedWaffleItemIds &&
        this.isWaffleItem(item) &&
        !targetedWaffleItemIds.has(item.id)
      ) {
        continue;
      }
      if (targetedWaffleItemIds && !this.isWaffleItem(item)) {
        continue;
      }
      if (implicitTarget && item.id !== implicitTarget.item.id) {
        continue;
      }

      const scopedText = this.scopeTextForRequiredOptions(item, text);
      const scopedAnswers = scopedText ? this.extractRequiredOptionAnswers(scopedText) : {};
      const answers = implicitTarget?.item.id === item.id
        ? globalAnswers
        : { ...globalAnswers, ...scopedAnswers };
      this.removeProductVariantFlavorCollision(item, text, answers);
      const allowedOptionKeys = implicitTarget?.item.id === item.id
        ? implicitTarget.optionKeys
        : null;

      item.selectedOptions ??= {};
      for (const option of product.requiredOptions) {
        if (!option.required) {
          continue;
        }
        if (allowedOptionKeys && !allowedOptionKeys.has(option.key)) {
          continue;
        }
        if (
          !allowOverwrite &&
          (item.selectedOptions[option.key]?.length ?? 0) >= option.minSelections
        ) {
          continue;
        }

        const answer = answers[option.key];
        if (answer) {
          item.selectedOptions[option.key] = [answer].slice(0, option.maxSelections);
        }
      }
    }
  }

  private applySameRequiredOptionsAsPrevious(draft: OrderDraft, text: string) {
    const normalized = this.normalizeForMatching(text);
    if (!/\b(igual|lo mismo|mismo)\b/.test(normalized)) {
      return false;
    }

    const focus = this.getRequiredOptionFocus(draft);
    if (!focus) {
      return false;
    }

    const source = draft.items
      .slice(0, focus.itemIndex)
      .reverse()
      .find(
        (item) =>
          item.productId === focus.item.productId &&
          this.itemRequiredOptionsAreComplete(item)
      );
    if (!source?.selectedOptions) {
      return false;
    }

    const product = this.catalogService.findProductById(focus.item.productId);
    focus.item.selectedOptions ??= {};
    for (const option of product?.requiredOptions ?? []) {
      if (option.required && source.selectedOptions[option.key]?.length) {
        focus.item.selectedOptions[option.key] = [...source.selectedOptions[option.key]].slice(
          0,
          option.maxSelections
        );
      }
    }

    return this.itemRequiredOptionsAreComplete(focus.item);
  }

  private buildAmbiguousRequiredOptionQuestion(draft: OrderDraft, text: string) {
    const focus = this.getRequiredOptionFocus(draft);
    if (!focus || focus.option.key !== "sauce") {
      return null;
    }

    const normalized = this.normalizeForMatching(text);
    const answers = this.extractRequiredOptionAnswers(text);
    if (
      answers.sauce ||
      !/\bchocolate\b/.test(normalized) ||
      /\b(hershey|nutella|salsa)\b/.test(normalized)
    ) {
      return null;
    }

    return "Cuando dices chocolate, ¿te refieres a Salsa Hershey o Nutella?";
  }

  private findImplicitRequiredOptionTarget(
    draft: OrderDraft,
    text: string,
    answers: Record<string, string>
  ) {
    const normalized = this.normalizeForMatching(text);
    if (
      !Object.keys(answers).length ||
      /\bwaffles?\b/.test(normalized) ||
      /\bfresas\b/.test(normalized)
    ) {
      return null;
    }

    const target = this.getMissingRequiredOptions(draft)
      .filter((entry) => answers[entry.option.key])
      .find((entry, index, list) => list.findIndex((item) => item.item.id === entry.item.id) === index)
      ?.item;
    if (!target) {
      return null;
    }

    const product = this.catalogService.findProductById(target.productId);
    const missingOptions = (product?.requiredOptions ?? [])
      .filter((option) => option.required)
      .filter((option) => (target.selectedOptions?.[option.key]?.length ?? 0) < option.minSelections)
      .filter((option) => answers[option.key]);
    if (missingOptions.length === 0) {
      return null;
    }

    const distinctValues = new Set(missingOptions.map((option) => answers[option.key]));
    const optionKeys =
      distinctValues.size === 1
        ? new Set([missingOptions[0].key])
        : new Set(missingOptions.map((option) => option.key));

    return {
      item: target,
      optionKeys
    };
  }

  private isCorrectionText(text: string) {
    const normalized = this.normalizeForMatching(text);
    return /\b(mejor|cambia|cambiar|corrige|corregir|que sea|no)\b/.test(normalized);
  }

  private removeProductVariantFlavorCollision(
    item: OrderItem,
    text: string,
    answers: Record<string, string>
  ) {
    const normalized = this.normalizeForMatching(text);
    if (
      item.productName === "Waffle Chocolate" &&
      answers.iceCreamFlavor === "Chocolate" &&
      /\bwaffles?\s+chocolate\b/.test(normalized) &&
      !/\b(helado|sabor)\s+(de\s+)?chocolate\b/.test(normalized)
    ) {
      delete answers.iceCreamFlavor;
    }
  }

  private findTargetedWaffleItemIds(draft: OrderDraft, text: string) {
    const normalized = this.normalizeForMatching(text);
    const ordinal = this.extractOrdinal(normalized);
    if (!/\bwaffles?\b/.test(normalized) && !(this.isCorrectionText(text) && ordinal !== null)) {
      return null;
    }

    const waffleSegment = normalized.match(
      /\bwaffles?\b(.+?)(?=\b(?:las|unas?|los)?\s*fresas\s+(?:con\s+helado|tradicionales?\s+con\s+helado)\b|$)/
    )?.[0] ?? normalized;
    const mentionsTraditional = /\btradicional(?:es)?\b/.test(waffleSegment);
    const mentionsChocolate = /\bchocolate\b/.test(waffleSegment);
    let candidates = draft.items.filter((item) => this.isWaffleItem(item));

    if (mentionsTraditional && !mentionsChocolate) {
      candidates = candidates.filter((item) => item.productName === "Waffle Tradicional");
    }
    if (mentionsChocolate && !mentionsTraditional) {
      candidates = candidates.filter((item) => item.productName === "Waffle Chocolate");
    }

    if (ordinal !== null) {
      const target = candidates[ordinal - 1];
      return target ? new Set([target.id]) : new Set<string>();
    }

    if (candidates.length === 1) {
      return new Set([candidates[0].id]);
    }

    return null;
  }

  private extractOrdinal(text: string) {
    const match = text.match(/\b(primer|primero|1|1er|segundo|2|tercer|tercero|3)\b/);
    if (!match?.[1]) {
      return null;
    }

    const ordinals: Record<string, number> = {
      primer: 1,
      primero: 1,
      "1": 1,
      "1er": 1,
      segundo: 2,
      "2": 2,
      tercer: 3,
      tercero: 3,
      "3": 3
    };
    return ordinals[match[1]] ?? null;
  }

  private isWaffleItem(item: OrderItem) {
    return item.productName === "Waffle Tradicional" || item.productName === "Waffle Chocolate";
  }

  private buildWaffleVariantHelpIfNeeded(draft: OrderDraft, text: string) {
    const normalized = this.normalizeForMatching(text);
    const asksOptions =
      /\b(no se|opciones|cuales|que hay|como asi)\b/.test(normalized) &&
      !this.extractWaffleVariantCounts(text);
    if (!asksOptions) {
      return null;
    }

    const traditionalWaffle = draft.items.find((item) => item.productName === "Waffle Tradicional");
    const chocolateWaffle = draft.items.find((item) => item.productName === "Waffle Chocolate");
    if (!traditionalWaffle || chocolateWaffle || traditionalWaffle.quantity < 2) {
      return null;
    }

    return `Tenemos waffles tradicionales y waffles de chocolate. Para los ${traditionalWaffle.quantity} waffles dime cuantos quieres de cada uno, por ejemplo: dos tradicionales y uno chocolate.`;
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
      ...Array.from({ length: counts.traditional }, () =>
        this.toOrderItem({
          producto: "Waffle Tradicional",
          cantidad: 1
        })
      ),
      ...Array.from({ length: counts.chocolate }, () =>
        this.toOrderItem({
          producto: "Waffle Chocolate",
          cantidad: 1
        })
      )
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
      new RegExp(`(?:^|\\s)(\\d+|un|uno|una|dos|tres|cuatro|cinco)\\s+(?:waffles?\\s+)?(?:de\\s+)?${variant}(?:es)?\\b`)
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
      const labeledAnswer = this.extractLabeledRequiredOptionAnswer(text, option);
      if (labeledAnswer) {
        answers[option.key] = labeledAnswer;
        continue;
      }

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

  private extractLabeledRequiredOptionAnswer(
    text: string,
    option: NonNullable<Product["requiredOptions"]>[number]
  ) {
    const labelPatterns: Record<string, string> = {
      fruit: "frutas?",
      iceCreamFlavor: "(?:sabor(?:es)? de helado|helado)",
      sauce: "salsas?",
      includedTopping: "toppings?"
    };
    const labelPattern = labelPatterns[option.key];
    if (!labelPattern) {
      return null;
    }

    const normalizedText = this.normalizeForMatching(text);
    const labelMatch = normalizedText.match(new RegExp(`\\b${labelPattern}\\b`));
    if (labelMatch?.index === undefined) {
      return null;
    }

    const afterLabel = normalizedText.slice(labelMatch.index + labelMatch[0].length);
    const nextLabel = afterLabel.search(
      /\b(?:frutas?|sabor(?:es)? de helado|helado|salsas?|toppings?)\b/
    );
    const punctuation = afterLabel.search(/[,;]/);
    const boundaries = [nextLabel, punctuation].filter((index) => index >= 0);
    const segment = boundaries.length > 0
      ? afterLabel.slice(0, Math.min(...boundaries))
      : afterLabel;

    return option.options.find((value) => this.findOptionMentionIndex(segment, value) >= 0) ?? null;
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
    const candidates = [
      normalizedValue,
      normalizedValue.startsWith("salsa ") ? normalizedValue.replace(/^salsa\s+/, "") : null
    ].filter((candidate): candidate is string => Boolean(candidate));
    const match = candidates
      .map((candidate) =>
        normalizedText.match(new RegExp(`(^|\\s)${this.escapeRegExp(candidate)}(\\s|$)`))
      )
      .find((candidateMatch) => Boolean(candidateMatch));
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
        const label = this.formatSelectedOptionLabel(product, key);
        return values.map((value) => `${label}: ${value}`);
      });
    const removals = item.components
      .filter((component) => component.type === "removed")
      .map((component) => `sin ${component.name}`);
    const details = [...options, ...removals].join("; ");
    const optionsText = details ? ` (${details})` : "";

    return `- ${item.quantity} x ${item.productName}${optionsText}: ${this.money(
      item.unitBasePrice * item.quantity
    )}`;
  }

  private formatSelectedOptionLabel(product: Product | null | undefined, key: string) {
    const productLabel = product?.requiredOptions?.find((option) => option.key === key)?.label;
    if (productLabel) {
      return productLabel;
    }

    const fallbackLabels: Record<string, string> = {
      fruit: "fruta",
      iceCreamFlavor: "sabor de helado",
      sauce: "salsa",
      toppingChoice: "topping"
    };

    return fallbackLabels[key] ?? key;
  }

  private normalizeForMatching(value: string) {
    return value
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\p{L}0-9]+/gu, " ")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/\bwafle\b/g, "waffle")
      .replace(/\bwafles\b/g, "waffles")
      .replace(/\bhersey\b/g, "hershey")
      .replace(/\barekipe\b/g, "arequipe")
      .replace(/\bbankolombia\b/g, "bancolombia")
      .replace(/\bbilla santos\b/g, "villa santos");
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
    if (missingFields.includes("direccion")) lines.push("Dirección:");
    if (missingFields.includes("barrio")) lines.push("Barrio:");
    if (missingFields.includes("referencia")) lines.push("Referencia:");
    if (missingFields.includes("metodo_pago")) {
      lines.push("Método de pago: Nequi, Bancolombia, Bre-B o efectivo");
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
