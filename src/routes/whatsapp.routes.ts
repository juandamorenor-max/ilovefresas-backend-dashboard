import { Router } from "express";
import { WhatsAppController } from "../controllers/whatsapp.controller.js";

const controller = new WhatsAppController();

export const whatsappRouter = Router();

whatsappRouter.get("/webhook/whatsapp", controller.verifyWebhook.bind(controller));
whatsappRouter.post("/webhook/whatsapp", controller.receiveWebhook.bind(controller));
