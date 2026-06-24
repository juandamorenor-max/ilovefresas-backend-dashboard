import { strict as assert } from "node:assert";
import { demoStore } from "../data/demoStore.js";
import { AdminDashboardService } from "../services/admin-dashboard.service.js";
import { ConversationService } from "../services/conversation.service.js";
import type { PostDispatchIntentService } from "../services/post-dispatch-intent.service.js";
import type { Conversation, Order, OrderItem } from "../types/index.js";
import { createId, nowIso } from "../utils/id.js";

process.env.NODE_ENV = "production";
process.env.TELEGRAM_ADMIN_BOT_TOKEN = "";
process.env.TELEGRAM_ADMIN_CHAT_ID = "";

type IntentType =
  | "conversation_close"
  | "delivery_status_question"
  | "repeated_status_question"
  | "delivery_issue"
  | "change_after_dispatch"
  | "new_order_request"
  | "small_talk"
  | "unknown";

type RequestedActionType =
  | "status"
  | "address_change"
  | "item_change"
  | "cancellation"
  | "payment_issue"
  | "complaint"
  | "new_order"
  | "none";

interface QaResult {
  name: string;
  ok: boolean;
  error?: string;
}

function makeIntent(
  type: IntentType,
  requestedAction: RequestedActionType,
  overrides: Partial<Awaited<ReturnType<PostDispatchIntentService["interpret"]>>["intent"]> = {}
) {
  return {
    type,
    confidence: 0.96,
    relatedToOrderId: null,
    severity: type === "delivery_issue" || type === "change_after_dispatch" ? "high" : "low",
    shouldReplyAutomatically: !["delivery_issue", "change_after_dispatch"].includes(type),
    shouldEscalate: ["delivery_issue", "change_after_dispatch"].includes(type),
    requestedAction: {
      type: requestedAction,
      description: null
    },
    reason: "QA post-dispatch",
    ...overrides
  } as NonNullable<Awaited<ReturnType<PostDispatchIntentService["interpret"]>>["intent"]>;
}

class FakePostDispatchIntentService {
  constructor(private readonly intents: Array<ReturnType<typeof makeIntent> | null>) {}

  async interpret() {
    const intent = this.intents.shift() ?? null;
    return {
      intent,
      source: "openai" as const,
      error: intent ? null : "qa-empty-intent"
    };
  }
}

function resetStore() {
  demoStore.conversations = [];
  demoStore.messages = [];
  demoStore.orders = [];
  demoStore.customers = [];
  demoStore.businesses[0]!.status.manualOpenOverride = true;
  demoStore.businesses[0]!.status.acceptingOrders = true;
  demoStore.businesses[0]!.status.deliveryEnabled = true;
  demoStore.businesses[0]!.status.botPausedUntil = null;
  demoStore.businesses[0]!.status.botPausedReason = null;
}

function makeItem(productName = "Fresas con crema tradicional"): OrderItem {
  return {
    id: createId("item"),
    productId: productName === "Fresas con helado" ? "prod_fresa_helado" : "prod_fresa_tradicional",
    productName,
    quantity: 1,
    unitBasePrice: productName === "Fresas con helado" ? 18000 : 16000,
    components: [],
    selectedOptions:
      productName === "Fresas con helado" ? { iceCreamFlavor: ["Vainilla"] } : undefined,
    notes: null
  };
}

function seedConversationWithOrder(input: {
  phone: string;
  status: Order["status"];
  items?: OrderItem[];
}) {
  const timestamp = nowIso();
  const business = demoStore.businesses[0]!;
  const order: Order = {
    id: createId("order"),
    createdAt: timestamp,
    updatedAt: timestamp,
    businessId: business.id,
    customerPhone: input.phone,
    fulfillmentType: "delivery",
    customerName: "Juan Moreno",
    address: "Cra 39a # 41-99 casa",
    zoneName: null,
    paymentMethod: "Nequi",
    paymentProofReceived: true,
    paymentProofNote: "QA seed",
    cashAmount: null,
    notes: null,
    items: input.items ?? [makeItem()],
    pricing: {
      subtotal: input.items?.reduce((sum, item) => sum + item.unitBasePrice * item.quantity, 0) ?? 16000,
      deliveryFee: 6000,
      discountTotal: 0,
      total: (input.items?.reduce((sum, item) => sum + item.unitBasePrice * item.quantity, 0) ?? 16000) + 6000
    },
    status: input.status,
    internalNotes: null
  };
  demoStore.orders.push(order);

  const conversation: Conversation = {
    id: createId("conv"),
    createdAt: timestamp,
    updatedAt: timestamp,
    businessId: business.id,
    customerPhone: input.phone,
    state: "completed",
    aiUsageCount: 0,
    draftOrder: null,
    activeOrderId: order.id,
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
  return { business, conversation, order };
}

function makeService(intents: Array<ReturnType<typeof makeIntent> | null>) {
  return new ConversationService(
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    new FakePostDispatchIntentService(intents) as unknown as PostDispatchIntentService
  );
}

async function send(
  service: ConversationService,
  phone: string,
  text: string
) {
  return service.handleIncomingMessage({
    from: phone,
    to: "qa-business",
    text
  });
}

function latestEvent(conversation: Conversation) {
  return conversation.postOrderEvents?.at(-1) ?? null;
}

function snapshotOrder(order: Order) {
  return JSON.stringify({
    status: order.status,
    items: order.items,
    address: order.address,
    pricing: order.pricing
  });
}

async function check(name: string, assertion: () => Promise<void>, results: QaResult[]) {
  try {
    await assertion();
    results.push({ name, ok: true });
  } catch (error) {
    results.push({
      name,
      ok: false,
      error: error instanceof Error ? error.message : "Unknown assertion error"
    });
  }
}

const results: QaResult[] = [];

await check("cierra naturalmente cuando el cliente agradece despues de enviado", async () => {
  resetStore();
  const phone = "qa-post-001";
  const { conversation, order } = seedConversationWithOrder({ phone, status: "dispatched" });
  const before = snapshotOrder(order);
  const result = await send(
    makeService([makeIntent("conversation_close", "none")]),
    phone,
    "dale gracias"
  );
  assert.equal(result.classificationSource, "openai");
  assert.equal(conversation.state, "post_order_closed");
  assert.equal(latestEvent(conversation)?.type, "conversation_close");
  assert.equal(latestEvent(conversation)?.needsHuman, false);
  assert.equal(snapshotOrder(order), before);
}, results);

await check("responde una pregunta de estado una sola vez sin escalar", async () => {
  resetStore();
  const phone = "qa-post-002";
  const { conversation } = seedConversationWithOrder({ phone, status: "dispatched" });
  const result = await send(
    makeService([makeIntent("delivery_status_question", "status")]),
    phone,
    "cuanto tarda?"
  );
  assert.match(result.reply, /enviado|camino/i);
  assert.equal(conversation.state, "completed");
  assert.equal(latestEvent(conversation)?.type, "delivery_status_question");
  assert.equal(latestEvent(conversation)?.needsHuman, false);
}, results);

await check("escala si el cliente insiste por estado despues de una respuesta", async () => {
  resetStore();
  const phone = "qa-post-003";
  const { conversation } = seedConversationWithOrder({ phone, status: "dispatched" });
  const service = makeService([
    makeIntent("delivery_status_question", "status"),
    makeIntent("delivery_status_question", "status")
  ]);
  await send(service, phone, "cuanto tarda?");
  const result = await send(service, phone, "pero cuanto tarda pues?");
  assert.equal(conversation.state, "pending_human");
  assert.match(result.reply, /operario|revisar/i);
  assert.equal(latestEvent(conversation)?.type, "repeated_status_question");
  assert.equal(latestEvent(conversation)?.humanReason, "delivery_status_escalation");
}, results);

await check("escala novedad de entrega despues de enviado", async () => {
  resetStore();
  const phone = "qa-post-004";
  const { conversation } = seedConversationWithOrder({ phone, status: "dispatched" });
  await send(
    makeService([makeIntent("delivery_issue", "complaint", { severity: "high" })]),
    phone,
    "no me ha llegado y ya paso mucho tiempo"
  );
  assert.equal(conversation.state, "pending_human");
  assert.equal(latestEvent(conversation)?.type, "delivery_issue");
  assert.equal(latestEvent(conversation)?.needsHuman, true);
}, results);

await check("no cambia direccion de una orden enviada", async () => {
  resetStore();
  const phone = "qa-post-005";
  const { conversation, order } = seedConversationWithOrder({ phone, status: "dispatched" });
  const before = snapshotOrder(order);
  const result = await send(
    makeService([makeIntent("change_after_dispatch", "address_change")]),
    phone,
    "mejor mandalo a la calle 84"
  );
  assert.match(result.reply, /no puedo modificar|operario/i);
  assert.equal(snapshotOrder(order), before);
  assert.equal(conversation.state, "pending_human");
  assert.equal(latestEvent(conversation)?.humanReason, "post_dispatch_address_change");
}, results);

await check("no cancela automaticamente una orden enviada", async () => {
  resetStore();
  const phone = "qa-post-006";
  const { conversation, order } = seedConversationWithOrder({ phone, status: "dispatched" });
  await send(
    makeService([makeIntent("change_after_dispatch", "cancellation")]),
    phone,
    "cancelalo entonces"
  );
  assert.equal(order.status, "dispatched");
  assert.equal(conversation.state, "pending_human");
  assert.equal(latestEvent(conversation)?.humanReason, "post_dispatch_cancellation");
}, results);

await check("no modifica items despues de enviado", async () => {
  resetStore();
  const phone = "qa-post-007";
  const { conversation, order } = seedConversationWithOrder({
    phone,
    status: "dispatched",
    items: [makeItem(), makeItem("Fresas con helado")]
  });
  const before = snapshotOrder(order);
  await send(
    makeService([makeIntent("change_after_dispatch", "item_change")]),
    phone,
    "quitale las fresas tradicionales"
  );
  assert.equal(snapshotOrder(order), before);
  assert.equal(conversation.state, "pending_human");
  assert.equal(latestEvent(conversation)?.humanReason, "post_dispatch_item_change");
}, results);

await check("pide confirmacion antes de iniciar pedido nuevo despues de enviado", async () => {
  resetStore();
  const phone = "qa-post-008";
  const { conversation, order } = seedConversationWithOrder({ phone, status: "dispatched" });
  const result = await send(
    makeService([makeIntent("new_order_request", "new_order")]),
    phone,
    "quiero otro pedido"
  );
  assert.match(result.reply, /pedido nuevo|aparte/i);
  assert.equal(conversation.activeOrderId, order.id);
  assert.equal(conversation.draftOrder, null);
  assert.equal(latestEvent(conversation)?.type, "new_order_request");
}, results);

await check("segundo mensaje de nuevo pedido abre draft separado", async () => {
  resetStore();
  const phone = "qa-post-009";
  const { conversation, order } = seedConversationWithOrder({ phone, status: "dispatched" });
  const service = makeService([
    makeIntent("new_order_request", "new_order"),
    makeIntent("new_order_request", "new_order")
  ]);
  await send(service, phone, "quiero otro pedido");
  await send(service, phone, "si, empiezalo aparte");
  assert.equal(conversation.activeOrderId, null);
  assert(conversation.draftOrder, "Expected a fresh draft for the new order.");
  assert.equal(conversation.draftOrder?.items.length, 0);
  assert.equal(order.status, "dispatched");
}, results);

await check("orden completada tambien queda protegida ante reclamo", async () => {
  resetStore();
  const phone = "qa-post-010";
  const { conversation, order } = seedConversationWithOrder({ phone, status: "completed" });
  await send(
    makeService([makeIntent("delivery_issue", "complaint", { severity: "high" })]),
    phone,
    "me llego mal"
  );
  assert.equal(order.status, "completed");
  assert.equal(conversation.state, "pending_human");
  assert.equal(latestEvent(conversation)?.needsHuman, true);
}, results);

await check("orden completada se despide una vez y luego queda silenciosa", async () => {
  resetStore();
  const phone = "qa-post-010b";
  const { conversation, order } = seedConversationWithOrder({ phone, status: "completed" });
  const service = makeService([
    makeIntent("conversation_close", "none"),
    makeIntent("small_talk", "none")
  ]);
  const closeResult = await send(service, phone, "gracias");
  const silentResult = await send(service, phone, "hola");
  assert.match(closeResult.reply, /gracias|I Love Fresas/i);
  assert.equal(silentResult.reply, "");
  assert.equal(conversation.state, "post_order_closed");
  assert.equal(conversation.activeOrderId, null);
  assert.equal(order.status, "completed");
}, results);

await check("dashboard al marcar completado cierra el chat asociado", async () => {
  resetStore();
  const phone = "qa-post-010c";
  const { conversation, order } = seedConversationWithOrder({ phone, status: "dispatched" });
  const dashboard = new AdminDashboardService();
  const updated = dashboard.updateDashboardOrderStatus(order.id, "completed");
  assert(updated, "Expected dashboard order update.");
  assert.equal(order.status, "completed");
  assert.equal(conversation.state, "post_order_closed");
  assert.equal(conversation.activeOrderId, null);
  assert.equal(conversation.draftOrder, null);
  assert.equal(latestEvent(conversation)?.type, "conversation_close");
}, results);

await check("orden cancelada responde estado sin reabrir pedido", async () => {
  resetStore();
  const phone = "qa-post-011";
  const { conversation, order } = seedConversationWithOrder({ phone, status: "cancelled" });
  const result = await send(
    makeService([makeIntent("delivery_status_question", "status")]),
    phone,
    "como va?"
  );
  assert.match(result.reply, /cancelado/i);
  assert.equal(order.status, "cancelled");
  assert.equal(conversation.activeOrderId, order.id);
}, results);

await check("small talk post-envio no cambia la orden ni escala", async () => {
  resetStore();
  const phone = "qa-post-012";
  const { conversation, order } = seedConversationWithOrder({ phone, status: "dispatched" });
  const before = snapshotOrder(order);
  await send(
    makeService([makeIntent("small_talk", "none")]),
    phone,
    "jajaja listo"
  );
  assert.equal(snapshotOrder(order), before);
  assert.equal(latestEvent(conversation)?.type, "small_talk");
  assert.equal(latestEvent(conversation)?.needsHuman, false);
}, results);

await check("si OpenAI no devuelve intencion valida, conserva orden y escala", async () => {
  resetStore();
  const phone = "qa-post-013";
  const { conversation, order } = seedConversationWithOrder({ phone, status: "dispatched" });
  const before = snapshotOrder(order);
  await send(makeService([null]), phone, "???");
  assert.equal(snapshotOrder(order), before);
  assert.equal(conversation.state, "pending_human");
  assert.equal(latestEvent(conversation)?.humanReason, "post_dispatch_intent_unavailable");
}, results);

await check("la orden enviada no cambia aunque exista un draft viejo", async () => {
  resetStore();
  const phone = "qa-post-014";
  const { conversation, order } = seedConversationWithOrder({ phone, status: "dispatched" });
  conversation.draftOrder = {
    id: createId("draft"),
    businessId: order.businessId,
    customerPhone: phone,
    items: [...order.items],
    fulfillmentType: "delivery",
    customerName: order.customerName,
    address: order.address,
    inferredZoneId: null,
    paymentMethod: order.paymentMethod,
    paymentProofReceived: order.paymentProofReceived,
    paymentProofNote: order.paymentProofNote,
    cashAmount: null,
    notes: null,
    pendingSelections: [],
    blockingIssue: null,
    pricing: order.pricing
  };
  await send(
    makeService([makeIntent("change_after_dispatch", "item_change")]),
    phone,
    "agregale oreo"
  );
  assert.equal(order.items.length, 1);
  assert(conversation.draftOrder);
  assert.equal(conversation.draftOrder.blockingIssue, "Intervencion post-envio requerida");
}, results);

const failed = results.filter((result) => !result.ok);
for (const result of results) {
  const prefix = result.ok ? "PASS" : "FAIL";
  console.log(`${prefix} ${result.name}${result.error ? ` - ${result.error}` : ""}`);
}

if (failed.length > 0) {
  console.error(`qa:post-dispatch failed: ${failed.length}/${results.length}`);
  process.exit(1);
}

console.log(`qa:post-dispatch passed: ${results.length}/${results.length}`);
