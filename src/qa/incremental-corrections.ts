import { strict as assert } from "node:assert";
import { env } from "../config/env.js";
import { demoStore } from "../data/demoStore.js";
import { AdminDashboardService } from "../services/admin-dashboard.service.js";
import { AgentFlowTurnService } from "../services/agent-flow-turn.service.js";
import { BotIntegrationService } from "../services/bot-integration.service.js";

demoStore.conversations = [];
demoStore.messages = [];
demoStore.orders = [];
demoStore.businesses[0]!.status.botPausedUntil = null;
demoStore.businesses[0]!.status.botPausedReason = null;

const service = new BotIntegrationService();
const turnService = new AgentFlowTurnService(service);

function seedCompleteDraft(chatId: string, paymentMethod = "efectivo") {
  const conversation = service.startNewConversation("telegram", chatId);
  service.updateConversationState(conversation.id, {
    items: [{ producto: "Fresas con crema tradicional", cantidad: 1 }],
    nombre: "Cliente QA",
    direccion: "Cra 51 # 82-100",
    barrio: "Riomar",
    referencia: "Porteria",
    metodo_pago: paymentMethod,
    modalidad_entrega: "domicilio"
  });
  return conversation.id;
}

const technicalConfirmationId = seedCompleteDraft("technical-confirmation", "Nequi");
service.updateConversationState(technicalConfirmationId, {
  pedido_confirmado: true,
  pedido_confirmado_por_cliente: true,
  comprobante_pago_recibido: true,
  next_expected: "humano"
});
assert.equal(
  service.createOrderForReview(technicalConfirmationId),
  null,
  "Flowise flags must not replace explicit customer summary confirmation"
);
assert(
  service.getOrderReviewReadiness(technicalConfirmationId).missingFields.includes(
    "confirmacion_cliente"
  )
);

const cashConversationId = seedCompleteDraft("cash-amount");
service.markSummaryConfirmed(cashConversationId);
assert(
  service.getOrderReviewReadiness(cashConversationId).missingFields.includes("monto_efectivo"),
  "Cash orders must ask how much the customer will pay with"
);
service.updateConversationState(cashConversationId, { monto_efectivo: "30000" });
service.markSummaryConfirmed(cashConversationId);
assert.equal(service.getOrderReviewReadiness(cashConversationId).ready, true);

const unavailableConversationId = seedCompleteDraft("catalog-revalidation");
service.updateConversationState(unavailableConversationId, { monto_efectivo: "30000" });
service.markSummaryConfirmed(unavailableConversationId);
const traditional = demoStore.products.find(
  (product) => product.name === "Fresas con crema tradicional"
);
assert(traditional);
const originalStock = traditional.isOutOfStock;
traditional.isOutOfStock = true;
assert.equal(service.createOrderForReview(unavailableConversationId), null);
assert(
  service.getOrderReviewReadiness(unavailableConversationId).missingFields.includes(
    "disponibilidad"
  ),
  "Availability must be revalidated immediately before order creation"
);
traditional.isOutOfStock = originalStock;

const zoneConversationId = seedCompleteDraft("stale-zone");
const zoneConversation = demoStore.conversations.find(
  (conversation) => conversation.id === zoneConversationId
);
assert(zoneConversation?.draftOrder);
zoneConversation.draftOrder.inferredZoneId = "stale-zone-id";
service.updateConversationState(zoneConversationId, {
  direccion: "Punto sin zona reconocida 123",
  barrio: "Barrio sin zona reconocida"
});
assert.equal(
  zoneConversation.draftOrder.inferredZoneId,
  null,
  "Changing address/neighborhood must clear stale inferred zone"
);

const pausedConversation = service.startNewConversation("telegram", "global-pause");
const dashboard = new AdminDashboardService();
dashboard.setGlobalBotPause({ paused: true, minutes: 10, reason: "QA" });
const firstPausedTurn = await turnService.handleTurn({
  channel: "telegram",
  chatId: "global-pause",
  text: "hola"
});
assert.equal(firstPausedTurn.source, "backend_global_pause");
assert.equal(firstPausedTurn.shouldSendReply, true);
const secondPausedTurn = await turnService.handleTurn({
  channel: "telegram",
  chatId: "global-pause",
  text: "sigues ahi?"
});
assert.equal(secondPausedTurn.shouldSendReply, false);
dashboard.setGlobalBotPause({ paused: false });
const resumedConversation = demoStore.conversations.find(
  (conversation) => conversation.id === pausedConversation.id
);
assert.equal(resumedConversation?.state, "idle");
assert.equal(resumedConversation?.botPausedReason, null);

const genuineHumanConversation = service.startNewConversation("telegram", "genuine-human");
service.updateConversationState(genuineHumanConversation.id, { needs_human: true });
dashboard.setGlobalBotPause({ paused: true, minutes: 10, reason: "QA" });
await turnService.handleTurn({
  channel: "telegram",
  chatId: "genuine-human",
  text: "necesito ayuda"
});
dashboard.setGlobalBotPause({ paused: false });
assert.equal(
  demoStore.conversations.find((conversation) => conversation.id === genuineHumanConversation.id)
    ?.state,
  "pending_human",
  "Ending a global pause must not release a genuine human handoff"
);

const privateTurnService = turnService as unknown as {
  callFlowise(input: {
    question: string;
    sessionId: string;
    conversationState: Record<string, unknown>;
    catalogoDisponible: unknown;
  }): Promise<Record<string, unknown>>;
  extractFlowisePatch(response: Record<string, unknown>): Record<string, unknown>;
};
const mutableEnv = env as unknown as Record<string, unknown>;
const originalFlowise = {
  url: env.FLOWISE_API_URL,
  id: env.FLOWISE_CHATFLOW_ID,
  timeout: env.FLOWISE_TIMEOUT_MS,
  retry: env.FLOWISE_RETRY_BASE_MS
};
const originalFetch = globalThis.fetch;

try {
  mutableEnv.FLOWISE_API_URL = "https://flowise.qa";
  mutableEnv.FLOWISE_CHATFLOW_ID = "qa-flow";
  mutableEnv.FLOWISE_TIMEOUT_MS = 20;
  mutableEnv.FLOWISE_RETRY_BASE_MS = 1;
  const flowiseInput = {
    question: "hola",
    sessionId: "qa-session",
    conversationState: {},
    catalogoDisponible: {}
  };

  let retryCalls = 0;
  globalThis.fetch = (async () => {
    retryCalls += 1;
    if (retryCalls === 1) {
      return new Response("rate limited", { status: 429 });
    }
    return new Response(JSON.stringify({ text: "ok" }), { status: 200 });
  }) as typeof fetch;
  const retryResult = await privateTurnService.callFlowise(flowiseInput);
  assert.equal(retryResult.text, "ok");
  assert.equal(retryCalls, 2, "Flowise should retry 429 exactly once");

  let timeoutCalls = 0;
  globalThis.fetch = ((_input: string | URL | Request, init?: RequestInit) => {
    timeoutCalls += 1;
    return new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => {
        reject(new DOMException("Aborted", "AbortError"));
      });
    });
  }) as typeof fetch;
  await assert.rejects(() => privateTurnService.callFlowise(flowiseInput), /exceeded 20ms/);
  assert.equal(timeoutCalls, 1, "Flowise timeouts must not be retried automatically");
} finally {
  globalThis.fetch = originalFetch;
  mutableEnv.FLOWISE_API_URL = originalFlowise.url;
  mutableEnv.FLOWISE_CHATFLOW_ID = originalFlowise.id;
  mutableEnv.FLOWISE_TIMEOUT_MS = originalFlowise.timeout;
  mutableEnv.FLOWISE_RETRY_BASE_MS = originalFlowise.retry;
}

const extracted = privateTurnService.extractFlowisePatch({
  pedido_confirmado: true,
  items: [{ producto: "Producto inyectado" }],
  agentFlowExecutedData: [
    { data: { output: { route: "pedido", confidence: 0.9, mensaje_cliente: "router" } } },
    { data: { output: { items: [{ producto: "Salida no ejecutada" }] } } },
    {
      data: {
        output: {
          mensaje_cliente: "especialista",
          items_json: '[{"producto":"Fresas con crema tradicional","cantidad":1}]'
        }
      }
    }
  ]
});
assert.equal(extracted.route, "pedido");
assert.equal(extracted.mensaje_cliente, "especialista");
assert.equal(extracted.pedido_confirmado, undefined);
assert.equal(
  extracted.items,
  '[{"producto":"Fresas con crema tradicional","cantidad":1}]'
);

console.log("incremental-corrections smoke OK");
