import { strict as assert } from "node:assert";
import { writeFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { Conversation, ModifierOption, Order, OrderDraft, OrderItem, Product } from "../types/index.js";

process.env.NODE_ENV = "production";
process.env.TELEGRAM_ADMIN_BOT_TOKEN = "";
process.env.TELEGRAM_ADMIN_CHAT_ID = "";

const { CatalogService } = await import("../services/catalog.service.js");
const { ConversationService } = await import("../services/conversation.service.js");
const { demoStore } = await import("../data/demoStore.js");

demoStore.businesses[0]!.status.manualOpenOverride = true;

type MatrixCategory =
  | "catalog-audit"
  | "independent-product"
  | "product-modifier"
  | "invalid-modifier"
  | "ambiguous-modifier"
  | "required-options"
  | "multiproduct"
  | "real-regression";

interface MatrixResult {
  id: string;
  category: MatrixCategory;
  name: string;
  ok: boolean;
  error?: string;
  final?: ReturnType<typeof summarizeFinal>;
}

const catalogService = new CatalogService();
const products = catalogService.listActiveProducts();
const modifiers = catalogService.listModifierOptions();
const productsWithModifiers = products.filter((product) => product.modifierGroupIds.length > 0);
const requiredProducts = products.filter((product) => (product.requiredOptions ?? []).some((option) => option.required));
const results: MatrixResult[] = [];

function normalize(value: string | null | undefined) {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function additions(item: OrderItem | undefined) {
  return item?.components.filter((component) => component.type === "added").map((component) => component.name) ?? [];
}

function selectedOptionValues(item: OrderItem | undefined) {
  return Object.values(item?.selectedOptions ?? {}).flat();
}

function productDefaultHasModifier(product: Product, modifier: ModifierOption) {
  return product.defaultComponents.some((component) => normalize(component) === normalize(modifier.name));
}

function productHasChocolateInName(product: Product) {
  return normalize(product.name).includes("chocolate") ||
    product.aliases.some((alias) => normalize(alias).includes("chocolate"));
}

function findItem(items: OrderItem[], product: Product) {
  return items.find((item) => item.productId === product.id);
}

function latestOrder(phone: string) {
  return [...demoStore.orders].reverse().find((order) => order.customerPhone === phone) ?? null;
}

async function runConversation(messages: string[], phone: string) {
  const service = new ConversationService();
  let lastReply = "";

  for (const text of messages) {
    const result = await service.handleIncomingMessage({
      from: phone,
      to: "qa-business",
      text
    });
    lastReply = result.reply;
  }

  const conversation = demoStore.conversations.find((entry: Conversation) => entry.customerPhone === phone);
  return {
    conversation,
    draft: conversation?.draftOrder ?? null,
    order: latestOrder(phone),
    lastReply
  };
}

function summarizeFinal(
  conversation: Conversation | undefined,
  draft: OrderDraft | null,
  order: Order | null,
  lastReply: string
) {
  const items = order?.items ?? draft?.items ?? [];
  return {
    state: conversation?.state ?? null,
    orderCreated: Boolean(order),
    blockingIssue: draft?.blockingIssue ?? null,
    lastReply,
    items: items.map((item) => ({
      productId: item.productId,
      productName: item.productName,
      quantity: item.quantity,
      selectedOptions: item.selectedOptions ?? {},
      additions: additions(item),
      removals: item.components.filter((component) => component.type === "removed").map((component) => component.name)
    })),
    subtotal: order?.pricing.subtotal ?? draft?.pricing.subtotal ?? null,
    total: order?.pricing.total ?? draft?.pricing.total ?? null
  };
}

async function check(category: MatrixCategory, name: string, assertion: () => Promise<ReturnType<typeof summarizeFinal> | void> | ReturnType<typeof summarizeFinal> | void) {
  const id = `${category}-${String(results.length + 1).padStart(4, "0")}`;
  try {
    const final = await assertion();
    results.push({ id, category, name, ok: true, final: final || undefined });
  } catch (error) {
    results.push({
      id,
      category,
      name,
      ok: false,
      error: error instanceof Error ? error.message : "Unknown error"
    });
  }
}

function assertNoUnsafeOrder(order: Order | null) {
  if (!order) {
    return;
  }

  assert(order.items.every((item) => item.productId !== "custom_pending_review"), "Orden creada con producto custom.");
  assert(order.items.every((item) => item.unitBasePrice > 0), "Orden creada con precio cero.");
  assert(order.pricing.total > 0, "Orden creada con total invalido.");
}

function assertRequiredOptionsSatisfied(item: OrderItem, product: Product) {
  for (const option of product.requiredOptions ?? []) {
    if (!option.required) {
      continue;
    }

    const selected = item.selectedOptions?.[option.key] ?? [];
    assert(
      selected.length >= option.minSelections,
      `Falta ${option.label} para ${product.name}. Seleccion actual: ${selected.join(", ") || "ninguna"}.`
    );
  }
}

function assertRequiredOptionsPending(draft: OrderDraft | null, product: Product) {
  assert(draft, "Se esperaba draft.");
  const item = findItem(draft.items, product);
  assert(item, `No se encontro item ${product.name}.`);
  const missing = (product.requiredOptions ?? []).filter(
    (option) => (item.selectedOptions?.[option.key]?.length ?? 0) < option.minSelections
  );
  assert(missing.length > 0, `Se esperaba requisito pendiente para ${product.name}.`);
  assert(draft.blockingIssue, "El draft debe tener blockingIssue por requisito pendiente.");
}

function requiredOptionPhrase(product: Product) {
  return (product.requiredOptions ?? [])
    .filter((option) => option.required)
    .map((option) => {
      const values = option.options.slice(0, option.minSelections);
      if (option.key === "iceCreamFlavor") {
        return `de ${values.join(" y ")}`;
      }
      if (option.key === "fruit") {
        return `con fruta ${values[0]}`;
      }
      if (option.key === "sauce") {
        return `con salsa ${values[0]}`;
      }
      if (option.key === "includedTopping") {
        return `con topping ${values[0]}`;
      }
      return `con ${option.label} ${values.join(" y ")}`;
    })
    .join(" ");
}

function assertNoMassChocolateAdditions(item: OrderItem | undefined) {
  const chocolateAdditions = additions(item).filter((name) =>
    /\b(chocolate|hershey|choco|chips)\b/i.test(normalize(name))
  );
  assert(
    chocolateAdditions.length <= 1,
    `No debe aplicar multiples opciones de chocolate: ${chocolateAdditions.join(", ")}`
  );
}

await check("catalog-audit", "productos, categorias, toppings, precios y requiredOptions auditables", () => {
  assert.equal(products.length, 40, "Cantidad de productos principales inesperada.");
  assert.equal(modifiers.length, 24, "Cantidad de toppings/adiciones inesperada.");
  assert(products.every((product) => product.basePrice > 0), "Hay producto sin precio.");
  assert(modifiers.every((modifier) => modifier.priceDelta > 0), "Hay modificador sin precio.");
  assert.equal(demoStore.promotions.length, 0, "No deben existir promos inventadas.");
  assert(requiredProducts.length > 0, "Debe existir metadata requiredOptions.");
});

for (const [index, product] of products.entries()) {
  await check("independent-product", `producto independiente: ${product.name}`, async () => {
    const { conversation, draft, order, lastReply } = await runConversation(
      [`quiero ${product.name}`],
      `matrix_ind_${index}`
    );
    assertNoUnsafeOrder(order);
    assert.equal(order, null, "No debe cerrar sin datos de entrega/pago.");
    assert(draft, "Debe quedar draft activo.");
    const item = findItem(draft.items, product);
    assert(item, `Debe crear item ${product.name}.`);
    assert.equal(item.unitBasePrice, product.basePrice);

    if ((product.requiredOptions ?? []).some((option) => option.required)) {
      assertRequiredOptionsPending(draft, product);
      assert.doesNotMatch(lastReply, /Nombre completo|Direccion de entrega|Metodo de pago/i);
    } else {
      assert.equal(draft.blockingIssue, null);
    }

    return summarizeFinal(conversation, draft, order, lastReply);
  });
}

for (const product of productsWithModifiers) {
  for (const modifier of modifiers) {
    await check("product-modifier", `${product.name} con ${modifier.name}`, async () => {
      const { conversation, draft, order, lastReply } = await runConversation(
        [`quiero ${product.name} con ${modifier.name}`],
        `matrix_mod_${product.id}_${modifier.id}`
      );
      assertNoUnsafeOrder(order);
      assert(draft, "Debe quedar draft.");
      const item = findItem(draft.items, product);
      assert(item, `Debe crear item ${product.name}.`);
      const modifierIsIncludedOption = selectedOptionValues(item).some(
        (value) => normalize(value) === normalize(modifier.name)
      );

      if (!productDefaultHasModifier(product, modifier) && !modifierIsIncludedOption) {
        assert(
          additions(item).some((name) => normalize(name) === normalize(modifier.name)),
          `No aplico ${modifier.name} a ${product.name}.`
        );
      }

      assertNoMassChocolateAdditions(item);
      return summarizeFinal(conversation, draft, order, lastReply);
    });
  }
}

for (const [index, product] of products.entries()) {
  await check("invalid-modifier", `${product.name} con topping inexistente`, async () => {
    const { conversation, draft, order, lastReply } = await runConversation(
      [`quiero ${product.name} con gomitas`],
      `matrix_invalid_${index}`
    );
    assertNoUnsafeOrder(order);
    assert(draft, "Debe quedar draft.");
    const item = findItem(draft.items, product);
    assert(item, `Debe crear item ${product.name}.`);
    assert.equal(additions(item).some((name) => /gomita/i.test(name)), false);
    assert(draft.blockingIssue, "Debe bloquear o pedir aclaracion por topping inexistente.");
    return summarizeFinal(conversation, draft, order, lastReply);
  });
}

for (const [index, product] of productsWithModifiers.entries()) {
  await check("ambiguous-modifier", `${product.name} con chocolate ambiguo`, async () => {
    const { conversation, draft, order, lastReply } = await runConversation(
      [`quiero ${product.name} con chocolate`],
      `matrix_amb_chocolate_${index}`
    );
    assertNoUnsafeOrder(order);
    assert(draft, "Debe quedar draft.");
    const item = findItem(draft.items, product);
    assert(item, `Debe crear item ${product.name}.`);
    assertNoMassChocolateAdditions(item);
    if (!productHasChocolateInName(product)) {
      assert(
        draft.blockingIssue || (product.requiredOptions ?? []).some((option) => option.required),
        "Debe pedir aclaracion por chocolate ambiguo o por requisito obligatorio pendiente."
      );
    }
    return summarizeFinal(conversation, draft, order, lastReply);
  });
}

for (const [index, product] of requiredProducts.entries()) {
  await check("required-options", `${product.name} bloquea sin opciones`, async () => {
    const { conversation, draft, order, lastReply } = await runConversation(
      [`quiero ${product.name}`],
      `matrix_req_missing_${index}`
    );
    assert.equal(order, null);
    assertRequiredOptionsPending(draft, product);
    assert.doesNotMatch(lastReply, /Nombre completo|Direccion de entrega|Metodo de pago/i);
    return summarizeFinal(conversation, draft, order, lastReply);
  });

  await check("required-options", `${product.name} acepta opciones validas`, async () => {
    const { conversation, draft, order, lastReply } = await runConversation(
      [`quiero ${product.name} ${requiredOptionPhrase(product)}`],
      `matrix_req_valid_${index}`
    );
    assertNoUnsafeOrder(order);
    assert(draft, "Debe quedar draft.");
    const item = findItem(draft.items, product);
    assert(item, `Debe crear item ${product.name}.`);
    assertRequiredOptionsSatisfied(item, product);
    assert.equal(draft.blockingIssue, null);
    return summarizeFinal(conversation, draft, order, lastReply);
  });

  await check("required-options", `${product.name} rechaza opcion invalida`, async () => {
    const { conversation, draft, order, lastReply } = await runConversation(
      [`quiero ${product.name} de pistacho`],
      `matrix_req_invalid_${index}`
    );
    assert.equal(order, null);
    assertRequiredOptionsPending(draft, product);
    return summarizeFinal(conversation, draft, order, lastReply);
  });
}

const pairProducts = products.slice(0, 12);
for (let index = 0; index < pairProducts.length; index += 1) {
  const first = pairProducts[index]!;
  const second = pairProducts[(index + 1) % pairProducts.length]!;
  const modifier = modifiers[index % modifiers.length]!;

  await check("multiproduct", `${first.name} y ${second.name} en un mensaje`, async () => {
    const { conversation, draft, order, lastReply } = await runConversation(
      [`quiero ${first.name} y ${second.name}`],
      `matrix_multi_same_${index}`
    );
    assertNoUnsafeOrder(order);
    assert(draft, "Debe quedar draft.");
    assert(findItem(draft.items, first), `Falta ${first.name}.`);
    assert(findItem(draft.items, second), `Falta ${second.name}.`);
    return summarizeFinal(conversation, draft, order, lastReply);
  });

  await check("multiproduct", `${first.name}, luego ${second.name} con ${modifier.name}`, async () => {
    const { conversation, draft, order, lastReply } = await runConversation(
      [`quiero ${first.name}`, `ademas ${second.name} con ${modifier.name}`],
      `matrix_multi_later_${index}`
    );
    assertNoUnsafeOrder(order);
    assert(draft, "Debe quedar draft.");
    assert(findItem(draft.items, first), `Falta ${first.name}.`);
    const secondItem = findItem(draft.items, second);
    assert(secondItem, `Falta ${second.name}.`);
    if (second.modifierGroupIds.length > 0 && !productDefaultHasModifier(second, modifier)) {
      const modifierIsIncludedOption = selectedOptionValues(secondItem).some(
        (value) => normalize(value) === normalize(modifier.name)
      );
      if (!modifierIsIncludedOption) {
        assert(
          additions(secondItem).some((name) => normalize(name) === normalize(modifier.name)),
          `No aplico ${modifier.name} al segundo producto.`
        );
      }
    }
    assert.equal(additions(findItem(draft.items, first)).some((name) => normalize(name) === normalize(modifier.name)), false);
    return summarizeFinal(conversation, draft, order, lastReply);
  });
}

await check("multiproduct", "dos productos con requisito pendiente y respuesta ambigua", async () => {
  const { conversation, draft, order, lastReply } = await runConversation(
    ["quiero Fresas con helado y Brownie con Helado", "chocolate"],
    "matrix_multi_pending_ambiguous"
  );
  assert.equal(order, null);
  assert(draft, "Debe quedar draft.");
  assert.equal(draft.items.length, 2);
  assert.match(draft.blockingIssue ?? "", /producto equivocado|producto va|opciones del pedido|sabor/i);
  return summarizeFinal(conversation, draft, order, lastReply);
});

const realRegressionCases: Array<{
  name: string;
  messages: string[];
  assert: (result: Awaited<ReturnType<typeof runConversation>>) => void;
}> = [
  {
    name: "Caso A: fresas con helado sin sabor bloquea",
    messages: ["quiero realizar un pedido de unas fresas con helado"],
    assert: ({ draft, order, lastReply }) => {
      assert.equal(order, null);
      const product = catalogService.findProductByNameOrAlias("Fresas con helado")!;
      assertRequiredOptionsPending(draft, product);
      assert.doesNotMatch(lastReply, /Nombre completo|Direccion de entrega|Metodo de pago/i);
    }
  },
  {
    name: "Caso B: oblea adicional generica no se vuelve topping de fresas",
    messages: [
      "quiero realizar un pedido de unas fresas con helado",
      "ademas una oblea con toppings de chocolate"
    ],
    assert: ({ draft, order }) => {
      assert.equal(order, null);
      assert(draft, "Debe quedar draft.");
      assert.equal(draft.items.length, 1, "No debe inventar una oblea generica sin escoger opcion exacta.");
      assert.equal(draft.items[0]?.productName, "Fresas con helado");
      assert.equal(additions(draft.items[0]).length, 0, "No debe aplicar chocolate a las fresas.");
      assert.match(draft.blockingIssue ?? "", /sabor|oblea|opciones/i);
    }
  },
  {
    name: "Caso C: targeting explicito a fresas",
    messages: ["quiero fresas con helado de vainilla y un love banana", "agregale helado a las fresas"],
    assert: ({ draft }) => {
      assert(draft, "Debe quedar draft.");
      assert.equal(draft.items.length, 2);
      assert(
        draft.items[0]?.components.some((component) => component.type === "default" && component.name === "helado")
      );
      assert.equal(additions(draft.items[1]).some((name) => name === "Helado"), false);
    }
  },
  {
    name: "Caso D: otro helado es adicional en fresas",
    messages: ["quiero fresas con helado de vainilla y un love banana", "agregale otro helado a las fresas"],
    assert: ({ draft }) => {
      assert(draft, "Debe quedar draft.");
      assert(additions(draft.items[0]).some((name) => name === "Helado"));
      assert.equal(additions(draft.items[1]).some((name) => name === "Helado"), false);
    }
  },
  {
    name: "Caso E: malteada generica no cierra producto inseguro",
    messages: ["quiero una malteada y una oblea con chocolate"],
    assert: ({ draft, order }) => {
      assert.equal(order, null);
      assert(draft?.blockingIssue || draft?.items.length === 0 || draft?.items.every((item) => item.productId !== "custom_pending_review"));
    }
  },
  {
    name: "Caso F: oblea con toppings de chocolate pide aclaracion",
    messages: ["quiero una oblea con toppings de chocolate"],
    assert: ({ draft, order, lastReply }) => {
      assert.equal(order, null);
      assert(!draft || draft.items.every((item) => additions(item).length <= 1));
      assert.match([draft?.blockingIssue, lastReply].filter(Boolean).join(" "), /oblea|chocolate|opciones|confirmas/i);
    }
  },
  {
    name: "Caso G: pregunta por toppings de oblea no crea producto custom",
    messages: [
      "quiero fresas con helado y oblea arequipe crema",
      "que toppings tienes para la oblea?"
    ],
    assert: ({ draft, order, lastReply }) => {
      assert.equal(order, null);
      assert(draft, "Debe conservar el draft activo.");
      assert.equal(draft.items.length, 2, "La pregunta no debe crear un tercer producto.");
      assert(draft.items.some((item) => item.productName === "Fresas con helado"));
      assert(draft.items.some((item) => item.productName === "Oblea Arequipe crema"));
      assert(!draft.items.some((item) => item.productId === "custom_pending_review"), "No debe crear producto custom.");
      assert.doesNotMatch(lastReply, /Tengo anotado:\s*[\s\S]*que toppings tienes para la oblea/i);
      assert.match(lastReply, /Oreo|Brownie|Milo|Arequipe|topping|agregar/i);
    }
  },
  {
    name: "Caso H: pregunta por toppings de helado no reemplaza sabor pendiente",
    messages: [
      "quiero fresas con helado",
      "que toppings tienes de helado?"
    ],
    assert: ({ draft, order, lastReply }) => {
      assert.equal(order, null);
      assert(draft, "Debe conservar el draft activo.");
      assert.equal(draft.items.length, 1, "La pregunta no debe crear otro producto.");
      assert.equal(draft.items[0]?.productName, "Fresas con helado");
      assert(!draft.items.some((item) => item.productId === "custom_pending_review"), "No debe crear producto custom.");
      assert.equal((draft.items[0]?.selectedOptions?.iceCreamFlavor ?? []).length, 0, "No debe inventar sabor.");
      assert.match(lastReply, /Fresa|Chocolate|Vainilla|Oreo|sabor/i);
    }
  }
];

for (const [index, entry] of realRegressionCases.entries()) {
  await check("real-regression", entry.name, async () => {
    const result = await runConversation(entry.messages, `matrix_real_${index}`);
    entry.assert(result);
    return summarizeFinal(result.conversation, result.draft, result.order, result.lastReply);
  });
}

const failed = results.filter((result) => !result.ok);
const byCategory = results.reduce<Record<string, { total: number; failed: number }>>((acc, result) => {
  acc[result.category] ??= { total: 0, failed: 0 };
  acc[result.category].total += 1;
  if (!result.ok) {
    acc[result.category].failed += 1;
  }
  return acc;
}, {});

const catalogAudit = {
  products: products.map((product) => ({
    productId: product.id,
    name: product.name,
    aliases: product.aliases,
    category: product.category,
    basePrice: product.basePrice,
    requiresOptions: product.requiredOptions?.length ? "si" : "no",
    requiredOptions: product.requiredOptions ?? [],
    allowsToppings: product.modifierGroupIds.length > 0,
    defaultComponents: product.defaultComponents,
    removableComponents: product.removableComponents
  })),
  categories: [...new Set(products.map((product) => product.category))],
  modifiers: modifiers.map((modifier) => ({
    id: modifier.id,
    name: modifier.name,
    aliases: modifier.aliases,
    priceDelta: modifier.priceDelta
  })),
  promotions: demoStore.promotions
};

const report = {
  generatedAt: new Date().toISOString(),
  total: results.length,
  passed: results.length - failed.length,
  failed: failed.length,
  byCategory,
  catalogAudit,
  failures: failed,
  results
};

await mkdir(dirname(resolve("qa-output", "catalog-matrix-report.json")), { recursive: true });
writeFileSync(resolve("qa-output", "catalog-matrix-report.json"), JSON.stringify(report, null, 2));

console.log(
  JSON.stringify(
    {
      total: report.total,
      passed: report.passed,
      failed: report.failed,
      byCategory,
      catalog: {
        products: products.length,
        categories: catalogAudit.categories,
        modifiers: modifiers.length,
        requiredProducts: requiredProducts.map((product) => product.name),
        promotions: demoStore.promotions.length
      },
      reportPath: "qa-output/catalog-matrix-report.json",
      failures: failed.slice(0, 20).map((failure) => ({
        id: failure.id,
        category: failure.category,
        name: failure.name,
        error: failure.error
      }))
    },
    null,
    2
  )
);

if (failed.length > 0) {
  process.exitCode = 1;
}
