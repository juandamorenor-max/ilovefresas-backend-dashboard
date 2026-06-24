import type { Request, Response } from "express";
import { env } from "../config/env.js";
import { HttpError } from "../utils/http.js";
import { AgentFlowTurnService } from "../services/agent-flow-turn.service.js";
import { BotIntegrationService } from "../services/bot-integration.service.js";

export class BotIntegrationController {
  constructor(
    private readonly service = new BotIntegrationService(),
    private readonly agentFlowTurnService = new AgentFlowTurnService()
  ) {}

  getAvailableCatalog(request: Request, response: Response) {
    this.assertBotSecret(request);
    response.json(this.service.getAvailableCatalog());
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
        text: String(request.body.text ?? "")
      })
    );
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
}
