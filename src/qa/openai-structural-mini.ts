import { strict as assert } from "node:assert";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
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

type StructuralCaseGroup =
  | "required-option-no-default"
  | "ice-cream-cup-with-modifiers"
  | "family-no-default"
  | "multi-product-family-no-handoff";

type CaseDefinition = {
  id: string;
  group: StructuralCaseGroup;
  messages: string[];
  assert: (context: CaseContext) => void;
};

type CaseContext = {
  turns: ConversationTurnResult[];
  draft: OrderDraft | null;
  reply: string;
  state: string | null;
};

type CaseReport = {
  id: string;
  group: StructuralCaseGroup;
  messages: string[];
  ok: boolean;
  error: string | null;
  turns: Array<{
    source: string;
    reply: string;
  }>;
  draft: OrderDraft | null;
  state: string | null;
};

function normalize(value: string | null | undefined) {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function item(draft: OrderDraft | null, productName: string) {
  return draft?.items.find((entry) => normalize(entry.productName) === normalize(productName)) ?? null;
}

function addedNames(draft: OrderDraft | null, productName: string) {
  return item(draft, productName)?.components
    .filter((component) => component.type === "added")
    .map((component) => component.name) ?? [];
}

function pendingText(draft: OrderDraft | null) {
  return (draft?.pendingSelections ?? [])
    .map((selection) => `${selection.type} ${selection.label} ${selection.question} ${selection.options.join(" ")}`)
    .join(" ");
}

function assertOpenAi(context: CaseContext) {
  assert(context.turns.length > 0, "No turns captured.");
  for (const turn of context.turns) {
    assert.equal(turn.classificationSource, "openai", "Expected OpenAI as classification source.");
  }
}

function assertNoHumanHandoff(context: CaseContext) {
  assert.notEqual(context.state, "pending_human", "Conversation escalated to human unexpectedly.");
  assert.doesNotMatch(context.reply, /operario|asesor para revisar|contactando con un agente/i);
}

function assertHasPendingFlavor(context: CaseContext) {
  assert.match(
    normalize(`${pendingText(context.draft)} ${context.reply}`),
    /sabor|helado|fresa|chocolate|vainilla|oreo/,
    "Expected a pending/requested ice cream flavor."
  );
}

function assertNoSelectedIceCreamFlavor(draft: OrderDraft | null, productName: string) {
  const target = item(draft, productName);
  assert(target, `Missing item ${productName}`);
  assert.deepEqual(target.selectedOptions?.iceCreamFlavor ?? [], [], "Ice cream flavor must not be assumed.");
}

function assertFamilyClarification(context: CaseContext, familyPattern: RegExp) {
  const text = normalize(`${pendingText(context.draft)} ${context.reply}`);
  assert.match(text, familyPattern, "Expected family/variant clarification.");
}

async function runCase(definition: CaseDefinition): Promise<CaseReport> {
  const service = new ConversationService();
  const phone = `qa_openai_structural_${definition.id}_${Date.now()}`;
  const turns: ConversationTurnResult[] = [];

  for (const text of definition.messages) {
    turns.push(await service.handleIncomingMessage({ from: phone, to: "qa-business", text }));
  }

  const conversation = demoStore.conversations.find((entry) => entry.customerPhone === phone) ?? null;
  const context: CaseContext = {
    turns,
    draft: conversation?.draftOrder ?? null,
    reply: turns.at(-1)?.reply ?? "",
    state: conversation?.state ?? null
  };

  try {
    assertOpenAi(context);
    definition.assert(context);
    return buildReport(definition, context, true, null);
  } catch (error) {
    return buildReport(
      definition,
      context,
      false,
      error instanceof Error ? error.message : "Unknown error"
    );
  }
}

function buildReport(
  definition: CaseDefinition,
  context: CaseContext,
  ok: boolean,
  error: string | null
): CaseReport {
  return {
    id: definition.id,
    group: definition.group,
    messages: definition.messages,
    ok,
    error,
    turns: context.turns.map((turn) => ({
      source: turn.classificationSource,
      reply: turn.reply
    })),
    draft: context.draft,
    state: context.state
  };
}

const cases: CaseDefinition[] = [
  {
    id: "required_brownie_helado_milo",
    group: "required-option-no-default",
    messages: ["Me regalas un brownie con helado y milo"],
    assert: (context) => {
      assertNoHumanHandoff(context);
      assertNoSelectedIceCreamFlavor(context.draft, "Brownie con Helado");
      assert(addedNames(context.draft, "Brownie con Helado").includes("Milo"), "Expected Milo as modifier.");
      assertHasPendingFlavor(context);
    }
  },
  {
    id: "required_fresas_helado_oreo",
    group: "required-option-no-default",
    messages: ["Quiero unas fresas con helado y oreo"],
    assert: (context) => {
      assertNoHumanHandoff(context);
      assertNoSelectedIceCreamFlavor(context.draft, "Fresas con helado");
      assert(addedNames(context.draft, "Fresas con helado").includes("Oreo"), "Expected Oreo as modifier.");
      assertHasPendingFlavor(context);
    }
  },
  {
    id: "vaso_un_sabor_modifiers",
    group: "ice-cream-cup-with-modifiers",
    messages: ["Vaso helado un sabor + Choco Crispi + Arequipe"],
    assert: (context) => {
      assertNoHumanHandoff(context);
      assertNoSelectedIceCreamFlavor(context.draft, "Vaso helado un sabor");
      assert(addedNames(context.draft, "Vaso helado un sabor").includes("Choco Crispi"), "Expected Choco Crispi.");
      assert(addedNames(context.draft, "Vaso helado un sabor").includes("Arequipe"), "Expected Arequipe.");
      assertHasPendingFlavor(context);
    }
  },
  {
    id: "vaso_dos_sabores_modifiers",
    group: "ice-cream-cup-with-modifiers",
    messages: ["Me das un vaso helado dos sabores con milo y brownie"],
    assert: (context) => {
      assertNoHumanHandoff(context);
      assert(item(context.draft, "Vaso helado dos sabores"), "Expected Vaso helado dos sabores.");
      assert(addedNames(context.draft, "Vaso helado dos sabores").includes("Milo"), "Expected Milo.");
      assert(addedNames(context.draft, "Vaso helado dos sabores").includes("Brownie"), "Expected Brownie.");
      assert.match(normalize(`${pendingText(context.draft)} ${context.reply}`), /dos|sabores|helado/);
    }
  },
  {
    id: "family_oblea",
    group: "family-no-default",
    messages: ["Quiero una oblea"],
    assert: (context) => {
      assertNoHumanHandoff(context);
      assert.equal(context.draft?.items.length ?? 0, 0, "Should not pick an oblea variant by default.");
      assertFamilyClarification(context, /oblea|arequipe|nutella|crema/);
    }
  },
  {
    id: "family_malteada",
    group: "family-no-default",
    messages: ["Quiero una malteada"],
    assert: (context) => {
      assertNoHumanHandoff(context);
      assert.equal(context.draft?.items.length ?? 0, 0, "Should not pick a malteada flavor by default.");
      assertFamilyClarification(context, /malteada|fresa|chocolate|vainilla|oreo/);
    }
  },
  {
    id: "multi_malteadas_obleas",
    group: "multi-product-family-no-handoff",
    messages: ["Quiero 3 malteadas y 2 obleas"],
    assert: (context) => {
      assertNoHumanHandoff(context);
      assertFamilyClarification(context, /malteada|oblea|sabor|tipo/);
    }
  },
  {
    id: "multi_waffles_malteadas",
    group: "multi-product-family-no-handoff",
    messages: ["Dame 2 waffles y una malteada"],
    assert: (context) => {
      assertNoHumanHandoff(context);
      assertFamilyClarification(context, /waffle|malteada|sabor|tipo|fruta|salsa/);
    }
  }
];

const reports = [];
for (const testCase of cases) {
  reports.push(await runCase(testCase));
}

const outputDir = join(process.cwd(), "qa-output");
mkdirSync(outputDir, { recursive: true });
const outputPath = join(outputDir, `openai-structural-mini-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
writeFileSync(
  outputPath,
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      total: reports.length,
      passed: reports.filter((report) => report.ok).length,
      failed: reports.filter((report) => !report.ok).length,
      reports
    },
    null,
    2
  )
);

for (const report of reports) {
  console.log(`${report.ok ? "OK" : "FAIL"} [${report.group}] ${report.id}${report.error ? ` - ${report.error}` : ""}`);
}
console.log(`Evidence written: ${outputPath}`);

if (reports.some((report) => !report.ok)) {
  process.exitCode = 1;
}
