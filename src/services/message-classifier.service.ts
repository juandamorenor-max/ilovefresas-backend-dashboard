import { env } from "../config/env.js";
import { buildClassificationPrompt } from "../prompts/classifyUserMessage.prompt.js";
import type {
  Business,
  ConversationState,
  MessageClassification
} from "../types/index.js";
import { LlmJsonService } from "./llm-json.service.js";

const emptyClassification: MessageClassification = {
  intent: "unknown",
  source: "heuristic",
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

export class MessageClassifierService {
  constructor(private readonly llmJsonService = new LlmJsonService()) {}

  async classify(
    message: string,
    business: Business,
    state: ConversationState,
    aiUsageCount: number,
    catalogContext: string,
    memoryContext = ""
  ): Promise<MessageClassification> {
    if (aiUsageCount >= env.AI_MAX_CALLS_PER_CONVERSATION) {
      return this.classifyHeuristically(message);
    }

    const prompt = buildClassificationPrompt(message, business, state, catalogContext, memoryContext);
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

    return this.classifyHeuristically(message);
  }

  private sanitizeClassification(
    classification: Partial<MessageClassification>,
    source: MessageClassification["source"]
  ): MessageClassification {
    const extracted = classification.extracted ?? emptyClassification.extracted;
    const rawItems = Array.isArray(extracted.items) ? extracted.items : [];

    return {
      ...emptyClassification,
      ...classification,
      source,
      intent: classification.intent ?? emptyClassification.intent,
      confidence: Number.isFinite(classification.confidence)
        ? Number(classification.confidence)
        : emptyClassification.confidence,
      missingFields: this.cleanStringArray(classification.missingFields),
      extracted: {
        customerName: this.cleanNullableString(extracted.customerName),
        address: this.cleanNullableString(extracted.address),
        zone: this.cleanNullableString(extracted.zone),
        paymentMethod: this.cleanNullableString(extracted.paymentMethod),
        notes: this.cleanNullableString(extracted.notes),
        items: rawItems
          .filter((item) => item && typeof item === "object")
          .map((item) => ({
            productName: this.cleanNullableString(item.productName) ?? "",
            quantity: this.cleanQuantity(item.quantity),
            additions: this.cleanStringArray(item.additions),
            removals: this.cleanStringArray(item.removals),
            notes: this.cleanNullableString(item.notes)
          }))
      }
    };
  }

  private cleanNullableString(value: unknown) {
    return typeof value === "string" && value.trim() ? value.trim() : null;
  }

  private cleanStringArray(value: unknown) {
    if (!Array.isArray(value)) {
      return [];
    }

    return value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
      .map((entry) => entry.trim());
  }

  private cleanQuantity(value: unknown) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
  }

  private classifyHeuristically(message: string): MessageClassification {
    const lower = this.normalizeForMatching(message);

    if (/^(hola+|buenas|buenos dias|buenas tardes|buenas noches|hey|holi|hello|hi)[!. ]*$/.test(lower)) {
      return { ...emptyClassification, intent: "greeting", confidence: 0.95 };
    }

    if (
      /\b(menu|catalogo)\b/.test(lower) &&
      /\b(wow|cool|brutal|bacano|bacana|bueno|buenos|rico|ricos|se ve|se ven|antoja|antojo)\b/.test(lower)
    ) {
      return { ...emptyClassification, intent: "small_talk", confidence: 0.85 };
    }

    if (/\b(menu|catalogo)\b/.test(lower)) {
      return { ...emptyClassification, intent: "ask_menu", confidence: 0.95 };
    }

    if (
      /\b(toppings?|adiciones?|adicionales?|salsas?|sabores?|frutas?|opciones?|helado)\b/.test(lower) &&
      /\b(que|cual|cuales|tienes|manejan|hay|opciones|sabores|dime|cuentame)\b/.test(lower)
    ) {
      return { ...emptyClassification, intent: "business_question", confidence: 0.9 };
    }

    if (
      /\b(promo|promocion|2x1|descuento|premio|premios|ganaron|ganado|famosos|famosas|mejores de|mejor de|clientes tienen|cuantos clientes|cuantas personas)\b/.test(
        lower
      )
    ) {
      return { ...emptyClassification, intent: "business_question", confidence: 0.85 };
    }

    if (
      /\b(primera vez|nuevo comprando|nueva comprando|nunca he pedido|nunca he comprado|nunca les he pedido|nunca les he comprado|no he comprado|soy nuevo|soy nueva)\b/.test(
        lower
      )
    ) {
      return { ...emptyClassification, intent: "small_talk", confidence: 0.85 };
    }

    if (/\b(cancela|cancelar|ya no)\b/.test(lower)) {
      return { ...emptyClassification, intent: "cancel_order", confidence: 0.85 };
    }

    if (/\b(asesor|humano|operario|persona)\b/.test(lower)) {
      return { ...emptyClassification, intent: "talk_to_human", confidence: 0.85 };
    }

    if (
      /\b(mejor|perdon|perdona|cambio|cambiar|cambiala|cambialo|en vez de|reemplaza|reemplazalo)\b/.test(lower) &&
      /\b(oblea|fresa|fresas|tradicional|malteada|waffle|helado|oreo|brownie|milo|nutella)\b/.test(lower)
    ) {
      return { ...emptyClassification, intent: "modify_order", confidence: 0.9 };
    }

    if (/\b(cambiar|cambiala|cambialo|modificar|quitar|agregar|sin|en vez de|mejor cambia|mejor cambiala|mejor cambialo)\b/.test(lower)) {
      return { ...emptyClassification, intent: "modify_order", confidence: 0.85 };
    }

    if (/\b(recomiendas|recomendacion|mejor|mas vendido|mas rica|favorita|que pedir|que pido|no se que pedir|no se que ordenar)\b/.test(lower)) {
      return { ...emptyClassification, intent: "ask_recommendation", confidence: 0.85 };
    }

    if (/\b(quiero|queria|me regalas|me das|pedido|pedir|orden|mandame|dame|agrega|tambien)\b/.test(lower)) {
      return { ...emptyClassification, intent: "place_order", confidence: 0.85 };
    }

    if (/\b(horario|abren|cierran|abierto)\b/.test(lower)) {
      return { ...emptyClassification, intent: "ask_hours", confidence: 0.9 };
    }

    if (/\b(nequi|daviplata|pago|efectivo|transferencia)\b/.test(lower)) {
      return { ...emptyClassification, intent: "ask_payment_methods", confidence: 0.8 };
    }

    if (/\b(domicilio|zona|barrio|envio)\b/.test(lower)) {
      return { ...emptyClassification, intent: "ask_delivery_zones", confidence: 0.75 };
    }

    if (/\b(wow|cool|brutal|bacano|bacana|lindo|linda|se ve|se ven|antoja|antojo|antojable|delicioso|deliciosa|hambre|amo las fresas)\b/.test(lower)) {
      return { ...emptyClassification, intent: "small_talk", confidence: 0.8 };
    }

    if (/\b(ricas|rico|buenas|bueno|fresco|frescas|grande|pequeno|caro|vale la pena)\b/.test(lower)) {
      return { ...emptyClassification, intent: "business_question", confidence: 0.8 };
    }

    if (/\b(como estas|como esta|que tal|como va|todo bien|como te va)\b/.test(lower)) {
      return { ...emptyClassification, intent: "small_talk", confidence: 0.9 };
    }

    return emptyClassification;
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
      .replace(/\bneky\b/g, "nequi");
  }
}
