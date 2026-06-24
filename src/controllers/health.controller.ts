import type { Request, Response } from "express";
import { env } from "../config/env.js";
import { getRuntimeStoreStatus } from "../data/runtime-store.js";

export class HealthController {
  getStatus(_request: Request, response: Response) {
    response.json({
      ok: true,
      service: "chatbot-i-love-fresas-v2",
      timestamp: new Date().toISOString()
    });
  }

  getIntegrationStatus(_request: Request, response: Response) {
    response.json({
      ok: true,
      service: "chatbot-i-love-fresas-v2",
      storage: getRuntimeStoreStatus(),
      flowise: {
        configured: Boolean(env.FLOWISE_CHATFLOW_ID),
        apiUrl: env.FLOWISE_API_URL,
        hasApiKey: Boolean(env.FLOWISE_API_KEY)
      },
      botIntegration: {
        secretEnabled: Boolean(env.BOT_INTEGRATION_SECRET),
        includeRawFlowiseResponse: env.BOT_TURN_INCLUDE_RAW,
        defaultDeliveryFee: env.DEFAULT_DELIVERY_FEE
      },
      timestamp: new Date().toISOString()
    });
  }
}
