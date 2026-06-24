import assert from "node:assert/strict";
import { buildDefaultCatalog } from "../catalog/defaultCatalog.js";
import { createCatalogIndex } from "../catalog/index.js";
import type { OrderItem } from "../catalog/index.js";
import type { LlmTurnOutput } from "../llm/turnOutput.js";
import { parseLlmTurnOutput } from "../llm/turnOutput.js";
import { createInitialOrderState } from "../state/orderState.js";
import { getMissingOrderFields } from "./orderCompleteness.js";
import { routeTurn } from "./router.js";

const catalog = createCatalogIndex(buildDefaultCatalog());
const now = "2026-06-22T00:00:00.000Z";

const item = (producto_id: string, patch: Partial<OrderItem> = {}): OrderItem => ({
  producto_id,
  cantidad: 1,
  toppings: [],
  adicionales: [],
  personalizacion: null,
  ...patch
});

const llmOutput = (patch: Record<string, unknown>): LlmTurnOutput =>
  parseLlmTurnOutput({
    mensaje_cliente: "Listo",
    slots: {
      nombre: null,
      direccion: null,
      barrio: null,
      referencia: null,
      items: [],
      metodo_pago: null
    },
    pedido_confirmado: false,
    needs_human: false,
    enviar_menu: false,
    ...patch
  });

const completeState = createInitialOrderState("telegram:1", "telegram", now);
Object.assign(completeState, {
  nombre: "Juan Moreno",
  direccion: "Cra 39a # 41-99",
  barrio: "La Paz",
  referencia: "Casa azul",
  metodo_pago: "nequi" as const,
  items: [item("prod_fresa_tradicional")]
});

const registered = routeTurn(
  completeState,
  llmOutput({ pedido_confirmado: true, mensaje_cliente: "Pedido listo para registro" }),
  catalog,
  now
);
assert.equal(registered.branch, "register_order");
assert.equal(registered.total, 16000);
assert.equal(registered.state.status, "registered");

const incompletePersonalization = createInitialOrderState("telegram:2", "telegram", now);
Object.assign(incompletePersonalization, {
  nombre: "Laura Perez",
  direccion: "Calle 45 # 30-20",
  barrio: "Boston",
  referencia: "Apto 301",
  metodo_pago: "bancolombia" as const,
  items: [item("prod_fresa_helado")]
});
assert.deepEqual(getMissingOrderFields(incompletePersonalization, catalog), [
  "personalizacion:prod_fresa_helado"
]);
const blocked = routeTurn(
  incompletePersonalization,
  llmOutput({ pedido_confirmado: true }),
  catalog,
  now
);
assert.equal(blocked.branch, "reply");
assert.equal(blocked.state.status, "open");

const menu = routeTurn(
  createInitialOrderState("telegram:3", "telegram", now),
  llmOutput({ enviar_menu: true, mensaje_cliente: "Claro, te comparto el menu" }),
  catalog,
  now
);
assert.equal(menu.branch, "send_menu");

const handoff = routeTurn(
  createInitialOrderState("telegram:4", "telegram", now),
  llmOutput({ needs_human: true }),
  catalog,
  now
);
assert.equal(handoff.branch, "human_handoff");
assert.equal(handoff.state.pausar_bot, true);

const inventedReferences = routeTurn(
  createInitialOrderState("telegram:5", "telegram", now),
  llmOutput({
    slots: {
      nombre: null,
      direccion: null,
      barrio: null,
      referencia: null,
      items: [
        item("prod_fresa_tradicional", {
          toppings: ["mo_oreo", "mo_inventado"],
          adicionales: ["mo_helado", "mo_falso"]
        }),
        item("prod_falso")
      ],
      metodo_pago: "neqi"
    }
  }),
  catalog,
  now
);
assert.equal(inventedReferences.state.items.length, 1);
assert.deepEqual(inventedReferences.state.items[0]?.toppings, ["mo_oreo"]);
assert.deepEqual(inventedReferences.state.items[0]?.adicionales, ["mo_helado"]);
assert.equal(inventedReferences.state.metodo_pago, "nequi");

console.log("orchestrator tests passed");
