import { env } from "../config/env.js";
import { buildInterpretConversationTurnPrompt } from "../prompts/interpretConversationTurn.prompt.js";
import type {
  Business,
  ConversationState,
  Intent,
  MessageClassification
} from "../types/index.js";
import { LlmJsonService } from "./llm-json.service.js";
import { MessageClassifierService } from "./message-classifier.service.js";

type Planner = NonNullable<MessageClassification["planner"]>;
type PlannerAction = Planner["action"];
type PlannerAmbiguity = NonNullable<Planner["ambiguity"]>;

const validIntents: Intent[] = [
  "greeting",
  "place_order",
  "ask_menu",
  "ask_hours",
  "ask_payment_methods",
  "ask_delivery_zones",
  "ask_recommendation",
  "business_question",
  "modify_order",
  "cancel_order",
  "talk_to_human",
  "small_talk",
  "unknown"
];

const validPlannerActions = [
  "continue_order",
  "answer_question",
  "collect_delivery",
  "ask_clarification",
  "unknown"
] as const;

const validAmbiguityTypes = [
  "target_item",
  "catalog_option",
  "product",
  "required_option",
  "none"
] as const;

const emptyClassification: MessageClassification = {
  intent: "unknown",
  source: "heuristic",
  planner: null,
  extracted: {
    items: [],
    customerName: null,
    address: null,
    zone: null,
    paymentMethod: null,
    notes: null
  },
  missingFields: [],
  confidence: 0.2
};

export class ConversationInterpreterService {
  constructor(
    private readonly llmJsonService = new LlmJsonService(),
    private readonly fallbackClassifier = new MessageClassifierService()
  ) {}

  async interpret(input: {
    message: string;
    business: Business;
    state: ConversationState;
    aiUsageCount: number;
    catalogContext: string;
    memoryContext: string;
    draftContext: string;
  }): Promise<MessageClassification> {
    if (input.aiUsageCount >= env.AI_MAX_CALLS_PER_CONVERSATION) {
      return this.fallbackClassifier.classify(
        input.message,
        input.business,
        input.state,
        input.aiUsageCount,
        input.catalogContext,
        input.memoryContext
      );
    }

    const prompt = buildInterpretConversationTurnPrompt(input);
    const aiResult = await this.llmJsonService.generateJson<MessageClassification>(prompt);

    if (aiResult.data) {
      return this.sanitizeClassification(aiResult.data, aiResult.source);
    }

    if (env.AI_STRICT_PROVIDER && aiResult.source !== "heuristic") {
      return {
        ...emptyClassification,
        source: aiResult.source,
        confidence: 0
      };
    }

    return this.fallbackClassifier.classify(
      input.message,
      input.business,
      input.state,
      input.aiUsageCount,
      input.catalogContext,
      input.memoryContext
    );
  }

  private sanitizeClassification(
    classification: Partial<MessageClassification>,
    source: MessageClassification["source"]
  ): MessageClassification {
    const extracted = classification.extracted ?? emptyClassification.extracted;
    const rawItems = Array.isArray(extracted.items) ? extracted.items : [];
    const intent = validIntents.includes(classification.intent as Intent)
      ? (classification.intent as Intent)
      : "unknown";
    const items =
      intent === "place_order" || intent === "modify_order"
        ? rawItems
            .filter((item) => item && typeof item === "object")
            .map((item) => ({
              productName: this.cleanNullableString(item.productName) ?? "",
              quantity: this.cleanQuantity(item.quantity),
              additions: this.cleanStringArray(item.additions),
              removals: this.cleanStringArray(item.removals),
              notes: this.cleanNullableString(item.notes)
            }))
        : [];

    return {
      ...emptyClassification,
      ...classification,
      source,
      intent,
      confidence: Number.isFinite(classification.confidence)
        ? Number(classification.confidence)
        : emptyClassification.confidence,
      planner: this.sanitizePlanner(classification.planner),
      missingFields: this.cleanStringArray(classification.missingFields),
      extracted: {
        customerName: this.cleanNullableString(extracted.customerName),
        address: this.cleanNullableString(extracted.address),
        zone: this.cleanNullableString(extracted.zone),
        paymentMethod: this.cleanNullableString(extracted.paymentMethod),
        notes: this.cleanNullableString(extracted.notes),
        items
      }
    };
  }

  private cleanNullableString(value: unknown) {
    return typeof value === "string" && value.trim() ? value.trim() : null;
  }

  private sanitizePlanner(value: unknown): MessageClassification["planner"] {
    if (!value || typeof value !== "object") {
      return null;
    }

    const planner = value as Record<string, unknown>;
    const rawAction = typeof planner.action === "string" ? planner.action : "unknown";
    const action = validPlannerActions.includes(rawAction as (typeof validPlannerActions)[number])
      ? rawAction as PlannerAction
      : "unknown";
    const rawAmbiguity =
      planner.ambiguity && typeof planner.ambiguity === "object"
        ? planner.ambiguity as Record<string, unknown>
        : null;
    const rawAmbiguityType = typeof rawAmbiguity?.type === "string"
      ? rawAmbiguity.type
      : "none";
    const ambiguityType = validAmbiguityTypes.includes(
      rawAmbiguityType as (typeof validAmbiguityTypes)[number]
    )
      ? rawAmbiguityType as PlannerAmbiguity["type"]
      : "none";

    return {
      action,
      targetItemIndex: this.cleanNullableNumber(planner.targetItemIndex),
      targetProductName: this.cleanNullableString(planner.targetProductName),
      requestedComponent: this.cleanNullableString(planner.requestedComponent),
      ambiguity: rawAmbiguity
        ? {
            type: ambiguityType,
            candidates: this.cleanStringArray(rawAmbiguity.candidates).slice(0, 8),
            question: this.cleanNullableString(rawAmbiguity.question)
          }
        : null
    };
  }

  private cleanNullableNumber(value: unknown) {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  }

  private cleanStringArray(value: unknown) {
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
      .map((entry) => entry.trim());
  }

  private cleanQuantity(value: unknown) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
  }
}
