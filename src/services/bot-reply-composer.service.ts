import { env } from "../config/env.js";
import { buildComposeBotReplyPrompt } from "../prompts/composeBotReply.prompt.js";
import type { Business, Conversation, MessageClassification } from "../types/index.js";
import { LlmJsonService } from "./llm-json.service.js";

interface ComposedReply {
  reply: string;
}

export class BotReplyComposerService {
  constructor(private readonly llmJsonService = new LlmJsonService()) {}

  async compose(input: {
    business: Business;
    conversation: Conversation;
    customerMessage: string;
    classification: MessageClassification | null;
    safeDraftReply: string;
    memoryContext?: string;
  }): Promise<{ reply: string; source: MessageClassification["source"] | "template" }> {
    if (this.shouldPreserveStructuredReply(input.safeDraftReply)) {
      return { reply: input.safeDraftReply, source: "template" };
    }

    if (input.conversation.aiUsageCount >= env.AI_MAX_CALLS_PER_CONVERSATION) {
      return { reply: input.safeDraftReply, source: "template" };
    }

    const prompt = buildComposeBotReplyPrompt(input);
    const result = await this.llmJsonService.generateJson<ComposedReply>(prompt);

    if (!result.data?.reply?.trim()) {
      return { reply: input.safeDraftReply, source: "template" };
    }

    return {
      reply: result.data.reply.trim(),
      source: result.source
    };
  }

  private shouldPreserveStructuredReply(reply: string) {
    return (
      reply.includes("Tengo anotado:") ||
      reply.includes("Necesito los siguientes datos para completar tu pedido:") ||
      reply.includes("Necesito este dato para completar tu pedido:") ||
      reply.includes("Listo, ya pase tu pedido al operario para revision.")
    );
  }
}
