import { demoStore } from "../data/demoStore.js";
import { env } from "../config/env.js";
import type { OrderDraft, PricingBreakdown } from "../types/index.js";

export class PricingService {
  calculateDraftPricing(draft: OrderDraft): PricingBreakdown {
    const subtotal = draft.items.reduce((sum, item) => {
      const componentDelta = item.components.reduce((componentSum, component) => {
        if (component.type === "removed") {
          return componentSum;
        }
        return componentSum + component.priceDelta;
      }, 0);

      return sum + (item.unitBasePrice + componentDelta) * item.quantity;
    }, 0);

    const zone = draft.inferredZoneId
      ? demoStore.deliveryZones.find((item) => item.id === draft.inferredZoneId)
      : null;

    const deliveryFee =
      draft.fulfillmentType === "pickup"
        ? 0
        : zone && zone.fee > 0
          ? zone.fee
          : env.DEFAULT_DELIVERY_FEE;
    const discountTotal = 0;
    const total = subtotal + deliveryFee - discountTotal;

    return {
      subtotal,
      deliveryFee,
      discountTotal,
      total
    };
  }
}
