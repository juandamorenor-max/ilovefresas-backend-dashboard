import { env } from "../config/env.js";
import { parseJsonFromText } from "../utils/json.js";
import { logger } from "../utils/logger.js";

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
}

export class GeminiService {
  async generateJson<T>(prompt: string): Promise<T | null> {
    if (!env.GEMINI_API_KEY) {
      return null;
    }

    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${env.GEMINI_MODEL}:generateContent`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": env.GEMINI_API_KEY
          },
          body: JSON.stringify({
            contents: [
              {
                role: "user",
                parts: [{ text: prompt }]
              }
            ],
            generationConfig: {
              maxOutputTokens: env.AI_MAX_OUTPUT_TOKENS,
              responseMimeType: "application/json"
            }
          })
        }
      );

      if (!response.ok) {
        logger.warn("Gemini classification request failed", {
          status: response.status
        });
        return null;
      }

      const data = (await response.json()) as GeminiResponse;
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) {
        return null;
      }

      return parseJsonFromText<T>(text);
    } catch (error) {
      logger.warn("Gemini classification fell back to heuristics", {
        error: error instanceof Error ? error.message : "unknown"
      });
      return null;
    }
  }
}
