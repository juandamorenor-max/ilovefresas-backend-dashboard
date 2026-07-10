import fs from "node:fs";
import path from "node:path";

const file = path.join(process.cwd(), "integrations", "flowise", "v3-shadow-agentflow-import.json");
const flow = JSON.parse(fs.readFileSync(file, "utf8"));
const ids = new Set(flow.nodes.map((node) => node.id));
const llms = flow.nodes.filter((node) => node.id.startsWith("llmAgentflow_"));
const labels = new Set(llms.map((node) => node.data.label));
const expected = ["SUPERVISOR V3", "PEDIDO V3", "OPCIONES V3", "DATOS V3", "MENU V3", "POSTVENTA V3"];

if (flow.nodes.length !== 13 || flow.edges.length !== 12) {
  throw new Error(`Unexpected V3 graph size: ${flow.nodes.length} nodes, ${flow.edges.length} edges`);
}
if (flow.edges.some((edge) => !ids.has(edge.source) || !ids.has(edge.target))) {
  throw new Error("V3 graph contains dangling edges");
}
if (expected.some((label) => !labels.has(label))) {
  throw new Error("V3 graph is missing a required specialist");
}
for (const node of llms) {
  const inputs = node.data.inputs;
  const systemPrompt = inputs.llmMessages?.[0]?.content ?? "";
  if (inputs.llmEnableMemory !== false) throw new Error(`${node.data.label} must not own memory`);
  if (inputs.llmModel !== "chatOpenAI") throw new Error(`${node.data.label} must use OpenAI`);
  if (inputs.llmModelConfig?.modelName !== "gpt-5.4-mini") throw new Error(`${node.data.label} uses an unexpected model`);
  if (systemPrompt.length > 2500) throw new Error(`${node.data.label} prompt is too large`);
  if (/\b(16000|18000|5000)\b/.test(systemPrompt)) throw new Error(`${node.data.label} embeds business prices`);
  const keys = new Set((inputs.llmStructuredOutput ?? []).map((entry) => entry.key));
  for (const key of ["intent", "confidence", "operations", "replyDraft", "needsHuman", "reason", "specialist"]) {
    if (!keys.has(key)) throw new Error(`${node.data.label} is missing structured output ${key}`);
  }
}

console.log("flowise-v3 import validation OK");
