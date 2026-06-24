import { env } from "../config/env.js";
import { FlowiseService } from "./flowise.service.js";
import { GeminiService } from "./gemini.service.js";
import { OpenAIService } from "./openai.service.js";

export type LlmJsonSource = "heuristic" | "openai" | "gemini" | "flowise";

export class LlmJsonService {
  constructor(
    private readonly openAIService = new OpenAIService(),
    private readonly geminiService = new GeminiService(),
    private readonly flowiseService = new FlowiseService()
  ) {}

  getProvider() {
    return env.LLM_PROVIDER;
  }

  async generateJson<T>(prompt: string): Promise<{
    data: T | null;
    source: LlmJsonSource;
  }> {
    if (env.LLM_PROVIDER === "openai") {
      return {
        data: await this.openAIService.generateJson<T>(prompt),
        source: "openai"
      };
    }

    if (env.LLM_PROVIDER === "gemini") {
      return {
        data: await this.geminiService.generateJson<T>(prompt),
        source: "gemini"
      };
    }

    if (env.LLM_PROVIDER === "flowise") {
      return {
        data: await this.flowiseService.generateJson<T>(prompt),
        source: "flowise"
      };
    }

    return {
      data: null,
      source: "heuristic"
    };
  }
}
