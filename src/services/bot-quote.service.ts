import { createHash } from "node:crypto";
import { demoStore } from "../data/demoStore.js";
import { persistRuntimeStore } from "../data/runtime-store.js";
import type { BotQuote, OrderDraft, OrderItem, ProductRequiredOption } from "../types/index.js";
import { HttpError } from "../utils/http.js";
import { createId, nowIso } from "../utils/id.js";
import { CatalogService } from "./catalog.service.js";
import { OrderService } from "./order.service.js";

export interface BotQuoteItemInput {
  id?: string;
  productId?: string;
  productName?: string;
  producto?: string;
  quantity?: number;
  cantidad?: number;
  selectedOptions?: Record<string, string[] | string>;
  modifierIds?: string[];
  modifiers?: string[];
  toppings?: string[];
  adiciones?: string[];
  notes?: string | null;
}

export interface CreateBotQuoteInput {
  sessionId?: string;
  conversationId?: string;
  items?: BotQuoteItemInput[];
  fulfillmentType?: "delivery" | "pickup";
  neighborhood?: string;
}

export interface ConfirmBotOrderInput {
  quoteId?: string;
  sessionId?: string;
  conversationId?: string;
  items?: BotQuoteItemInput[];
  customer?: {
    name?: string;
    phone?: string;
    address?: string;
    neighborhood?: string;
    reference?: string;
  };
  nombre?: string;
  telefono?: string;
  direccion?: string;
  barrio?: string;
  referencia?: string;
  paymentMethod?: string;
  metodo_pago?: string;
  paymentProof?: { received?: boolean; note?: string } | null;
  comprobante?: { recibido?: boolean; nota?: string } | null;
}

const QUOTE_TTL_MS = 15 * 60 * 1000;

export class BotQuoteService {
  constructor(
    private readonly catalogService = new CatalogService(),
    private readonly orderService = new OrderService()
  ) {}

  createQuote(input: CreateBotQuoteInput) {
    const items = Array.isArray(input.items) ? input.items : [];
    const blockingErrors: string[] = [];
    const normalizedItems = items.flatMap((item, index) => {
      const normalized = this.normalizeItem(item, index, blockingErrors);
      return normalized ? [normalized] : [];
    });

    if (normalizedItems.length === 0) {
      blockingErrors.push("order_has_no_valid_items");
    }

    const fulfillmentType = input.fulfillmentType === "pickup" ? "pickup" : "delivery";
    const neighborhood = input.neighborhood?.trim() || null;
    const draft = this.buildDraft(normalizedItems, fulfillmentType, neighborhood);
    const fingerprint = this.quoteFingerprint(normalizedItems, fulfillmentType, neighborhood);
    const timestamp = nowIso();
    const quote: BotQuote = {
      id: createId("quote"),
      createdAt: timestamp,
      updatedAt: timestamp,
      businessId: demoStore.businesses[0].id,
      conversationId: this.resolveConversationId(input.conversationId, input.sessionId),
      requestFingerprint: fingerprint,
      fulfillmentType,
      neighborhood,
      normalizedItems,
      pricing: draft.pricing,
      expiresAt: new Date(Date.now() + QUOTE_TTL_MS).toISOString(),
      consumedAt: null
    };

    if (blockingErrors.length === 0) {
      demoStore.botQuotes.push(quote);
      persistRuntimeStore();
    }

    return {
      quoteId: blockingErrors.length === 0 ? quote.id : "",
      expiresAt: blockingErrors.length === 0 ? quote.expiresAt : "",
      normalizedItems,
      subtotal: draft.pricing.subtotal,
      deliveryFee: draft.pricing.deliveryFee,
      discount: draft.pricing.discountTotal,
      total: draft.pricing.total,
      blockingErrors
    };
  }

  confirmOrder(input: ConfirmBotOrderInput) {
    const quote = demoStore.botQuotes.find((entry) => entry.id === input.quoteId);
    if (!quote) throw new HttpError(404, "Quote not found");
    if (quote.consumedAt) throw new HttpError(409, "Quote already consumed");
    if (Date.parse(quote.expiresAt) <= Date.now()) throw new HttpError(409, "Quote expired");
    this.assertQuoteStillValid(quote);

    const conversationId = this.resolveConversationId(
      input.conversationId ?? quote.conversationId ?? undefined,
      input.sessionId
    );
    const conversation = demoStore.conversations.find((entry) => entry.id === conversationId);
    if (!conversation) throw new HttpError(404, "Conversation not found for quote");
    if (quote.conversationId && quote.conversationId !== conversation.id) {
      throw new HttpError(409, "Quote belongs to another conversation");
    }

    if (Array.isArray(input.items)) {
      const verification = this.createVerificationFingerprint(input.items, quote);
      if (verification !== quote.requestFingerprint) {
        throw new HttpError(409, "Order items changed after quote");
      }
    }

    const customer = input.customer ?? {};
    const paymentMethod = String(input.paymentMethod ?? input.metodo_pago ?? "").trim();
    const proofReceived = Boolean(input.paymentProof?.received ?? input.comprobante?.recibido);
    const proofNote = input.paymentProof?.note ?? input.comprobante?.nota ?? null;
    const requiresProof = this.paymentMethodRequiresProof(paymentMethod);
    if (requiresProof && !proofReceived) {
      throw new HttpError(409, "Payment proof is required before confirming this order");
    }

    const draft = this.buildDraft(
      structuredClone(quote.normalizedItems),
      quote.fulfillmentType,
      customer.neighborhood ?? input.barrio ?? quote.neighborhood
    );
    draft.customerName = String(customer.name ?? input.nombre ?? "").trim() || null;
    draft.address = String(customer.address ?? input.direccion ?? "").trim() || null;
    draft.neighborhood = String(customer.neighborhood ?? input.barrio ?? "").trim() || null;
    draft.addressReference = String(customer.reference ?? input.referencia ?? "").trim() || null;
    draft.paymentMethod = paymentMethod || null;
    draft.paymentProofReceived = proofReceived;
    draft.paymentProofNote = proofNote;

    const missing = this.finalOrderMissingFields(draft);
    if (missing.length > 0) {
      throw new HttpError(409, `Confirmed order is incomplete: ${missing.join(", ")}`);
    }

    conversation.draftOrder = draft;
    const order = this.orderService.createOrderFromConversation(conversation);
    if (!order) throw new HttpError(409, "Unable to create order from quote");

    conversation.activeOrderId = order.id;
    conversation.state = "pending_human";
    conversation.updatedAt = nowIso();
    quote.consumedAt = nowIso();
    quote.updatedAt = quote.consumedAt;
    persistRuntimeStore();
    return order;
  }

  private normalizeItem(input: BotQuoteItemInput, index: number, errors: string[]): OrderItem | null {
    const product = input.productId
      ? this.catalogService.findProductById(input.productId)
      : this.catalogService.findProductByNameOrAlias(input.productName ?? input.producto ?? "");
    if (!product) {
      errors.push(`unknown_product:${input.productId ?? input.productName ?? input.producto ?? index}`);
      return null;
    }
    if (!product.isActive || product.isOutOfStock) {
      errors.push(`unavailable_product:${product.id}`);
      return null;
    }

    const quantity = Math.max(1, Math.trunc(Number(input.quantity ?? input.cantidad ?? 1)));
    if ((product.requiredOptions?.length ?? 0) > 0 && quantity !== 1) {
      errors.push(`configurable_product_requires_unit_items:${product.id}`);
    }

    const selectedOptions: Record<string, string[]> = {};
    for (const option of product.requiredOptions ?? []) {
      const raw = input.selectedOptions?.[option.key];
      const values = (Array.isArray(raw) ? raw : raw ? [raw] : [])
        .map((value) => this.canonicalOption(option, value))
        .filter((value): value is string => Boolean(value));
      const unique = [...new Set(values)].slice(0, option.maxSelections);
      if (option.required && unique.length < option.minSelections) {
        errors.push(`missing_required_option:${product.id}:${index}:${option.key}`);
      }
      if (unique.length > 0) selectedOptions[option.key] = unique;
    }

    const requestedModifiers = [
      ...(input.modifierIds ?? []),
      ...(input.modifiers ?? []),
      ...(input.toppings ?? []),
      ...(input.adiciones ?? [])
    ];
    const components = requestedModifiers.flatMap((value) => {
      const modifier = this.catalogService.findModifierOptionById(value) ??
        this.catalogService.findModifierOptionByNameOrAlias(value);
      if (!modifier || !modifier.isActive) {
        errors.push(`unavailable_modifier:${value}`);
        return [];
      }
      return [{ name: modifier.name, type: "added" as const, priceDelta: modifier.priceDelta }];
    });

    return {
      id: input.id?.trim() || createId("item"),
      productId: product.id,
      productName: product.name,
      quantity,
      unitBasePrice: product.basePrice,
      components,
      selectedOptions,
      notes: input.notes?.trim() || null
    };
  }

  private buildDraft(
    items: OrderItem[],
    fulfillmentType: "delivery" | "pickup",
    neighborhood: string | null
  ) {
    const draft = this.orderService.createEmptyDraft(demoStore.businesses[0].id, "quote");
    draft.items = items;
    draft.fulfillmentType = fulfillmentType;
    draft.neighborhood = neighborhood;
    const zone = neighborhood ? this.catalogService.inferDeliveryZone(neighborhood) : null;
    draft.inferredZoneId = zone?.id ?? null;
    return this.orderService.refreshDraft(draft);
  }

  private createVerificationFingerprint(items: BotQuoteItemInput[], quote: BotQuote) {
    const errors: string[] = [];
    const normalizedItems = items.flatMap((item, index) => {
      const normalized = this.normalizeItem(item, index, errors);
      return normalized ? [normalized] : [];
    });
    if (errors.length > 0) return "invalid";
    return this.quoteFingerprint(normalizedItems, quote.fulfillmentType, quote.neighborhood);
  }

  private finalOrderMissingFields(draft: OrderDraft) {
    const missing: string[] = [];
    if (draft.items.length === 0) missing.push("items");
    if (!draft.customerName) missing.push("name");
    if (!draft.paymentMethod) missing.push("paymentMethod");
    if (draft.fulfillmentType === "delivery") {
      if (!draft.address) missing.push("address");
      if (!draft.neighborhood) missing.push("neighborhood");
      if (!draft.addressReference) missing.push("reference");
    }
    return missing;
  }

  private assertQuoteStillValid(quote: BotQuote) {
    for (const item of quote.normalizedItems) {
      const product = this.catalogService.findProductById(item.productId);
      if (!product || !product.isActive || product.isOutOfStock) {
        throw new HttpError(409, `Quoted product is no longer available: ${item.productId}`);
      }
      if (product.basePrice !== item.unitBasePrice) {
        throw new HttpError(409, `Quoted product price changed: ${item.productId}`);
      }
      for (const required of product.requiredOptions ?? []) {
        const selected = item.selectedOptions?.[required.key] ?? [];
        if (required.required && selected.length < required.minSelections) {
          throw new HttpError(409, `Quoted item lost required option: ${item.id}:${required.key}`);
        }
        if (selected.some((value) => !this.canonicalOption(required, value))) {
          throw new HttpError(409, `Quoted option is no longer valid: ${item.id}:${required.key}`);
        }
      }
      for (const component of item.components.filter((entry) => entry.type === "added")) {
        const modifier = this.catalogService.findModifierOptionByNameOrAlias(component.name);
        if (!modifier || !modifier.isActive || modifier.priceDelta !== component.priceDelta) {
          throw new HttpError(409, `Quoted modifier changed: ${component.name}`);
        }
      }
    }

    const recalculated = this.buildDraft(
      structuredClone(quote.normalizedItems),
      quote.fulfillmentType,
      quote.neighborhood
    ).pricing;
    if (this.fingerprint(recalculated) !== this.fingerprint(quote.pricing)) {
      throw new HttpError(409, "Quoted totals changed");
    }
  }

  private paymentMethodRequiresProof(paymentMethod: string) {
    const normalized = this.normalize(paymentMethod);
    return demoStore.businesses[0].paymentMethodSettings.some(
      (method) => method.requiresProof &&
        [method.name, ...method.aliases].some((value) => this.normalize(value) === normalized)
    );
  }

  private canonicalOption(option: ProductRequiredOption, value: string) {
    const normalized = this.normalize(value);
    return option.options.find((candidate) => this.normalize(candidate) === normalized) ?? null;
  }

  private resolveConversationId(conversationId?: string, sessionId?: string) {
    const direct = String(conversationId ?? "").trim();
    if (direct) return direct;
    const session = String(sessionId ?? "").trim();
    return session ? session.split(":").at(-1) ?? null : null;
  }

  private fingerprint(value: unknown) {
    const normalized = this.stableStringify(value);
    return createHash("sha256").update(normalized).digest("hex");
  }

  private quoteFingerprint(
    items: OrderItem[],
    fulfillmentType: "delivery" | "pickup",
    neighborhood: string | null
  ) {
    return this.fingerprint({
      fulfillmentType,
      neighborhood,
      items: items.map(({ id: _id, ...item }) => item)
    });
  }

  private stableStringify(value: unknown): string {
    if (Array.isArray(value)) {
      return `[${value.map((entry) => this.stableStringify(entry)).join(",")}]`;
    }
    if (value && typeof value === "object") {
      return `{${Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => `${JSON.stringify(key)}:${this.stableStringify(entry)}`)
        .join(",")}}`;
    }
    return JSON.stringify(value) ?? "null";
  }

  private normalize(value: string) {
    return value.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  }
}
