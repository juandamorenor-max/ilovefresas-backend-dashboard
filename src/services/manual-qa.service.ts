import fs from "node:fs/promises";
import path from "node:path";
import { createId, nowIso } from "../utils/id.js";

export type ManualQaEvaluationStatus = "success" | "failure";

export interface ManualQaEvaluation {
  id: string;
  createdAt: string;
  updatedAt: string;
  conversationId: string;
  conversationName: string | null;
  customerPhone: string | null;
  orderId: string | null;
  status: ManualQaEvaluationStatus;
  comments: string;
  reviewer: string | null;
  conversationSnapshot: unknown;
  orderSnapshot: unknown;
}

export interface ManualQaReport {
  generatedAt: string;
  targetConversations: number;
  totalEvaluations: number;
  successCount: number;
  failureCount: number;
  successRate: number;
  failureRate: number;
  latestFailures: ManualQaEvaluation[];
  prompt: string;
}

const STORAGE_DIR = "qa-output";
const STORAGE_FILE = "manual-conversation-evaluations.json";

export class ManualQaService {
  private readonly targetConversations = 50;
  private readonly storagePath = path.join(process.cwd(), STORAGE_DIR, STORAGE_FILE);

  async listEvaluations() {
    return this.readEvaluations();
  }

  async saveEvaluation(input: {
    conversationId: string;
    conversationName?: string | null;
    customerPhone?: string | null;
    orderId?: string | null;
    status: ManualQaEvaluationStatus;
    comments?: string | null;
    reviewer?: string | null;
    conversationSnapshot?: unknown;
    orderSnapshot?: unknown;
  }) {
    const evaluations = await this.readEvaluations();
    const timestamp = nowIso();
    const existingIndex = evaluations.findIndex((evaluation) =>
      this.sameEvaluationTarget(evaluation, input.conversationId, input.orderId ?? null)
    );
    const existing = existingIndex >= 0 ? evaluations[existingIndex] : null;
    const evaluation: ManualQaEvaluation = {
      id: existing?.id ?? createId("manualqa"),
      createdAt: existing?.createdAt ?? timestamp,
      updatedAt: timestamp,
      conversationId: input.conversationId,
      conversationName: input.conversationName ?? null,
      customerPhone: input.customerPhone ?? null,
      orderId: input.orderId ?? null,
      status: input.status,
      comments: String(input.comments ?? "").trim(),
      reviewer: input.reviewer ?? null,
      conversationSnapshot: this.safeClone(input.conversationSnapshot ?? null),
      orderSnapshot: this.safeClone(input.orderSnapshot ?? null)
    };

    if (existingIndex >= 0) {
      evaluations.splice(existingIndex, 1);
    }
    evaluations.unshift(evaluation);
    await this.writeEvaluations(evaluations);
    return evaluation;
  }

  async buildReport(): Promise<ManualQaReport> {
    const evaluations = await this.readEvaluations();
    const successCount = evaluations.filter((evaluation) => evaluation.status === "success").length;
    const latestFailures = evaluations.filter((evaluation) => evaluation.status === "failure");
    const failureCount = latestFailures.length;
    const totalEvaluations = evaluations.length;
    const successRate = totalEvaluations ? Math.round((successCount / totalEvaluations) * 100) : 0;
    const failureRate = totalEvaluations ? Math.round((failureCount / totalEvaluations) * 100) : 0;

    return {
      generatedAt: nowIso(),
      targetConversations: this.targetConversations,
      totalEvaluations,
      successCount,
      failureCount,
      successRate,
      failureRate,
      latestFailures,
      prompt: this.buildImprovementPrompt(evaluations)
    };
  }

  private async readEvaluations(): Promise<ManualQaEvaluation[]> {
    try {
      const raw = await fs.readFile(this.storagePath, "utf8");
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) {
        return [];
      }
      return parsed.filter((entry): entry is ManualQaEvaluation => this.isEvaluation(entry));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return [];
      }
      throw error;
    }
  }

  private async writeEvaluations(evaluations: ManualQaEvaluation[]) {
    await fs.mkdir(path.dirname(this.storagePath), { recursive: true });
    await fs.writeFile(this.storagePath, JSON.stringify(evaluations, null, 2), "utf8");
  }

  private isEvaluation(value: unknown): value is ManualQaEvaluation {
    if (!value || typeof value !== "object") {
      return false;
    }
    const entry = value as Partial<ManualQaEvaluation>;
    return (
      typeof entry.id === "string" &&
      typeof entry.conversationId === "string" &&
      (entry.status === "success" || entry.status === "failure")
    );
  }

  private sameEvaluationTarget(
    evaluation: ManualQaEvaluation,
    conversationId: string,
    orderId: string | null
  ) {
    if (orderId && evaluation.orderId === orderId) {
      return true;
    }

    return evaluation.conversationId === conversationId;
  }

  private buildImprovementPrompt(evaluations: ManualQaEvaluation[]) {
    const failures = evaluations.filter((evaluation) => evaluation.status === "failure");
    const successes = evaluations.filter((evaluation) => evaluation.status === "success");
    const failureLines = failures
      .slice()
      .reverse()
      .map((evaluation, index) =>
        [
          `CASO FALLIDO ${index + 1}`,
          `Conversacion: ${evaluation.conversationName ?? evaluation.conversationId}`,
          `Cliente: ${evaluation.customerPhone ?? "sin telefono"}`,
          `Pedido asociado: ${evaluation.orderId ?? "sin pedido"}`,
          `Comentario humano: ${evaluation.comments || "sin comentario"}`,
          `Snapshot conversacion: ${JSON.stringify(evaluation.conversationSnapshot, null, 2)}`,
          `Snapshot pedido: ${JSON.stringify(evaluation.orderSnapshot, null, 2)}`
        ].join("\n")
      )
      .join("\n\n");

    return [
      "# PROMPT DE MEJORA - I LOVE FRESAS",
      "",
      "Actua como Senior Staff Engineer especializado en agentes conversacionales de comercio.",
      "Debes analizar las evaluaciones manuales de conversaciones reales y proponer mejoras estructurales.",
      "",
      "Regla arquitectonica no negociable:",
      "- OpenAI interpreta lenguaje natural.",
      "- El backend valida catalogo, precios, pagos, estados y seguridad operacional.",
      "- No propongas if/else por frases exactas, regex conversacionales ni arboles rigidos.",
      "- Si una solucion parece un parche por frase, reemplazala por mejora de prompt, schema, estado o validacion estructural.",
      "",
      "Objetivo del bot:",
      "- Obtener productos exactos del menu, cantidades, opciones requeridas, toppings/adiciones, nombre, direccion, barrio/referencia y metodo de pago.",
      "- Conversar con tono amable y vendedor, pero siempre orientar hacia completar el pedido.",
      "- No inventar productos, precios, promociones, zonas, pagos ni disponibilidad.",
      "",
      `Resumen: ${evaluations.length} evaluaciones, ${successes.length} exitos, ${failures.length} fracasos.`,
      "",
      "Evalua cada fracaso y clasifica causa raiz:",
      "- Prompt / instrucciones OpenAI",
      "- Schema JSON / herramienta de interpretacion",
      "- Validador backend",
      "- Estado conversacional",
      "- Catalogo / metadata de productos",
      "- UX / plantilla de respuesta",
      "- Dashboard / operacion",
      "- Parser creep existente",
      "",
      "Entrega:",
      "1. Top bugs por impacto operativo.",
      "2. Cambios recomendados, clasificados como prompt/schema/validator/state/catalog/dashboard.",
      "3. Riesgo de parser creep de cada cambio.",
      "4. Tests manuales de regresion sugeridos.",
      "5. Implementacion propuesta solo si conserva OpenAI como interprete principal.",
      "",
      "CASOS FALLIDOS:",
      failureLines || "No hay fracasos registrados todavia."
    ].join("\n");
  }

  private safeClone<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T;
  }
}
