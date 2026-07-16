import express, { type NextFunction, type Request, type Response } from "express";
import { existsSync } from "node:fs";
import path from "node:path";
import { adminRouter } from "./routes/admin.routes.js";
import { botIntegrationRouter } from "./routes/bot-integration.routes.js";
import { healthRouter } from "./routes/health.routes.js";
import { localTestRouter } from "./routes/local-test.routes.js";
import { telegramRouter } from "./routes/telegram.routes.js";
import { whatsappRouter } from "./routes/whatsapp.routes.js";
import { loadRuntimeStore } from "./data/runtime-store.js";
import { HttpError } from "./utils/http.js";
import { logger } from "./utils/logger.js";

export function createApp() {
  loadRuntimeStore();

  const app = express();

  app.use(express.json({ limit: "1mb" }));

  const dashboardSourcePath = path.join(process.cwd(), "dashboard");
  const dashboardDistPath = path.join(dashboardSourcePath, "dist");
  const dashboardPath = existsSync(dashboardDistPath) ? dashboardDistPath : dashboardSourcePath;
  app.get("/", (_request: Request, response: Response) => {
    response.redirect(302, "/dashboard");
  });
  app.use("/dashboard", express.static(dashboardPath));

  app.use(healthRouter);
  app.use(localTestRouter);
  app.use(telegramRouter);
  app.use(whatsappRouter);
  app.use(botIntegrationRouter);
  app.use(adminRouter);

  app.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
    const statusCode = error instanceof HttpError
      ? error.statusCode
      : typeof error === "object" &&
          error !== null &&
          "statusCode" in error &&
          typeof error.statusCode === "number"
        ? error.statusCode
        : null;

    if (statusCode) {
      response.status(statusCode).json({
        error: error instanceof Error ? error.message : "Application error"
      });
      return;
    }

    logger.error("Unhandled application error", {
      error: error instanceof Error ? error.message : "unknown"
    });
    response.status(500).json({ error: "Internal server error" });
  });

  return app;
}
