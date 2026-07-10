import crypto from "node:crypto";
import type { Request, Response } from "express";
import { env } from "../config/env.js";
import { ConversationService } from "../services/conversation.service.js";
import { ConversationTurnOrchestratorService } from "../services/conversation-turn-orchestrator.service.js";
import { WhatsAppService } from "../services/whatsapp.service.js";
import { logger } from "../utils/logger.js";

type ParsedWhatsAppTurn = {
  kind: "text" | "attachment";
  from: string;
  to: string;
  externalMessageId: string;
  occurredAt: string | null;
  text: string;
  attachmentType?: "image" | "document";
  fileId?: string | null;
  mimeType?: string | null;
};

export class WhatsAppController {
  constructor(
    private readonly conversationService = new ConversationService(),
    private readonly whatsAppService = new WhatsAppService(),
    private readonly turnOrchestrator = new ConversationTurnOrchestratorService()
  ) {}

  verifyWebhook(request: Request, response: Response) {
    const mode = request.query["hub.mode"];
    const token = request.query["hub.verify_token"];
    const challenge = request.query["hub.challenge"];

    if (mode === "subscribe" && token === env.WHATSAPP_VERIFY_TOKEN) {
      response.status(200).send(challenge);
      return;
    }

    response.status(403).json({ error: "Invalid verify token" });
  }

  async receiveWebhook(request: Request, response: Response) {
    if (!this.hasValidSignature(request)) {
      response.status(401).json({ error: "Invalid webhook signature" });
      return;
    }

    const parsedMessage = this.parseIncomingMessage(request.body);

    if (!parsedMessage) {
      response.status(200).json({ received: true, ignored: true });
      return;
    }

    if (env.TURN_ENGINE_VERSION === "v3") {
      const appBaseUrl = this.getRequestBaseUrl(request);
      response.status(200).json({ received: true, queued: true });
      void this.processV3Turn(parsedMessage, appBaseUrl).catch((error) => {
        logger.error("WhatsApp V3 turn failed after webhook acknowledgement", {
          externalMessageId: parsedMessage.externalMessageId,
          error: error instanceof Error ? error.message : "unknown"
        });
      });
      return;
    }

    const result =
      parsedMessage.kind === "text"
        ? await this.conversationService.handleIncomingMessage({
            from: parsedMessage.from,
            to: parsedMessage.to,
            text: parsedMessage.text
          })
        : await this.conversationService.handleIncomingAttachment({
            from: parsedMessage.from,
            to: parsedMessage.to,
            attachmentType: parsedMessage.attachmentType ?? "document",
            caption: parsedMessage.text || null,
            fileId: parsedMessage.fileId ?? null,
            mimeType: parsedMessage.mimeType ?? null
          });
    if (result.reply.trim()) {
      await this.whatsAppService.sendTextMessage(parsedMessage.from, result.reply);
    }

    response.status(200).json({
      received: true,
      silent: !result.reply.trim(),
      reply: result.reply,
      debug: {
        conversationId: result.conversationId,
        state: result.state,
        classificationSource: result.classificationSource,
        replySource: result.replySource,
        aiUsageCount: result.aiUsageCount
      }
    });
  }

  private parseIncomingMessage(
    body: unknown
  ): ParsedWhatsAppTurn | null {
    const payload = body as {
      entry?: Array<{
        changes?: Array<{
          value?: {
            metadata?: { display_phone_number?: string };
            messages?: Array<{
              id?: string;
              from?: string;
              timestamp?: string;
              text?: { body?: string };
              image?: { id?: string; caption?: string; mime_type?: string };
              document?: { id?: string; caption?: string; mime_type?: string; filename?: string };
              type?: string;
            }>;
          };
        }>;
      }>;
    };

    const value = payload.entry?.[0]?.changes?.[0]?.value;
    const incomingMessage = value?.messages?.[0];

    if (!incomingMessage?.from) {
      return null;
    }

    const to = value?.metadata?.display_phone_number ?? "";
    const externalMessageId = incomingMessage.id ?? `whatsapp:${incomingMessage.from}:${incomingMessage.timestamp ?? Date.now()}`;
    const occurredAt = incomingMessage.timestamp
      ? new Date(Number(incomingMessage.timestamp) * 1000).toISOString()
      : null;
    if (incomingMessage.type === "text" && incomingMessage.text?.body) {
      return {
        kind: "text",
        from: incomingMessage.from,
        to,
        externalMessageId,
        occurredAt,
        text: incomingMessage.text.body
      };
    }

    if (incomingMessage.type === "image" && incomingMessage.image?.id) {
      return {
        kind: "attachment",
        from: incomingMessage.from,
        to,
        externalMessageId,
        occurredAt,
        text: incomingMessage.image.caption ?? "",
        attachmentType: "image",
        fileId: incomingMessage.image.id,
        mimeType: incomingMessage.image.mime_type ?? null
      };
    }

    if (incomingMessage.type === "document" && incomingMessage.document?.id) {
      return {
        kind: "attachment",
        from: incomingMessage.from,
        to,
        externalMessageId,
        occurredAt,
        text: incomingMessage.document.caption ?? "",
        attachmentType: "document",
        fileId: incomingMessage.document.id,
        mimeType: incomingMessage.document.mime_type ?? null
      };
    }

    return null;
  }

  private async processV3Turn(message: ParsedWhatsAppTurn, appBaseUrl: string) {
    const result = await this.turnOrchestrator.handle({
      channel: "whatsapp",
      chatId: message.from,
      externalMessageId: message.externalMessageId,
      text: message.text,
      occurredAt: message.occurredAt,
      attachments: message.kind === "attachment" && message.fileId && message.attachmentType
        ? [{
            id: message.fileId,
            type: message.attachmentType,
            mimeType: message.mimeType ?? null,
            caption: message.text || null
          }]
        : []
    }, { appBaseUrl });

    if (result.duplicate) return;
    if (result.shouldSendReply && result.responseText.trim()) {
      await this.whatsAppService.sendTextMessage(message.from, result.responseText);
    }
    for (const attachment of result.attachments) {
      if (attachment.type === "document") {
        await this.whatsAppService.sendDocumentMessage(
          message.from,
          attachment.pathOrUrl,
          attachment.filename,
          attachment.caption
        );
      } else {
        await this.whatsAppService.sendImageMessage(
          message.from,
          attachment.pathOrUrl,
          attachment.caption
        );
      }
    }
  }

  private hasValidSignature(request: Request) {
    if (!env.WHATSAPP_APP_SECRET) return true;
    const signature = request.header("x-hub-signature-256");
    const rawBody = (request as Request & { rawBody?: Buffer }).rawBody;
    if (!signature || !rawBody) return false;
    const expected = `sha256=${crypto
      .createHmac("sha256", env.WHATSAPP_APP_SECRET)
      .update(rawBody)
      .digest("hex")}`;
    const receivedBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expected);
    return receivedBuffer.length === expectedBuffer.length &&
      crypto.timingSafeEqual(receivedBuffer, expectedBuffer);
  }

  private getRequestBaseUrl(request: Request) {
    const proto = request.header("x-forwarded-proto")?.split(",")[0]?.trim() || request.protocol;
    const host = request.header("x-forwarded-host")?.split(",")[0]?.trim() || request.get("host");
    return host ? `${proto}://${host}` : env.APP_BASE_URL;
  }
}
