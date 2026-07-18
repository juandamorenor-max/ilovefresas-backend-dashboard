import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";
import { AgentFlowTurnService } from "./agent-flow-turn.service.js";
import { TelegramService } from "./telegram.service.js";

export interface TelegramInboundMessage {
  chatId: string;
  externalMessageId: string;
  sequenceNumber: number;
  text: string;
  appBaseUrl?: string;
  hasAttachment?: boolean;
  attachmentType?: "image" | "document" | null;
  attachmentFileId?: string | null;
  caption?: string | null;
  mimeType?: string | null;
  receivedAt?: string;
}

interface BufferOptions {
  debounceMs: number;
  replyGraceMs: number;
  maxBatchSize: number;
  seenMessageTtlMs: number;
}

interface BufferedMessage extends TelegramInboundMessage {
  receivedAtMs: number;
}

interface ChatBuffer {
  pending: BufferedMessage[];
  processing: boolean;
  timer: ReturnType<typeof setTimeout> | null;
  idleWaiters: Array<() => void>;
}

type TurnResult = Awaited<ReturnType<AgentFlowTurnService["handleTurn"]>>;

type AgentTurnHandler = Pick<AgentFlowTurnService, "handleTurn">;

type TelegramSender = Pick<TelegramService, "sendMessage"> &
  Partial<Pick<TelegramService, "sendChatAction">>;

const defaultOptions: BufferOptions = {
  debounceMs: env.TELEGRAM_MESSAGE_DEBOUNCE_MS,
  replyGraceMs: env.TELEGRAM_REPLY_GRACE_MS,
  maxBatchSize: env.TELEGRAM_MESSAGE_BATCH_SIZE,
  seenMessageTtlMs: 24 * 60 * 60 * 1000
};

export class TelegramInboundBufferService {
  private readonly buffers = new Map<string, ChatBuffer>();
  private readonly seenMessages = new Map<string, number>();

  constructor(
    private readonly agentFlowTurnService: AgentTurnHandler = new AgentFlowTurnService(),
    private readonly telegramService: TelegramSender = new TelegramService(),
    private readonly options: BufferOptions = defaultOptions
  ) {}

  enqueue(input: TelegramInboundMessage) {
    const dedupeKey = `telegram:${input.chatId}:${input.externalMessageId}`;
    this.pruneSeenMessages();
    if (this.seenMessages.has(dedupeKey)) {
      return { accepted: true, duplicate: true, queued: false };
    }

    this.seenMessages.set(dedupeKey, Date.now());
    const buffer = this.getOrCreateBuffer(input.chatId);
    const message: BufferedMessage = {
      ...input,
      receivedAtMs: Date.now()
    };

    if (this.isNewChatCommand(message.text)) {
      buffer.pending = [message];
    } else {
      buffer.pending.push(message);
    }
    buffer.pending.sort((left, right) =>
      left.sequenceNumber - right.sequenceNumber ||
      left.receivedAtMs - right.receivedAtMs
    );

    this.schedule(input.chatId, buffer);
    logger.info("Telegram inbound queued", {
      chatId: input.chatId,
      externalMessageId: input.externalMessageId,
      pendingCount: buffer.pending.length,
      processing: buffer.processing
    });

    return { accepted: true, duplicate: false, queued: true };
  }

  async waitForIdle(chatId: string) {
    const buffer = this.buffers.get(chatId);
    if (!buffer || this.isIdle(buffer)) {
      return;
    }

    await new Promise<void>((resolve) => {
      buffer.idleWaiters.push(resolve);
    });
  }

  private getOrCreateBuffer(chatId: string) {
    const existing = this.buffers.get(chatId);
    if (existing) {
      return existing;
    }

    const buffer: ChatBuffer = {
      pending: [],
      processing: false,
      timer: null,
      idleWaiters: []
    };
    this.buffers.set(chatId, buffer);
    return buffer;
  }

  private schedule(chatId: string, buffer: ChatBuffer) {
    if (buffer.processing) {
      return;
    }

    if (buffer.timer) {
      clearTimeout(buffer.timer);
    }

    const first = buffer.pending[0];
    const delay = first && this.isNewChatCommand(first.text)
      ? 0
      : this.options.debounceMs;
    buffer.timer = setTimeout(() => {
      buffer.timer = null;
      void this.drain(chatId, buffer);
    }, delay);
  }

  private async drain(chatId: string, buffer: ChatBuffer) {
    if (buffer.processing) {
      return;
    }

    buffer.processing = true;
    let heldResult: TurnResult | null = null;
    let heldBatch: BufferedMessage[] = [];

    try {
      while (buffer.pending.length > 0) {
        await this.waitForPendingMessagesToSettle(buffer);
        const batch = this.takeBatch(buffer);
        if (batch.length === 0) {
          break;
        }

        await this.sendTyping(chatId);
        const result = await this.agentFlowTurnService.handleTurn(
          this.toTurnInput(batch)
        );

        if (this.isNewChatCommand(batch[0]?.text ?? "")) {
          heldResult = null;
          heldBatch = [];
          await this.publish(chatId, result, batch);
          continue;
        }

        heldResult = result;
        heldBatch = batch;

        if (buffer.pending.length > 0) {
          logger.info("Telegram reply superseded by newer inbound message", {
            chatId,
            supersededMessageIds: batch.map((message) => message.externalMessageId),
            pendingCount: buffer.pending.length
          });
          continue;
        }

        await this.sleep(this.options.replyGraceMs);
      }

      if (heldResult) {
        await this.publish(chatId, heldResult, heldBatch);
      }
    } catch (error) {
      logger.error("Telegram buffered turn failed", {
        chatId,
        error: error instanceof Error ? error.message : "unknown"
      });
    } finally {
      buffer.processing = false;
      if (buffer.pending.length > 0) {
        this.schedule(chatId, buffer);
      } else {
        this.resolveIdle(buffer);
        this.buffers.delete(chatId);
      }
    }
  }

  private async waitForPendingMessagesToSettle(buffer: ChatBuffer) {
    const latest = buffer.pending.at(-1);
    if (!latest || this.isNewChatCommand(latest.text)) {
      return;
    }

    const elapsed = Date.now() - latest.receivedAtMs;
    const remaining = Math.max(0, this.options.debounceMs - elapsed);
    await this.sleep(remaining);
  }

  private takeBatch(buffer: ChatBuffer) {
    const first = buffer.pending.shift();
    if (!first) {
      return [];
    }

    const batch = [first];
    if (this.isNewChatCommand(first.text) || this.hasAttachment(first)) {
      return batch;
    }

    while (batch.length < this.options.maxBatchSize) {
      const next = buffer.pending[0];
      if (!next || this.isNewChatCommand(next.text) || this.hasAttachment(next)) {
        break;
      }
      batch.push(buffer.pending.shift() as BufferedMessage);
    }

    return batch;
  }

  private toTurnInput(batch: BufferedMessage[]) {
    const first = batch[0] as BufferedMessage;
    const text = batch
      .map((message) => message.text.trim())
      .filter(Boolean)
      .join("\n");

    return {
      channel: "telegram" as const,
      chatId: first.chatId,
      text,
      appBaseUrl: first.appBaseUrl,
      hasAttachment: first.hasAttachment,
      attachmentType: first.attachmentType,
      attachmentFileId: first.attachmentFileId,
      caption: first.caption,
      mimeType: first.mimeType
    };
  }

  private async publish(
    chatId: string,
    result: TurnResult,
    batch: BufferedMessage[]
  ) {
    const responseText = String(result.responseText ?? "").trim();
    if (!result.shouldSendReply || !responseText || !env.TELEGRAM_CLIENT_BOT_TOKEN) {
      return;
    }

    await this.telegramService.sendMessage(
      env.TELEGRAM_CLIENT_BOT_TOKEN,
      chatId,
      responseText
    );
    logger.info("Telegram buffered reply delivered", {
      chatId,
      messageIds: batch.map((message) => message.externalMessageId),
      source: result.source ?? "unknown"
    });
  }

  private async sendTyping(chatId: string) {
    if (!env.TELEGRAM_CLIENT_BOT_TOKEN || !this.telegramService.sendChatAction) {
      return;
    }

    try {
      await this.telegramService.sendChatAction(
        env.TELEGRAM_CLIENT_BOT_TOKEN,
        chatId,
        "typing"
      );
    } catch (error) {
      logger.warn("Telegram typing action failed", {
        chatId,
        error: error instanceof Error ? error.message : "unknown"
      });
    }
  }

  private isNewChatCommand(text: string) {
    return /^\/(?:newchat|newbot)\b/i.test(text.trim());
  }

  private hasAttachment(message: BufferedMessage) {
    return Boolean(
      message.hasAttachment ||
      message.attachmentType ||
      message.attachmentFileId
    );
  }

  private pruneSeenMessages() {
    const cutoff = Date.now() - this.options.seenMessageTtlMs;
    for (const [key, seenAt] of this.seenMessages) {
      if (seenAt < cutoff) {
        this.seenMessages.delete(key);
      }
    }
  }

  private isIdle(buffer: ChatBuffer) {
    return !buffer.processing && !buffer.timer && buffer.pending.length === 0;
  }

  private resolveIdle(buffer: ChatBuffer) {
    for (const resolve of buffer.idleWaiters.splice(0)) {
      resolve();
    }
  }

  private sleep(ms: number) {
    if (ms <= 0) {
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => setTimeout(resolve, ms));
  }
}
