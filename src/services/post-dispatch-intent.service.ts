import { z } from "zod";
import type { Conversation, MessageClassification, Order } from "../types/index.js";
import { LlmJsonService } from "./llm-json.service.js";
import { logger } from "../utils/logger.js";

const postDispatchIntentSchema = z.object({
  type: z.enum([
    "conversation_close",
    "delivery_status_question",
    "repeated_status_question",
    "delivery_issue",
    "change_after_dispatch",
    "new_order_request",
    "small_talk",
    "unknown"
  ]),
  confidence: z.number().min(0).max(1),
  relatedToOrderId: z.string().nullable(),
  severity: z.enum(["low", "medium", "high", "critical"]),
  shouldReplyAutomatically: z.boolean(),
  shouldEscalate: z.boolean(),
  requestedAction: z.object({
    type: z.enum([
      "status",
      "address_change",
      "item_change",
      "cancellation",
      "payment_issue",
      "complaint",
      "new_order",
      "none"
    ]),
    description: z.string().nullable()
  }),
  reason: z.string()
});

export type PostDispatchIntent = z.infer<typeof postDispatchIntentSchema>;

export class PostDispatchIntentService {
  constructor(private readonly llmJsonService = new LlmJsonService()) {}

  async interpret(input: {
    currentMessage: string;
    conversation: Conversation;
    order: Order;
  }): Promise<{
    intent: PostDispatchIntent | null;
    source: MessageClassification["source"];
    error: string | null;
  }> {
    const prompt = this.buildPrompt(input);
    const aiResult = await this.llmJsonService.generateJson<unknown>(prompt);
    const parsed = postDispatchIntentSchema.safeParse(aiResult.data);

    if (!parsed.success) {
      logger.warn("PostDispatchIntent returned invalid schema", {
        source: aiResult.source,
        error: parsed.error.message
      });
      return {
        intent: null,
        source: aiResult.source,
        error: parsed.error.message
      };
    }

    return {
      intent: parsed.data,
      source: aiResult.source,
      error: null
    };
  }

  private buildPrompt(input: {
    currentMessage: string;
    conversation: Conversation;
    order: Order;
  }) {
    return [
      "Eres un clasificador semantico post-envio para I Love Fresas.",
      "El pedido ya existe; tu tarea es interpretar el mensaje del cliente segun el estado real de la orden.",
      "No tomes pedidos ni modifiques nada. Solo devuelve JSON valido.",
      "",
      "Estados:",
      "- pending_review: pedido en revision, aun no despachado.",
      "- confirmed/preparing: pedido aprobado o en preparacion.",
      "- dispatched: pedido enviado/en camino.",
      "- completed: pedido entregado.",
      "- cancelled: pedido cancelado.",
      "",
      "Si la orden esta dispatched/completed/cancelled y el cliente pide agregar, quitar, cambiar direccion, cambiar pago o cancelar, clasifica change_after_dispatch o delivery_issue segun gravedad; no lo trates como modificacion segura.",
      "Si el cliente pregunta por estado una primera vez, usa delivery_status_question.",
      "Si insiste, se queja de demora, dice que no llega o suena frustrado, usa repeated_status_question o delivery_issue.",
      "Si el cliente agradece o cierra, usa conversation_close.",
      "Si claramente quiere otro pedido separado, usa new_order_request.",
      "",
      "Formato JSON exacto:",
      JSON.stringify({
        type:
          "conversation_close | delivery_status_question | repeated_status_question | delivery_issue | change_after_dispatch | new_order_request | small_talk | unknown",
        confidence: 0,
        relatedToOrderId: "string|null",
        severity: "low | medium | high | critical",
        shouldReplyAutomatically: true,
        shouldEscalate: false,
        requestedAction: {
          type:
            "status | address_change | item_change | cancellation | payment_issue | complaint | new_order | none",
          description: null
        },
        reason: "breve explicacion"
      }),
      "",
      `Mensaje actual: ${input.currentMessage}`,
      `Orden activa: ${JSON.stringify({
        id: input.order.id,
        status: input.order.status,
        customerName: input.order.customerName,
        fulfillmentType: input.order.fulfillmentType,
        paymentMethod: input.order.paymentMethod,
        items: input.order.items.map((item) => `${item.quantity} x ${item.productName}`)
      })}`,
      `Eventos post-envio previos: ${JSON.stringify(input.conversation.postOrderEvents ?? [])}`,
      `Historial reciente: ${JSON.stringify(input.conversation.memory?.recentMessages ?? [])}`
    ].join("\n");
  }
}
