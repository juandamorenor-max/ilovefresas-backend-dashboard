import { Router } from "express";
import { TelegramController } from "../controllers/telegram.controller.js";

const controller = new TelegramController();

export const telegramRouter = Router();

telegramRouter.post("/webhook/telegram", controller.receiveWebhook.bind(controller));
