import { demoStore } from "../data/demoStore.js";
import { persistRuntimeStore } from "../data/runtime-store.js";
import type { Conversation, Message, Order, OrderItem } from "../types/index.js";
import { env } from "../config/env.js";
import { createId, nowIso } from "../utils/id.js";
import { HttpError } from "../utils/http.js";
import { TelegramService } from "./telegram.service.js";
import { WhatsAppService } from "./whatsapp.service.js";

type DashboardStatus =
  | "pending"
  | "confirmed"
  | "preparing"
  | "dispatched"
  | "completed"
  | "cancelled";

const statusToDashboard: Record<Order["status"], DashboardStatus> = {
  pending_review: "pending",
  confirmed: "confirmed",
  preparing: "preparing",
  dispatched: "dispatched",
  completed: "completed",
  cancelled: "cancelled"
};

const statusToBackend: Record<DashboardStatus, Order["status"]> = {
  pending: "pending_review",
  confirmed: "confirmed",
  preparing: "preparing",
  dispatched: "dispatched",
  completed: "completed",
  cancelled: "cancelled"
};

export class AdminDashboardService {
  constructor(
    private readonly telegramService = new TelegramService(),
    private readonly whatsAppService = new WhatsAppService()
  ) {}

  listDashboardOrders() {
    return demoStore.orders
      .slice()
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((order) => this.toDashboardOrder(order));
  }

  getDashboardOrder(orderId: string) {
    const order = demoStore.orders.find((entry) => entry.id === orderId);
    return order ? this.toDashboardOrder(order) : null;
  }

  updateDashboardOrder(orderId: string, patch: Record<string, unknown>) {
    const order = demoStore.orders.find((entry) => entry.id === orderId);
    if (!order) {
      return null;
    }

    if (typeof patch.address === "string") {
      order.address = patch.address.trim() || order.address;
    }

    if (typeof patch.payment === "string") {
      order.paymentMethod = this.normalizePaymentMethod(patch.payment);
    }

    if (typeof patch.note === "string") {
      order.notes = patch.note.trim() || null;
    }

    if (patch.deliveryFee !== undefined) {
      const deliveryFee = Math.max(0, Number(patch.deliveryFee));
      order.pricing.deliveryFee = deliveryFee;
      order.pricing.total = order.pricing.subtotal - order.pricing.discountTotal + deliveryFee;
    }

    order.updatedAt = new Date().toISOString();
    persistRuntimeStore();
    return this.toDashboardOrder(order);
  }

  updateDashboardOrderStatus(orderId: string, status: string, internalNotes?: string | null) {
    const order = demoStore.orders.find((entry) => entry.id === orderId);
    const backendStatus = this.toBackendStatus(status);
    if (!order || !backendStatus) {
      return null;
    }

    order.status = backendStatus;
    if (internalNotes !== undefined) {
      order.internalNotes = internalNotes;
    }
    order.updatedAt = new Date().toISOString();
    if (backendStatus === "completed") {
      this.closeConversationForCompletedOrder(order);
    }
    persistRuntimeStore();
    return this.toDashboardOrder(order);
  }

  async confirmOrderAndNotify(orderId: string, payload: { deliveryFee?: number; note?: string }) {
    const order = demoStore.orders.find((entry) => entry.id === orderId);
    if (!order) {
      return null;
    }

    if (!order.customerName || !order.paymentMethod) {
      throw new HttpError(400, "Order is missing customer name or payment method");
    }

    if (order.fulfillmentType === "delivery" && (!order.address || !order.zoneName || !order.addressReference)) {
      throw new HttpError(400, "Order is missing delivery address, neighborhood or reference");
    }

    const deliveryFee = order.fulfillmentType === "delivery"
      ? Math.max(0, Number(payload.deliveryFee ?? order.pricing.deliveryFee ?? 0))
      : 0;

    if (order.fulfillmentType === "delivery" && deliveryFee <= 0) {
      throw new HttpError(400, "Delivery fee is required before confirming");
    }

    order.pricing.deliveryFee = deliveryFee;
    order.pricing.total = order.pricing.subtotal - order.pricing.discountTotal + deliveryFee;
    order.status = "confirmed";
    order.internalNotes = [
      order.internalNotes,
      "Pedido confirmado y notificado al cliente desde dashboard.",
      payload.note?.trim() || null
    ].filter(Boolean).join(" ");
    order.updatedAt = nowIso();

    const customerMessage = this.buildCustomerConfirmationMessage(order);
    await this.sendCustomerMessage(order.customerPhone, customerMessage);
    this.saveBotMessageForOrder(order, customerMessage);

    persistRuntimeStore();
    return this.toDashboardOrder(order);
  }

  async markDispatchNotified(orderId: string) {
    const order = demoStore.orders.find((entry) => entry.id === orderId);
    if (!order) {
      return null;
    }

    const customerMessage = "Tu pedido ha sido enviado! Va en camino.";
    await this.sendCustomerMessage(order.customerPhone, customerMessage);
    this.saveBotMessageForOrder(order, customerMessage);

    order.status = "dispatched";
    const notice = "Cliente avisado de despacho desde dashboard.";
    order.internalNotes = order.internalNotes
      ? order.internalNotes.includes(notice)
        ? order.internalNotes
        : `${order.internalNotes} ${notice}`
      : notice;
    order.updatedAt = new Date().toISOString();
    persistRuntimeStore();
    return this.toDashboardOrder(order);
  }

  async sendConversationMessage(conversationId: string, text: string) {
    const conversation = demoStore.conversations.find((entry) => entry.id === conversationId);
    if (!conversation) {
      return null;
    }

    const message = text.trim();
    if (!message) {
      throw new HttpError(400, "Message text is required");
    }

    await this.sendCustomerMessage(conversation.customerPhone, message);
    this.saveBotMessageForConversation(conversation, message);
    persistRuntimeStore();
    return this.toDashboardConversation(conversation);
  }

  setConversationBotPause(conversationId: string, payload: { paused: boolean; minutes?: number; reason?: string }) {
    const conversation = demoStore.conversations.find((entry) => entry.id === conversationId);
    if (!conversation) {
      return null;
    }

    if (payload.paused) {
      const minutes = Math.max(1, Number(payload.minutes ?? 30));
      conversation.botPausedUntil = new Date(Date.now() + minutes * 60_000).toISOString();
      conversation.botPausedReason = payload.reason?.trim() || "Pausado por operario";
      conversation.state = "pending_human";
    } else {
      conversation.botPausedUntil = null;
      conversation.botPausedReason = null;
      if (conversation.state === "pending_human") {
        if (conversation.draftOrder) {
          conversation.draftOrder.blockingIssue = null;
        }
        conversation.state = conversation.draftOrder?.items.length ? "collecting_items" : "idle";
      }
    }

    conversation.updatedAt = nowIso();
    persistRuntimeStore();
    return this.toDashboardConversation(conversation);
  }

  setGlobalBotPause(payload: { paused: boolean; minutes?: number; reason?: string }) {
    const business = demoStore.businesses[0];
    if (payload.paused) {
      const minutes = Math.max(1, Number(payload.minutes ?? 30));
      business.status.botPausedUntil = new Date(Date.now() + minutes * 60_000).toISOString();
      business.status.botPausedReason = payload.reason?.trim() || "Pausado desde dashboard";
    } else {
      business.status.botPausedUntil = null;
      business.status.botPausedReason = null;
    }

    business.updatedAt = nowIso();
    persistRuntimeStore();
    return business.status;
  }

  private async sendCustomerMessage(customerPhone: string, message: string) {
    if (customerPhone.startsWith("telegram:")) {
      if (!env.TELEGRAM_CLIENT_BOT_TOKEN) {
        throw new HttpError(400, "Telegram client bot token is not configured");
      }

      const chatId = customerPhone.replace(/^telegram:/, "");
      await this.telegramService.sendMessage(env.TELEGRAM_CLIENT_BOT_TOKEN, chatId, message);
      return;
    }

    const whatsappTo = customerPhone.replace(/^whatsapp:/, "");
    await this.whatsAppService.sendTextMessage(whatsappTo, message);
  }

  private buildCustomerConfirmationMessage(order: Order) {
    const customerFirstName = order.customerName?.trim().split(/\s+/)[0] ?? "cliente";
    const summaryItems = order.items.flatMap((item) => {
      const productLine = `- ${item.quantity} x ${item.productName} - ${this.money(item.unitBasePrice * item.quantity)}`;
      const options = Object.entries(item.selectedOptions ?? {}).flatMap(([label, values]) =>
        values.length ? [`  - ${label}: ${values.join(", ")}`] : []
      );
      const additions = item.components
        .filter((component) => component.type === "added")
        .map((component) => `  - Adicion: ${component.name} - ${this.money(component.priceDelta)}`);
      const removals = item.components
        .filter((component) => component.type === "removed")
        .map((component) => `  - Sin: ${component.name}`);

      return [productLine, ...options, ...additions, ...removals];
    });
    const paymentNote = this.buildDashboardPaymentNote(order.paymentMethod);

    return [
      `Confirmado, ${customerFirstName}.`,
      "",
      "Tu pedido quedo confirmado asi:",
      "",
      "Pedido",
      ...summaryItems,
      "",
      "Datos",
      `Nombre: ${order.customerName ?? "Por confirmar"}`,
      order.fulfillmentType === "delivery" ? `Direccion: ${order.address ?? "Por confirmar"}` : "Entrega: Recoger en punto",
      order.fulfillmentType === "delivery" ? `Barrio: ${order.zoneName ?? "Por confirmar"}` : null,
      order.fulfillmentType === "delivery" ? `Referencia: ${order.addressReference ?? "Por confirmar"}` : null,
      `Metodo de pago: ${order.paymentMethod ?? "Por confirmar"}`,
      "",
      `Productos: ${this.money(order.pricing.subtotal)}`,
      order.fulfillmentType === "delivery" ? `Domicilio: ${this.money(order.pricing.deliveryFee)}` : null,
      `Total final: ${this.money(order.pricing.total)}`,
      "",
      paymentNote,
      "Gracias por tu pedido. Te avisamos cuando salga a despacho."
    ].filter(Boolean).join("\n");
  }

  private money(value: number) {
    return value.toLocaleString("es-CO", {
      style: "currency",
      currency: "COP",
      maximumFractionDigits: 0
    });
  }

  private buildDashboardPaymentNote(paymentMethod: string | null) {
    const normalized = paymentMethod?.toLowerCase() ?? "";
    if (normalized.includes("nequi")) {
      return "Cuando realices el pago por Nequi, envianos el comprobante para continuar con el despacho.";
    }
    if (normalized.includes("bancolombia") || normalized.includes("banco")) {
      return "Cuando realices el pago por Bancolombia, envianos el comprobante para continuar con el despacho.";
    }
    if (normalized.includes("contra entrega") || normalized.includes("efectivo")) {
      return "Recuerda que tu pedido es contraentrega. Te avisaremos una vez sea enviado.";
    }
    return null;
  }

  private buildPaymentStatusLabel(order: Order) {
    if (!order.paymentMethod) {
      return "Pago pendiente";
    }

    if (order.paymentMethod === "Contra entrega") {
      return "Pago contra entrega";
    }

    return order.paymentProofReceived
      ? "Comprobante recibido, pendiente de verificacion"
      : "Falta comprobante";
  }

  private saveBotMessageForOrder(order: Order, text: string) {
    const conversation = this.findConversationForOrder(order);
    if (!conversation) {
      return;
    }

    this.saveBotMessageForConversation(conversation, text);
  }

  private saveBotMessageForConversation(conversation: Conversation, text: string) {
    const timestamp = nowIso();
    const message: Message = {
      id: createId("msg"),
      createdAt: timestamp,
      updatedAt: timestamp,
      businessId: conversation.businessId,
      conversationId: conversation.id,
      customerPhone: conversation.customerPhone,
      role: "bot",
      text
    };

    demoStore.messages.push(message);
    conversation.memory.recentMessages.push({ role: "bot", text, createdAt: timestamp });
    conversation.memory.recentMessages = conversation.memory.recentMessages.slice(-24);
    conversation.updatedAt = timestamp;
    persistRuntimeStore();
  }

  listDashboardConversations() {
    return demoStore.conversations
      .slice()
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map((conversation) => this.toDashboardConversation(conversation));
  }

  getDashboardConversation(conversationId: string) {
    const conversation = demoStore.conversations.find((entry) => entry.id === conversationId);
    return conversation ? this.toDashboardConversation(conversation) : null;
  }

  toBackendStatus(status: string): Order["status"] | null {
    return statusToBackend[status as DashboardStatus] ?? null;
  }

  private toDashboardOrder(order: Order) {
    const risk = this.calculateRisk(order);
    const conversation = this.findConversationForOrder(order);

    return {
      id: order.id,
      displayNumber: this.getOrderDisplayNumber(order.id),
      customer: order.customerName ?? "Cliente pendiente",
      phone: order.customerPhone,
      channel: this.inferChannel(order.customerPhone),
      address: order.address ?? "Direccion pendiente",
      zone: order.zoneName ?? "Por confirmar",
      addressReference: order.addressReference ?? null,
      payment: order.paymentMethod ?? "Pendiente",
      paymentProofReceived: order.paymentProofReceived,
      paymentProofNote: order.paymentProofNote,
      paymentStatusLabel: this.buildPaymentStatusLabel(order),
      total: order.pricing.total,
      subtotal: order.pricing.subtotal,
      delivery: order.pricing.deliveryFee,
      status: statusToDashboard[order.status],
      backendStatus: order.status,
      urgent: order.status === "pending_review" || risk !== "Bajo",
      age: this.formatAge(order.createdAt),
      risk,
      note:
        [order.notes, order.addressReference ? `Referencia: ${order.addressReference}` : null, order.internalNotes]
          .filter(Boolean)
          .join(" ") || "Sin notas.",
      items: order.items.map((item) => this.formatItem(item)),
      lineItems: order.items.map((item) => this.toDashboardLineItem(item)),
      dispatchNotified: Boolean(order.internalNotes?.includes("Cliente avisado de despacho")),
      blockingIssue: conversation?.draftOrder?.blockingIssue ?? null,
      conversationId: conversation?.id ?? null,
      updatedAt: order.updatedAt,
      createdAt: order.createdAt
    };
  }

  private getOrderDisplayNumber(orderId: string) {
    const orderedIds = demoStore.orders
      .slice()
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
      .map((order) => order.id);
    const index = orderedIds.indexOf(orderId);
    return index >= 0 ? index : orderedIds.length;
  }

  private toDashboardLineItem(item: OrderItem) {
    const components = item.components ?? [];
    const selectedOptions = Object.entries(item.selectedOptions ?? {})
      .filter(([, values]) => values.length > 0)
      .map(([label, values]) => ({
        label,
        value: this.formatSelectedOptionValues(item, label, values)
      }));
    const additions = components
      .filter((component) => component.type === "added" || component.type === "replaced")
      .map((component) => ({
        name: component.name,
        price: component.priceDelta * item.quantity
      }));
    const removals = components
      .filter((component) => component.type === "removed")
      .map((component) => component.name);
    const componentDelta = components.reduce((sum, component) => {
      if (component.type === "removed") {
        return sum;
      }
      return sum + component.priceDelta;
    }, 0);
    const baseTotal = item.unitBasePrice * item.quantity;
    const total = (item.unitBasePrice + componentDelta) * item.quantity;
    const notes = Array.isArray(item.notes) ? item.notes.join(", ") : item.notes;

    return {
      id: item.id,
      productId: item.productId,
      productName: item.productName,
      quantity: item.quantity,
      unitBasePrice: item.unitBasePrice,
      baseTotal,
      additions,
      removals,
      selectedOptions,
      notes,
      total,
      priceStatus: item.unitBasePrice > 0 ? "priced" : "review_required"
    };
  }

  private formatSelectedOptionValues(item: OrderItem, optionKey: string, values: string[]) {
    const quantityMap = item.selectedOptionQuantities?.[optionKey] ?? {};
    const entries = Object.entries(quantityMap).filter(([, quantity]) => quantity > 0);

    if (entries.length > 0) {
      return entries
        .map(([value, quantity]) => (quantity > 1 ? `${value} x${quantity}` : value))
        .join(", ");
    }

    return values.join(", ");
  }

  private toDashboardConversation(conversation: Conversation) {
    const messages = demoStore.messages
      .filter((message) => message.conversationId === conversation.id)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const fallbackMessages = conversation.memory.recentMessages.map((message) => ({
      role: message.role,
      text: message.text,
      createdAt: message.createdAt
    }));
    const displayMessages = messages.length
      ? messages.map((message) => this.toDashboardMessage(message))
      : fallbackMessages.map((message) => this.toDashboardMessage(message));
    const relatedOrder = this.findLatestOrderForCustomer(conversation.customerPhone);
    const lastMessage = displayMessages[displayMessages.length - 1];
    const latestPostOrderEvent = (conversation.postOrderEvents ?? [])
      .slice()
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null;
    const botPaused = Boolean(
      conversation.botPausedUntil && new Date(conversation.botPausedUntil).getTime() > Date.now()
    );
    const human = Boolean(
      conversation.draftOrder?.blockingIssue ||
        conversation.state === "pending_human" ||
        relatedOrder?.status === "pending_review" ||
        latestPostOrderEvent?.needsHuman ||
        botPaused
    );

    return {
      id: conversation.id,
      name: relatedOrder?.customerName ?? this.maskCustomer(conversation.customerPhone),
      meta: `${conversation.customerPhone} - ${this.inferChannel(conversation.customerPhone)}`,
      state:
        latestPostOrderEvent?.needsHuman
          ? "Intervencion post-envio requerida"
          : conversation.draftOrder?.blockingIssue ?? this.describeConversationState(conversation),
      human,
      botPausedUntil: conversation.botPausedUntil,
      botPausedReason: conversation.botPausedReason,
      postOrderEvent: latestPostOrderEvent,
      last: lastMessage?.text ?? "Sin mensajes registrados",
      orderId: relatedOrder?.id ?? conversation.activeOrderId,
      messages: displayMessages.map((message) => [message.type, message.text])
    };
  }

  private toDashboardMessage(message: Pick<Message, "role" | "text">) {
    return {
      type: message.role === "customer" ? "user" : message.role,
      text: message.text
    };
  }

  private formatItem(item: OrderItem) {
    const components = item.components ?? [];
    const additions = components
      .filter((component) => component.type === "added")
      .map((component) => component.name);
    const removals = components
      .filter((component) => component.type === "removed")
      .map((component) => `sin ${component.name}`);
    const selectedOptions = Object.entries(item.selectedOptions ?? {})
      .filter(([, values]) => values.length > 0)
      .map(([key, values]) => `${key}: ${values.join(", ")}`);
    const modifiers = [...selectedOptions, ...additions, ...removals];
    const notes = Array.isArray(item.notes) ? item.notes.join(", ") : item.notes;
    return [
      `${item.productName} x${item.quantity}`,
      modifiers.length ? modifiers.join(", ") : null,
      notes
    ]
      .filter(Boolean)
      .join(" - ");
  }

  private calculateRisk(order: Order) {
    if (order.status === "cancelled") {
      return "Cancelado";
    }

    if (!order.address || !order.zoneName || !order.addressReference) {
      return "Direccion";
    }

    if (!order.paymentMethod) {
      return "Pago";
    }

    if (order.paymentMethod !== "Contra entrega" && !order.paymentProofReceived) {
      return "Comprobante";
    }

    if (order.cashAmount && order.cashAmount !== "exacto") {
      return `Cambio ${order.cashAmount}`;
    }

    if (order.status === "pending_review") {
      return "Revision";
    }

    return "Bajo";
  }

  private findConversationForOrder(order: Order) {
    return (
      demoStore.conversations.find((conversation) => conversation.activeOrderId === order.id) ??
      this.findLatestConversationForCustomer(order.customerPhone)
    );
  }

  private closeConversationForCompletedOrder(order: Order) {
    const conversation = this.findConversationForOrder(order);
    if (!conversation) {
      return;
    }

    const timestamp = nowIso();
    conversation.state = "post_order_closed";
    conversation.activeOrderId = null;
    conversation.draftOrder = null;
    conversation.botPausedUntil = null;
    conversation.botPausedReason = null;
    conversation.postOrderEvents ??= [];
    conversation.postOrderEvents.push({
      id: createId("postevt"),
      createdAt: timestamp,
      updatedAt: timestamp,
      orderId: order.id,
      type: "conversation_close",
      orderStatus: order.status,
      severity: "low",
      handledByBot: true,
      needsHuman: false,
      humanReason: null,
      customerMessage: "[dashboard] Pedido marcado como completado",
      suggestedAction: null
    });
    conversation.updatedAt = timestamp;
    persistRuntimeStore();
  }

  private findLatestConversationForCustomer(customerPhone: string) {
    return demoStore.conversations
      .filter((conversation) => conversation.customerPhone === customerPhone)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] ?? null;
  }

  private findLatestOrderForCustomer(customerPhone: string) {
    return demoStore.orders
      .filter((order) => order.customerPhone === customerPhone)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] ?? null;
  }

  private inferChannel(customerPhone: string) {
    return customerPhone.startsWith("telegram:") ? "Telegram" : "WhatsApp";
  }

  private normalizePaymentMethod(value: string) {
    const normalized = value.trim().toLowerCase();
    if (normalized.includes("nequi")) return "Nequi";
    if (normalized.includes("banco") || normalized.includes("bancol")) return "Bancolombia";
    if (normalized.includes("efectivo") || normalized.includes("contra entrega")) {
      return "Contra entrega";
    }
    return value.trim();
  }

  private describeConversationState(conversation: Conversation) {
    if (conversation.state === "pending_human") return "Operario debe revisar";
    if (conversation.state === "collecting_delivery_details") return "Recolectando datos";
    if (conversation.state === "post_order_closed") return "Conversacion cerrada post-envio";
    if (conversation.state === "completed") return "Pedido en revision";
    if (conversation.state === "cancelled") return "Cancelado";
    return "Conversacion activa";
  }

  private maskCustomer(customerPhone: string) {
    return customerPhone.replace(/^telegram:/, "Telegram ");
  }

  private formatAge(createdAt: string) {
    const diffMs = Date.now() - new Date(createdAt).getTime();
    const diffMinutes = Math.max(0, Math.floor(diffMs / 60000));
    if (diffMinutes < 1) return "Ahora";
    if (diffMinutes < 60) return `${diffMinutes} min`;
    const hours = Math.floor(diffMinutes / 60);
    const minutes = diffMinutes % 60;
    return minutes ? `${hours} h ${minutes} min` : `${hours} h`;
  }
}
