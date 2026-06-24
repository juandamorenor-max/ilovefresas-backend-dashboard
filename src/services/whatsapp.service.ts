import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";

export class WhatsAppService {
  async sendTextMessage(to: string, body: string) {
    if (!env.WHATSAPP_ACCESS_TOKEN || !env.WHATSAPP_PHONE_NUMBER_ID) {
      logger.info("WhatsApp credentials not configured; returning mock send result", {
        to,
        body
      });
      return {
        delivered: false,
        mocked: true,
        to,
        body
      };
    }

    const response = await fetch(
      `https://graph.facebook.com/v22.0/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to,
          type: "text",
          text: {
            body
          }
        })
      }
    );

    if (!response.ok) {
      const errorBody = await response.text();
      logger.error("WhatsApp send failed", { status: response.status, errorBody });
      throw new Error("Failed to send WhatsApp message");
    }

    return response.json();
  }
}
