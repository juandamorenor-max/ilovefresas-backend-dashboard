import { demoStore } from "../data/demoStore.js";
import type {
  Conversation,
  ConversationTrace,
  ConversationTraceAlert,
  ConversationTraceFeedback,
  ConversationTraceSeverity,
  ConversationTurnResult
} from "../types/index.js";
import { createId, nowIso } from "../utils/id.js";

export interface OpenAITraceEvent {
  source: string;
  result: unknown;
  error: string | null;
  proposedReply: string | null;
  backendAppliedPatch: unknown;
  guardrailsApplied: string[];
}

export interface ConversationTraceInput {
  businessId: string;
  conversation: Conversation;
  customerPhone: string;
  customerText: string;
  customerMessageId: string | null;
  botMessageId: string | null;
  finalReply: string;
  stateBefore: Conversation["state"];
  stateAfter: Conversation["state"];
  activeOrderIdBefore: string | null;
  activeOrderIdAfter: string | null;
  draftBefore: unknown;
  draftAfter: unknown;
  turnResult: ConversationTurnResult;
  openAIEvent: OpenAITraceEvent | null;
}

const severityRank: Record<ConversationTraceSeverity, number> = {
  info: 0,
  low: 1,
  medium: 2,
  high: 3,
  critical: 4
};

export class ConversationTraceService {
  recordTurn(input: ConversationTraceInput) {
    const openAIEvent = input.openAIEvent;
    const provider = openAIEvent?.source ?? input.turnResult.classificationSource;
    const proposedReply = openAIEvent?.proposedReply ?? null;
    const replyWasOverridden = Boolean(
      proposedReply &&
        input.finalReply.trim() &&
        this.normalize(proposedReply) !== this.normalize(input.finalReply)
    );
    const alerts = this.buildAlerts(input, replyWasOverridden);
    const timestamp = nowIso();
    const trace: ConversationTrace = {
      id: createId("trace"),
      createdAt: timestamp,
      updatedAt: timestamp,
      businessId: input.businessId,
      conversationId: input.conversation.id,
      customerPhone: input.customerPhone,
      customerMessageId: input.customerMessageId,
      botMessageId: input.botMessageId,
      customerText: input.customerText,
      finalReply: input.finalReply,
      provider,
      classificationSource: input.turnResult.classificationSource,
      replySource: input.turnResult.replySource,
      stateBefore: input.stateBefore,
      stateAfter: input.stateAfter,
      activeOrderIdBefore: input.activeOrderIdBefore,
      activeOrderIdAfter: input.activeOrderIdAfter,
      draftBefore: this.safeClone(input.draftBefore),
      draftAfter: this.safeClone(input.draftAfter),
      openAIJson: this.safeClone(openAIEvent?.result ?? null),
      openAIError: openAIEvent?.error ?? null,
      proposedReply,
      replyWasOverridden,
      backendAppliedPatch: this.safeClone(openAIEvent?.backendAppliedPatch ?? null),
      guardrailsApplied: openAIEvent?.guardrailsApplied ?? [],
      alerts,
      severity: this.highestSeverity(alerts),
      feedback: {
        status: "unreviewed",
        note: null,
        updatedAt: null
      }
    };

    demoStore.conversationTraces.push(trace);
    return trace;
  }

  listTraces(conversationId?: string) {
    return demoStore.conversationTraces
      .filter((trace) => !conversationId || trace.conversationId === conversationId)
      .slice()
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  getTrace(traceId: string) {
    return demoStore.conversationTraces.find((trace) => trace.id === traceId) ?? null;
  }

  updateFeedback(
    traceId: string,
    feedback: Partial<Pick<ConversationTraceFeedback, "status" | "note">>
  ) {
    const trace = this.getTrace(traceId);
    if (!trace) {
      return null;
    }

    if (feedback.status) {
      trace.feedback.status = feedback.status;
    }
    if (feedback.note !== undefined) {
      trace.feedback.note = feedback.note;
    }
    trace.feedback.updatedAt = nowIso();
    trace.updatedAt = trace.feedback.updatedAt;
    return trace;
  }

  removeConversationTraces(conversationIds: string[]) {
    demoStore.conversationTraces = demoStore.conversationTraces.filter(
      (trace) => !conversationIds.includes(trace.conversationId)
    );
  }

  private buildAlerts(input: ConversationTraceInput, replyWasOverridden: boolean) {
    const alerts: ConversationTraceAlert[] = [];
    const openAIEvent = input.openAIEvent;
    const draftAfter = input.draftAfter as {
      blockingIssue?: string | null;
      pendingSelections?: Array<{ blocking?: boolean; question?: string; label?: string }>;
    } | null;

    if (openAIEvent?.error) {
      alerts.push({
        code: "openai_error",
        title: "Error de OpenAI",
        detail: openAIEvent.error,
        severity: "high"
      });
    }

    if (openAIEvent?.source === "heuristic" || input.turnResult.classificationSource === "heuristic") {
      alerts.push({
        code: "heuristic_used",
        title: "Se uso heuristic",
        detail: "El turno no fue interpretado principalmente por OpenAI.",
        severity: "critical"
      });
    }

    if (replyWasOverridden) {
      alerts.push({
        code: "reply_overridden",
        title: "Respuesta reemplazada",
        detail: "OpenAI propuso una respuesta distinta a la que finalmente vio el cliente.",
        severity: "medium"
      });
    }

    if (input.stateAfter === "pending_human") {
      alerts.push({
        code: "human_handoff",
        title: "Requiere operario",
        detail: "El bot dejo este chat en manos de una persona.",
        severity: "high"
      });
    }

    if (draftAfter?.blockingIssue) {
      alerts.push({
        code: "blocking_issue",
        title: "Bloqueo operativo",
        detail: draftAfter.blockingIssue,
        severity: "medium"
      });
    }

    const pendingBlocking = draftAfter?.pendingSelections?.filter((selection) => selection.blocking) ?? [];
    if (pendingBlocking.length > 0) {
      alerts.push({
        code: "pending_selection",
        title: "Aclaracion pendiente",
        detail: pendingBlocking.map((selection) => selection.label ?? selection.question).filter(Boolean).join(", "),
        severity: "medium"
      });
    }

    if (!input.finalReply.trim()) {
      alerts.push({
        code: "silent_turn",
        title: "Turno silencioso",
        detail: "El bot no respondio. Puede ser correcto si el chat esta pausado o cerrado.",
        severity: input.stateAfter === "pending_human" ? "low" : "medium"
      });
    }

    if (this.hasRepeatedBotReply(input.conversation)) {
      alerts.push({
        code: "repeated_reply",
        title: "Respuesta repetida",
        detail: "Los ultimos mensajes del bot son muy parecidos. Puede haber loop o plantilla dominando.",
        severity: "medium"
      });
    }

    if (alerts.length === 0) {
      alerts.push({
        code: "ok",
        title: "Sin alerta automatica",
        detail: "No se detectaron senales obvias de conflicto en este turno.",
        severity: "info"
      });
    }

    return alerts;
  }

  private hasRepeatedBotReply(conversation: Conversation) {
    const botMessages = conversation.memory.recentMessages
      .filter((message) => message.role === "bot" && message.text.trim())
      .slice(-2);

    if (botMessages.length < 2) {
      return false;
    }

    return this.normalize(botMessages[0]!.text) === this.normalize(botMessages[1]!.text);
  }

  private highestSeverity(alerts: ConversationTraceAlert[]) {
    return alerts.reduce<ConversationTraceSeverity>(
      (highest, alert) =>
        severityRank[alert.severity] > severityRank[highest] ? alert.severity : highest,
      "info"
    );
  }

  private normalize(value: string) {
    return value
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ");
  }

  private safeClone<T>(value: T): T {
    if (value === undefined) {
      return null as T;
    }

    return JSON.parse(JSON.stringify(value)) as T;
  }
}
