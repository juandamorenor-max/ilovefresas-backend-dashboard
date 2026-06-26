import { strict as assert } from "node:assert";
import { demoStore } from "../data/demoStore.js";
import { BotIntegrationService } from "../services/bot-integration.service.js";
import type { OrderItem } from "../types/index.js";

type TurnLog = {
  user: string;
  bot: string;
  source: string;
  state: string;
  missingFields: string[];
  items: Array<{
    productName: string;
    quantity: number;
    selectedOptions: Record<string, string[]>;
  }>;
};

demoStore.conversations = [];
demoStore.messages = [];
demoStore.orders = [];

const service = new BotIntegrationService();

function assertIncludes(text: unknown, expected: string, label: string) {
  assert(
    String(text).includes(expected),
    `${label} should include "${expected}". Actual:\n${String(text)}`
  );
}

function assertNotIncludes(text: unknown, unexpected: string, label: string) {
  assert(
    !String(text).includes(unexpected),
    `${label} should not include "${unexpected}". Actual:\n${String(text)}`
  );
}

function normalized(text: unknown) {
  return String(text)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function startWaffleConversation(chatId: string, text: string) {
  const conversation = service.getOrCreateActiveConversation("telegram", chatId);
  service.updateConversationState(conversation.id, {
    customerMessage: text,
    items: [{ producto: "Fresas con helado", cantidad: 1, precio_unitario: 18000 }],
    modalidad_entrega: "domicilio"
  });
  return conversation.id;
}

function draftItems(chatId: string) {
  return service.getOrCreateActiveConversation("telegram", chatId).draftOrder?.items ?? [];
}

function itemAt(chatId: string, index: number) {
  const item = draftItems(chatId)[index];
  assert(item, `Expected item at index ${index}`);
  return item;
}

function selected(item: OrderItem, key: string) {
  return item.selectedOptions?.[key] ?? [];
}

function snapshotOptions(item: OrderItem) {
  return Object.fromEntries(
    Object.entries(item.selectedOptions ?? {}).map(([key, values]) => [key, [...values]])
  );
}

function runRequiredOptionTurn(chatId: string, conversationId: string, text: string): TurnLog {
  const turn = service.handleRequiredOptionsTurn(conversationId, text);
  assert(turn, `Expected backend required-options turn for "${text}"`);
  const current = service.getOrCreateActiveConversation("telegram", chatId);
  const readiness = service.getOrderReviewReadiness(conversationId);

  return {
    user: text,
    bot: String(turn.responseText),
    source: String(turn.source),
    state: current.state,
    missingFields: readiness.missingFields,
    items: (current.draftOrder?.items ?? []).map((item) => ({
      productName: item.productName,
      quantity: item.quantity,
      selectedOptions: snapshotOptions(item)
    }))
  };
}

function applyDeliveryData(
  chatId: string,
  conversationId: string,
  payload: {
    customerMessage: string;
    nombre: string;
    direccion: string;
    barrio: string;
    referencia: string;
    metodo_pago: string;
  }
) {
  service.updateConversationState(conversationId, {
    ...payload,
    modalidad_entrega: "domicilio"
  });
  const nextStep = service.buildNextOrderStepReply(conversationId);
  assert(nextStep, "Expected confirmation summary after delivery data");
  const current = service.getOrCreateActiveConversation("telegram", chatId);

  return {
    user: payload.customerMessage,
    bot: String(nextStep.responseText),
    source: String(nextStep.source),
    state: current.state,
    missingFields: service.getOrderReviewReadiness(conversationId).missingFields,
    items: (current.draftOrder?.items ?? []).map((item) => ({
      productName: item.productName,
      quantity: item.quantity,
      selectedOptions: snapshotOptions(item)
    }))
  };
}

function assertNoDeliveryPrompt(log: TurnLog, label: string) {
  assertNotIncludes(log.bot, "Nombre:", label);
  assertNotIncludes(log.bot, "Direccion:", label);
  assert(
    log.missingFields.includes("opciones_obligatorias"),
    `${label} should still block on required options`
  );
}

function assertOrderIsSplit(chatId: string) {
  const items = draftItems(chatId);
  assert.equal(items.filter((item) => item.productName === "Waffle Tradicional").length, 1);
  assert.equal(items.filter((item) => item.productName === "Waffle Chocolate").length, 2);
  assert.equal(items.filter((item) => item.productName === "Fresas con helado").length, 1);
  assert.equal(items.some((item) => item.productName === "Fresas con crema tradicional"), false);
  assert.equal(items.some((item) => item.quantity > 1), false);
}

function runPartialRealisticOrder() {
  const chatId = "qa-realistic-waffle-partial";
  const conversationId = startWaffleConversation(
    chatId,
    "quiero 3 wafles y unas fresas con helado"
  );
  const logs: TurnLog[] = [];

  const firstQuestion = service.buildNextOrderStepReply(conversationId);
  assertIncludes(firstQuestion?.responseText, "3 waffles", "variant question");
  assertIncludes(firstQuestion?.responseText, "tradicionales", "variant question");
  assertIncludes(firstQuestion?.responseText, "chocolate", "variant question");

  const unknownOptions = runRequiredOptionTurn(chatId, conversationId, "no se, que opciones hay");
  assertIncludes(unknownOptions.bot, "tradicionales", "unknown variant options");
  assertIncludes(unknownOptions.bot, "chocolate", "unknown variant options");
  assert.equal(unknownOptions.source, "backend_waffle_variant_guardrail");
  logs.push(unknownOptions);

  const variantSplit = runRequiredOptionTurn(chatId, conversationId, "uno tradicional y dos chocolate");
  assertIncludes(variantSplit.bot, "Frutas:", "required option choices");
  assertIncludes(variantSplit.bot, "Helados:", "required option choices");
  assertIncludes(variantSplit.bot, "Salsas:", "required option choices");
  assertOrderIsSplit(chatId);
  logs.push(variantSplit);

  const fruitOnly = runRequiredOptionTurn(chatId, conversationId, "fresa");
  assert.deepEqual(selected(itemAt(chatId, 0), "fruit"), ["Fresa"]);
  assert.deepEqual(selected(itemAt(chatId, 0), "iceCreamFlavor"), []);
  assertNoDeliveryPrompt(fruitOnly, "fruit-only reply");
  logs.push(fruitOnly);

  const iceCreamOnly = runRequiredOptionTurn(chatId, conversationId, "vainilla");
  assert.deepEqual(selected(itemAt(chatId, 0), "iceCreamFlavor"), ["Vainilla"]);
  assert.deepEqual(selected(itemAt(chatId, 0), "sauce"), []);
  assertNoDeliveryPrompt(iceCreamOnly, "ice-cream-only reply");
  logs.push(iceCreamOnly);

  const sauceTypo = runRequiredOptionTurn(chatId, conversationId, "arekipe");
  assert.deepEqual(selected(itemAt(chatId, 0), "sauce"), ["Arequipe"]);
  assertNoDeliveryPrompt(sauceTypo, "sauce typo reply");
  logs.push(sauceTypo);

  const correction = runRequiredOptionTurn(chatId, conversationId, "la salsa del primero que sea nutella");
  assert.deepEqual(selected(itemAt(chatId, 0), "sauce"), ["Nutella"]);
  assertNoDeliveryPrompt(correction, "first waffle sauce correction");
  logs.push(correction);

  const otherFruit = runRequiredOptionTurn(chatId, conversationId, "el otro con kiwi");
  assert.deepEqual(selected(itemAt(chatId, 1), "fruit"), ["Kiwi"]);
  assertNoDeliveryPrompt(otherFruit, "other waffle fruit");
  logs.push(otherFruit);

  const otherCorrection = runRequiredOptionTurn(chatId, conversationId, "mejor el segundo waffle con mango no kiwi");
  assert.deepEqual(selected(itemAt(chatId, 1), "fruit"), ["Mango"]);
  assertNoDeliveryPrompt(otherCorrection, "second waffle fruit correction");
  logs.push(otherCorrection);

  const otherIceCreamSauce = runRequiredOptionTurn(chatId, conversationId, "chocolate y hersey");
  assert.deepEqual(selected(itemAt(chatId, 1), "iceCreamFlavor"), ["Chocolate"]);
  assert.deepEqual(selected(itemAt(chatId, 1), "sauce"), ["Salsa Hershey"]);
  assertNoDeliveryPrompt(otherIceCreamSauce, "ambiguous ice cream and sauce");
  logs.push(otherIceCreamSauce);

  const secondChocolateFruit = runRequiredOptionTurn(chatId, conversationId, "segundo waffle chocolate con fruta durazno");
  assert.deepEqual(selected(itemAt(chatId, 2), "fruit"), ["Durazno"]);
  assertNoDeliveryPrompt(secondChocolateFruit, "second chocolate fruit");
  logs.push(secondChocolateFruit);

  const secondChocolateFlavor = runRequiredOptionTurn(chatId, conversationId, "helado oreo");
  assert.deepEqual(selected(itemAt(chatId, 2), "iceCreamFlavor"), ["Oreo"]);
  assertNoDeliveryPrompt(secondChocolateFlavor, "second chocolate ice cream");
  logs.push(secondChocolateFlavor);

  const secondChocolateSauce = runRequiredOptionTurn(chatId, conversationId, "salsa arequipe");
  assert.deepEqual(selected(itemAt(chatId, 2), "sauce"), ["Arequipe"]);
  assertNoDeliveryPrompt(secondChocolateSauce, "second chocolate sauce");
  logs.push(secondChocolateSauce);

  const strawberriesFlavor = runRequiredOptionTurn(chatId, conversationId, "oreo");
  assert.deepEqual(selected(itemAt(chatId, 3), "iceCreamFlavor"), ["Oreo"]);
  assert.equal(strawberriesFlavor.source, "backend_next_action_guardrail");
  assertIncludes(strawberriesFlavor.bot, "Nombre:", "delivery template after all required options");
  assert(
    !strawberriesFlavor.missingFields.includes("opciones_obligatorias"),
    "all required options should be complete before delivery data"
  );
  logs.push(strawberriesFlavor);

  const summary = applyDeliveryData(chatId, conversationId, {
    customerMessage: "carlos diaz cra 51 # 82-100 riomar porteria nequi",
    nombre: "Carlos Diaz",
    direccion: "cra 51 # 82-100",
    barrio: "riomar",
    referencia: "porteria",
    metodo_pago: "Nequi"
  });
  assertIncludes(summary.bot, "1 x Waffle Tradicional (fruta: Fresa; sabor de helado: Vainilla; salsa: Nutella): $15,000", "partial summary");
  assertIncludes(summary.bot, "1 x Waffle Chocolate (fruta: Mango; sabor de helado: Chocolate; salsa: Salsa Hershey): $15,000", "partial summary");
  assertIncludes(summary.bot, "1 x Waffle Chocolate (fruta: Durazno; sabor de helado: Oreo; salsa: Arequipe): $15,000", "partial summary");
  assertIncludes(summary.bot, "1 x Fresas con helado (sabor de helado: Oreo): $18,000", "partial summary");
  assertIncludes(summary.bot, "Total: $68,000", "partial summary");
  assertNotIncludes(summary.bot, "Fresas con crema tradicional", "partial summary");
  assertNotIncludes(summary.bot, "2 x Waffle Chocolate", "partial summary");
  logs.push(summary);

  return { chatId, conversationId, logs };
}

function runDirectRealisticOrder() {
  const chatId = "qa-realistic-waffle-direct";
  const conversationId = startWaffleConversation(
    chatId,
    "quiero tres wafles y unas fresas con helado"
  );
  const logs: TurnLog[] = [];

  logs.push(runRequiredOptionTurn(chatId, conversationId, "uno tradicional y dos chocolate"));
  logs.push(runRequiredOptionTurn(chatId, conversationId, "primer waffle tradicional con fruta durazno"));
  logs.push(runRequiredOptionTurn(chatId, conversationId, "helado fresa y salsa dulce de mora"));
  logs.push(runRequiredOptionTurn(chatId, conversationId, "primer waffle chocolate con fruta kiwi, helado vainilla y salsa arequipe"));
  logs.push(runRequiredOptionTurn(chatId, conversationId, "segundo waffle chocolate con fruta mango"));
  logs.push(runRequiredOptionTurn(chatId, conversationId, "helado chocolate y salsa nutella"));
  logs.push(runRequiredOptionTurn(chatId, conversationId, "fresas con helado oreo"));

  const summary = applyDeliveryData(chatId, conversationId, {
    customerMessage: "laura ruiz calle 80 # 43-20 villa santos apto 302 bankolombia",
    nombre: "Laura Ruiz",
    direccion: "calle 80 # 43-20",
    barrio: "villa santos",
    referencia: "apto 302",
    metodo_pago: "bankolombia"
  });
  assertIncludes(summary.bot, "1 x Waffle Tradicional (fruta: Durazno; sabor de helado: Fresa; salsa: Dulce de mora): $15,000", "direct summary");
  assertIncludes(summary.bot, "1 x Waffle Chocolate (fruta: Kiwi; sabor de helado: Vainilla; salsa: Arequipe): $15,000", "direct summary");
  assertIncludes(summary.bot, "1 x Waffle Chocolate (fruta: Mango; sabor de helado: Chocolate; salsa: Nutella): $15,000", "direct summary");
  assertIncludes(summary.bot, "1 x Fresas con helado (sabor de helado: Oreo): $18,000", "direct summary");
  assert(
    normalized(summary.bot).includes("metodo de pago: bancolombia"),
    "bankolombia typo normalization"
  );
  assertIncludes(summary.bot, "Total: $68,000", "direct summary");
  assertNotIncludes(summary.bot, "Fresas con crema tradicional", "direct summary");
  assertNotIncludes(summary.bot, "2 x Waffle Chocolate", "direct summary");
  logs.push(summary);

  return { chatId, conversationId, logs };
}

const partialOrder = runPartialRealisticOrder();
const directOrder = runDirectRealisticOrder();

console.log(
  JSON.stringify(
    {
      ok: true,
      scenarios: [
        {
          name: "partial-realistic-order",
          chatId: partialOrder.chatId,
          conversationId: partialOrder.conversationId,
          turns: partialOrder.logs
        },
        {
          name: "direct-realistic-order",
          chatId: directOrder.chatId,
          conversationId: directOrder.conversationId,
          turns: directOrder.logs
        }
      ]
    },
    null,
    2
  )
);
