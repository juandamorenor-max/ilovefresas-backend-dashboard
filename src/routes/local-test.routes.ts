import { Router } from "express";
import { LocalTestController } from "../controllers/local-test.controller.js";

const controller = new LocalTestController();

export const localTestRouter = Router();

localTestRouter.get("/local-test", controller.getPage.bind(controller));
localTestRouter.post("/local-test/chat", controller.chat.bind(controller));
localTestRouter.post("/local-test/reset", controller.reset.bind(controller));
