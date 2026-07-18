import type { Request, Response } from "express";
import { existsSync } from "node:fs";
import path from "node:path";
import { env } from "../config/env.js";
import { HttpError } from "../utils/http.js";
import { AgentFlowTurnService } from "../services/agent-flow-turn.service.js";
import { BotIntegrationService } from "../services/bot-integration.service.js";
import { BotQuoteService } from "../services/bot-quote.service.js";

export class BotIntegrationController {
  constructor(
    private readonly service = new BotIntegrationService(),
    private readonly agentFlowTurnService = new AgentFlowTurnService(),
    private readonly botQuoteService = new BotQuoteService()
  ) {}

  getAvailableCatalog(request: Request, response: Response) {
    this.assertBotSecret(request);
    response.json(this.service.getAvailableCatalog());
  }

  getMenuPdf(_request: Request, response: Response) {
    const menuPath = path.resolve(env.MENU_PDF_PATH);
    if (!existsSync(menuPath)) {
      throw new HttpError(404, "Menu PDF not found");
    }

    response.sendFile(menuPath, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'inline; filename="Menu 2026.pdf"'
      }
    });
  }

  getOrCreateActiveConversation(request: Request, response: Response) {
    this.assertBotSecret(request);
    response.json(
      this.service.getOrCreateActiveConversation(
        this.getChannel(request),
        this.getParam(request, "chatId")
      )
    );
  }

  startNewConversation(request: Request, response: Response) {
    this.assertBotSecret(request);
    response.status(201).json(
      this.service.startNewConversation(
        this.getChannel(request),
        this.getParam(request, "chatId")
      )
    );
  }

  updateConversationState(request: Request, response: Response) {
    this.assertBotSecret(request);
    const conversation = this.service.updateConversationState(
      this.getParam(request, "conversationId"),
      request.body
    );
    if (!conversation) {
      throw new HttpError(404, "Conversation not found");
    }

    response.json(conversation);
  }

  createOrderForReview(request: Request, response: Response) {
    this.assertBotSecret(request);
    const order = this.service.createOrderForReview(this.getParam(request, "conversationId"));
    if (!order) {
      throw new HttpError(404, "Conversation or draft order not found");
    }

    response.status(201).json(order);
  }

  async handleTurn(request: Request, response: Response) {
    this.assertBotSecret(request);
    response.json(
      await this.agentFlowTurnService.handleTurn({
        channel: this.getBodyChannel(request),
        chatId: String(request.body.chatId ?? ""),
        text: String(request.body.text ?? request.body.caption ?? ""),
        appBaseUrl: this.getRequestBaseUrl(request),
        hasAttachment: this.hasAttachment(request.body),
        attachmentType: this.getAttachmentType(request.body),
        attachmentFileId: this.getAttachmentFileId(request.body),
        caption: this.getCaption(request.body),
        mimeType: this.getMimeType(request.body)
      })
    );
  }

  createQuote(request: Request, response: Response) {
    this.assertBotSecret(request);
    const result = this.botQuoteService.createQuote(request.body ?? {});
    response.status(result.blockingErrors.length > 0 ? 422 : 201).json(result);
  }

  confirmOrder(request: Request, response: Response) {
    this.assertBotSecret(request);
    response.status(201).json(this.botQuoteService.confirmOrder(request.body ?? {}));
  }

  private getChannel(request: Request) {
    const channel = this.getParam(request, "channel");
    if (channel !== "telegram" && channel !== "whatsapp") {
      throw new HttpError(400, "Invalid channel");
    }

    return channel;
  }

  private getBodyChannel(request: Request) {
    const channel = String(request.body.channel ?? "");
    if (channel !== "telegram" && channel !== "whatsapp") {
      throw new HttpError(400, "Invalid channel");
    }

    return channel;
  }

  private getParam(request: Request, key: string) {
    return String(request.params[key] ?? "");
  }

  private assertBotSecret(request: Request) {
    if (!env.BOT_INTEGRATION_SECRET) {
      return;
    }

    if (request.header("x-bot-secret") !== env.BOT_INTEGRATION_SECRET) {
      throw new HttpError(401, "Invalid bot integration secret");
    }
  }

  private getRequestBaseUrl(request: Request) {
    const forwardedProto = request.header("x-forwarded-proto")?.split(",")[0]?.trim();
    const forwardedHost = request.header("x-forwarded-host")?.split(",")[0]?.trim();
    const proto = forwardedProto || request.protocol;
    const host = forwardedHost || request.get("host");
    return host ? `${proto}://${host}` : env.APP_BASE_URL;
  }

  private hasAttachment(body: Record<string, unknown>) {
    return (
      body.hasAttachment === true ||
      body.hasAttachment === "true" ||
      Boolean(body.attachmentType) ||
      Array.isArray(body.photo) ||
      Boolean(body.document)
    );
  }

  private getAttachmentType(body: Record<string, unknown>) {
    const attachmentType = String(body.attachmentType ?? "").toLowerCase();
    if (attachmentType === "image" || attachmentType === "photo") return "image" as const;
    if (attachmentType === "document") return "document" as const;
    if (Array.isArray(body.photo)) return "image" as const;
    if (body.document) return "document" as const;
    return null;
  }

  private getAttachmentFileId(body: Record<string, unknown>) {
    if (typeof body.attachmentFileId === "string") return body.attachmentFileId;
    const photo = Array.isArray(body.photo) ? body.photo.at(-1) : null;
    if (photo && typeof photo === "object" && "file_id" in photo) {
      return String(photo.file_id ?? "");
    }
    const document = body.document;
    if (document && typeof document === "object" && "file_id" in document) {
      return String(document.file_id ?? "");
    }
    return null;
  }

  private getCaption(body: Record<string, unknown>) {
    if (typeof body.caption === "string") return body.caption;
    if (typeof body.text === "string") return body.text;
    const document = body.document;
    if (document && typeof document === "object" && "caption" in document) {
      return String(document.caption ?? "");
    }
    return null;
  }

  private getMimeType(body: Record<string, unknown>) {
    if (typeof body.mimeType === "string") return body.mimeType;
    const document = body.document;
    if (document && typeof document === "object" && "mime_type" in document) {
      return String(document.mime_type ?? "");
    }
    if (Array.isArray(body.photo)) return "image/jpeg";
    return null;
  }
}
