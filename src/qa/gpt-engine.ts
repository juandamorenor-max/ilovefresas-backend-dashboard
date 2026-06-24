import { strict as assert } from "node:assert";
import type { ConversationTurnResult, OrderDraft } from "../types/index.js";

process.env.NODE_ENV = "production";
process.env.LLM_PROVIDER = "openai";
process.env.AI_ORDER_ENGINE_MODE = "true";
process.env.AI_AGENT_MODE = "true";
process.env.AI_STRICT_PROVIDER = "true";
process.env.LOCAL_FORCE_BUSINESS_OPEN = "true";
process.env.TELEGRAM_ADMIN_BOT_TOKEN = "";
process.env.TELEGRAM_ADMIN_CHAT_ID = "";

const { ConversationService } = await import("../services/conversation.service.js");
const { demoStore } = await import("../data/demoStore.js");

demoStore.businesses[0]!.status.manualOpenOverride = true;

interface CheckResult {
  name: string;
  ok: boolean;
  error?: string;
}

const results: CheckResult[] = [];

async function runConversation(messages: string[], phone: string) {
  const service = new ConversationService();
  const turns: ConversationTurnResult[] = [];
  for (const text of messages) {
    turns.push(await service.handleIncomingMessage({ from: phone, to: "qa-business", text }));
  }
  const conversation = demoStore.conversations.find((entry) => entry.customerPhone === phone);
  const order = [...demoStore.orders].reverse().find((entry) => entry.customerPhone === phone) ?? null;
  return { conversation, draft: conversation?.draftOrder ?? null, order, turns, last: turns.at(-1) ?? null };
}

async function check(name: string, assertion: () => Promise<void>) {
  try {
    await assertion();
    results.push({ name, ok: true });
  } catch (error) {
    results.push({ name, ok: false, error: error instanceof Error ? error.message : "Unknown error" });
  }
}

function assertOpenAi(turns: ConversationTurnResult[]) {
  assert(turns.length > 0);
  for (const turn of turns) {
    assert.equal(turn.classificationSource, "openai", "No debe usar heuristic silenciosamente.");
  }
}

function itemNames(draft: OrderDraft | null | undefined) {
  return draft?.items.map((item) => item.productName) ?? [];
}

function findItem(draft: OrderDraft | null | undefined, productName: string) {
  return draft?.items.find((item) => item.productName === productName);
}

function additions(draft: OrderDraft | null | undefined, productName: string) {
  return findItem(draft, productName)?.components
    .filter((component) => component.type === "added")
    .map((component) => component.name) ?? [];
}

function removals(draft: OrderDraft | null | undefined, productName: string) {
  return findItem(draft, productName)?.components
    .filter((component) => component.type === "removed")
    .map((component) => component.name) ?? [];
}

function pendingLabels(draft: OrderDraft | null | undefined) {
  return draft?.pendingSelections.map((selection) => selection.label) ?? [];
}

function assertNoCustom(draft: OrderDraft | null | undefined) {
  assert(
    (draft?.items ?? []).every((item) => item.productId !== "custom_pending_review"),
    `No debe crear custom products: ${itemNames(draft).join(", ")}`
  );
}

await check("catalog question toppings oblea", async () => {
  const { draft, turns } = await runConversation(["y que toppings tienes para la oblea?"], "qa_gpt_01");
  assertOpenAi(turns);
  assert.equal(draft?.items.length ?? 0, 0);
  assertNoCustom(draft);
});

await check("maracufresa con chocolate no inventa remociones", async () => {
  const { draft, turns, last } = await runConversation(["dame un maracufresa con chocolate"], "qa_gpt_02");
  assertOpenAi(turns);
  assert.deepEqual(itemNames(draft), ["Maracutfresa"]);
  assert.equal(removals(draft, "Maracutfresa").length, 0);
  assert(
    additions(draft, "Maracutfresa").some((name) => /chocolate|hershey|chips/i.test(name)) ||
      pendingLabels(draft).some((label) => /chocolate|topping|adicion|salsa/i.test(label))
  );
  assert.match(last?.reply ?? "", /chocolate|salsa|chips|hershey/i);
});

await check("chips responde aclaracion sin volverse nombre", async () => {
  const { draft, turns, last } = await runConversation(
    ["dame un maracufresa con chocolate", "chips"],
    "qa_gpt_03"
  );
  assertOpenAi(turns);
  assert.equal(draft?.customerName, null);
  assertNoCustom(draft);
  assert.equal(itemNames(draft).some((name) => /chips/i.test(name)), false);
  if (findItem(draft, "Maracutfresa")) {
    assert.equal(removals(draft, "Maracutfresa").length, 0);
  }
  assert.match(last?.reply ?? "", /chips|negros|blancos|colores|confirm|anotado|agreg|menu|topping|opciones/i);
});

await check("chips negros se aplica o se mantiene seguro", async () => {
  const { draft, turns } = await runConversation(
    ["dame un maracufresa", "chips negros"],
    "qa_gpt_04"
  );
  assertOpenAi(turns);
  assert.deepEqual(itemNames(draft), ["Maracutfresa"]);
  assert(additions(draft, "Maracutfresa").some((name) => /Chips de Chocolate Negro/i.test(name)));
  assert.equal(removals(draft, "Maracutfresa").length, 0);
});

await check("fresas con helado pide sabor antes de entrega", async () => {
  const { draft, turns, last } = await runConversation(["fresas con helado"], "qa_gpt_05");
  assertOpenAi(turns);
  assert.deepEqual(itemNames(draft), ["Fresas con helado"]);
  assert(pendingLabels(draft).some((label) => /sabor/i.test(label)));
  assert.doesNotMatch(last?.reply ?? "", /Nombre completo|Direccion|Metodo de pago/i);
});

await check("de chocolate resuelve sabor pendiente", async () => {
  const { draft, turns } = await runConversation(["fresas con helado", "de chocolate"], "qa_gpt_06");
  assertOpenAi(turns);
  assert.deepEqual(findItem(draft, "Fresas con helado")?.selectedOptions?.iceCreamFlavor, ["Chocolate"]);
});

await check("oblea con toppings de chocolate no crea producto inventado", async () => {
  const { draft, turns, last } = await runConversation(["y una oblea con toppings de chocolate"], "qa_gpt_07");
  assertOpenAi(turns);
  assert(
    itemNames(draft).some((name) => /Oblea/i.test(name)) ||
      pendingLabels(draft).some((label) => /oblea|producto|chocolate|topping|adicion/i.test(label)) ||
      (last?.reply ?? "").match(/oblea|opciones|menu|disponible|tenemos/i),
    "Debe crear item de oblea, pedir aclaracion segura o responder con opciones reales."
  );
  assertNoCustom(draft);
  assert.match(last?.reply ?? "", /oblea|chocolate|chips|hershey|salsa|topping/i);
});

await check("ponle oreo a las fresas target correcto", async () => {
  const { draft, turns } = await runConversation(
    ["fresas con helado de vainilla y love banana", "ponle oreo a las fresas"],
    "qa_gpt_08"
  );
  assertOpenAi(turns);
  assert(additions(draft, "Fresas con helado").includes("Oreo"));
  assert(!additions(draft, "Love Banana").includes("Oreo"));
});

await check("ponle oreo con varios items pide target", async () => {
  const { draft, turns, last } = await runConversation(
    ["love banana y oblea arequipe", "ponle oreo"],
    "qa_gpt_09"
  );
  assertOpenAi(turns);
  assert.equal(additions(draft, "Love Banana").includes("Oreo"), false);
  assert.equal(additions(draft, "Oblea Arequipe").includes("Oreo"), false);
  assert.match(last?.reply ?? "", /cual|producto|donde|a cual|love banana|oblea/i);
});

await check("barrio cabecera y neqi aplica al draft", async () => {
  const { order, turns } = await runConversation(
    ["fresas con helado de vainilla", "Juan", "Cra 39a #41-99", "barrio cabecera y neqi"],
    "qa_gpt_10"
  );
  assertOpenAi(turns);
  assert(order, "Debe crear pedido.");
  assert.equal(order.zoneName, "Cabecera");
  assert.equal(order.paymentMethod, "Nequi");
});

await check("small talk no muta draft", async () => {
  const { draft, turns, last } = await runConversation(["se ve rico"], "qa_gpt_11");
  assertOpenAi(turns);
  assert.equal(draft?.items.length ?? 0, 0);
  assert.match(last?.reply ?? "", /antoja|rico|recom|escog|gusta|elegir/i);
});

await check("promo inventada no crea pedido", async () => {
  const { conversation, turns } = await runConversation(["me dijeron que habia 2x1"], "qa_gpt_12");
  assertOpenAi(turns);
  assert.equal(conversation?.draftOrder?.items.length ?? 0, 0);
});

await check("recomendacion sin pedido no crea item", async () => {
  const { draft, turns, last } = await runConversation(["quiero algo rico pero no se que"], "qa_gpt_13");
  assertOpenAi(turns);
  assert.equal(draft?.items.length ?? 0, 0);
  assert.match(last?.reply ?? "", /recom|clasico|antojo|menu|opcion|escog|elegir|fresas|oblea|helado/i);
});

await check("pedido grande 6 productos", async () => {
  const { draft, turns } = await runConversation(
    ["quiero Love Banana, Oblea Arequipe, Pavlova, Vaso Waffle, Malteada Fresa y Mix Oreo"],
    "qa_gpt_14"
  );
  assertOpenAi(turns);
  assert.equal(draft?.items.length, 6);
  for (const name of ["Love Banana", "Oblea Arequipe", "Pavlova", "Vaso Waffle", "Malteada Fresa", "Mix Oreo"]) {
    assert(findItem(draft, name), `Falta ${name}`);
  }
});

await check("pregunta precio en medio mantiene pedido", async () => {
  const { draft, turns, last } = await runConversation(
    ["quiero Love Banana", "cuanto vale ese?"],
    "qa_gpt_15"
  );
  assertOpenAi(turns);
  assert.deepEqual(itemNames(draft), ["Love Banana"]);
  assert.match(last?.reply ?? "", /\$|vale|precio|17/i);
});

await check("producto inexistente no usa el mas parecido", async () => {
  const { draft, turns, last } = await runConversation(["quiero banana split"], "qa_gpt_16");
  assertOpenAi(turns);
  assert.equal(draft?.items.length ?? 0, 0);
  assertNoCustom(draft);
  assert.doesNotMatch(last?.reply ?? "", /Tengo anotado|Nombre completo|Direccion|Metodo de pago/i);
  assert.match(last?.reply ?? "", /no.*menu|no.*tenemos|no.*manejo|opciones|disponible|love banana|fresas|oblea/i);
});

await check("alias real sigue funcionando", async () => {
  const { draft, turns } = await runConversation(["quiero lov banana"], "qa_gpt_17");
  assertOpenAi(turns);
  assert.deepEqual(itemNames(draft), ["Love Banana"]);
});

for (const result of results) {
  const marker = result.ok ? "OK" : "FAIL";
  console.log(`${marker} ${result.name}${result.error ? ` - ${result.error}` : ""}`);
}

const failed = results.filter((result) => !result.ok);
if (failed.length > 0) {
  process.exitCode = 1;
} else {
  console.log(`GPT engine QA passed ${results.length}/${results.length}`);
}
