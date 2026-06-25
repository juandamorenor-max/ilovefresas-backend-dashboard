import { strict as assert } from "node:assert";

process.env.NODE_ENV = "production";
process.env.LLM_PROVIDER = "heuristic";
process.env.AI_AGENT_MODE = "false";
process.env.AI_ORDER_ENGINE_MODE = "false";
process.env.AI_STRICT_PROVIDER = "false";
process.env.TELEGRAM_ADMIN_BOT_TOKEN = "";
process.env.TELEGRAM_ADMIN_CHAT_ID = "";

const { ConversationService } = await import("../services/conversation.service.js");
const { demoStore } = await import("../data/demoStore.js");

demoStore.businesses[0]!.status.manualOpenOverride = true;

interface CaseResult {
  name: string;
  ok: boolean;
  error?: string;
}

const results: CaseResult[] = [];

async function check(name: string, assertion: () => Promise<void>) {
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

async function runConversation(messages: string[], phone: string) {
  const service = new ConversationService();
  let reply = "";

  for (const text of messages) {
    const result = await service.handleIncomingMessage({
      from: phone,
      to: "qa-business",
      text
    });
    reply = result.reply;
  }

  const conversation = demoStore.conversations.find((entry) => entry.customerPhone === phone);
  const order = demoStore.orders.find((entry) => entry.customerPhone === phone);
  return { conversation, order, reply };
}

await check("acepta barrio real con typo menor y lo normaliza", async () => {
  const { conversation, order } = await runConversation(
    [
      "quiero una oblea nutella",
      "Juan Perez, calle 10 #20-30 Altos del Praddo, contra entrega"
    ],
    "qa_baq_valid_typo"
  );

  assert.equal(order, undefined);
  assert.equal(conversation?.state, "collecting_delivery_details");
  assert.equal(conversation?.draftOrder?.neighborhood, "Altos del Prado");
  assert.match(conversation?.draftOrder?.inferredZoneId ?? "", /altos_del_prado/);
});

await check("rechaza barrio inventado y pide correccion", async () => {
  const { conversation, order, reply } = await runConversation(
    [
      "quiero una oblea nutella",
      "Juan Perez, calle 10 #20-30 Villa Marte, contra entrega"
    ],
    "qa_baq_invalid_once"
  );

  assert.equal(order, undefined);
  assert.equal(conversation?.state, "collecting_delivery_details");
  assert.equal(conversation?.draftOrder?.inferredZoneId, null);
  assert.match(reply, /Ese barrio no lo reconozco/i);
  assert.match(reply, /barrio correcto de Barranquilla/i);
});

await check("pide aclaracion cuando el barrio pertenece a familia parecida", async () => {
  const { conversation, order, reply } = await runConversation(
    [
      "quiero una oblea nutella",
      "Juan Perez, calle 10 #20-30 Los Angeles, contra entrega"
    ],
    "qa_baq_ambiguous_family"
  );

  assert.equal(order, undefined);
  assert.equal(conversation?.state, "collecting_delivery_details");
  assert.equal(conversation?.draftOrder?.inferredZoneId, null);
  assert.match(reply, /varias opciones/i);
  assert.match(reply, /Los Angeles I/i);
  assert.match(reply, /Los Angeles II/i);
  assert.match(reply, /Los Angeles III/i);
});

await check("escala a humano despues de insistir con barrios no reconocidos", async () => {
  const { conversation, order, reply } = await runConversation(
    [
      "quiero una oblea nutella",
      "Juan Perez, calle 10 #20-30 Villa Marte, contra entrega",
      "barrio Villa Jupiter"
    ],
    "qa_baq_invalid_repeated"
  );

  assert.equal(order, undefined);
  assert.equal(conversation?.state, "pending_human");
  assert.match(conversation?.draftOrder?.blockingIssue ?? "", /Barrio no reconocido/i);
  assert.match(reply, /agente|equipo|operario|persona/i);
});

const passed = results.filter((result) => result.ok).length;
const failed = results.length - passed;

console.log(
  JSON.stringify(
    {
      total: results.length,
      passed,
      failed,
      results
    },
    null,
    2
  )
);

if (failed > 0) {
  process.exitCode = 1;
}
