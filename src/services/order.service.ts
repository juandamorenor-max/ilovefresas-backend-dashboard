import { demoStore } from "../data/demoStore.js";
import { persistRuntimeStore } from "../data/runtime-store.js";
import { createId, nowIso } from "../utils/id.js";
import type { Conversation, Order, OrderDraft, OrderItem } from "../types/index.js";
import { PricingService } from "./pricing.service.js";
import { AccountingLedgerService } from "./accounting-ledger.service.js";

export class OrderService {
  constructor(
    private readonly pricingService = new PricingService(),
    private readonly accountingLedgerService = new AccountingLedgerService()
  ) {}

  createEmptyDraft(businessId: string, customerPhone: string): OrderDraft {
    return {
      id: createId("draft"),
      businessId,
      customerPhone,
      items: [],
      fulfillmentType: "delivery",
      customerName: null,
      address: null,
      neighborhood: null,
      neighborhoodValidationAttempts: 0,
      lastInvalidNeighborhood: null,
      addressReference: null,
      inferredZoneId: null,
      paymentMethod: null,
      paymentProofReceived: false,
      paymentProofNote: null,
      cashAmount: null,
      notes: null,
      pendingSelections: [],
      blockingIssue: null,
      pricing: {
        subtotal: 0,
        deliveryFee: 0,
        discountTotal: 0,
        total: 0
      }
    };
  }

  addItem(draft: OrderDraft, item: OrderItem) {
    draft.items.push(item);
    draft.pricing = this.pricingService.calculateDraftPricing(draft);
    return draft;
  }

  refreshDraft(draft: OrderDraft) {
    draft.pricing = this.pricingService.calculateDraftPricing(draft);
    return draft;
  }

  createOrderFromConversation(conversation: Conversation): Order | null {
    if (!conversation.draftOrder) {
      return null;
    }

    const timestamp = nowIso();
    const zone = conversation.draftOrder.inferredZoneId
      ? demoStore.deliveryZones.find((item) => item.id === conversation.draftOrder?.inferredZoneId)
      : null;

    const order: Order = {
      id: createId("order"),
      createdAt: timestamp,
      updatedAt: timestamp,
      businessId: conversation.businessId,
      customerPhone: conversation.customerPhone,
      fulfillmentType: conversation.draftOrder.fulfillmentType,
      customerName: conversation.draftOrder.customerName,
      address: conversation.draftOrder.address,
      neighborhood: conversation.draftOrder.neighborhood ?? null,
      addressReference: conversation.draftOrder.addressReference ?? null,
      zoneName: conversation.draftOrder.neighborhood ?? zone?.name ?? null,
      paymentMethod: conversation.draftOrder.paymentMethod,
      paymentProofReceived: conversation.draftOrder.paymentProofReceived,
      paymentProofNote: conversation.draftOrder.paymentProofNote,
      cashAmount: conversation.draftOrder.cashAmount,
      notes: conversation.draftOrder.notes,
      items: conversation.draftOrder.items,
      pricing: conversation.draftOrder.pricing,
      status: "pending_review",
      internalNotes: this.buildInternalNotes(conversation.draftOrder)
    };

    demoStore.orders.push(order);
    persistRuntimeStore();
    return order;
  }

  listOrders() {
    return demoStore.orders;
  }

  findOrder(orderId: string) {
    return demoStore.orders.find((order) => order.id === orderId) ?? null;
  }

  syncOrderFromDraft(orderId: string, draft: OrderDraft, internalNote?: string) {
    const order = this.findOrder(orderId);
    if (!order) {
      return null;
    }

    const zone = draft.inferredZoneId
      ? demoStore.deliveryZones.find((item) => item.id === draft.inferredZoneId)
      : null;
    const generatedNotes = this.buildInternalNotes(draft);

    order.fulfillmentType = draft.fulfillmentType;
    order.customerName = draft.customerName;
    order.address = draft.address;
    order.neighborhood = draft.neighborhood ?? null;
    order.addressReference = draft.addressReference ?? null;
    order.zoneName = draft.neighborhood ?? zone?.name ?? null;
    order.paymentMethod = draft.paymentMethod;
    order.paymentProofReceived = draft.paymentProofReceived;
    order.paymentProofNote = draft.paymentProofNote;
    order.cashAmount = draft.cashAmount;
    order.notes = draft.notes;
    order.items = draft.items;
    order.pricing = draft.pricing;
    order.internalNotes = [generatedNotes, internalNote].filter(Boolean).join(" ") || null;
    order.updatedAt = nowIso();

    persistRuntimeStore();
    return order;
  }

  updateOrderStatus(orderId: string, status: Order["status"], internalNotes?: string | null) {
    const order = this.findOrder(orderId);
    if (!order) {
      return null;
    }

    order.status = status;
    if (internalNotes !== undefined) {
      order.internalNotes = internalNotes;
    }
    order.updatedAt = nowIso();
    persistRuntimeStore();
    if (status === "dispatched") {
      void this.accountingLedgerService.recordDispatchedOrder(order);
    }
    return order;
  }

  private buildInternalNotes(draft: OrderDraft) {
    const notes: string[] = [];

    if (draft.paymentMethod && draft.paymentMethod !== "Contra entrega") {
      notes.push(
        draft.paymentProofReceived
          ? "Comprobante recibido; operario debe verificarlo antes de confirmar."
          : "Pago pendiente de verificacion/comprobante."
      );
      if (draft.paymentProofNote) {
        notes.push(`Nota de comprobante: ${draft.paymentProofNote}.`);
      }
    }

    if (draft.paymentMethod === "Contra entrega" && draft.cashAmount) {
      notes.push(`Cliente paga con: ${draft.cashAmount}.`);
    }

    if (draft.fulfillmentType === "pickup") {
      notes.push("Cliente recoge en tienda.");
    }

    if (draft.fulfillmentType === "delivery" && draft.addressReference) {
      notes.push(`Referencia: ${draft.addressReference}.`);
    }

    const zone = draft.inferredZoneId
      ? demoStore.deliveryZones.find((item) => item.id === draft.inferredZoneId)
      : null;
    if (draft.fulfillmentType === "delivery" && zone && zone.fee <= 0) {
      notes.push(`Domicilio para ${zone.name} pendiente de configurar/verificar.`);
    }

    return notes.length ? notes.join(" ") : null;
  }
}
