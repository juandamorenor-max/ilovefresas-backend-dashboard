export class AdminCommandService {
  parseCommand(message: string) {
    const lower = message.trim().toLowerCase();

    if (lower === "cerrar hoy") {
      return { type: "close_today" as const };
    }

    if (lower === "abrir negocio") {
      return { type: "open_business" as const };
    }

    if (lower.startsWith("ver pedidos")) {
      return { type: "list_orders" as const };
    }

    return { type: "unknown" as const };
  }
}
