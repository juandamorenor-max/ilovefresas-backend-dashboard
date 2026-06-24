import { z } from "zod";
import { buildOrderAgentRouterPrompt, buildSpecialistAgentPrompt, type OrderAgentName } from "../prompts/multiAgentOrderEngine.prompt.js";
import type { Business, Conversation, DeliveryZone, ModifierOption, OrderDraft, Product } from "../types/index.js";
import { logger } from "../utils/logger.js";
import { LlmJsonService, type LlmJsonSource } from "./llm-json.service.js";
import { engineOutputSchema, type OpenAIOrderEngineOutput } from "./openai-order-engine.service.js";

const routerOutputSchema = z.object({
  agent: z.enum([
    "menu_agent",
    "order_builder_agent",
    "customer_data_agent",
    "ambiguity_agent",
    "post_order_agent",
    "handoff_agent",
    "small_talk_agent"
  ]),
  confidence: z.number().min(0).max(1),
  reason: z.string()
});

type RouterOutput = z.infer<typeof routerOutputSchema>;

export class MultiAgentOrderEngineService {
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
    agent: OrderAgentName | null;
  }> {
    const context = this.buildContext(input);
    const router = await this.route(context, input.conversation.id);
    if (!router.output) {
      return {
        result: null,
        source: router.source,
        error: router.error,
        agent: null
      };
    }

    const specialist = await this.runSpecialist(context, router.output.agent, input.conversation.id);
    return {
      ...specialist,
      agent: router.output.agent
    };
  }

  private async route(
    context: ReturnType<MultiAgentOrderEngineService["buildContext"]>,
    conversationId: string
  ): Promise<{ output: RouterOutput | null; source: LlmJsonSource; error: string | null }> {
    const prompt = buildOrderAgentRouterPrompt(context);
    let source: LlmJsonSource = this.llmJsonService.getProvider();
    let lastError = "Multi-agent router returned empty or invalid JSON";

    for (let attempt = 0; attempt <= 1; attempt += 1) {
      const aiResult = await this.llmJsonService.generateJson<unknown>(prompt);
      source = aiResult.source;

      const parsed = routerOutputSchema.safeParse(aiResult.data);
      if (parsed.success) {
        logger.info("Multi-agent router selected specialist", {
          conversationId,
          agent: parsed.data.agent,
          confidence: parsed.data.confidence,
          reason: parsed.data.reason,
          source
        });
        return { output: parsed.data, source, error: null };
      }

      lastError = parsed.error.message;
      logger.warn("Multi-agent router returned invalid schema", {
        conversationId,
        attempt,
        source,
        error: parsed.error.message
      });
    }

    return { output: null, source, error: lastError };
  }

  private async runSpecialist(
    context: ReturnType<MultiAgentOrderEngineService["buildContext"]>,
    agent: OrderAgentName,
    conversationId: string
  ): Promise<{ result: OpenAIOrderEngineOutput | null; source: LlmJsonSource; error: string | null }> {
    const prompt = buildSpecialistAgentPrompt(context, agent);
    let source: LlmJsonSource = this.llmJsonService.getProvider();
    let lastError = `Multi-agent specialist ${agent} returned empty or invalid JSON`;

    for (let attempt = 0; attempt <= 1; attempt += 1) {
      const aiResult = await this.llmJsonService.generateJson<unknown>(prompt);
      source = aiResult.source;

      const parsed = engineOutputSchema.safeParse(aiResult.data);
      if (parsed.success) {
        logger.info("Multi-agent specialist produced engine output", {
          conversationId,
          agent,
          intent: parsed.data.intent,
          source
        });
        return { result: parsed.data, source, error: null };
      }

      lastError = parsed.error.message;
      logger.warn("Multi-agent specialist returned invalid schema", {
        conversationId,
        agent,
        attempt,
        source,
        error: parsed.error.message
      });
    }

    return { result: null, source, error: lastError };
  }

  private buildContext(input: {
    currentMessage: string;
    business: Business;
    conversation: Conversation;
    activeOrder: { id: string; status: string } | null;
    draftOrder: OrderDraft | null;
    products: Product[];
    modifiers: ModifierOption[];
    zones: DeliveryZone[];
  }) {
    return {
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
        "El backend valida IDs, precios, pagos, adjuntos y cierre seguro; el agente redacta la respuesta conversacional al cliente.",
        "El agente debe extraer barrio/zona como setNeighborhood y referencia como setAddressReference. El backend valida barrio; el agente no inventa ni asigna zoneId."
      ]
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
