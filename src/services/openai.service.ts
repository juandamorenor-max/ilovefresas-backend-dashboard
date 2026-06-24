import { env } from "../config/env.js";
import { parseJsonFromText } from "../utils/json.js";
import { logger } from "../utils/logger.js";

interface OpenAIResponseContent {
  type?: string;
  text?: string;
}

interface OpenAIResponseOutput {
  content?: OpenAIResponseContent[];
}

interface OpenAIResponseBody {
  output_text?: string;
  output?: OpenAIResponseOutput[];
}

export class OpenAIService {
  async generateJson<T>(prompt: string): Promise<T | null> {
    if (!env.OPENAI_API_KEY) {
      return null;
    }

    for (let attempt = 0; attempt <= env.OPENAI_MAX_RETRIES; attempt += 1) {
      try {
        const response = await fetch("https://api.openai.com/v1/responses", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${env.OPENAI_API_KEY}`
          },
          body: JSON.stringify({
            model: env.OPENAI_MODEL,
            input: prompt,
            max_output_tokens: env.AI_MAX_OUTPUT_TOKENS
          })
        });

        if (!response.ok) {
          logger.warn("OpenAI request failed", {
            status: response.status,
            attempt,
            maxRetries: env.OPENAI_MAX_RETRIES
          });

          if (this.shouldRetry(response.status) && attempt < env.OPENAI_MAX_RETRIES) {
            await this.wait(this.retryDelayMs(response, attempt));
            continue;
          }

          return null;
        }

        const data = (await response.json()) as OpenAIResponseBody;
        const outputText =
          data.output_text ??
          data.output
            ?.flatMap((item) => item.content ?? [])
            .map((content) => content.text)
            .find((text) => Boolean(text));

        if (!outputText) {
          return null;
        }

        return parseJsonFromText<T>(outputText);
      } catch (error) {
        logger.warn("OpenAI request errored", {
          error: error instanceof Error ? error.message : "unknown",
          attempt,
          maxRetries: env.OPENAI_MAX_RETRIES
        });

        if (attempt < env.OPENAI_MAX_RETRIES) {
          await this.wait(this.retryDelayMs(null, attempt));
          continue;
        }

        return null;
      }
    }

    return null;
  }

  private shouldRetry(status: number) {
    return status === 408 || status === 409 || status === 429 || status >= 500;
  }

  private retryDelayMs(response: Response | null, attempt: number) {
    const retryAfter = response?.headers.get("retry-after");
    const retryAfterSeconds = retryAfter ? Number(retryAfter) : Number.NaN;
    if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
      return retryAfterSeconds * 1000;
    }

    return env.OPENAI_RETRY_BASE_MS * 2 ** attempt;
  }

  private wait(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
