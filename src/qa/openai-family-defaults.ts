import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
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
  reply?: string;
  items?: string[];
  pendingSelections?: string[];
  error?: string;
}

async function runConversation(messages: string[], phone: string) {
  const service = new ConversationService();
  const turns: ConversationTurnResult[] = [];

  for (const text of messages) {
    turns.push(await service.handleIncomingMessage({ from: phone, to: "qa-business", text }));
  }

  const conversation = demoStore.conversations.find((entry) => entry.customerPhone === phone);
  return {
    draft: conversation?.draftOrder ?? null,
    turns,
    last: turns.at(-1) ?? null
  };
}

async function check(name: string, assertion: () => Promise<Omit<CheckResult, "name" | "ok">>) {
  try {
    const result = await assertion();
    return { ...result, name, ok: true };
  } catch (error) {
    return {
      name,
      ok: false,
      error: error instanceof Error ? error.message : "Unknown assertion error"
    };
  }
}

function assertOpenAi(turns: ConversationTurnResult[]) {
  assert(turns.length > 0);
  for (const turn of turns) {
    assert.equal(turn.classificationSource, "openai", "La interpretacion debe venir de OpenAI.");
  }
}

function itemNames(draft: OrderDraft | null | undefined) {
  return draft?.items.map((item) => item.productName) ?? [];
}

function pendingLabels(draft: OrderDraft | null | undefined) {
  return draft?.pendingSelections.map((selection) => `${selection.type}:${selection.label}`) ?? [];
}

function assertNoItems(draft: OrderDraft | null | undefined) {
  assert.equal(itemNames(draft).length, 0, `No debia crear items: ${itemNames(draft).join(", ")}`);
}

function assertHasItem(draft: OrderDraft | null | undefined, productName: string) {
  assert(
    itemNames(draft).includes(productName),
    `Falta item ${productName}. Items: ${itemNames(draft).join(", ")}`
  );
}

function assertNoItem(draft: OrderDraft | null | undefined, productName: string) {
  assert(
    !itemNames(draft).includes(productName),
    `No debia crear ${productName}. Items: ${itemNames(draft).join(", ")}`
  );
}

function assertPending(draft: OrderDraft | null | undefined, type: string, labelPattern: RegExp) {
  assert(
    (draft?.pendingSelections ?? []).some(
      (selection) => selection.type === type && labelPattern.test(selection.label)
    ),
    `Falta pendingSelection ${type}/${labelPattern}. Pendientes: ${pendingLabels(draft).join(", ")}`
  );
}

function snapshot(draft: OrderDraft | null | undefined, last: ConversationTurnResult | null): Omit<CheckResult, "name" | "ok"> {
  return {
    reply: last?.reply,
    items: itemNames(draft),
    pendingSelections: pendingLabels(draft)
  };
}

const checks: Array<() => Promise<CheckResult>> = [
  () => check("familia fresas con crema no defaulta tradicional", async () => {
    const { draft, turns, last } = await runConversation(["me regalas unas fresas con crema"], "qa_family_01");
    assertOpenAi(turns);
    assertNoItem(draft, "Fresas con crema tradicional");
    assertPending(draft, "product_clarification", /fresas/i);
    return snapshot(draft, last);
  }),
  () => check("producto exacto fresas tradicional sigue funcionando", async () => {
    const { draft, turns, last } = await runConversation(["fresas con crema tradicional"], "qa_family_02");
    assertOpenAi(turns);
    assertHasItem(draft, "Fresas con crema tradicional");
    return snapshot(draft, last);
  }),
  () => check("producto exacto fresas oreo sigue funcionando", async () => {
    const { draft, turns, last } = await runConversation(["fresas con crema de oreo"], "qa_family_03");
    assertOpenAi(turns);
    assertHasItem(draft, "Fresas con crema de Oreo");
    return snapshot(draft, last);
  }),
  () => check("familia oblea no defaulta arequipe", async () => {
    const { draft, turns, last } = await runConversation(["una oblea"], "qa_family_04");
    assertOpenAi(turns);
    assertNoItem(draft, "Oblea Arequipe");
    assertPending(draft, "product_clarification", /oblea/i);
    return snapshot(draft, last);
  }),
  () => check("producto exacto oblea arequipe crema sigue funcionando", async () => {
    const { draft, turns, last } = await runConversation(["oblea arequipe crema"], "qa_family_05");
    assertOpenAi(turns);
    assertHasItem(draft, "Oblea Arequipe crema");
    return snapshot(draft, last);
  }),
  () => check("familia malteada no elige sabor", async () => {
    const { draft, turns, last } = await runConversation(["una malteada"], "qa_family_06");
    assertOpenAi(turns);
    assertNoItems(draft);
    assertPending(draft, "product_clarification", /malteada|sabor/i);
    return snapshot(draft, last);
  }),
  () => check("producto exacto malteada oreo sigue funcionando", async () => {
    const { draft, turns, last } = await runConversation(["malteada oreo"], "qa_family_07");
    assertOpenAi(turns);
    assertHasItem(draft, "Malteada Oreo");
    return snapshot(draft, last);
  }),
  () => check("antojo general con chocolate no crea producto por defecto", async () => {
    const { draft, turns, last } = await runConversation(["algo con chocolate"], "qa_family_08");
    assertOpenAi(turns);
    assertNoItems(draft);
    return snapshot(draft, last);
  }),
  () => check("familia fresas no crea producto por defecto", async () => {
    const { draft, turns, last } = await runConversation(["quiero fresas"], "qa_family_09");
    assertOpenAi(turns);
    assertNoItems(draft);
    assertPending(draft, "product_clarification", /fresas/i);
    return snapshot(draft, last);
  }),
  () => check("fresas con helado crea item y pide sabor", async () => {
    const { draft, turns, last } = await runConversation(["quiero fresas con helado"], "qa_family_10");
    assertOpenAi(turns);
    assertHasItem(draft, "Fresas con helado");
    assertPending(draft, "required_option", /helado|sabor/i);
    return snapshot(draft, last);
  })
];

const results: CheckResult[] = [];
for (const runCheck of checks) {
  results.push(await runCheck());
}

mkdirSync(resolve("qa-output"), { recursive: true });
const outputPath = resolve("qa-output", `openai-family-defaults-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
writeFileSync(outputPath, JSON.stringify({ results }, null, 2), "utf8");

for (const result of results) {
  if (result.ok) {
    console.log(`OK ${result.name}`);
  } else {
    console.error(`FAIL ${result.name}: ${result.error}`);
  }
}
console.log(`\nReporte: ${outputPath}`);

const failures = results.filter((result) => !result.ok);
if (failures.length > 0) {
  process.exitCode = 1;
}
