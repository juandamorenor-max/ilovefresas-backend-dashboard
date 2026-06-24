import type { OrderItem } from "../catalog/index.js";

export interface OrderState {
  session_id: string;
  channel: "telegram" | "whatsapp";
  nombre: string;
  direccion: string;
  barrio: string;
  referencia: string;
  items: OrderItem[];
  metodo_pago: "nequi" | "bancolombia" | "breb" | null;
  pedido_confirmado: boolean;
  needs_human: boolean;
  pausar_bot: boolean;
  enviar_menu: boolean;
  status: "open" | "registered" | "abandoned";
  created_at: string;
  updated_at: string;
}

export const createInitialOrderState = (
  session_id: string,
  channel: OrderState["channel"],
  now = new Date().toISOString()
): OrderState => ({
  session_id,
  channel,
  nombre: "",
  direccion: "",
  barrio: "",
  referencia: "",
  items: [],
  metodo_pago: null,
  pedido_confirmado: false,
  needs_human: false,
  pausar_bot: false,
  enviar_menu: false,
  status: "open",
  created_at: now,
  updated_at: now
});
