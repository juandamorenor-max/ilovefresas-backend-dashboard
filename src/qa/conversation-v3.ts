import { strict as assert } from "node:assert";

process.env.NODE_ENV = "test";
process.env.TURN_ENGINE_VERSION = "v3";
process.env.TURN_PERSISTENCE_MODE = "memory";
process.env.LLM_PROVIDER = "heuristic";

const { turnDecisionV3Schema } = await import("../contracts/customer-turn.js");
const { ConversationTurnOrchestratorService } = await import(
  "../services/conversation-turn-orchestrator.service.js"
);
const { extractLatestTurnDecisionV3 } = await import(
  "../services/flowise-v3-shadow.service.js"
);
const { demoStore } = await import("../data/demoStore.js");

demoStore.conversations = [];
demoStore.messages = [];
demoStore.orders = [];

const service = new ConversationTurnOrchestratorService();

const first = await service.handle({
  channel: "telegram",
  chatId: "qa-v3-idempotency",
  externalMessageId: "telegram:100:1",
  text: "/newchat",
  attachments: [],
  occurredAt: null
});
const duplicate = await service.handle({
  channel: "telegram",
  chatId: "qa-v3-idempotency",
  externalMessageId: "telegram:100:1",
  text: "/newchat",
  attachments: [],
  occurredAt: null
});

assert.equal(duplicate.duplicate, true);
assert.equal(duplicate.shouldSendReply, false);
assert.equal(duplicate.turnId, first.turnId);
assert.equal(duplicate.conversationId, first.conversationId);
assert.equal(duplicate.responseText, first.responseText);

const parallel = await Promise.all([
  service.handle({
    channel: "telegram",
    chatId: "qa-v3-ordered",
    externalMessageId: "telegram:200:1",
    text: "/newchat",
    attachments: [],
    occurredAt: null
  }),
  service.handle({
    channel: "telegram",
    chatId: "qa-v3-ordered",
    externalMessageId: "telegram:200:2",
    text: "que paso en venezuela ayer?",
    attachments: [],
    occurredAt: null
  })
]);

assert.equal(parallel.length, 2);
assert.equal(parallel[0]?.source, "newchat");
assert.equal(parallel[1]?.source, "backend_out_of_scope_guardrail");
assert.equal(parallel[0]?.conversationId, parallel[1]?.conversationId);

const validDecision = turnDecisionV3Schema.safeParse({
  intent: "order_update",
  confidence: 0.95,
  operations: [{
    type: "add_item",
    productId: "prod_test",
    quantity: 1,
    modifierIds: [],
    selectedOptions: {},
    notes: null
  }],
  replyDraft: "Listo.",
  needsHuman: false,
  reason: "Producto exacto",
  specialist: "pedido"
});
assert.equal(validDecision.success, true);

const invalidDecision = turnDecisionV3Schema.safeParse({
  intent: "order_update",
  confidence: 1,
  operations: [],
  replyDraft: "Total inventado",
  needsHuman: false,
  reason: "No permitido",
  specialist: "pedido",
  total: 5000
});
assert.equal(invalidDecision.success, false, "TurnDecisionV3 must reject extra price fields");

const specialistDecision = extractLatestTurnDecisionV3({
  agentFlowExecutedData: [
    { data: { output: { ...validDecision.data, specialist: "supervisor", operations: [] } } },
    { data: { output: validDecision.data } }
  ],
  text: "{{llmAgentflow_1.output.replyDraft}}"
});
assert.equal(specialistDecision.specialist, "pedido");
assert.equal(specialistDecision.operations[0]?.type, "add_item");

const serializedOperationsDecision = extractLatestTurnDecisionV3({
  output: {
    ...validDecision.data,
    operations: JSON.stringify(validDecision.data?.operations ?? [])
  }
});
assert.equal(serializedOperationsDecision.operations[0]?.type, "add_item");

const flowiseEmptyOptionsDecision = extractLatestTurnDecisionV3({
  output: {
    ...validDecision.data,
    operations: JSON.stringify([{
      type: "add_item",
      productId: "prod_fresa_tradicional",
      quantity: 1,
      modifierIds: [],
      selectedOptions: [],
      notes: ""
    }])
  }
});
const normalizedAddOperation = flowiseEmptyOptionsDecision.operations[0];
assert.equal(normalizedAddOperation?.type, "add_item");
if (normalizedAddOperation?.type === "add_item") {
  assert.deepEqual(normalizedAddOperation.selectedOptions, {});
}

console.log("conversation-v3 contracts and idempotency OK");
