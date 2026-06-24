import { demoStore } from "../data/demoStore.js";
import { catalogSchema } from "./schema.js";
import type { IlovefresasCatalog } from "./types.js";
import type { ProductRequiredOption } from "../types/index.js";

const additionalModifierIds = new Set([
  "mo_helado",
  "mo_queso",
  "mo_nutella",
  "mo_chocorramo",
  "mo_dulce_mora",
  "mo_adicional_crema",
  "mo_barquillo",
  "mo_cerezas",
  "mo_arandanos"
]);

const formatRequiredOptions = (requiredOptions: ProductRequiredOption[] | undefined) => {
  if (!requiredOptions?.length) {
    return null;
  }

  return requiredOptions
    .filter((option) => option.required)
    .map((option) => `${option.label}: ${option.options.join(", ")}`)
    .join(" | ");
};

export const buildDefaultCatalog = (): IlovefresasCatalog => {
  const productos = demoStore.products
    .filter((product) => product.isActive)
    .map((product) => ({
      id: product.id,
      nombre: product.name,
      precio: product.basePrice,
      categoria: product.category,
      aliases: product.aliases,
      requiere_personalizacion: Boolean(product.requiredOptions?.some((option) => option.required)),
      opciones: formatRequiredOptions(product.requiredOptions)
    }));

  const modifiers = demoStore.modifierOptions.filter((modifier) => modifier.isActive);
  const toppings = modifiers
    .filter((modifier) => !additionalModifierIds.has(modifier.id))
    .map((modifier) => ({
      id: modifier.id,
      nombre: modifier.name,
      precio: modifier.priceDelta,
      aliases: modifier.aliases
    }));

  const adicionales = modifiers
    .filter((modifier) => additionalModifierIds.has(modifier.id))
    .map((modifier) => ({
      id: modifier.id,
      nombre: modifier.name,
      precio: modifier.priceDelta,
      aliases: modifier.aliases
    }));

  return catalogSchema.parse({ productos, toppings, adicionales });
};
