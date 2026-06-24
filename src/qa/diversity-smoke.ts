import { strict as assert } from "node:assert";
import type {
  Conversation,
  ConversationTurnResult,
  OrderDraft,
  OrderItem,
  Product
} from "../types/index.js";

process.env.NODE_ENV = "production";
process.env.LLM_PROVIDER ??= "openai";
process.env.AI_AGENT_MODE ??= "true";
process.env.AI_STRICT_PROVIDER ??= "true";
process.env.LOCAL_FORCE_BUSINESS_OPEN ??= "true";
process.env.TELEGRAM_ADMIN_BOT_TOKEN = "";
process.env.TELEGRAM_ADMIN_CHAT_ID = "";

const { CatalogService } = await import("../services/catalog.service.js");
const { ConversationService } = await import("../services/conversation.service.js");
const { demoStore } = await import("../data/demoStore.js");

demoStore.businesses[0]!.status.manualOpenOverride = true;

type CaseGroup =
  | "simple"
  | "required-options"
  | "multiproduct"
  | "large-order"
  | "targeted-toppings"
  | "catalog-question"
  | "mixed-final-data";

interface CheckResult {
  name: string;
  group: CaseGroup;
  ok: boolean;
  error?: string;
}

const catalogService = new CatalogService();
const results: CheckResult[] = [];

const coverageProducts = [
  "Mix Oreo Milo",
  "Mix Oreo",
  "Fresas con crema tradicional",
  "Fresas con helado",
  "Durazno con crema",
  "Combinado fresa durazno con helado",
  "Love Banana",
  "Maracutfresa",
  "Oblea Arequipe",
  "Oblea Arequipe crema",
  "Oblea Nutella",
  "Brownie con Helado",
  "Waffle Tradicional",
  "Waffle Chocolate",
  "Vaso Fantasia",
  "Vaso helado un sabor",
  "Vaso helado dos sabores",
  "Vaso Waffle",
  "Pavlova",
  "Malteada Fresa",
  "Malteada Chocolate",
  "Malteada Oreo"
];

const coverageModifiers = [
  "Oreo",
  "Brownie",
  "Milo",
  "Nutella",
  "Helado",
  "Queso",
  "Dulce de mora",
  "Salsa Hershey",
  "Chips de Chocolate Negro",
  "Arequipe",
  "Leche Condensada"
];

function product(name: string): Product {
  const found = catalogService.findProductByNameOrAlias(name);
  assert(found, `Producto de cobertura no encontrado: ${name}`);
  return found;
}

function normalize(value: string | null | undefined) {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function additions(item: OrderItem | undefined) {
  return item?.components
    .filter((component) => component.type === "added")
    .map((component) => component.name) ?? [];
}

function removals(item: OrderItem | undefined) {
  return item?.components
    .filter((component) => component.type === "removed")
    .map((component) => component.name) ?? [];
}

function findItem(draft: OrderDraft | null | undefined, productName: string) {
  const expected = product(productName);
  return draft?.items.find((item) => item.productId === expected.id);
}

function latestOrder(phone: string) {
  return [...demoStore.orders].reverse().find((order) => order.customerPhone === phone) ?? null;
}

async function runConversation(messages: string[], phone: string) {
  const service = new ConversationService();
  const turns: ConversationTurnResult[] = [];

  for (const text of messages) {
    const result = await service.handleIncomingMessage({
      from: phone,
      to: "qa-business",
      text
    });
    turns.push(result);
  }

  const conversation = demoStore.conversations.find(
    (entry: Conversation) => entry.customerPhone === phone
  );
  return {
    conversation,
    draft: conversation?.draftOrder ?? null,
    order: latestOrder(phone),
    turns,
    lastResult: turns.at(-1) ?? null
  };
}

async function check(group: CaseGroup, name: string, assertion: () => Promise<void> | void) {
  try {
    await assertion();
    results.push({ name, group, ok: true });
  } catch (error) {
    results.push({
      name,
      group,
      ok: false,
      error: error instanceof Error ? error.message : "Unknown error"
    });
  }
}

function assertOpenAiTurns(turns: ConversationTurnResult[]) {
  for (const turn of turns) {
    assert.equal(turn.classificationSource, "openai", "La suite debe usar OpenAI real, no heuristic.");
  }
}

function assertSingleItemDraft(draft: OrderDraft | null, productName: string) {
  assert(draft, "Se esperaba draft activo.");
  assert.equal(draft.items.length, 1);
  const item = findItem(draft, productName);
  assert(item, `No se encontro ${productName}. Items: ${draft.items.map((entry) => entry.productName).join(", ")}`);
  assert.equal(item.unitBasePrice, product(productName).basePrice);
  assert.equal(draft.pricing.subtotal, item.unitBasePrice * item.quantity + additions(item).reduce((sum, name) => {
    const modifier = catalogService.findModifierOptionByNameOrAlias(name);
    return sum + (modifier?.priceDelta ?? 0);
  }, 0) * item.quantity);
  return item;
}

function assertProductsPresent(draft: OrderDraft | null, productNames: string[]) {
  assert(draft, "Se esperaba draft activo.");
  assert.equal(
    draft.items.length,
    productNames.length,
    `Items esperados ${productNames.length}; recibidos ${draft.items.map((item) => item.productName).join(", ")}`
  );
  for (const name of productNames) {
    assert(findItem(draft, name), `Falta producto: ${name}`);
  }
}

function assertNoCustomFromQuestion(draft: OrderDraft | null) {
  const items = draft?.items ?? [];
  assert(
    items.every((item) => item.productId !== "custom_pending_review"),
    `Se creo producto custom desde pregunta: ${items.map((item) => item.productName).join(", ")}`
  );
  assert(
    items.every((item) => !/toppings tienes|sabores tienes|cuanto vale|que le puedo poner/i.test(item.productName)),
    `Pregunta guardada como producto: ${items.map((item) => item.productName).join(", ")}`
  );
}

function assertSelected(item: OrderItem | undefined, key: string, expectedValues: string[]) {
  assert(item, "Item requerido no encontrado.");
  assert.deepEqual(item.selectedOptions?.[key] ?? [], expectedValues);
}

function missingRequiredOptions(draft: OrderDraft | null) {
  return (draft?.items ?? []).flatMap((item) => {
    const itemProduct = catalogService.findProductById(item.productId);
    return (itemProduct?.requiredOptions ?? [])
      .filter((option) => option.required)
      .filter((option) => (item.selectedOptions?.[option.key]?.length ?? 0) < option.minSelections)
      .map((option) => `${item.productName}:${option.key}`);
  });
}

function assertRequiredPending(draft: OrderDraft | null) {
  const missing = missingRequiredOptions(draft);
  assert(missing.length > 0, "Se esperaba requiredOption pendiente.");
  assert(draft?.blockingIssue, "Debe existir blockingIssue por requiredOption pendiente.");
}

function assertNoRequiredPending(draft: OrderDraft | null) {
  assert.deepEqual(missingRequiredOptions(draft), []);
  assert(!draft?.blockingIssue, `No debe quedar blockingIssue: ${draft?.blockingIssue}`);
}

function assertNoDeliveryPromptBeforeRequiredOption(result: ConversationTurnResult | null) {
  const reply = normalize(result?.reply);
  assert(!/\bnombre completo\b|\bdireccion\b|\bmetodo de pago\b/.test(reply), result?.reply);
}

function assertAdditionOnOnly(
  draft: OrderDraft | null,
  targetProduct: string,
  modifierName: string,
  untouchedProduct?: string
) {
  const target = findItem(draft, targetProduct);
  assert(target, `No se encontro item target ${targetProduct}`);
  assert(
    additions(target).some((name) => normalize(name) === normalize(modifierName)),
    `${modifierName} no quedo aplicado a ${targetProduct}. Adiciones: ${additions(target).join(", ")}`
  );

  if (untouchedProduct) {
    const untouched = findItem(draft, untouchedProduct);
    assert(untouched, `No se encontro item ${untouchedProduct}`);
    assert(
      !additions(untouched).some((name) => normalize(name) === normalize(modifierName)),
      `${modifierName} fue aplicado al item equivocado ${untouchedProduct}.`
    );
  }
}

function assertQuantity(draft: OrderDraft | null, productName: string, quantity: number) {
  const item = findItem(draft, productName);
  assert(item, `No se encontro ${productName}`);
  assert.equal(item.quantity, quantity);
}

const deliveryCabeceraNequi = "Juan Perez, calle 10 #20-30 Cabecera, Nequi";

await check("simple", "Mix Oreo Milo simple", async () => {
  const { draft, turns } = await runConversation(["quiero Mix Oreo Milo"], "qa_div_simple_01");
  assertOpenAiTurns(turns);
  assertSingleItemDraft(draft, "Mix Oreo Milo");
});

await check("simple", "Durazno con crema simple", async () => {
  const { draft, turns } = await runConversation(["quiero Durazno con crema"], "qa_div_simple_02");
  assertOpenAiTurns(turns);
  assertSingleItemDraft(draft, "Durazno con crema");
});

await check("simple", "Love Banana simple", async () => {
  const { draft, turns } = await runConversation(["quiero Love Banana"], "qa_div_simple_03");
  assertOpenAiTurns(turns);
  assertSingleItemDraft(draft, "Love Banana");
});

await check("simple", "Oblea Nutella simple", async () => {
  const { draft, turns } = await runConversation(["quiero Oblea Nutella"], "qa_div_simple_04");
  assertOpenAiTurns(turns);
  assertSingleItemDraft(draft, "Oblea Nutella");
});

await check("simple", "Malteada Oreo simple", async () => {
  const { draft, turns } = await runConversation(["quiero Malteada Oreo"], "qa_div_simple_05");
  assertOpenAiTurns(turns);
  assertSingleItemDraft(draft, "Malteada Oreo");
});

await check("required-options", "Fresas con helado sin sabor bloquea antes de delivery", async () => {
  const { draft, lastResult, turns } = await runConversation(["quiero fresas con helado"], "qa_div_req_01");
  assertOpenAiTurns(turns);
  assertSingleItemDraft(draft, "Fresas con helado");
  assertRequiredPending(draft);
  assertNoDeliveryPromptBeforeRequiredOption(lastResult);
});

await check("required-options", "Fresas con helado con sabor queda completo", async () => {
  const { draft, turns } = await runConversation(["quiero fresas con helado de vainilla"], "qa_div_req_02");
  assertOpenAiTurns(turns);
  const item = assertSingleItemDraft(draft, "Fresas con helado");
  assertSelected(item, "iceCreamFlavor", ["Vainilla"]);
  assertNoRequiredPending(draft);
});

await check("required-options", "Waffle Tradicional con fruta, helado y salsa", async () => {
  const { draft, turns } = await runConversation(
    ["quiero Waffle Tradicional con fruta fresa, helado de oreo y salsa arequipe"],
    "qa_div_req_03"
  );
  assertOpenAiTurns(turns);
  const item = assertSingleItemDraft(draft, "Waffle Tradicional");
  assertSelected(item, "fruit", ["Fresa"]);
  assertSelected(item, "iceCreamFlavor", ["Oreo"]);
  assertSelected(item, "sauce", ["Arequipe"]);
  assertNoRequiredPending(draft);
});

await check("required-options", "Vaso Fantasia resuelve cuatro opciones", async () => {
  const { draft, turns } = await runConversation(
    ["quiero Vaso Fantasia con helado de chocolate, fruta banano, topping Milo y salsa Nutella"],
    "qa_div_req_04"
  );
  assertOpenAiTurns(turns);
  const item = assertSingleItemDraft(draft, "Vaso Fantasia");
  assertSelected(item, "iceCreamFlavor", ["Chocolate"]);
  assertSelected(item, "fruit", ["Banano"]);
  assertSelected(item, "includedTopping", ["Milo"]);
  assertSelected(item, "sauce", ["Nutella"]);
  assertNoRequiredPending(draft);
});

await check("required-options", "Vaso helado dos sabores captura dos sabores", async () => {
  const { draft, turns } = await runConversation(
    ["quiero vaso helado dos sabores de fresa y chocolate"],
    "qa_div_req_05"
  );
  assertOpenAiTurns(turns);
  const item = assertSingleItemDraft(draft, "Vaso helado dos sabores");
  assertSelected(item, "iceCreamFlavor", ["Fresa", "Chocolate"]);
  assertNoRequiredPending(draft);
});

await check("multiproduct", "Love Banana y Oblea Arequipe quedan independientes", async () => {
  const { draft, turns } = await runConversation(
    ["quiero Love Banana y Oblea Arequipe"],
    "qa_div_multi_01"
  );
  assertOpenAiTurns(turns);
  assertProductsPresent(draft, ["Love Banana", "Oblea Arequipe"]);
});

await check("multiproduct", "Topping en P1 no contamina P2", async () => {
  const { draft, turns } = await runConversation(
    ["quiero Fresas con crema tradicional con Oreo y Oblea Nutella"],
    "qa_div_multi_02"
  );
  assertOpenAiTurns(turns);
  assertProductsPresent(draft, ["Fresas con crema tradicional", "Oblea Nutella"]);
  assertAdditionOnOnly(draft, "Fresas con crema tradicional", "Oreo", "Oblea Nutella");
});

await check("multiproduct", "Tres productos de categorias distintas", async () => {
  const { draft, turns } = await runConversation(
    ["quiero Malteada Fresa, Pavlova y Vaso Waffle"],
    "qa_div_multi_03"
  );
  assertOpenAiTurns(turns);
  assertProductsPresent(draft, ["Malteada Fresa", "Pavlova", "Vaso Waffle"]);
});

await check("multiproduct", "Ademas agrega oblea con topping como item nuevo", async () => {
  const { draft, turns } = await runConversation(
    ["quiero fresas con helado de vainilla", "ademas una oblea arequipe con brownie"],
    "qa_div_multi_04"
  );
  assertOpenAiTurns(turns);
  assertProductsPresent(draft, ["Fresas con helado", "Oblea Arequipe"]);
  assertAdditionOnOnly(draft, "Oblea Arequipe", "Brownie", "Fresas con helado");
});

await check("multiproduct", "Tambien agregame malteada despues de brownie con helado", async () => {
  const { draft, turns } = await runConversation(
    ["quiero Brownie con Helado de chocolate", "tambien agregame una Malteada Vainilla"],
    "qa_div_multi_05"
  );
  assertOpenAiTurns(turns);
  assertProductsPresent(draft, ["Brownie con Helado", "Malteada Vainilla"]);
  assertSelected(findItem(draft, "Brownie con Helado"), "iceCreamFlavor", ["Chocolate"]);
});

await check("multiproduct", "Productos parecidos Mix Oreo y Combinado no se confunden", async () => {
  const { draft, turns } = await runConversation(
    ["quiero Mix Oreo y Combinado fresa banano con crema"],
    "qa_div_multi_06"
  );
  assertOpenAiTurns(turns);
  assertProductsPresent(draft, ["Mix Oreo", "Combinado fresa banano con crema"]);
});

await check("large-order", "Pedido grande 7 productos simples", async () => {
  const names = [
    "Love Banana",
    "Oblea Arequipe",
    "Oblea Nutella",
    "Pavlova",
    "Vaso Waffle",
    "Malteada Fresa",
    "Mix Oreo"
  ];
  const { draft, turns } = await runConversation([`quiero ${names.join(", ")}`], "qa_div_large_01");
  assertOpenAiTurns(turns);
  assertProductsPresent(draft, names);
});

await check("large-order", "Pedido grande con cantidades y topping dirigido", async () => {
  const { draft, turns } = await runConversation(
    ["para una reunion: 2 Love Banana, 1 Oblea Arequipe con Oreo, 1 Pavlova, 3 Malteada Oreo y una Oblea Nutella"],
    "qa_div_large_02"
  );
  assertOpenAiTurns(turns);
  assertProductsPresent(draft, ["Love Banana", "Oblea Arequipe", "Pavlova", "Malteada Oreo", "Oblea Nutella"]);
  assertQuantity(draft, "Love Banana", 2);
  assertQuantity(draft, "Malteada Oreo", 3);
  assertAdditionOnOnly(draft, "Oblea Arequipe", "Oreo", "Love Banana");
});

await check("large-order", "Pedido grande con requiredOptions resueltos", async () => {
  const names = [
    "Fresas con helado",
    "Brownie con Helado",
    "Vaso helado un sabor",
    "Oblea Arequipe",
    "Love Banana",
    "Malteada Chocolate"
  ];
  const { draft, turns } = await runConversation(
    ["quiero Fresas con helado de vainilla, Brownie con Helado de chocolate, Vaso helado un sabor de Oreo, Oblea Arequipe, Love Banana y Malteada Chocolate"],
    "qa_div_large_03"
  );
  assertOpenAiTurns(turns);
  assertProductsPresent(draft, names);
  assertNoRequiredPending(draft);
});

await check("large-order", "Pedido grande con obleas parecidas", async () => {
  const names = [
    "Oblea Arequipe",
    "Oblea Arequipe crema",
    "Oblea Arequipe dulce de mora",
    "Oblea Arequipe Queso",
    "Oblea Nutella",
    "Oblea Crema y Nutella"
  ];
  const { draft, turns } = await runConversation([`quiero ${names.join(", ")}`], "qa_div_large_04");
  assertOpenAiTurns(turns);
  assertProductsPresent(draft, names);
});

await check("large-order", "Pedido grande no cierra con sabor pendiente", async () => {
  const names = [
    "Love Banana",
    "Fresas con helado",
    "Oblea Arequipe",
    "Pavlova",
    "Vaso Waffle",
    "Malteada Fresa"
  ];
  const { draft, order, lastResult, turns } = await runConversation(
    ["quiero Love Banana, fresas con helado, Oblea Arequipe, Pavlova, Vaso Waffle y Malteada Fresa"],
    "qa_div_large_05"
  );
  assertOpenAiTurns(turns);
  assertProductsPresent(draft, names);
  assertRequiredPending(draft);
  assertNoDeliveryPromptBeforeRequiredOption(lastResult);
  assert.equal(order, null);
});

await check("targeted-toppings", "Oreo a las fresas aunque no sea ultimo item", async () => {
  const { draft, turns } = await runConversation(
    ["quiero fresas con helado de vainilla y Love Banana", "ponle Oreo a las fresas"],
    "qa_div_target_01"
  );
  assertOpenAiTurns(turns);
  assertProductsPresent(draft, ["Fresas con helado", "Love Banana"]);
  assertAdditionOnOnly(draft, "Fresas con helado", "Oreo", "Love Banana");
});

await check("targeted-toppings", "Brownie a la oblea con target explicito", async () => {
  const { draft, turns } = await runConversation(
    ["quiero Oblea Arequipe y Malteada Oreo", "ponle brownie a la oblea"],
    "qa_div_target_02"
  );
  assertOpenAiTurns(turns);
  assertProductsPresent(draft, ["Oblea Arequipe", "Malteada Oreo"]);
  assertAdditionOnOnly(draft, "Oblea Arequipe", "Brownie", "Malteada Oreo");
});

await check("targeted-toppings", "Ordinal primero aplica al primer item", async () => {
  const { draft, turns } = await runConversation(
    ["quiero Love Banana y Oblea Nutella", "al primero ponle brownie"],
    "qa_div_target_03"
  );
  assertOpenAiTurns(turns);
  assertAdditionOnOnly(draft, "Love Banana", "Brownie", "Oblea Nutella");
});

await check("targeted-toppings", "Ordinal segundo remueve crema del segundo item", async () => {
  const { draft, turns } = await runConversation(
    ["quiero Fresas con crema tradicional y Oblea Arequipe crema", "al segundo quitale crema"],
    "qa_div_target_04"
  );
  assertOpenAiTurns(turns);
  const oblea = findItem(draft, "Oblea Arequipe crema");
  assert(oblea, "No se encontro oblea.");
  assert(removals(oblea).some((name) => normalize(name) === "crema"), "No removio crema del segundo item.");
  const fresas = findItem(draft, "Fresas con crema tradicional");
  assert(!removals(fresas).some((name) => normalize(name) === "crema"), "Removio crema del item equivocado.");
});

await check("targeted-toppings", "Topping ambiguo con varios items pide aclaracion", async () => {
  const { draft, turns, lastResult } = await runConversation(
    ["quiero Love Banana y Oblea Arequipe", "ponle chocolate"],
    "qa_div_target_05"
  );
  assertOpenAiTurns(turns);
  assertProductsPresent(draft, ["Love Banana", "Oblea Arequipe"]);
  assertNoCustomFromQuestion(draft);
  assert(
    draft?.blockingIssue || /cual|producto|confirm/i.test(normalize(lastResult?.reply)),
    "Debe pedir aclaracion si no sabe a que item aplicar el topping."
  );
});

await check("catalog-question", "Pregunta toppings para oblea no crea producto", async () => {
  const { draft, turns } = await runConversation(
    ["quiero Oblea Arequipe", "que toppings tienes para la oblea?"],
    "qa_div_question_01"
  );
  assertOpenAiTurns(turns);
  assertProductsPresent(draft, ["Oblea Arequipe"]);
  assertNoCustomFromQuestion(draft);
});

await check("catalog-question", "Pregunta sabores de helado mantiene requiredOption pendiente", async () => {
  const { draft, turns } = await runConversation(
    ["quiero fresas con helado", "que sabores de helado tienes?"],
    "qa_div_question_02"
  );
  assertOpenAiTurns(turns);
  assertProductsPresent(draft, ["Fresas con helado"]);
  assertRequiredPending(draft);
  assertNoCustomFromQuestion(draft);
});

await check("catalog-question", "Pregunta que poner a las fresas no modifica item", async () => {
  const { draft, turns } = await runConversation(
    ["quiero Fresas con crema tradicional", "que le puedo poner a las fresas?"],
    "qa_div_question_03"
  );
  assertOpenAiTurns(turns);
  assertProductsPresent(draft, ["Fresas con crema tradicional"]);
  assert.equal(additions(findItem(draft, "Fresas con crema tradicional")).length, 0);
  assertNoCustomFromQuestion(draft);
});

await check("catalog-question", "Pregunta cuanto vale ese no reinicia ni crea producto", async () => {
  const { draft, turns } = await runConversation(
    ["quiero Oblea Arequipe y Love Banana", "cuanto vale ese?"],
    "qa_div_question_04"
  );
  assertOpenAiTurns(turns);
  assertProductsPresent(draft, ["Oblea Arequipe", "Love Banana"]);
  assertNoCustomFromQuestion(draft);
});

await check("mixed-final-data", "Nombre direccion barrio y pago en un mensaje cierra draft", async () => {
  const { order, turns } = await runConversation(
    ["quiero fresas con helado de vainilla", "Marta Albeira, cra 39a #41-99, cabecera y neqi"],
    "qa_div_final_01"
  );
  assertOpenAiTurns(turns);
  assert(order, "Debe crear orden.");
  assert.equal(order.items[0]?.productName, "Fresas con helado");
  assert.equal(order.customerName, "Marta Albeira");
  assert.equal(order.zoneName, "Cabecera");
  assert.equal(order.paymentMethod, "Nequi");
});

await check("mixed-final-data", "Barrio y pago despues de direccion aplican al draft activo", async () => {
  const { order, turns } = await runConversation(
    ["fresas con helado de vainilla", "Juan Moreno", "Cra 39a # 41-99", "barrio Cabecera del Llano y Nequi"],
    "qa_div_final_02"
  );
  assertOpenAiTurns(turns);
  assert(order, "Debe crear orden.");
  assert.equal(order.items[0]?.productName, "Fresas con helado");
  assert.equal(order.customerName, "Juan Moreno");
  assert.equal(order.zoneName, "Cabecera");
  assert.equal(order.paymentMethod, "Nequi");
});

await check("mixed-final-data", "Efectivo con monto no pide metodo otra vez", async () => {
  const { order, turns } = await runConversation(
    ["quiero Oblea Nutella", "Ana", "Cra 39a #41-99 Cabecera", "efectivo con 50000"],
    "qa_div_final_03"
  );
  assertOpenAiTurns(turns);
  assert(order, "Debe crear orden.");
  assert.equal(order.paymentMethod, "Efectivo");
  assert.equal(order.cashAmount, "50000");
});

const failed = results.filter((result) => !result.ok);
const byGroup = results.reduce<Record<string, { ok: number; total: number }>>((acc, result) => {
  acc[result.group] ??= { ok: 0, total: 0 };
  acc[result.group].total += 1;
  if (result.ok) {
    acc[result.group].ok += 1;
  }
  return acc;
}, {});

console.log("Diversity smoke coverage");
console.log(`Products (${coverageProducts.length}): ${coverageProducts.join(", ")}`);
console.log(`Modifiers (${coverageModifiers.length}): ${coverageModifiers.join(", ")}`);
for (const [group, summary] of Object.entries(byGroup)) {
  console.log(`${group}: ${summary.ok}/${summary.total}`);
}

for (const result of results) {
  const marker = result.ok ? "OK" : "FAIL";
  console.log(`${marker} [${result.group}] ${result.name}${result.error ? ` - ${result.error}` : ""}`);
}

if (failed.length > 0) {
  process.exitCode = 1;
} else {
  console.log(`Diversity smoke QA passed ${results.length}/${results.length}`);
}
