import { strict as assert } from "node:assert";
import type { ConversationTurnResult } from "../types/index.js";

process.env.NODE_ENV = "production";
process.env.LLM_PROVIDER ??= "openai";
process.env.AI_AGENT_MODE ??= "true";
process.env.AI_ORDER_ENGINE_MODE ??= "true";
process.env.AI_STRICT_PROVIDER ??= "true";
process.env.LOCAL_FORCE_BUSINESS_OPEN ??= "true";
process.env.TELEGRAM_ADMIN_BOT_TOKEN = "";
process.env.TELEGRAM_ADMIN_CHAT_ID = "";

const { ConversationService } = await import("../services/conversation.service.js");
const { AdminNotificationService } = await import("../services/admin-notification.service.js");
const { demoStore } = await import("../data/demoStore.js");

demoStore.businesses[0]!.status.manualOpenOverride = true;

interface CheckResult {
  name: string;
  ok: boolean;
  error?: string;
}

async function runConversation(messages: string[], phone: string) {
  const service = new ConversationService();
  let lastResult: ConversationTurnResult | null = null;

  for (const text of messages) {
    lastResult = await service.handleIncomingMessage({
      from: phone,
      to: "qa-business",
      text
    });
  }

  const conversation = demoStore.conversations.find((entry) => entry.customerPhone === phone);
  const order = demoStore.orders.find((entry) => entry.customerPhone === phone);
  return { lastResult, conversation, order };
}

async function check(name: string, assertion: () => Promise<void>, results: CheckResult[]) {
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

function assertOpenAi(result: ConversationTurnResult | null) {
  assert.equal(result?.classificationSource, "openai", "Expected OpenAI classification");
}

function assertNoQuestionAsProduct(items: string[]) {
  assert(
    items.every((item) => !/toppings tienes|sabores tienes|que toppings|que sabores/i.test(item)),
    `Question was persisted as product: ${items.join(", ")}`
  );
}

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

const results: CheckResult[] = [];

await check(
  "pregunta de toppings para oblea no se guarda como producto",
  async () => {
    const { lastResult, conversation } = await runConversation(
      [
        "quiero unas fresas con helado de vainilla y una oblea arequipe crema",
        "y que toppings tienes para la oblea?"
      ],
      "qa_ai_option_oblea"
    );

    assertOpenAi(lastResult);
    const items = conversation?.draftOrder?.items.map((item) => item.productName) ?? [];
    assert.equal(items.length, 2);
    assertNoQuestionAsProduct(items);
    assert.match(lastResult?.reply ?? "", /puedes agregar|toppings|adiciones|opciones/i);
  },
  results
);

await check(
  "pregunta de sabores de helado no se guarda como producto",
  async () => {
    const { lastResult, conversation } = await runConversation(
      [
        "quiero unas fresas con helado y un love banana",
        "que sabores tienes de helado?"
      ],
      "qa_ai_option_helado"
    );

    assertOpenAi(lastResult);
    const items = conversation?.draftOrder?.items.map((item) => item.productName) ?? [];
    assert.equal(items.length, 2);
    assertNoQuestionAsProduct(items);
    assert.match(lastResult?.reply ?? "", /fresa|chocolate|vainilla|oreo|sabores/i);
  },
  results
);

await check(
  "barrio y pago juntos se aplican al draft activo",
  async () => {
    const { lastResult, order } = await runConversation(
      [
        "fresas con helado de vainilla",
        "Marta Albeira",
        "Cra 39a # 41-99",
        "Barrio cabecera del llano y neqi"
      ],
      "qa_ai_zone_payment"
    );

    assertOpenAi(lastResult);
    assert(order, "Expected order to be created");
    assert.equal(order.items[0]?.productName, "Fresas con helado");
    assert.equal(order.customerName, "Marta Albeira");
    assert.equal(order.address, "Cra 39a # 41-99");
    assert.equal(order.zoneName, "Cabecera");
    assert.equal(order.paymentMethod, "Nequi");
  },
  results
);

await check(
  "typos comunes siguen usando IA y catalogo real",
  async () => {
    const { lastResult, conversation } = await runConversation(
      ["Holaaa kiero una fresas cn krema y oreoo"],
      "qa_ai_typos"
    );

    assertOpenAi(lastResult);
    const item = conversation?.draftOrder?.items[0];
    assert.equal(item?.productName, "Fresas con crema tradicional");
    assert(
      item?.components.some((component) => component.type === "added" && component.name === "Oreo"),
      "Expected Oreo as addition"
    );
  },
  results
);

await check(
  "sabor ya definido no deja nota operativa vieja al operador",
  async () => {
    const { lastResult, order } = await runConversation(
      [
        "unas fresas con helado",
        "vainilla",
        "y una oblea arequipe",
        "Juan Moreno",
        "Cra 39a # 41-99",
        "Barrio cabecera del llano y neqi"
      ],
      "qa_ai_stale_option_note"
    );

    assertOpenAi(lastResult);
    assert(order, "Expected order to be created");
    const fresas = order.items.find((item) => item.productName === "Fresas con helado");
    assert(fresas, "Expected Fresas con helado item");
    assert.deepEqual(fresas.selectedOptions?.iceCreamFlavor, ["Vainilla"]);
    assert.equal(fresas.notes, null);

    const operatorMessage = new AdminNotificationService().formatOrderForOperator(order);
    assert.doesNotMatch(operatorMessage, /Nota item:.*(?:falta|definir|confirmar sabor)/i);
    assert.match(operatorMessage, /sabor de helado: Vainilla/i);
  },
  results
);

await check(
  "small talk no se guarda como dato ni producto",
  async () => {
    const { lastResult, conversation } = await runConversation(
      ["wow se ve rico"],
      "qa_ai_smalltalk"
    );

    assertOpenAi(lastResult);
    assert.equal(conversation?.draftOrder?.items.length ?? 0, 0);
    assert.equal(conversation?.draftOrder?.customerName ?? null, null);
    assert.match(normalizeText(lastResult?.reply ?? ""), /gusta|antoja|llamo|recomendar|escoger/i);
  },
  results
);

await check(
  "motor IA pide aclaracion para adicion ambigua",
  async () => {
    const { lastResult, conversation } = await runConversation(
      ["quiero Love Banana y Oblea Arequipe", "ponle chocolate"],
      "qa_ai_planner_ambiguous_addition"
    );

    assertOpenAi(lastResult);
    assert.match(lastResult?.reply ?? "", /cual|cu[aá]l|producto|chocolate|salsa|topping/i);
    assert.equal(conversation?.draftOrder?.items.length, 2);
    assert.equal(conversation?.draftOrder?.customerName, null);
    assert(
      conversation?.draftOrder?.items.every(
        (item) => !item.components.some((component) => component.type === "added")
      ),
      "No debe aplicar una adicion ambigua sin aclaracion."
    );
  },
  results
);

const failed = results.filter((result) => !result.ok);

for (const result of results) {
  const marker = result.ok ? "OK" : "FAIL";
  console.log(`${marker} ${result.name}${result.error ? ` - ${result.error}` : ""}`);
}

if (failed.length > 0) {
  process.exitCode = 1;
} else {
  console.log(`AI smoke QA passed ${results.length}/${results.length}`);
}
