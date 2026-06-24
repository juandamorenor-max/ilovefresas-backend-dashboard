import assert from "node:assert/strict";
import { buildDefaultCatalog } from "./defaultCatalog.js";
import {
  CatalogLookupError,
  computeTotal,
  createCatalogIndex,
  findMissingPersonalizations,
  validateCatalogIntegrity
} from "./index.js";
import type { OrderItem } from "./types.js";

const catalog = buildDefaultCatalog();
const index = createCatalogIndex(catalog);

const baseItem = (producto_id: string): OrderItem => ({
  producto_id,
  cantidad: 1,
  toppings: [],
  adicionales: [],
  personalizacion: null
});

assert.doesNotThrow(() => validateCatalogIntegrity(catalog));
assert.ok(index.productosById.has("prod_fresa_tradicional"));
assert.ok(index.productosById.has("prod_fresa_helado"));
assert.ok(index.productosById.has("prod_waffle_tradicional"));
assert.ok(index.toppingsById.has("mo_brownie"));
assert.ok(index.toppingsById.has("mo_chips_chocolate"));
assert.ok(index.adicionalesById.has("mo_helado"));
assert.ok(index.adicionalesById.has("mo_dulce_mora"));

assert.equal(computeTotal([baseItem("prod_fresa_tradicional")], index), 16000);

assert.equal(
  computeTotal(
    [
      {
        producto_id: "prod_fresa_helado",
        cantidad: 2,
        toppings: ["mo_oreo"],
        adicionales: ["mo_helado"],
        personalizacion: "sabor de helado: Vainilla"
      }
    ],
    index
  ),
  48000
);

assert.equal(
  computeTotal(
    [
      baseItem("prod_mix_oreo"),
      {
        producto_id: "prod_oblea_nutella",
        cantidad: 3,
        toppings: [],
        adicionales: ["mo_queso"],
        personalizacion: null
      }
    ],
    index
  ),
  56000
);

assert.throws(
  () => computeTotal([baseItem("prod_inventado")], index),
  CatalogLookupError
);

assert.throws(
  () =>
    computeTotal(
      [
        {
          ...baseItem("prod_fresa_tradicional"),
          toppings: ["mo_inventado"]
        }
      ],
      index
    ),
  CatalogLookupError
);

assert.deepEqual(findMissingPersonalizations([baseItem("prod_fresa_helado")], index), [
  {
    index: 0,
    producto_id: "prod_fresa_helado",
    producto_nombre: "Fresas con helado",
    opciones: "sabor de helado: Fresa, Chocolate, Vainilla, Oreo",
    missing: true
  }
]);

assert.deepEqual(
  findMissingPersonalizations(
    [
      {
        ...baseItem("prod_fresa_helado"),
        personalizacion: "sabor de helado: Chocolate"
      }
    ],
    index
  ),
  []
);

console.log("catalog tests passed");
