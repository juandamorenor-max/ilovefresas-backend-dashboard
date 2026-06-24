import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { env } from "../config/env.js";
import { buildDefaultCatalog } from "./defaultCatalog.js";
import { catalogSchema, orderItemSchema } from "./schema.js";
import type { CatalogEntry, CatalogIndex, IlovefresasCatalog, OrderItem } from "./types.js";

export class CatalogIntegrityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CatalogIntegrityError";
  }
}

export class CatalogLookupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CatalogLookupError";
  }
}

const assertUniqueIds = (sectionName: string, entries: CatalogEntry[]) => {
  const seen = new Set<string>();

  for (const entry of entries) {
    if (seen.has(entry.id)) {
      throw new CatalogIntegrityError(`Duplicate id in ${sectionName}: ${entry.id}`);
    }

    seen.add(entry.id);
  }
};

const assertValidEntries = (sectionName: string, entries: CatalogEntry[]) => {
  for (const entry of entries) {
    if (!Number.isInteger(entry.precio) || entry.precio < 0) {
      throw new CatalogIntegrityError(`Invalid price for ${sectionName}.${entry.id}`);
    }
  }
};

export const validateCatalogIntegrity = (catalog: IlovefresasCatalog) => {
  const parsed = catalogSchema.parse(catalog);
  const sections = [
    ["productos", parsed.productos],
    ["toppings", parsed.toppings],
    ["adicionales", parsed.adicionales]
  ] as const;

  for (const [sectionName, entries] of sections) {
    assertUniqueIds(sectionName, entries);
    assertValidEntries(sectionName, entries);
  }

  const allIds = new Set<string>();
  for (const [sectionName, entries] of sections) {
    for (const entry of entries) {
      if (allIds.has(entry.id)) {
        throw new CatalogIntegrityError(`Catalog id reused across sections: ${sectionName}.${entry.id}`);
      }

      allIds.add(entry.id);
    }
  }

  return parsed;
};

export const createCatalogIndex = (catalog: IlovefresasCatalog): CatalogIndex => {
  const parsed = validateCatalogIntegrity(catalog);

  return {
    catalog: parsed,
    productosById: new Map(parsed.productos.map((entry) => [entry.id, entry])),
    toppingsById: new Map(parsed.toppings.map((entry) => [entry.id, entry])),
    adicionalesById: new Map(parsed.adicionales.map((entry) => [entry.id, entry]))
  };
};

export const loadCatalog = (catalogPath = env.CATALOG_PATH): CatalogIndex => {
  if (!catalogPath) {
    return createCatalogIndex(buildDefaultCatalog());
  }

  const absolutePath = resolve(catalogPath);
  const raw = readFileSync(absolutePath, "utf8");
  const parsed = catalogSchema.parse(JSON.parse(raw));
  return createCatalogIndex(parsed);
};

const getCatalogIndex = (catalogOrIndex: IlovefresasCatalog | CatalogIndex) =>
  "productosById" in catalogOrIndex ? catalogOrIndex : createCatalogIndex(catalogOrIndex);

const requireEntry = (entries: Map<string, CatalogEntry>, sectionName: string, id: string) => {
  const entry = entries.get(id);
  if (!entry) {
    throw new CatalogLookupError(`Unknown ${sectionName} id: ${id}`);
  }

  return entry;
};

export const computeTotal = (
  rawItems: OrderItem[],
  catalogOrIndex: IlovefresasCatalog | CatalogIndex
) => {
  const index = getCatalogIndex(catalogOrIndex);
  const items = rawItems.map((item) => orderItemSchema.parse(item));

  return items.reduce((sum, item) => {
    const product = requireEntry(index.productosById, "producto", item.producto_id);
    const toppingsTotal = item.toppings.reduce(
      (subtotal, toppingId) => subtotal + requireEntry(index.toppingsById, "topping", toppingId).precio,
      0
    );
    const adicionalesTotal = item.adicionales.reduce(
      (subtotal, adicionalId) =>
        subtotal + requireEntry(index.adicionalesById, "adicional", adicionalId).precio,
      0
    );

    return sum + (product.precio + toppingsTotal + adicionalesTotal) * item.cantidad;
  }, 0);
};

export const findMissingPersonalizations = (
  rawItems: OrderItem[],
  catalogOrIndex: IlovefresasCatalog | CatalogIndex
) => {
  const index = getCatalogIndex(catalogOrIndex);
  const items = rawItems.map((item) => orderItemSchema.parse(item));

  return items
    .map((item, indexInOrder) => {
      const product = requireEntry(index.productosById, "producto", item.producto_id);
      return {
        index: indexInOrder,
        producto_id: item.producto_id,
        producto_nombre: product.nombre,
        opciones: product.opciones,
        missing: Boolean(product.requiere_personalizacion && !item.personalizacion)
      };
    })
    .filter((entry) => entry.missing);
};

export type { CatalogEntry, CatalogIndex, IlovefresasCatalog, OrderItem };
