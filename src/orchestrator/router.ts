import { computeTotal } from "../catalog/index.js";
import type { CatalogIndex } from "../catalog/index.js";
import type { LlmTurnOutput } from "../llm/turnOutput.js";
import type { OrderState } from "../state/orderState.js";
import { isOrderComplete } from "./orderCompleteness.js";
import { sanitizeLlmSlots } from "./sanitizers.js";

export type RouterBranch = "human_handoff" | "register_order" | "send_menu" | "reply";

export interface RouterResult {
  branch: RouterBranch;
  state: OrderState;
  message: string;
  total: number | null;
}

const keepCurrentIfEmpty = (currentValue: string, nextValue: string | null) =>
  nextValue?.trim() ? nextValue.trim() : currentValue;

export const applyLlmTurnToState = (
  state: OrderState,
  output: LlmTurnOutput,
  catalog: CatalogIndex,
  now = new Date().toISOString()
) => {
  const sanitized = sanitizeLlmSlots(output.slots, catalog);

  return {
    state: {
      ...state,
      nombre: keepCurrentIfEmpty(state.nombre, sanitized.slots.nombre),
      direccion: keepCurrentIfEmpty(state.direccion, sanitized.slots.direccion),
      barrio: keepCurrentIfEmpty(state.barrio, sanitized.slots.barrio),
      referencia: keepCurrentIfEmpty(state.referencia, sanitized.slots.referencia),
      items: sanitized.slots.items.length > 0 ? sanitized.slots.items : state.items,
      metodo_pago: sanitized.slots.metodo_pago ?? state.metodo_pago,
      pedido_confirmado: output.pedido_confirmado || state.pedido_confirmado,
      needs_human: output.needs_human || state.needs_human,
      enviar_menu: output.enviar_menu,
      updated_at: now
    },
    discarded: sanitized.discarded
  };
};

export const routeTurn = (
  state: OrderState,
  output: LlmTurnOutput,
  catalog: CatalogIndex,
  now = new Date().toISOString()
): RouterResult => {
  const applied = applyLlmTurnToState(state, output, catalog, now);
  const nextState = applied.state;

  if (nextState.needs_human) {
    return {
      branch: "human_handoff",
      state: {
        ...nextState,
        pausar_bot: true
      },
      message: "Te paso con un asesor para confirmar eso y evitar tomar mal tu pedido.",
      total: null
    };
  }

  if (nextState.pedido_confirmado && isOrderComplete(nextState, catalog)) {
    const total = computeTotal(nextState.items, catalog);
    return {
      branch: "register_order",
      state: {
        ...nextState,
        status: "registered"
      },
      message: output.mensaje_cliente,
      total
    };
  }

  if (nextState.enviar_menu) {
    return {
      branch: "send_menu",
      state: nextState,
      message: output.mensaje_cliente,
      total: null
    };
  }

  return {
    branch: "reply",
    state: nextState,
    message: output.mensaje_cliente,
    total: null
  };
};
