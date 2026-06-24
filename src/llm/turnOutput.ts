import { z } from "zod";
import { orderItemSchema } from "../catalog/schema.js";

const normalizePaymentMethod = (value: unknown) => {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (typeof value !== "string") {
    return value;
  }

  const normalized = value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s_-]+/g, "");

  if (["nequi", "neqi", "neky"].includes(normalized)) {
    return "nequi";
  }

  if (["bancolombia", "banco", "bancol", "transferenciabancolombia"].includes(normalized)) {
    return "bancolombia";
  }

  if (["breb", "bre-b", "llavebreb", "llavebre-b"].includes(normalized)) {
    return "breb";
  }

  return null;
};

export const paymentMethodSchema = z.preprocess(
  normalizePaymentMethod,
  z.enum(["nequi", "bancolombia", "breb"]).nullable()
);

const nullableSlotString = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? null : value),
  z.string().trim().min(1).nullable()
);

export const llmTurnOutputSchema = z.object({
  mensaje_cliente: z.string().trim().min(1),
  slots: z.object({
    nombre: nullableSlotString,
    direccion: nullableSlotString,
    barrio: nullableSlotString,
    referencia: nullableSlotString,
    items: z.array(orderItemSchema).default([]),
    metodo_pago: paymentMethodSchema
  }),
  pedido_confirmado: z.boolean(),
  needs_human: z.boolean(),
  enviar_menu: z.boolean()
});

export type LlmTurnOutput = z.infer<typeof llmTurnOutputSchema>;

export const parseLlmTurnOutput = (raw: unknown) => llmTurnOutputSchema.parse(raw);
