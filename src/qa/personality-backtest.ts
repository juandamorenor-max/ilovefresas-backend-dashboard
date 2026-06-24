import { strict as assert } from "node:assert";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { Conversation, ConversationTurnResult, Order } from "../types/index.js";

process.env.NODE_ENV = "production";
process.env.TELEGRAM_ADMIN_BOT_TOKEN = "";
process.env.TELEGRAM_ADMIN_CHAT_ID = "";

const { ConversationService } = await import("../services/conversation.service.js");
const { demoStore } = await import("../data/demoStore.js");

demoStore.businesses[0]!.status.manualOpenOverride = true;

type Category =
  | "positive_reaction"
  | "new_customer"
  | "social"
  | "soft_objection"
  | "invention_risk"
  | "transition";

interface PersonalityCase {
  id: string;
  category: Category;
  name: string;
  messages: string[];
  expectation: "social_reply" | "recommendation" | "claim_guard" | "transition_order";
}

interface CaseResult {
  id: string;
  category: Category;
  name: string;
  ok: boolean;
  reply: string;
  orderCreated: boolean;
  failures: string[];
}

const cases: PersonalityCase[] = [
  {
    id: "PER-001",
    category: "positive_reaction",
    name: "wow esta cool",
    messages: ["wow esta cool"],
    expectation: "social_reply"
  },
  {
    id: "PER-002",
    category: "positive_reaction",
    name: "se ve rico",
    messages: ["se ve rico"],
    expectation: "social_reply"
  },
  {
    id: "PER-003",
    category: "positive_reaction",
    name: "uff que antojo",
    messages: ["uff que antojo"],
    expectation: "social_reply"
  },
  {
    id: "PER-004",
    category: "positive_reaction",
    name: "todo se ve bueno",
    messages: ["todo se ve bueno"],
    expectation: "social_reply"
  },
  {
    id: "PER-005",
    category: "positive_reaction",
    name: "ese menu esta brutal",
    messages: ["ese menu esta brutal"],
    expectation: "social_reply"
  },
  {
    id: "PER-006",
    category: "new_customer",
    name: "primera vez que compro",
    messages: ["primera vez que compro"],
    expectation: "recommendation"
  },
  {
    id: "PER-007",
    category: "new_customer",
    name: "nunca he pedido aca",
    messages: ["nunca he pedido aca"],
    expectation: "recommendation"
  },
  {
    id: "PER-008",
    category: "new_customer",
    name: "que me recomiendas",
    messages: ["que me recomiendas?"],
    expectation: "recommendation"
  },
  {
    id: "PER-009",
    category: "new_customer",
    name: "soy nuevo no se que pedir",
    messages: ["soy nuevo, no se que pedir"],
    expectation: "recommendation"
  },
  {
    id: "PER-010",
    category: "new_customer",
    name: "cual recomiendas para empezar",
    messages: ["cual recomiendas para empezar?"],
    expectation: "recommendation"
  },
  {
    id: "PER-011",
    category: "social",
    name: "hola como estas",
    messages: ["hola como estas"],
    expectation: "social_reply"
  },
  {
    id: "PER-012",
    category: "social",
    name: "jajaja que rico",
    messages: ["jajaja que rico"],
    expectation: "social_reply"
  },
  {
    id: "PER-013",
    category: "social",
    name: "me dio hambre",
    messages: ["me dio hambre"],
    expectation: "social_reply"
  },
  {
    id: "PER-014",
    category: "social",
    name: "amo las fresas",
    messages: ["amo las fresas"],
    expectation: "social_reply"
  },
  {
    id: "PER-015",
    category: "social",
    name: "como va todo",
    messages: ["como va todo?"],
    expectation: "social_reply"
  },
  {
    id: "PER-016",
    category: "soft_objection",
    name: "esta caro",
    messages: ["esta caro"],
    expectation: "recommendation"
  },
  {
    id: "PER-017",
    category: "soft_objection",
    name: "no se que pedir",
    messages: ["no se que pedir"],
    expectation: "recommendation"
  },
  {
    id: "PER-018",
    category: "soft_objection",
    name: "cual es el mas vendido",
    messages: ["cual es el mas vendido?"],
    expectation: "recommendation"
  },
  {
    id: "PER-019",
    category: "soft_objection",
    name: "cual recomiendas",
    messages: ["cual recomiendas?"],
    expectation: "recommendation"
  },
  {
    id: "PER-020",
    category: "soft_objection",
    name: "algo clasico que recomiendas",
    messages: ["algo clasico que recomiendas?"],
    expectation: "recommendation"
  },
  {
    id: "PER-021",
    category: "invention_risk",
    name: "mejores de Barranquilla",
    messages: ["son las mejores de Barranquilla?"],
    expectation: "claim_guard"
  },
  {
    id: "PER-022",
    category: "invention_risk",
    name: "promo 2x1",
    messages: ["tienen promo 2x1?"],
    expectation: "claim_guard"
  },
  {
    id: "PER-023",
    category: "invention_risk",
    name: "premio",
    messages: ["ganaron algun premio?"],
    expectation: "claim_guard"
  },
  {
    id: "PER-024",
    category: "invention_risk",
    name: "clientes",
    messages: ["cuantos clientes tienen?"],
    expectation: "claim_guard"
  },
  {
    id: "PER-025",
    category: "invention_risk",
    name: "famosos",
    messages: ["son famosos?"],
    expectation: "claim_guard"
  },
  {
    id: "PER-026",
    category: "transition",
    name: "social a tradicional explicita",
    messages: ["wow esta cool", "bueno, dame una tradicional"],
    expectation: "transition_order"
  },
  {
    id: "PER-027",
    category: "transition",
    name: "cliente nuevo acepta esa",
    messages: ["primera vez que compro", "quiero esa"],
    expectation: "transition_order"
  },
  {
    id: "PER-028",
    category: "transition",
    name: "recomendacion convence",
    messages: ["que me recomiendas?", "me convenciste"],
    expectation: "transition_order"
  },
  {
    id: "PER-029",
    category: "transition",
    name: "indeciso acepta una",
    messages: ["no se que pedir", "listo, pido una"],
    expectation: "transition_order"
  },
  {
    id: "PER-030",
    category: "transition",
    name: "antojo a tradicional explicita",
    messages: ["se ve rico", "bueno, dame una tradicional"],
    expectation: "transition_order"
  }
];

async function runConversation(testCase: PersonalityCase) {
  const service = new ConversationService();
  const phone = `qa_personality_${testCase.id}`;
  let lastResult: ConversationTurnResult | null = null;

  for (const text of testCase.messages) {
    lastResult = await service.handleIncomingMessage({
      from: phone,
      to: "qa-business",
      text
    });
  }

  return {
    conversation: demoStore.conversations.find((entry: Conversation) => entry.customerPhone === phone),
    order: demoStore.orders.find((entry: Order) => entry.customerPhone === phone),
    reply: lastResult?.reply ?? ""
  };
}

function normalize(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function collectFailures(testCase: PersonalityCase, reply: string, conversation?: Conversation, order?: Order) {
  const failures: string[] = [];
  const normalizedReply = normalize(reply);

  if (!reply.trim()) {
    failures.push("Respuesta vacia.");
  }

  if (/(soy un bot|asistente virtual|inteligencia artificial|automatizacion)/i.test(reply)) {
    failures.push("La respuesta revela automatizacion.");
  }

  if (
    /(somos (?:las|los)? mejores|las mejores de barranquilla|ganamos|premiados|famosos|clientes al mes|mas vendido|mas pedido|mas piden)/i.test(
      reply
    )
  ) {
    failures.push("La respuesta contiene claim de reputacion, premios, ventas o fama no verificable.");
  }

  if (testCase.expectation !== "transition_order") {
    if (order) {
      failures.push("No debia crear orden en una conversacion social o consultiva.");
    }

    if (conversation?.draftOrder?.items.length) {
      failures.push("No debia guardar producto desde una frase social o consultiva.");
    }

    if (
      conversation?.draftOrder?.customerName ||
      conversation?.draftOrder?.address ||
      conversation?.draftOrder?.paymentMethod
    ) {
      failures.push("No debia guardar frase social como nombre, direccion o pago.");
    }

    if (/que deseas ordenar\??/i.test(reply)) {
      failures.push("La respuesta vuelve demasiado rapido al formulario de pedido.");
    }
  }

  if (testCase.expectation === "social_reply") {
    if (!/(gracias|alegra|antoja|hambre|fresas|bien|ayudo|escoger|llamo la atencion)/i.test(reply)) {
      failures.push("La respuesta social no suena suficientemente humana o vendedora.");
    }
  }

  if (testCase.expectation === "recommendation") {
    if (!/(tradicional|clasico|recomendar|escoger|empezar|ayudo|no tengo un ranking exacto|entiendo)/i.test(reply)) {
      failures.push("La respuesta no orienta ni recomienda de forma util.");
    }
  }

  if (testCase.expectation === "claim_guard") {
    if (!/(no tengo|no quiero invent|registrada|confirmada|ranking|cifras|premios|promocion)/i.test(reply)) {
      failures.push("La respuesta no protege claramente contra informacion no verificada.");
    }
  }

  if (testCase.expectation === "transition_order") {
    const item = conversation?.draftOrder?.items[0] ?? order?.items[0];

    if (!item) {
      failures.push("La charla no logro transicionar a pedido.");
    } else if (!normalize(item.productName).includes("fresas con crema tradicional")) {
      failures.push(`Producto inesperado tras transicion: ${item.productName}.`);
    }

    if (conversation?.draftOrder?.customerName || conversation?.draftOrder?.address || conversation?.draftOrder?.paymentMethod) {
      failures.push("La transicion no debia inventar datos de entrega o pago.");
    }
  }

  if (/(2x1|promo|promocion)/i.test(reply) && !/(no tengo|registrada|no hay)/i.test(reply)) {
    failures.push("La respuesta menciona promocion sin dejar claro que no esta registrada.");
  }

  if (normalizedReply.includes("premio") && !/(no tengo|no hay|no quiero invent)/i.test(reply)) {
    failures.push("La respuesta menciona premios sin guardrail.");
  }

  return failures;
}

const results: CaseResult[] = [];

for (const testCase of cases) {
  const { conversation, order, reply } = await runConversation(testCase);
  const failures = collectFailures(testCase, reply, conversation, order);

  results.push({
    id: testCase.id,
    category: testCase.category,
    name: testCase.name,
    ok: failures.length === 0,
    reply,
    orderCreated: Boolean(order),
    failures
  });
}

const passed = results.filter((result) => result.ok).length;
const failed = results.length - passed;
const report = {
  total: results.length,
  passed,
  failed,
  byCategory: results.reduce<Record<string, { total: number; passed: number; failed: number }>>(
    (acc, result) => {
      acc[result.category] ??= { total: 0, passed: 0, failed: 0 };
      acc[result.category]!.total += 1;
      acc[result.category]!.passed += result.ok ? 1 : 0;
      acc[result.category]!.failed += result.ok ? 0 : 1;
      return acc;
    },
    {}
  ),
  examples: results.slice(0, 8).map((result) => ({
    id: result.id,
    name: result.name,
    reply: result.reply
  })),
  failures: results.filter((result) => !result.ok),
  results
};

const reportPath = resolve("qa-output/personality-report.json");
mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, JSON.stringify(report, null, 2));

console.log(JSON.stringify(report, null, 2));

assert.equal(cases.length, 30, "La suite debe contener exactamente 30 conversaciones.");

if (failed > 0) {
  process.exitCode = 1;
}
