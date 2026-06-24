import { strict as assert } from "node:assert";
import type { ConversationTurnResult, Order } from "../types/index.js";

process.env.NODE_ENV = "production";
process.env.TELEGRAM_ADMIN_BOT_TOKEN = "";
process.env.TELEGRAM_ADMIN_CHAT_ID = "";

const { ConversationService } = await import("../services/conversation.service.js");
const { demoStore } = await import("../data/demoStore.js");

demoStore.businesses[0]!.status.manualOpenOverride = true;

type ConversationServiceInstance = InstanceType<typeof ConversationService>;

interface CheckResult {
  name: string;
  ok: boolean;
  error?: string;
}

async function runConversation(messages: string[], phone: string) {
  const service: ConversationServiceInstance = new ConversationService();
  let lastResult = null;

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

async function runConversationWithSnapshots(messages: string[], phone: string) {
  const service: ConversationServiceInstance = new ConversationService();
  let lastResult: ConversationTurnResult | null = null;
  const snapshots: Array<{
    text: string;
    reply: string;
    state: string | undefined;
    items: string[];
    customerName: string | null | undefined;
    address: string | null | undefined;
    inferredZoneId: string | null | undefined;
    paymentMethod: string | null | undefined;
    blockingIssue: string | null | undefined;
    orderCount: number;
  }> = [];

  for (const text of messages) {
    lastResult = await service.handleIncomingMessage({
      from: phone,
      to: "qa-business",
      text
    });

    const conversation = demoStore.conversations.find((entry) => entry.customerPhone === phone);
    const draft = conversation?.draftOrder;
    snapshots.push({
      text,
      reply: lastResult.reply,
      state: conversation?.state,
      items: draft?.items.map((item) => item.productName) ?? [],
      customerName: draft?.customerName,
      address: draft?.address,
      inferredZoneId: draft?.inferredZoneId,
      paymentMethod: draft?.paymentMethod,
      blockingIssue: draft?.blockingIssue,
      orderCount: demoStore.orders.filter((order) => order.customerPhone === phone).length
    });
  }

  const conversation = demoStore.conversations.find((entry) => entry.customerPhone === phone);
  const order = demoStore.orders.find((entry) => entry.customerPhone === phone);

  return { lastResult, conversation, order, snapshots };
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

function assertCompletedFresasDeliveryOrder(order: Order | undefined, expectedPayment = "Nequi") {
  assert(order, "Expected order to be created");
  assert.equal(order.items.length, 1);
  assert.equal(order.items[0]?.productName, "Fresas con helado");
  assert.equal(order.customerName, "Marta Albeira");
  assert.equal(order.address, "Cra 39a # 41-99");
  assert.equal(order.zoneName, "Cabecera");
  assert.equal(order.paymentMethod, expectedPayment);
  assert.equal(order.pricing.total, 23000);
}

function assertDidNotAskForProduct(reply: string | undefined) {
  assert.doesNotMatch(reply ?? "", /producto quieres pedir|que deseas ordenar|que producto/i);
}

function assertZoneNotDetectedHandoff(
  conversation: Awaited<ReturnType<typeof runConversation>>["conversation"],
  order: Awaited<ReturnType<typeof runConversation>>["order"],
  reply: string | undefined
) {
  assert.equal(order, undefined);
  assert.equal(conversation?.state, "pending_human");
  assert.equal(conversation?.draftOrder?.inferredZoneId, null);
  assert.match(conversation?.draftOrder?.blockingIssue ?? "", /No se pudo detectar zona\/barrio/i);
  assert.match(reply ?? "", /no pude confirmar la zona de domicilio/i);
  assertDidNotAskForProduct(reply);
}

function normalizeText(value: string | undefined) {
  return (value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

const results: CheckResult[] = [];

await check(
  "captura cantidades escritas en letras",
  async () => {
    const { conversation } = await runConversation(
      ["quiero dos fresas tradicionales con brownie"],
      "qa_reg_qty"
    );

    assert.equal(conversation?.draftOrder?.items[0]?.quantity, 2);
    assert.equal(conversation?.draftOrder?.pricing.subtotal, 36000);
  },
  results
);

await check(
  "captura producto escrito sin verbo de pedido",
  async () => {
    const { conversation } = await runConversation(["una oblea nutella rapido"], "qa_reg_noverb");

    assert.equal(conversation?.draftOrder?.items[0]?.productName, "Oblea Nutella");
  },
  results
);

await check(
  "reemplaza producto cuando el cliente cambia de idea",
  async () => {
    const { order } = await runConversation(
      [
        "quiero una oblea",
        "mejor cambiala por fresas con helado de vainilla",
        "Juan Perez, calle 10 #20-30 Cabecera, Nequi"
      ],
      "qa_reg_replace"
    );

    assert.equal(order?.items.length, 1);
    assert.equal(order?.items[0]?.productName, "Fresas con helado");
    assert.equal(order?.pricing.total, 23000);
  },
  results
);

await check(
  "aplica toppings posteriores al item activo",
  async () => {
    const { order } = await runConversation(
      [
        "quiero una tradicional",
        "menu",
        "con brownie",
        "Juan Perez, calle 10 #20-30 Cabecera, Nequi"
      ],
      "qa_reg_modifier"
    );

    assert(
      order?.items[0]?.components.some(
        (component) => component.type === "added" && component.name === "Brownie"
      )
    );
    assert.equal(order?.pricing.total, 23000);
  },
  results
);

await check(
  "agrega segundo producto libre sin guardarlo como nombre",
  async () => {
    const { order } = await runConversation(
      [
        "ok, para comenzar querria una fresas con helado de vainilla",
        "y un love banana",
        "Juan Perez, calle 10 #20-30 Cabecera, Nequi"
      ],
      "qa_reg_second_free_text_item"
    );

    assert.equal(order?.items.length, 2);
    assert.equal(order?.items[0]?.productName, "Fresas con helado");
    assert.equal(order?.items[1]?.productName, "Love Banana");
    assert.equal(order?.items[1]?.unitBasePrice, 17000);
    assert.equal(order?.customerName, "Juan Perez");
  },
  results
);

await check(
  "aplica adicion al ultimo item si no hay target explicito",
  async () => {
    const { order } = await runConversation(
      [
        "quiero unas fresas con helado de vainilla",
        "un love banana",
        "con brownie",
        "Juan Perez, calle 10 #20-30 Cabecera, Nequi"
      ],
      "qa_reg_target_fallback_last"
    );

    assert.equal(order?.items.length, 2);
    assert(
      order?.items[1]?.components.some(
        (component) => component.type === "added" && component.name === "Brownie"
      )
    );
    assert.equal(
      order?.items[0]?.components.some(
        (component) => component.type === "added" && component.name === "Brownie"
      ),
      false
    );
  },
  results
);

await check(
  "aplica adicion a item anterior cuando el producto objetivo esta explicito",
  async () => {
    const { order } = await runConversation(
      [
        "quiero unas fresas con helado de vainilla",
        "un love banana",
        "agregale brownie a las fresas",
        "Juan Perez, calle 10 #20-30 Cabecera, Nequi"
      ],
      "qa_reg_target_previous_item"
    );

    assert.equal(order?.items.length, 2);
    assert(
      order?.items[0]?.components.some(
        (component) => component.type === "added" && component.name === "Brownie"
      )
    );
    assert.equal(
      order?.items[1]?.components.some(
        (component) => component.type === "added" && component.name === "Brownie"
      ),
      false
    );
  },
  results
);

await check(
  "no aplica adicion al ultimo item cuando el target explicito es fresas",
  async () => {
    const { order } = await runConversation(
      [
        "quiero unas fresas con helado de vainilla",
        "un love banana",
        "y porfa agregale helado a las fresas",
        "Juan Perez, calle 10 #20-30 Cabecera, Nequi"
      ],
      "qa_reg_target_real_bug"
    );

    assert.equal(order?.items.length, 2);
    assert(
      order?.items[0]?.components.some(
        (component) => component.type === "default" && component.name === "helado"
      )
    );
    assert.equal(
      order?.items[1]?.components.some(
        (component) => component.type === "added" && component.name === "Helado"
      ),
      false
    );
    assert.equal(order?.pricing.total, 40000);
  },
  results
);

await check(
  "agrega componente adicional cuando el producto ya lo trae y el cliente dice otro",
  async () => {
    const { lastResult, conversation, order } = await runConversation(
      [
        "quiero unas fresas con helado de vainilla",
        "un love banana",
        "agregale otro helado a las fresas"
      ],
      "qa_reg_increment_existing_other"
    );

    assert.equal(order, undefined);
    assert.equal(conversation?.draftOrder?.items.length, 2);
    assert.match(lastResult?.reply ?? "", /ya incluye Helado|adicional/i);
    assert.doesNotMatch(lastResult?.reply ?? "", /opciones de helado/i);
    assert(
      conversation?.draftOrder?.items[0]?.components.some(
        (component) => component.type === "added" && component.name === "Helado"
      )
    );
    assert.equal(
      conversation?.draftOrder?.items[1]?.components.some(
        (component) => component.type === "added" && component.name === "Helado"
      ),
      false
    );
    assert.equal(conversation?.draftOrder?.pricing.subtotal, 39000);
  },
  results
);

await check(
  "agrega otra unidad de componente ya agregado cuando el cliente dice mas",
  async () => {
    const { order } = await runConversation(
      [
        "quiero una tradicional con brownie",
        "ponle mas brownie a las fresas",
        "Juan Perez, calle 10 #20-30 Cabecera, Nequi"
      ],
      "qa_reg_increment_existing_more"
    );

    const brownieAdditions =
      order?.items[0]?.components.filter(
        (component) => component.type === "added" && component.name === "Brownie"
      ) ?? [];
    assert.equal(brownieAdditions.length, 2);
    assert.equal(order?.pricing.total, 25000);
  },
  results
);

await check(
  "agrega componente extra cuando el producto ya lo trae y el cliente dice doble",
  async () => {
    const { order } = await runConversation(
      [
        "quiero una fresas con crema de oreo",
        "doble oreo",
        "Juan Perez, calle 10 #20-30 Cabecera, Nequi"
      ],
      "qa_reg_increment_existing_double"
    );

    assert(
      order?.items[0]?.components.some(
        (component) => component.type === "default" && component.name === "oreo"
      )
    );
    assert(
      order?.items[0]?.components.some(
        (component) => component.type === "added" && component.name === "Oreo"
      )
    );
    assert.equal(order?.pricing.total, 25000);
  },
  results
);

await check(
  "bloquea incremento de componente inexistente",
  async () => {
    const { conversation, order } = await runConversation(
      ["quiero una tradicional", "ponle mas gomitas a las fresas"],
      "qa_reg_increment_unknown_component"
    );

    assert.equal(order, undefined);
    assert.match(conversation?.draftOrder?.blockingIssue ?? "", /adicional registrado|confirmas/i);
    assert.equal(
      conversation?.draftOrder?.items[0]?.components.some((component) =>
        /gomita/i.test(component.name)
      ),
      false
    );
  },
  results
);

await check(
  "reemplaza componente explicito en vez de tratarlo como incremento",
  async () => {
    const { order } = await runConversation(
      [
        "quiero una tradicional con brownie",
        "cambiale el brownie por milo",
        "Juan Perez, calle 10 #20-30 Cabecera, Nequi"
      ],
      "qa_reg_component_replacement"
    );

    assert.equal(
      order?.items[0]?.components.some(
        (component) => component.type === "added" && component.name === "Brownie"
      ),
      false
    );
    assert(
      order?.items[0]?.components.some(
        (component) => component.type === "added" && component.name === "Milo"
      )
    );
    assert.equal(order?.pricing.total, 23000);
  },
  results
);

await check(
  "incremento respeta producto objetivo distinto al ultimo item",
  async () => {
    const { order } = await runConversation(
      [
        "quiero una fresas con crema de oreo",
        "un love banana",
        "doble oreo a las fresas",
        "Juan Perez, calle 10 #20-30 Cabecera, Nequi"
      ],
      "qa_reg_increment_previous_target"
    );

    assert(
      order?.items[0]?.components.some(
        (component) => component.type === "added" && component.name === "Oreo"
      )
    );
    assert.equal(
      order?.items[1]?.components.some(
        (component) => component.type === "added" && component.name === "Oreo"
      ),
      false
    );
  },
  results
);

await check(
  "aplica remocion a item anterior cuando el producto objetivo esta explicito",
  async () => {
    const { order } = await runConversation(
      [
        "quiero una tradicional con brownie",
        "un love banana",
        "sin crema en las fresas",
        "Juan Perez, calle 10 #20-30 Cabecera, Nequi"
      ],
      "qa_reg_target_previous_removal"
    );

    assert.equal(order?.items.length, 2);
    assert(
      order?.items[0]?.components.some(
        (component) => component.type === "removed" && component.name === "crema"
      )
    );
    assert.equal(
      order?.items[1]?.components.some(
        (component) => component.type === "removed" && component.name === "crema"
      ),
      false
    );
  },
  results
);

await check(
  "bloquea target ambiguo cuando hay varios productos de fresas",
  async () => {
    const { conversation, order } = await runConversation(
      [
        "quiero una tradicional",
        "una fresas con helado de vainilla",
        "agregale brownie a las fresas"
      ],
      "qa_reg_target_ambiguous"
    );

    assert.equal(order, undefined);
    assert.match(conversation?.draftOrder?.blockingIssue ?? "", /producto equivocado|confirmas/i);
    assert.equal(
      conversation?.draftOrder?.items.some((item) =>
        item.components.some((component) => component.type === "added" && component.name === "Brownie")
      ),
      false
    );
  },
  results
);

await check(
  "aplica adicion por ordinal al primer item",
  async () => {
    const { order } = await runConversation(
      [
        "quiero una tradicional",
        "un love banana",
        "a la primera ponle oreo",
        "Juan Perez, calle 10 #20-30 Cabecera, Nequi"
      ],
      "qa_reg_target_first_ordinal"
    );

    assert(
      order?.items[0]?.components.some(
        (component) => component.type === "added" && component.name === "Oreo"
      )
    );
    assert.equal(
      order?.items[1]?.components.some(
        (component) => component.type === "added" && component.name === "Oreo"
      ),
      false
    );
  },
  results
);

await check(
  "aplica adicion por ordinal al segundo item",
  async () => {
    const { order } = await runConversation(
      [
        "quiero una tradicional",
        "un love banana",
        "al segundo ponle brownie",
        "Juan Perez, calle 10 #20-30 Cabecera, Nequi"
      ],
      "qa_reg_target_second_ordinal"
    );

    assert.equal(
      order?.items[0]?.components.some(
        (component) => component.type === "added" && component.name === "Brownie"
      ),
      false
    );
    assert(
      order?.items[1]?.components.some(
        (component) => component.type === "added" && component.name === "Brownie"
      )
    );
  },
  results
);

await check(
  "captura nombre enviado solo",
  async () => {
    const { order } = await runConversation(
      ["quiero una tradicional", "Juan Perez", "calle 10 #20-30", "Cabecera", "Nequi"],
      "qa_reg_name"
    );

    assert.equal(order?.customerName, "Juan Perez");
    assert.equal(order?.zoneName, "Cabecera");
  },
  results
);

await check(
  "acepta nombre de una sola palabra",
  async () => {
    const { order } = await runConversation(
      ["quiero una oblea nutella", "Juan", "calle 10 #20-30 Cabecera", "Nequi"],
      "qa_reg_single_word_name"
    );

    assert.equal(order?.customerName, "Juan");
    assert.equal(order?.zoneName, "Cabecera");
  },
  results
);

await check(
  "conserva pedido activo al completar barrio y pago juntos con typo",
  async () => {
    const { lastResult, conversation, order, snapshots } = await runConversationWithSnapshots(
      [
        "fresas con helado de vainilla",
        "Marta Albeira",
        "Cra 39a # 41-99",
        "Barrio cabecera del llano y neqi"
      ],
      "qa_reg_delivery_zone_payment_real_bug"
    );

    assert.deepEqual(snapshots.map((snapshot) => snapshot.items.length), [1, 1, 1, 1]);
    assert.equal(snapshots[1]?.customerName, "Marta Albeira");
    assert.equal(snapshots[2]?.address, "Cra 39a # 41-99");
    assert.equal(snapshots[3]?.inferredZoneId, "zone_cabecera");
    assert.equal(snapshots[3]?.paymentMethod, "Nequi");
    assert.equal(conversation?.state, "pending_human");
    assertCompletedFresasDeliveryOrder(order);
    assertDidNotAskForProduct(lastResult?.reply);
  },
  results
);

await check(
  "captura cabecera y nequi despues de producto nombre y direccion",
  async () => {
    const { lastResult, conversation, order } = await runConversation(
      ["fresas con helado de vainilla", "Marta Albeira", "Cra 39a # 41-99", "cabecera y nequi"],
      "qa_reg_delivery_zone_payment_short"
    );

    assert.equal(conversation?.state, "pending_human");
    assertCompletedFresasDeliveryOrder(order);
    assertDidNotAskForProduct(lastResult?.reply);
  },
  results
);

await check(
  "normaliza typo neqi como Nequi al completar entrega",
  async () => {
    const { lastResult, order } = await runConversation(
      ["fresas con helado de vainilla", "Marta Albeira", "Cra 39a # 41-99", "Cabecera, neqi"],
      "qa_reg_delivery_payment_neqi"
    );

    assertCompletedFresasDeliveryOrder(order);
    assertDidNotAskForProduct(lastResult?.reply);
  },
  results
);

await check(
  "captura barrio y pago en el mismo mensaje",
  async () => {
    const { lastResult, order } = await runConversation(
      ["fresas con helado de vainilla", "Marta Albeira", "Cra 39a # 41-99", "Barrio Cabecera, pago Nequi"],
      "qa_reg_delivery_zone_payment_same_message"
    );

    assertCompletedFresasDeliveryOrder(order);
    assertDidNotAskForProduct(lastResult?.reply);
  },
  results
);

await check(
  "captura pago y barrio en orden invertido",
  async () => {
    const { lastResult, order } = await runConversation(
      ["fresas con helado de vainilla", "Marta Albeira", "Cra 39a # 41-99", "Nequi, barrio Cabecera"],
      "qa_reg_delivery_payment_zone_inverted"
    );

    assertCompletedFresasDeliveryOrder(order);
    assertDidNotAskForProduct(lastResult?.reply);
  },
  results
);

await check(
  "no crea nuevo draft vacio al recibir barrio y pago con pedido activo",
  async () => {
    const phone = "qa_reg_no_empty_draft_on_delivery_details";
    const { conversation, order } = await runConversation(
      ["fresas con helado de vainilla", "Marta Albeira", "Cra 39a # 41-99", "Cabecera y Nequi"],
      phone
    );

    assert.equal(demoStore.conversations.filter((entry) => entry.customerPhone === phone).length, 1);
    assert.equal(conversation?.draftOrder?.items.length, 1);
    assertCompletedFresasDeliveryOrder(order);
  },
  results
);

await check(
  "no pide producto si el draft activo ya tiene items",
  async () => {
    const { lastResult, conversation, order } = await runConversation(
      ["fresas con helado de vainilla", "Marta Albeira", "Cra 39a # 41-99", "Cabecera del Llano y Nequi"],
      "qa_reg_no_product_prompt_with_active_items"
    );

    assert.equal(conversation?.draftOrder?.items.length, 1);
    assertCompletedFresasDeliveryOrder(order);
    assertDidNotAskForProduct(lastResult?.reply);
  },
  results
);

await check(
  "no interpreta por favor como referencia de domicilio",
  async () => {
    const { conversation, order } = await runConversation(
      ["fresas con crema y helado de vainilla por favor"],
      "qa_reg_por_favor_not_location"
    );

    assert.equal(order, undefined);
    assert.notEqual(conversation?.state, "pending_human");
    assert.doesNotMatch(conversation?.draftOrder?.blockingIssue ?? "", /zona|barrio|domicilio/i);
    assert.ok(
      conversation?.draftOrder?.items.some((item) => item.productName === "Fresas con helado")
    );
  },
  results
);

await check(
  "mantiene memorias independientes por chat de Telegram",
  async () => {
    const service: ConversationServiceInstance = new ConversationService();
    const firstChat = "telegram:qa_memory_chat_a";
    const secondChat = "telegram:qa_memory_chat_b";

    await service.handleIncomingMessage({
      from: firstChat,
      to: "qa-business",
      text: "quiero unas fresas con crema"
    });
    await service.handleIncomingMessage({
      from: secondChat,
      to: "qa-business",
      text: "quiero una malteada de oreo"
    });

    const firstConversation = demoStore.conversations.find(
      (entry) => entry.customerPhone === firstChat
    );
    const secondConversation = demoStore.conversations.find(
      (entry) => entry.customerPhone === secondChat
    );

    assert.ok(firstConversation);
    assert.ok(secondConversation);
    assert.notEqual(firstConversation.id, secondConversation.id);
    assert.deepEqual(
      firstConversation.draftOrder?.items.map((item) => item.productName),
      ["Fresas con crema tradicional"]
    );
    assert.deepEqual(
      secondConversation.draftOrder?.items.map((item) => item.productName),
      ["Malteada Oreo"]
    );
  },
  results
);

await check(
  "permite una aclaracion cuando recibe solo direccion sin barrio",
  async () => {
    const { lastResult, conversation, order } = await runConversation(
      ["fresas con helado de vainilla", "Marta Albeira", "Cra 45 #82-100"],
      "qa_reg_zone_one_clarification"
    );

    assert.equal(order, undefined);
    assert.equal(conversation?.state, "collecting_delivery_details");
    assert.equal(conversation?.draftOrder?.address, "Cra 45 #82-100");
    assert.match(lastResult?.reply ?? "", /Barrio o zona de entrega/i);
  },
  results
);

await check(
  "escala referencia informal sin zona configurada",
  async () => {
    const { lastResult, conversation, order } = await runConversation(
      ["fresas con helado de vainilla", "Marta Albeira", "por Buenavista"],
      "qa_reg_zone_unknown_reference"
    );

    assertZoneNotDetectedHandoff(conversation, order, lastResult?.reply);
  },
  results
);

await check(
  "no usa Barranquilla como zona final",
  async () => {
    const { lastResult, conversation, order } = await runConversation(
      ["fresas con helado de vainilla", "Marta Albeira", "Barranquilla"],
      "qa_reg_zone_city_only"
    );

    assertZoneNotDetectedHandoff(conversation, order, lastResult?.reply);
  },
  results
);

await check(
  "no usa norte como zona final",
  async () => {
    const { lastResult, conversation, order } = await runConversation(
      ["fresas con helado de vainilla", "Marta Albeira", "norte"],
      "qa_reg_zone_generic_north"
    );

    assertZoneNotDetectedHandoff(conversation, order, lastResult?.reply);
  },
  results
);

await check(
  "escala municipio no configurado",
  async () => {
    const { lastResult, conversation, order } = await runConversation(
      ["fresas con helado de vainilla", "Marta Albeira", "Soledad"],
      "qa_reg_zone_unconfigured_municipality"
    );

    assertZoneNotDetectedHandoff(conversation, order, lastResult?.reply);
  },
  results
);

await check(
  "escala barrio desconocido",
  async () => {
    const { lastResult, conversation, order } = await runConversation(
      ["fresas con helado de vainilla", "Marta Albeira", "barrio Las Flores del Norte"],
      "qa_reg_zone_unknown_neighborhood"
    );

    assertZoneNotDetectedHandoff(conversation, order, lastResult?.reply);
  },
  results
);

await check(
  "conserva direccion y pago pero escala si falta zona reconocida",
  async () => {
    const { lastResult, conversation, order } = await runConversation(
      ["fresas con helado de vainilla", "Marta Albeira", "Cra 45 #82-100 pago Nequi"],
      "qa_reg_zone_address_payment_without_zone"
    );

    assert.equal(conversation?.draftOrder?.address, "Cra 45 #82-100");
    assert.equal(conversation?.draftOrder?.paymentMethod, "Nequi");
    assertZoneNotDetectedHandoff(conversation, order, lastResult?.reply);
  },
  results
);

await check(
  "reconoce zona con typo y pago con typo sin escalar",
  async () => {
    const { lastResult, order } = await runConversation(
      ["fresas con helado de vainilla", "Marta Albeira", "Cra 39a # 41-99 apto 402", "cabesera y neqi"],
      "qa_reg_zone_typo_no_handoff"
    );

    assert(order, "Expected order to be created");
    assert.equal(order.zoneName, "Cabecera");
    assert.equal(order.paymentMethod, "Nequi");
    assertDidNotAskForProduct(lastResult?.reply);
  },
  results
);

await check(
  "responde reaccion social sin forzar pedido inmediato",
  async () => {
    const { lastResult, order } = await runConversation(["wow esta cool"], "qa_reg_social_cool");

    assert.equal(order, undefined);
    assert.match(normalizeText(lastResult?.reply), /llamo la atencion/i);
    assert.doesNotMatch(lastResult?.reply ?? "", /que deseas ordenar/i);
  },
  results
);

await check(
  "responde antojo conversacional sin inventar informacion",
  async () => {
    const { lastResult, order } = await runConversation(["se ve rico"], "qa_reg_social_rico");

    assert.equal(order, undefined);
    assert.match(normalizeText(lastResult?.reply), /antoj|llamo la atencion/i);
    assert.doesNotMatch(lastResult?.reply ?? "", /que deseas ordenar/i);
  },
  results
);

await check(
  "acompaña primera compra como vendedor humano",
  async () => {
    const { lastResult, order } = await runConversation(
      ["primera vez que compro"],
      "qa_reg_social_first_time"
    );

    assert.equal(order, undefined);
    assert.match(normalizeText(lastResult?.reply), /bienvenido|recomend|clasico|buena opcion/i);
    assert.doesNotMatch(lastResult?.reply ?? "", /que deseas ordenar/i);
  },
  results
);

await check(
  "bloquea cierre si falta zona de domicilio",
  async () => {
    const { lastResult, conversation, order } = await runConversation(
      ["quiero una tradicional", "Juan Perez, calle 10 #20-30, Nequi"],
      "qa_reg_zone"
    );

    assert.equal(conversation?.draftOrder?.address, "calle 10 #20-30");
    assertZoneNotDetectedHandoff(conversation, order, lastResult?.reply);
  },
  results
);

await check(
  "bloquea cierre si hay zonas contradictorias",
  async () => {
    const { conversation, order } = await runConversation(
      ["quiero una tradicional", "Juan Perez, calle 10 #20-30 Cabecera, pero barrio Provenza, Nequi"],
      "qa_reg_contradictory_zone"
    );

    assert.equal(order, undefined);
    assert.equal(conversation?.state, "collecting_delivery_details");
  },
  results
);

await check(
  "soporta recogida en tienda sin pedir direccion",
  async () => {
    const { order } = await runConversation(
      ["quiero una oblea nutella", "Juan Perez", "paso a recoger, efectivo exacto"],
      "qa_reg_pickup"
    );

    assert.equal(order?.fulfillmentType, "pickup");
    assert.equal(order?.pricing.deliveryFee, 0);
    assert.equal(order?.customerName, "Juan Perez");
  },
  results
);

await check(
  "bloquea efectivo sin monto de cambio",
  async () => {
    const { conversation, order } = await runConversation(
      ["quiero una tradicional", "Juan Perez, calle 10 #20-30 Cabecera, efectivo"],
      "qa_reg_cash"
    );

    assert.equal(order, undefined);
    assert.equal(conversation?.state, "collecting_delivery_details");
    assert.equal(conversation?.draftOrder?.paymentMethod, "Efectivo");
  },
  results
);

await check(
  "recupera errores comunes de escritura",
  async () => {
    const { order } = await runConversation(
      ["Holaaa kiero una fresas cn krema y oreoo", "Juan Perez, cll 10 #20-30 cabesera, neky"],
      "qa_reg_typos"
    );

    assert.equal(order?.items[0]?.productName, "Fresas con crema tradicional");
    assert(
      order?.items[0]?.components.some(
        (component) => component.type === "added" && component.name === "Oreo"
      )
    );
    assert.equal(order?.zoneName, "Cabecera");
    assert.equal(order?.paymentMethod, "Nequi");
  },
  results
);

await check(
  "actualiza direccion despues de pasar a revision",
  async () => {
    const { order } = await runConversation(
      [
        "quiero una oblea nutella",
        "Juan Perez, calle 10 #20-30 Cabecera, Nequi",
        "cambia la direccion a carrera 15 #45-12 Provenza"
      ],
      "qa_reg_post_close_address"
    );

    assert.match(order?.address ?? "", /carrera 15 #45-12/i);
    assert.equal(order?.zoneName, "Provenza");
    assert.equal(order?.pricing.total, 14000);
    assert(order?.internalNotes?.includes("Cambio solicitado por el cliente"));
  },
  results
);

const passed = results.filter((result) => result.ok).length;
const failed = results.length - passed;

console.log(
  JSON.stringify(
    {
      total: results.length,
      passed,
      failed,
      metrics: {
        conversationsCompleted: demoStore.conversations.length,
        ordersCreated: demoStore.orders.length,
        criticalRegressions: failed
      },
      results
    },
    null,
    2
  )
);

if (failed > 0) {
  process.exitCode = 1;
}
