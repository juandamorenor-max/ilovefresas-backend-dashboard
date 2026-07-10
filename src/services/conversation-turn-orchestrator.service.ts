import {
  customerTurnSchema,
  turnResultSchema,
  type CustomerTurn,
  type TurnResult
} from "../contracts/customer-turn.js";
import { createId } from "../utils/id.js";
import { AgentFlowTurnService } from "./agent-flow-turn.service.js";
import { BotIntegrationService } from "./bot-integration.service.js";
import { ConversationTurnLockService } from "./conversation-turn-lock.service.js";
import { FlowiseV3ShadowService } from "./flowise-v3-shadow.service.js";
import { TurnPersistenceService } from "./turn-persistence.service.js";

export class ConversationTurnOrchestratorService {
  constructor(
    private readonly botIntegrationService = new BotIntegrationService(),
    private readonly agentFlowTurnService = new AgentFlowTurnService(botIntegrationService),
    private readonly lockService = new ConversationTurnLockService(),
    private readonly persistence = new TurnPersistenceService(),
    private readonly shadowService = new FlowiseV3ShadowService()
  ) {}

  async handle(input: CustomerTurn, options: { appBaseUrl?: string } = {}): Promise<TurnResult> {
    const turn = customerTurnSchema.parse(input);
    return this.lockService.runExclusive(`${turn.channel}:${turn.chatId}`, async () => {
      const completed = await this.persistence.getCompleted(turn);
      if (completed) return turnResultSchema.parse(completed);

      const turnId = createId("turn");
      const claimed = await this.persistence.claim(turn, turnId);
      if (!claimed) {
        const duplicate = await this.waitForCompleted(turn);
        if (duplicate) return turnResultSchema.parse(duplicate);
      }

      const startedAt = Date.now();
      let result: TurnResult | null = null;
      let errorMessage: string | null = null;

      try {
        const attachment = turn.attachments[0] ?? null;
        const raw = await this.agentFlowTurnService.handleTurn({
          channel: turn.channel,
          chatId: turn.chatId,
          text: turn.text,
          appBaseUrl: options.appBaseUrl,
          hasAttachment: turn.attachments.length > 0,
          attachmentType: attachment?.type ?? null,
          attachmentFileId: attachment?.id ?? null,
          caption: attachment?.caption ?? null,
          mimeType: attachment?.mimeType ?? null
        });
        const current = this.botIntegrationService.getOrCreateActiveConversation(
          turn.channel,
          turn.chatId
        );
        const currentState = current.conversationState as Record<string, unknown>;
        result = turnResultSchema.parse({
          turnId,
          conversationId: String(raw.conversationId),
          responseText: String(raw.responseText ?? ""),
          attachments: Array.isArray(raw.attachments) ? raw.attachments : [],
          nextExpected: String(current.conversationState.next_expected ?? "") || null,
          orderId: raw.orderId ? String(raw.orderId) : null,
          needsHuman:
            current.state === "pending_human" ||
            currentState.needs_human === true ||
            current.conversationState.next_expected === "humano",
          source: String(raw.source ?? "unknown"),
          shouldSendReply: raw.shouldSendReply !== false && Boolean(String(raw.responseText ?? "").trim()),
          duplicate: false
        });
        await this.persistence.complete(turn, result);
        this.runShadowEvaluation(turnId, turn, result);
        return result;
      } catch (error) {
        errorMessage = error instanceof Error ? error.message : "unknown";
        await this.persistence.fail(turn, errorMessage);
        throw error;
      } finally {
        await this.persistence.trace({
          turnId,
          turn,
          result,
          durationMs: Date.now() - startedAt,
          error: errorMessage
        });
      }
    });
  }

  private runShadowEvaluation(turnId: string, turn: CustomerTurn, result: TurnResult) {
    if (!this.shadowService.isEnabled()) return;
    const conversation = this.botIntegrationService.getOrCreateActiveConversation(
      turn.channel,
      turn.chatId
    );
    void this.shadowService.evaluate({
      turn,
      currentResult: result,
      conversationState: conversation.conversationState as Record<string, unknown>,
      catalog: this.botIntegrationService.getAvailableCatalog()
    }).then((shadow) => this.persistence.recordShadowResult({
      turnId,
      agentflowId: shadow.agentflowId,
      decision: shadow.decision,
      error: shadow.error,
      durationMs: shadow.durationMs
    }));
  }

  private async waitForCompleted(turn: CustomerTurn) {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      const completed = await this.persistence.getCompleted(turn);
      if (completed) return completed;
    }
    return null;
  }
}
