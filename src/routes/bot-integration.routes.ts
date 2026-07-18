import { Router } from "express";
import { BotIntegrationController } from "../controllers/bot-integration.controller.js";

const controller = new BotIntegrationController();

export const botIntegrationRouter = Router();

botIntegrationRouter.get("/bot/menu/pdf", controller.getMenuPdf.bind(controller));
botIntegrationRouter.get("/bot/catalog/available", controller.getAvailableCatalog.bind(controller));
botIntegrationRouter.post("/bot/turn", (request, response, next) => {
  controller.handleTurn(request, response).catch(next);
});
botIntegrationRouter.post("/bot/quote", controller.createQuote.bind(controller));
botIntegrationRouter.post("/bot/orders/confirmed", controller.confirmOrder.bind(controller));
botIntegrationRouter.get(
  "/bot/conversations/:channel/:chatId/active",
  controller.getOrCreateActiveConversation.bind(controller)
);
botIntegrationRouter.post(
  "/bot/conversations/:channel/:chatId/new",
  controller.startNewConversation.bind(controller)
);
botIntegrationRouter.patch(
  "/bot/conversations/:conversationId/state",
  controller.updateConversationState.bind(controller)
);
botIntegrationRouter.post(
  "/bot/conversations/:conversationId/orders/review",
  controller.createOrderForReview.bind(controller)
);
