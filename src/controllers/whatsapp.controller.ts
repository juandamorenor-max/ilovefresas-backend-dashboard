import type { Request, Response } from "express";
import { env } from "../config/env.js";
import { ConversationService } from "../services/conversation.service.js";
import { WhatsAppService } from "../services/whatsapp.service.js";
import type { IncomingCustomerAttachmentMessage, IncomingWhatsAppTextMessage } from "../types/index.js";

export class WhatsAppController {
  constructor(
    private readonly conversationService = new ConversationService(),
    private readonly whatsAppService = new WhatsAppService()
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
    const parsedMessage = this.parseIncomingMessage(request.body);

    if (!parsedMessage) {
      response.status(200).json({ received: true, ignored: true });
      return;
    }

    const result =
      "text" in parsedMessage
        ? await this.conversationService.handleIncomingMessage(parsedMessage)
        : await this.conversationService.handleIncomingAttachment(parsedMessage);
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
  ): IncomingWhatsAppTextMessage | IncomingCustomerAttachmentMessage | null {
    const payload = body as {
      entry?: Array<{
        changes?: Array<{
          value?: {
            metadata?: { display_phone_number?: string };
            messages?: Array<{
              from?: string;
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
    if (incomingMessage.type === "text" && incomingMessage.text?.body) {
      return {
        from: incomingMessage.from,
        to,
        text: incomingMessage.text.body
      };
    }

    if (incomingMessage.type === "image" && incomingMessage.image?.id) {
      return {
        from: incomingMessage.from,
        to,
        attachmentType: "image",
        caption: incomingMessage.image.caption ?? null,
        fileId: incomingMessage.image.id,
        mimeType: incomingMessage.image.mime_type ?? null
      };
    }

    if (incomingMessage.type === "document" && incomingMessage.document?.id) {
      return {
        from: incomingMessage.from,
        to,
        attachmentType: "document",
        caption: incomingMessage.document.caption ?? null,
        fileId: incomingMessage.document.id,
        mimeType: incomingMessage.document.mime_type ?? null
      };
    }

    return null;
  }
}
