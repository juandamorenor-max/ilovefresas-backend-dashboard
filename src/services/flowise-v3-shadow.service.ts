import { env } from "../config/env.js";
import {
  turnDecisionV3Schema,
  type CustomerTurn,
  type TurnDecisionV3,
  type TurnResult
} from "../contracts/customer-turn.js";
import { parseJsonFromText } from "../utils/json.js";

type FlowisePrediction = Record<string, unknown> & {
  agentFlowExecutedData?: unknown;
};

export function extractLatestTurnDecisionV3(payload: FlowisePrediction): TurnDecisionV3 {
  const candidates: unknown[] = [];
  const executedData = payload.agentFlowExecutedData;
  if (Array.isArray(executedData)) {
    for (let index = executedData.length - 1; index >= 0; index -= 1) {
      const node = executedData[index];
      if (node && typeof node === "object") {
        const data = (node as Record<string, unknown>).data;
        if (data && typeof data === "object") {
          candidates.push((data as Record<string, unknown>).output);
        }
      }
    }
  }

  candidates.push(payload.json, payload.output, payload.text, payload.answer, payload.response);

  for (const candidate of candidates) {
    if (candidate && typeof candidate === "object") {
      const validation = turnDecisionV3Schema.safeParse(normalizeFlowiseDecisionCandidate(candidate));
      if (validation.success) return validation.data;
    }
    if (typeof candidate === "string") {
      const parsed = parseJsonFromText<unknown>(candidate);
      const validation = turnDecisionV3Schema.safeParse(normalizeFlowiseDecisionCandidate(parsed));
      if (validation.success) return validation.data;
    }
  }
  throw new Error("Flowise V3 did not return a structured decision");
}

function normalizeFlowiseDecisionCandidate(candidate: unknown): unknown {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return candidate;
  const normalized = { ...(candidate as Record<string, unknown>) };
  if (typeof normalized.operations === "string") {
    const parsedOperations = parseJsonFromText<unknown>(normalized.operations);
    if (Array.isArray(parsedOperations)) normalized.operations = parsedOperations;
  }
  if (Array.isArray(normalized.operations)) {
    normalized.operations = normalized.operations.map((operation) => {
      if (!operation || typeof operation !== "object" || Array.isArray(operation)) return operation;
      const normalizedOperation = { ...(operation as Record<string, unknown>) };
      if (
        normalizedOperation.type === "add_item" &&
        Array.isArray(normalizedOperation.selectedOptions) &&
        normalizedOperation.selectedOptions.length === 0
      ) {
        normalizedOperation.selectedOptions = {};
      }
      return normalizedOperation;
    });
  }
  return normalized;
}

export type FlowiseV3ShadowResult = {
  agentflowId: string;
  decision: TurnDecisionV3 | null;
  error: string | null;
  durationMs: number;
};

export class FlowiseV3ShadowService {
  isEnabled() {
    return Boolean(env.FLOWISE_V3_SHADOW && env.FLOWISE_V3_AGENTFLOW_ID);
  }

  async evaluate(input: {
    turn: CustomerTurn;
    currentResult: TurnResult;
    conversationState: Record<string, unknown>;
    catalog: unknown;
  }): Promise<FlowiseV3ShadowResult> {
    const startedAt = Date.now();
    const agentflowId = env.FLOWISE_V3_AGENTFLOW_ID ?? "not-configured";
    if (!this.isEnabled()) {
      return { agentflowId, decision: null, error: "shadow_disabled", durationMs: 0 };
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), env.FLOWISE_V3_TIMEOUT_MS);
      const baseUrl = env.FLOWISE_API_URL.replace(/\/+$/, "");
      const response = await fetch(
        `${baseUrl}/api/v1/prediction/${encodeURIComponent(agentflowId)}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(env.FLOWISE_API_KEY ? { Authorization: `Bearer ${env.FLOWISE_API_KEY}` } : {})
          },
          signal: controller.signal,
          body: JSON.stringify({
            question: JSON.stringify({
              turn: input.turn,
              state: input.conversationState,
              catalog: input.catalog,
              currentEngineResult: {
                nextExpected: input.currentResult.nextExpected,
                source: input.currentResult.source,
                needsHuman: input.currentResult.needsHuman
              }
            }),
            sessionId: `v3-shadow:${input.turn.channel}:${input.turn.chatId}`,
            overrideConfig: {
              vars: {
                turn_context_v3: JSON.stringify({
                  turn: input.turn,
                  state: input.conversationState,
                  catalog: input.catalog
                })
              }
            }
          })
        }
      ).finally(() => clearTimeout(timeout));

      const payload = await response.text();
      if (!response.ok) {
        throw new Error(`Flowise V3 returned ${response.status}: ${payload.slice(0, 240)}`);
      }
      const parsedPayload = this.parsePayload(payload);
      const decision = extractLatestTurnDecisionV3(parsedPayload);
      return { agentflowId, decision, error: null, durationMs: Date.now() - startedAt };
    } catch (error) {
      return {
        agentflowId,
        decision: null,
        error: error instanceof Error ? error.message : "unknown",
        durationMs: Date.now() - startedAt
      };
    }
  }

  private parsePayload(payload: string): FlowisePrediction {
    try {
      const parsed = JSON.parse(payload);
      return parsed && typeof parsed === "object" ? parsed as FlowisePrediction : { text: payload };
    } catch {
      return { text: payload };
    }
  }

}
