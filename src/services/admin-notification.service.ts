import { env } from "../config/env.js";
import type { Order } from "../types/index.js";
import { formatCurrency } from "../utils/http.js";
import { logger } from "../utils/logger.js";
import { CatalogService } from "./catalog.service.js";
import { TelegramService } from "./telegram.service.js";

export interface AdminNotificationResult {
  delivered: boolean;
  mocked: boolean;
  channel: "telegram" | "log";
  message: string;
}

export class AdminNotificationService {
  constructor(
    private readonly telegramService = new TelegramService(),
    private readonly catalogService = new CatalogService()
  ) {}

  async notifyNewOrder(order: Order): Promise<AdminNotificationResult> {
    const message = this.formatOrderForOperator(order);

    if (!env.TELEGRAM_ADMIN_BOT_TOKEN || !env.TELEGRAM_ADMIN_CHAT_ID) {
      logger.info("Admin Telegram channel not configured; order notification mocked", {
        orderId: order.id,
        message
      });

      return {
        delivered: false,
        mocked: true,
        channel: "log",
        message
      };
    }

    try {
      await this.telegramService.sendMessage(
        env.TELEGRAM_ADMIN_BOT_TOKEN,
        env.TELEGRAM_ADMIN_CHAT_ID,
        message
      );

      return {
        delivered: true,
        mocked: false,
        channel: "telegram",
        message
      };
    } catch (error) {
      logger.error("Failed to notify admin channel", {
        orderId: order.id,
        error: error instanceof Error ? error.message : "unknown"
      });

      return {
        delivered: false,
        mocked: false,
        channel: "telegram",
        message
      };
    }
  }

  formatOrderForOperator(order: Order) {
    const itemLines = order.items
      .map((item) => {
        const additions = item.components
          .filter((component) => component.type === "added")
          .map((component) => component.name);
        const removals = item.components
          .filter((component) => component.type === "removed")
          .map((component) => component.name);
        const product = this.catalogService.findProductById(item.productId);
        const selectedOptions = Object.entries(item.selectedOptions ?? {})
          .filter(([, values]) => values.length > 0)
          .map(([key, values]) => {
            const label =
              product?.requiredOptions?.find((option) => option.key === key)?.label ?? key;
            const quantityMap = item.selectedOptionQuantities?.[key] ?? {};
            const formattedValues = Object.keys(quantityMap).length
              ? Object.entries(quantityMap)
                  .filter(([, quantity]) => quantity > 0)
                  .map(([value, quantity]) => (quantity > 1 ? `${value} x${quantity}` : value))
                  .join(", ")
              : values.join(", ");
            return `${label}: ${formattedValues}`;
          });

        return [
          `- ${item.quantity} x ${item.productName}`,
          selectedOptions.length ? `  Opciones: ${selectedOptions.join("; ")}` : null,
          additions.length ? `  Adiciones: ${additions.join(", ")}` : null,
          removals.length ? `  Sin: ${removals.join(", ")}` : null,
          item.notes ? `  Nota item: ${item.notes}` : null
        ]
          .filter(Boolean)
          .join("\n");
      })
      .join("\n");
    const hasPriceReview = order.items.some((item) => item.unitBasePrice === 0);
    const zone = order.zoneName
      ? this.catalogService.listDeliveryZones().find((entry) => entry.name === order.zoneName)
      : null;
    const hasDeliveryReview =
      order.fulfillmentType === "delivery" && (!zone || zone.fee <= 0);

    return [
      "Nuevo pedido pendiente de revision",
      "",
      `Pedido: ${order.id}`,
      `Cliente: ${order.customerName ?? "Pendiente"}`,
      `Telefono: ${order.customerPhone}`,
      `Entrega: ${order.fulfillmentType === "pickup" ? "Recoge en tienda" : "Domicilio"}`,
      "",
      "Items:",
      itemLines,
      "",
      `Direccion: ${order.address ?? "Pendiente"}`,
      `Zona: ${order.zoneName ?? "Por revisar"}`,
      `Pago: ${order.paymentMethod ?? "Pendiente"}`,
      order.cashAmount ? `Contra entrega: paga con ${order.cashAmount}` : null,
      order.notes ? `Notas: ${order.notes}` : "Notas: Sin notas",
      order.internalNotes ? `Notas internas: ${order.internalNotes}` : null,
      "",
      hasPriceReview ? "Subtotal: Por revisar" : `Subtotal: ${formatCurrency(order.pricing.subtotal)}`,
      hasDeliveryReview ? "Domicilio: Por revisar" : `Domicilio: ${formatCurrency(order.pricing.deliveryFee)}`,
      hasPriceReview || hasDeliveryReview
        ? "Total estimado: Por revisar"
        : `Total estimado: ${formatCurrency(order.pricing.total)}`,
      "",
      "Accion sugerida: revisar datos, confirmar disponibilidad y despachar."
    ]
      .filter((line) => line !== null)
      .join("\n");
  }
}
