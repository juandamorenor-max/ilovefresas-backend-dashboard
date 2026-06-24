import { z } from "zod";
import { buildOpenAIOrderEnginePrompt } from "../prompts/openAIOrderEngine.prompt.js";
import type { Business, Conversation, DeliveryZone, ModifierOption, OrderDraft, Product } from "../types/index.js";
import { logger } from "../utils/logger.js";
import { LlmJsonService, type LlmJsonSource } from "./llm-json.service.js";

function coerceNullableString(value: unknown) {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (Array.isArray(value)) {
    const primitiveValues = value.filter(
      (entry): entry is string | number | boolean =>
        ["string", "number", "boolean"].includes(typeof entry)
    );
    return primitiveValues.length ? primitiveValues.map(String).join(" ") : null;
  }

  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const key of ["value", "text", "address", "rawAddress", "name", "label"]) {
      if (typeof record[key] === "string" && record[key].trim()) {
        return record[key];
      }
    }
    return null;
  }

  return null;
}

const nullableStringSchema = z.preprocess(
  coerceNullableString,
  z.string().nullable()
);

const stringArraySchema = z.preprocess((value) => {
  if (value === null || value === undefined) {
    return [];
  }

  if (Array.isArray(value)) {
    return value.map((entry) => String(entry));
  }

  return [String(value)];
}, z.array(z.string()));

const selectedOptionsSchema = z.record(stringArraySchema).default({});

const nullablePositiveIntSchema = z.preprocess(
  (value) => (value === null || value === undefined ? null : value),
  z.coerce.number().int().positive().nullable()
);

const nullableIntSchema = z.preprocess(
  (value) => (value === null || value === undefined ? null : value),
  z.coerce.number().int().nullable()
);

const nullableFulfillmentTypeSchema = z.preprocess(
  (value) => (value === null || value === undefined || value === "" ? null : value),
  z.enum(["delivery", "pickup"]).nullable()
);

const arraySchema = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess(
    (value) => (value === null || value === undefined ? [] : value),
    z.array(schema)
  ).default([]);

const pendingSelectionSchema = z.object({
  type: z.enum(["required_option", "modifier_clarification", "product_clarification", "catalog_choice"]),
  targetItemId: nullableStringSchema,
  targetProductId: nullableStringSchema,
  label: z.string(),
  options: stringArraySchema,
  blocking: z.boolean(),
  question: z.string()
});

export const engineOutputSchema = z.object({
  intent: z.enum([
    "order_update",
    "catalog_question",
    "answer_pending_selection",
    "delivery_info",
    "payment_info",
    "small_talk",
    "business_question",
    "cancel",
    "human_handoff",
    "unknown"
  ]),
  confidence: z.number().min(0).max(1),
  understood: z.string(),
  draftPatch: z.object({
    addItems: arraySchema(z.object({
      productId: z.string(),
      quantity: z.coerce.number().int().positive().default(1),
      modifierIds: stringArraySchema,
      selectedOptions: selectedOptionsSchema,
      removals: stringArraySchema,
      notes: nullableStringSchema
    })),
    updateItems: arraySchema(z.object({
      targetItemId: nullableStringSchema,
      targetItemIndex: nullablePositiveIntSchema,
      modifierIdsToAdd: stringArraySchema,
      selectedOptions: selectedOptionsSchema,
      removals: stringArraySchema,
      quantity: nullablePositiveIntSchema,
      quantityDelta: nullableIntSchema,
      notes: nullableStringSchema
    })),
    removeItems: arraySchema(z.object({
      targetItemId: nullableStringSchema,
      targetItemIndex: nullablePositiveIntSchema
    })),
    setCustomerName: nullableStringSchema,
    setAddress: nullableStringSchema,
    setNeighborhood: nullableStringSchema,
    setAddressReference: nullableStringSchema,
    setZoneId: nullableStringSchema,
    possibleNeighborhoodText: nullableStringSchema,
    possibleLandmarkText: nullableStringSchema,
    possibleCityText: nullableStringSchema,
    rawAddressText: nullableStringSchema,
    setFulfillmentType: nullableFulfillmentTypeSchema,
    setPaymentMethod: nullableStringSchema,
    setCashAmount: nullableStringSchema,
    setNotes: nullableStringSchema,
    createPendingSelections: arraySchema(pendingSelectionSchema),
    resolvePendingSelections: stringArraySchema
  }),
  pendingSelections: arraySchema(pendingSelectionSchema),
  catalogAnswer: z.object({
    topic: z.enum(["modifiers", "flavors", "products", "price", "menu", "none"]),
    targetProductId: nullableStringSchema,
    answer: nullableStringSchema
  }),
  replyToCustomer: z.string(),
  needsHuman: z.boolean(),
  humanReason: nullableStringSchema,
  safeToApply: z.boolean()
});

export type OpenAIOrderEngineOutput = z.infer<typeof engineOutputSchema>;

export class OpenAIOrderEngineService {
  constructor(private readonly llmJsonService = new LlmJsonService()) {}

  async interpret(input: {
    currentMessage: string;
    business: Business;
    conversation: Conversation;
    activeOrder: { id: string; status: string } | null;
    draftOrder: OrderDraft | null;
    products: Product[];
    modifiers: ModifierOption[];
    zones: DeliveryZone[];
  }): Promise<{
    result: OpenAIOrderEngineOutput | null;
    source: LlmJsonSource;
    error: string | null;
  }> {
    const prompt = buildOpenAIOrderEnginePrompt({
      currentMessage: input.currentMessage,
      recentMessages: input.conversation.memory?.recentMessages?.map((message) => ({
        role: message.role,
        text: message.text
      })) ?? [],
      conversationState: input.conversation.state,
      activeOrder: input.activeOrder,
      draftOrder: this.summarizeDraft(input.draftOrder),
      pendingSelections: input.draftOrder?.pendingSelections ?? [],
      catalog: {
        products: input.products.map((product) => ({
          id: product.id,
          name: product.name,
          aliases: product.aliases,
          category: product.category,
          basePrice: product.basePrice,
          isActive: product.isActive,
          isOutOfStock: product.isOutOfStock,
          availabilityStatus: !product.isActive
            ? "hidden"
            : product.isOutOfStock
              ? "out_of_stock"
              : "available",
          modifierGroupIds: product.modifierGroupIds,
          defaultComponents: product.defaultComponents,
          requiredOptions: product.requiredOptions ?? []
        })),
        modifiers: input.modifiers.map((modifier) => ({
          id: modifier.id,
          name: modifier.name,
          aliases: modifier.aliases,
          priceDelta: modifier.priceDelta
        })),
        zones: input.zones.map((zone) => ({
          id: zone.id,
          name: zone.name,
          aliases: zone.aliases,
          fee: zone.fee
        })),
        paymentMethods: input.business.paymentMethods
      },
      businessRules: [
        "El backend calcula total y domicilio.",
        "El backend valida IDs, precios, pagos, adjuntos y cierre seguro; OpenAI redacta la respuesta conversacional al cliente.",
        "OpenAI debe extraer barrio/zona como setNeighborhood y referencia como setAddressReference. El backend valida el barrio contra la base local de barrios de Barranquilla; OpenAI no inventa ni asigna zoneId."
      ]
    });

    let source: LlmJsonSource = this.llmJsonService.getProvider();
    let lastError = "OpenAIOrderEngine returned empty or invalid JSON";

    for (let attempt = 0; attempt <= 1; attempt += 1) {
      const aiResult = await this.llmJsonService.generateJson<unknown>(prompt);
      source = aiResult.source;

      if (!aiResult.data) {
        lastError = "OpenAIOrderEngine returned empty or invalid JSON";
        logger.warn("OpenAIOrderEngine returned no parseable data", {
          attempt,
          maxEngineRetries: 1,
          source
        });
        continue;
      }

      const parsed = engineOutputSchema.safeParse(aiResult.data);
      if (!parsed.success) {
        lastError = parsed.error.message;
        logger.warn("OpenAIOrderEngine returned invalid schema", {
          attempt,
          maxEngineRetries: 1,
          source,
          error: parsed.error.message
        });
        continue;
      }

      return {
        result: parsed.data,
        source,
        error: null
      };
    }

    return {
      result: null,
      source,
      error: lastError
    };
  }

  private summarizeDraft(draft: OrderDraft | null) {
    if (!draft) {
      return null;
    }

    return {
      id: draft.id,
      items: draft.items.map((item, index) => ({
        id: item.id,
        index: index + 1,
        productId: item.productId,
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
        notes: item.notes
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
      pendingSelections: draft.pendingSelections,
      blockingIssue: draft.blockingIssue,
      deliveryFeePending: draft.fulfillmentType === "delivery" && draft.pricing.deliveryFee <= 0,
      pricing: draft.pricing
    };
  }

}
