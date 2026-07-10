import { z } from "zod";

export const botChannelSchema = z.enum(["telegram", "whatsapp"]);

export const customerAttachmentSchema = z.object({
  id: z.string().min(1),
  type: z.enum(["image", "document"]),
  mimeType: z.string().nullable().default(null),
  caption: z.string().nullable().default(null)
}).strict();

export const customerTurnSchema = z.object({
  channel: botChannelSchema,
  chatId: z.string().min(1),
  externalMessageId: z.string().min(1),
  text: z.string().default(""),
  attachments: z.array(customerAttachmentSchema).default([]),
  occurredAt: z.string().datetime().nullable().default(null)
}).strict();

export type CustomerTurn = z.infer<typeof customerTurnSchema>;

export const turnResultSchema = z.object({
  turnId: z.string().min(1),
  conversationId: z.string().min(1),
  responseText: z.string(),
  attachments: z.array(z.object({
    type: z.enum(["document", "photo"]),
    pathOrUrl: z.string(),
    filename: z.string(),
    caption: z.string().optional()
  }).strict()).default([]),
  nextExpected: z.string().nullable(),
  orderId: z.string().nullable(),
  needsHuman: z.boolean(),
  source: z.string().min(1),
  shouldSendReply: z.boolean(),
  duplicate: z.boolean().default(false)
}).strict();

export type TurnResult = z.infer<typeof turnResultSchema>;

const addItemOperationSchema = z.object({
  type: z.literal("add_item"),
  productId: z.string().min(1),
  quantity: z.number().int().positive(),
  modifierIds: z.array(z.string()).default([]),
  selectedOptions: z.record(z.array(z.string())).default({}),
  notes: z.string().nullable().default(null)
}).strict();

const updateItemOperationSchema = z.object({
  type: z.literal("update_item"),
  targetItemId: z.string().min(1),
  quantity: z.number().int().positive().optional(),
  quantityDelta: z.number().int().optional(),
  modifierIdsToAdd: z.array(z.string()).default([]),
  selectedOptions: z.record(z.array(z.string())).default({}),
  notes: z.string().nullable().optional()
}).strict();

const removeItemOperationSchema = z.object({
  type: z.literal("remove_item"),
  targetItemId: z.string().min(1)
}).strict();

const setCustomerDataOperationSchema = z.object({
  type: z.literal("set_customer_data"),
  customerName: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  neighborhood: z.string().nullable().optional(),
  addressReference: z.string().nullable().optional(),
  fulfillmentType: z.enum(["delivery", "pickup"]).nullable().optional(),
  paymentMethod: z.string().nullable().optional(),
  cashAmount: z.string().nullable().optional()
}).strict();

const answerCatalogOperationSchema = z.object({
  type: z.literal("answer_catalog"),
  topic: z.enum(["menu", "products", "price", "modifiers", "flavors"]),
  targetProductId: z.string().nullable().default(null)
}).strict();

const requestClarificationOperationSchema = z.object({
  type: z.literal("request_clarification"),
  label: z.string().min(1),
  targetItemId: z.string().nullable().default(null),
  options: z.array(z.string()).default([]),
  question: z.string().min(1)
}).strict();

const handoffOperationSchema = z.object({
  type: z.literal("handoff"),
  reason: z.string().min(1)
}).strict();

export const turnOperationSchema = z.discriminatedUnion("type", [
  addItemOperationSchema,
  updateItemOperationSchema,
  removeItemOperationSchema,
  setCustomerDataOperationSchema,
  answerCatalogOperationSchema,
  requestClarificationOperationSchema,
  handoffOperationSchema
]);

export const turnDecisionV3Schema = z.object({
  intent: z.enum([
    "order_update",
    "catalog_question",
    "customer_data",
    "answer_pending_selection",
    "small_talk",
    "post_order",
    "human_handoff",
    "unknown"
  ]),
  confidence: z.number().min(0).max(1),
  operations: z.array(turnOperationSchema),
  replyDraft: z.string(),
  needsHuman: z.boolean(),
  reason: z.string().min(1),
  specialist: z.enum([
    "pedido",
    "opciones",
    "datos",
    "menu",
    "postventa",
    "supervisor"
  ])
}).strict();

export type TurnDecisionV3 = z.infer<typeof turnDecisionV3Schema>;
