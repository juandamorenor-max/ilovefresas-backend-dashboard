import crypto from "node:crypto";
import type { Request, Response } from "express";
import { env } from "../config/env.js";
import { TelegramBotRunnerService } from "../services/telegram-bot-runner.service.js";
import type { TelegramUpdate } from "../services/telegram.service.js";
import { logger } from "../utils/logger.js";

export class TelegramController {
  constructor(
    private readonly runner = new TelegramBotRunnerService()
  ) {}

  async receiveWebhook(request: Request, response: Response) {
    if (!env.TELEGRAM_CLIENT_BOT_TOKEN || !env.BOT_INTEGRATION_SECRET) {
      response.status(503).json({ error: "Telegram webhook is not configured" });
      return;
    }

    if (!this.hasValidSecret(request)) {
      response.status(401).json({ error: "Invalid Telegram webhook secret" });
      return;
    }

    const update = request.body as TelegramUpdate;
    if (!Number.isInteger(update?.update_id)) {
      response.status(400).json({ error: "Invalid Telegram update" });
      return;
    }

    try {
      await this.runner.handleClientWebhookUpdate(update);
      response.status(200).json({ received: true, processed: true });
    } catch (error) {
      logger.error("Telegram webhook update failed before acknowledgement", {
        updateId: update.update_id,
        error: error instanceof Error ? error.message : "unknown"
      });
      response.status(500).json({ error: "Telegram update processing failed" });
    }
  }

  private hasValidSecret(request: Request) {
    const received = request.header("x-telegram-bot-api-secret-token") ?? "";
    const expected = env.BOT_INTEGRATION_SECRET ?? "";
    const receivedBuffer = Buffer.from(received);
    const expectedBuffer = Buffer.from(expected);
    return receivedBuffer.length === expectedBuffer.length &&
      crypto.timingSafeEqual(receivedBuffer, expectedBuffer);
  }
}
