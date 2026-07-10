import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const sourcePath = path.join(root, "integrations", "flowise", "current-agentflow-export.json");
const outputPath = path.join(root, "integrations", "flowise", "v3-shadow-agentflow-import.json");
const promptDir = path.join(root, "integrations", "flowise", "prompts");

const flow = JSON.parse(fs.readFileSync(sourcePath, "utf8"));
const prompt = (name) => fs.readFileSync(path.join(promptDir, `${name}.md`), "utf8").trim();

const envelope = `

<contrato_salida>
Devuelve exclusivamente un objeto TurnDecisionV3 con estos campos:
intent, confidence, operations, replyDraft, needsHuman, reason, specialist.
Operations solo puede contener: add_item, update_item, remove_item,
set_customer_data, answer_catalog, request_clarification o handoff.
No agregues campos. No incluyas markdown.
</contrato_salida>`;

const specialistPrompts = {
  llmAgentflow_1: ["PEDIDO V3", "pedido"],
  llmAgentflow_3: ["OPCIONES V3", "opciones"],
  llmAgentflow_2: ["DATOS V3", "datos"],
  llmAgentflow_4: ["MENU V3", "menu"],
  llmAgentflow_5: ["POSTVENTA V3", "postventa"]
};

const structuredOutput = [
  { key: "intent", type: "string", enumValues: "order_update,catalog_question,customer_data,answer_pending_selection,small_talk,post_order,human_handoff,unknown", jsonSchema: "", description: "Intent V3" },
  { key: "confidence", type: "number", enumValues: "", jsonSchema: "", description: "Confidence from 0 to 1" },
  { key: "operations", type: "json", enumValues: "", jsonSchema: JSON.stringify({ type: "array", items: { type: "object" } }), description: "Closed backend operations" },
  { key: "replyDraft", type: "string", enumValues: "", jsonSchema: "", description: "Optional draft; backend decides final reply" },
  { key: "needsHuman", type: "boolean", enumValues: "", jsonSchema: "", description: "True only for a real handoff" },
  { key: "reason", type: "string", enumValues: "", jsonSchema: "", description: "Short decision reason" },
  { key: "specialist", type: "string", enumValues: "pedido,opciones,datos,menu,postventa,supervisor", jsonSchema: "", description: "Responsible specialist" }
];

const modelConfig = {
  credential: "",
  modelName: "gpt-5.4-mini",
  temperature: "0",
  streaming: true,
  allowImageUploads: "",
  reasoning: "medium",
  maxTokens: "1200",
  topP: "",
  frequencyPenalty: "",
  presencePenalty: "",
  timeout: "20000",
  strictToolCalling: true,
  stopSequence: "",
  basepath: "",
  baseOptions: "",
  llmModel: "chatOpenAI"
};

const configureLlm = (node, label, content) => {
  node.data.label = label;
  node.data.name = "llmAgentflow";
  node.data.inputs.llmModel = "chatOpenAI";
  node.data.inputs.llmMessages = [
    { role: "system", content: `${content}${envelope}` },
    { role: "user", content: "{{question}}" }
  ];
  node.data.inputs.llmEnableMemory = false;
  node.data.inputs.llmMemoryType = "";
  node.data.inputs.llmUserMessage = "";
  node.data.inputs.llmReturnResponseAs = "userMessage";
  node.data.inputs.llmStructuredOutput = structuredOutput;
  node.data.inputs.llmUpdateState = [];
  node.data.inputs.llmModelConfig = { ...modelConfig };
};

const supervisor = flow.nodes.find((node) => node.id === "llmAgentflow_0");
configureLlm(supervisor, "SUPERVISOR V3", `${prompt("supervisor")}

Selecciona exactamente un especialista. En esta etapa operations debe ser [] y
specialist debe indicar la rama. El especialista producira la decision aplicable.`);
supervisor.data.inputs.llmUpdateState = [
  { key: "specialist", value: "<p>{{ output.specialist }}</p>" }
];

for (const [id, [label, promptName]] of Object.entries(specialistPrompts)) {
  const node = flow.nodes.find((candidate) => candidate.id === id);
  configureLlm(node, label, prompt(promptName));
}

const condition = flow.nodes.find((node) => node.id === "conditionAgentflow_0");
condition.data.label = "RUTA ESPECIALISTA V3";
const routes = ["postventa", "menu", "pedido", "datos", "opciones"];
condition.data.inputs.conditions = routes.map((route) => ({
  type: "string",
  value1: "<p>{{ $flow.state.specialist }}</p>",
  operation: "equal",
  value2: `<p>${route}</p>`
}));

const removedNodeIds = new Set([
  "conditionAgentflow_1",
  "conditionAgentflow_2",
  "httpAgentflow_0",
  "directReplyAgentflow_5",
  "directReplyAgentflow_6"
]);

const reroute = (source, sourceHandleFragment, target) => {
  const edge = flow.edges.find((candidate) =>
    candidate.source === source && String(candidate.sourceHandle).includes(sourceHandleFragment)
  );
  if (!edge) throw new Error(`Missing edge ${source}:${sourceHandleFragment}`);
  edge.target = target;
  edge.targetHandle = target;
  edge.id = `${source}-${edge.sourceHandle}-${target}-${target}`;
};

reroute("conditionAgentflow_0", "output-0", "llmAgentflow_5");
reroute("llmAgentflow_2", "output-llmAgentflow", "directReplyAgentflow_1");
reroute("llmAgentflow_4", "output-llmAgentflow", "directReplyAgentflow_4");

flow.nodes = flow.nodes.filter((node) => !removedNodeIds.has(node.id));
flow.edges = flow.edges.filter((edge) =>
  !removedNodeIds.has(edge.source) && !removedNodeIds.has(edge.target)
);

for (const [replyId, llmId] of [
  ["directReplyAgentflow_0", "llmAgentflow_1"],
  ["directReplyAgentflow_1", "llmAgentflow_2"],
  ["directReplyAgentflow_2", "llmAgentflow_3"],
  ["directReplyAgentflow_3", "llmAgentflow_5"],
  ["directReplyAgentflow_4", "llmAgentflow_4"]
]) {
  const node = flow.nodes.find((candidate) => candidate.id === replyId);
  node.data.label = `OUTPUT ${llmId.replace("llmAgentflow_", "")}`;
  node.data.inputs.directReplyMessage = `{{${llmId}.output}}`;
}

const start = flow.nodes.find((node) => node.id === "startAgentflow_0");
start.data.label = "START V3 SHADOW";
if (start.data.inputs.startState) start.data.inputs.startState = [];

fs.writeFileSync(outputPath, `${JSON.stringify(flow, null, 2)}\n`, "utf8");
console.log(`Created ${path.relative(root, outputPath)} (${flow.nodes.length} nodes, ${flow.edges.length} edges)`);
