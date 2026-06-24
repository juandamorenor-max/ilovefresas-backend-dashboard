import { findMissingPersonalizations } from "../catalog/index.js";
import type { CatalogIndex } from "../catalog/index.js";
import type { OrderState } from "../state/orderState.js";

export const getMissingOrderFields = (state: OrderState, catalog: CatalogIndex) => {
  const missing: string[] = [];

  if (!state.nombre.trim()) {
    missing.push("nombre");
  }

  if (!state.direccion.trim()) {
    missing.push("direccion");
  }

  if (!state.barrio.trim()) {
    missing.push("barrio");
  }

  if (!state.referencia.trim()) {
    missing.push("referencia");
  }

  if (state.items.length === 0) {
    missing.push("pedido");
  }

  if (!state.metodo_pago) {
    missing.push("metodo_pago");
  }

  for (const item of findMissingPersonalizations(state.items, catalog)) {
    missing.push(`personalizacion:${item.producto_id}`);
  }

  return missing;
};

export const isOrderComplete = (state: OrderState, catalog: CatalogIndex) =>
  getMissingOrderFields(state, catalog).length === 0;
