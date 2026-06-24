import express, { type NextFunction, type Request, type Response } from "express";
import path from "node:path";
import { adminRouter } from "./routes/admin.routes.js";
import { botIntegrationRouter } from "./routes/bot-integration.routes.js";
import { healthRouter } from "./routes/health.routes.js";
import { localTestRouter } from "./routes/local-test.routes.js";
import { whatsappRouter } from "./routes/whatsapp.routes.js";
import { HttpError } from "./utils/http.js";
import { logger } from "./utils/logger.js";

export function createApp() {
  const app = express();

  app.use(express.json({ limit: "1mb" }));

  const dashboardPath = path.join(process.cwd(), "dashboard");
  app.use("/dashboard", express.static(dashboardPath));

  app.use(healthRouter);
  app.use(localTestRouter);
  app.use(whatsappRouter);
  app.use(botIntegrationRouter);
  app.use(adminRouter);

  app.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
    if (error instanceof HttpError) {
      response.status(error.statusCode).json({ error: error.message });
      return;
    }

    logger.error("Unhandled application error", {
      error: error instanceof Error ? error.message : "unknown"
    });
    response.status(500).json({ error: "Internal server error" });
  });

  return app;
}
