import { z } from "zod";

export const catalogEntrySchema = z.object({
  id: z.string().trim().min(1),
  nombre: z.string().trim().min(1),
  precio: z.number().int().nonnegative(),
  categoria: z.string().trim().min(1).optional(),
  aliases: z.array(z.string().trim().min(1)).optional().default([]),
  requiere_personalizacion: z.boolean().optional().default(false),
  opciones: z.string().trim().min(1).nullable().optional().default(null)
});

export const catalogSchema = z.object({
  productos: z.array(catalogEntrySchema),
  toppings: z.array(catalogEntrySchema),
  adicionales: z.array(catalogEntrySchema)
});

export const orderItemSchema = z.object({
  producto_id: z.string().trim().min(1),
  cantidad: z.number().int().positive(),
  toppings: z.array(z.string().trim().min(1)).default([]),
  adicionales: z.array(z.string().trim().min(1)).default([]),
  personalizacion: z.string().trim().min(1).nullable().default(null)
});

export type CatalogEntryInput = z.input<typeof catalogEntrySchema>;
export type IlovefresasCatalogInput = z.input<typeof catalogSchema>;
export type OrderItemInput = z.input<typeof orderItemSchema>;
