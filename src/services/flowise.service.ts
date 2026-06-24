import { env } from "../config/env.js";
import { parseJsonFromText } from "../utils/json.js";
import { logger } from "../utils/logger.js";

interface FlowisePredictionResponse {
  text?: unknown;
  answer?: unknown;
  response?: unknown;
  output?: unknown;
  json?: unknown;
}

export class FlowiseService {
  async generateJson<T>(prompt: string): Promise<T | null> {
    if (!env.FLOWISE_CHATFLOW_ID) {
      logger.warn("Flowise provider selected but FLOWISE_CHATFLOW_ID is missing");
      return null;
    }

    const baseUrl = env.FLOWISE_API_URL.replace(/\/+$/, "");
    const url = `${baseUrl}/api/v1/prediction/${encodeURIComponent(env.FLOWISE_CHATFLOW_ID)}`;

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(env.FLOWISE_API_KEY ? { Authorization: `Bearer ${env.FLOWISE_API_KEY}` } : {})
        },
        body: JSON.stringify({
          question: prompt
        })
      });

      if (!response.ok) {
        logger.warn("Flowise prediction request failed", {
          status: response.status
        });
        return null;
      }

      const raw = (await response.json()) as FlowisePredictionResponse | string;
      return this.parseFlowiseOutput<T>(raw);
    } catch (error) {
      logger.warn("Flowise prediction request errored", {
        error: error instanceof Error ? error.message : "unknown"
      });
      return null;
    }
  }

  private parseFlowiseOutput<T>(raw: FlowisePredictionResponse | string): T | null {
    if (typeof raw === "string") {
      return parseJsonFromText<T>(raw);
    }

    if (!raw || typeof raw !== "object") {
      return null;
    }

    const directJson = raw.json;
    if (directJson && typeof directJson === "object") {
      return directJson as T;
    }

    if ("intent" in raw && "draftPatch" in raw) {
      return raw as T;
    }

    const candidates = [raw.text, raw.answer, raw.response, raw.output];
    for (const candidate of candidates) {
      if (!candidate) {
        continue;
      }

      if (typeof candidate === "object") {
        return candidate as T;
      }

      if (typeof candidate === "string") {
        const parsed = parseJsonFromText<T>(candidate);
        if (parsed) {
          return parsed;
        }
      }
    }

    return null;
  }
}
