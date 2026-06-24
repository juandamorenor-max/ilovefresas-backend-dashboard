import { Router } from "express";
import { HealthController } from "../controllers/health.controller.js";

const controller = new HealthController();

export const healthRouter = Router();

healthRouter.get("/health", controller.getStatus.bind(controller));
healthRouter.get("/health/integration", controller.getIntegrationStatus.bind(controller));
