import type { CatalogIndex, OrderItem } from "../catalog/index.js";
import type { LlmTurnOutput } from "../llm/turnOutput.js";

export interface DiscardedCatalogReferences {
  productos: string[];
  toppings: string[];
  adicionales: string[];
}

export interface SanitizedTurnSlots {
  slots: LlmTurnOutput["slots"];
  discarded: DiscardedCatalogReferences;
}

export const sanitizeLlmSlots = (
  slots: LlmTurnOutput["slots"],
  catalog: CatalogIndex
): SanitizedTurnSlots => {
  const discarded: DiscardedCatalogReferences = {
    productos: [],
    toppings: [],
    adicionales: []
  };

  const items = slots.items.reduce<OrderItem[]>((accepted, item) => {
    if (!catalog.productosById.has(item.producto_id)) {
      discarded.productos.push(item.producto_id);
      return accepted;
    }

    const toppings = item.toppings.filter((toppingId) => {
      const exists = catalog.toppingsById.has(toppingId);
      if (!exists) {
        discarded.toppings.push(toppingId);
      }
      return exists;
    });

    const adicionales = item.adicionales.filter((adicionalId) => {
      const exists = catalog.adicionalesById.has(adicionalId);
      if (!exists) {
        discarded.adicionales.push(adicionalId);
      }
      return exists;
    });

    accepted.push({
      ...item,
      toppings,
      adicionales
    });

    return accepted;
  }, []);

  return {
    slots: {
      ...slots,
      items
    },
    discarded
  };
};
