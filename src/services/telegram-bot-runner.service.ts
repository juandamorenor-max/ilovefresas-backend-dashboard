import { env } from "../config/env.js";
import { demoStore } from "../data/demoStore.js";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { TelegramMessage, TelegramUpdate } from "./telegram.service.js";
import { ConversationService } from "./conversation.service.js";
import { OrderService } from "./order.service.js";
import { TelegramService } from "./telegram.service.js";
import { formatCurrency } from "../utils/http.js";
import { logger } from "../utils/logger.js";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type ManualQaResult = "success" | "failure";

type ManualQaRecord = {
  id: string;
  date: string;
  chatId: number;
  customerId: string;
  conversationId: string | null;
  result: ManualQaResult;
  comment: string | null;
  closedAt: string;
  snapshot: ManualQaConversationSnapshot | null;
};

type ManualQaConversationSnapshot = {
  conversationId: string;
  state: string;
  activeOrderId: string | null;
  draftOrder: unknown;
  messages: Array<{
    role: string;
    text: string;
    createdAt: string;
  }>;
  traces: Array<{
    id: string;
    createdAt: string;
    customerText: string;
    finalReply: string;
    provider: string;
    classificationSource: string;
    replySource: string;
    stateBefore: string;
    stateAfter: string;
    draftBefore: unknown;
    draftAfter: unknown;
    openAIJson: unknown;
    openAIError: string | null;
    proposedReply: string | null;
    replyWasOverridden: boolean;
    backendAppliedPatch: unknown;
    guardrailsApplied: string[];
    alerts: unknown;
    severity: string;
  }>;
};

export class TelegramBotRunnerService {
  private clientOffset: number | undefined;
  private adminOffset: number | undefined;
  private stopped = false;
  private pendingClosures = new Map<number, { token: string; createdAt: string }>();
  private awaitingFailureComment = new Map<number, { token: string; createdAt: string }>();

  constructor(
    private readonly telegramService = new TelegramService(),
    private readonly conversationService = new ConversationService(),
    private readonly orderService = new OrderService()
  ) {}

  async start() {
    const loops: Array<Promise<void>> = [];

    if (env.TELEGRAM_CLIENT_BOT_TOKEN) {
      await this.telegramService.deleteWebhook(env.TELEGRAM_CLIENT_BOT_TOKEN);
      await this.configureClientCommands(env.TELEGRAM_CLIENT_BOT_TOKEN);
      loops.push(this.pollClientBot(env.TELEGRAM_CLIENT_BOT_TOKEN));
    } else {
      logger.warn("Telegram client bot token not configured");
    }

    if (env.TELEGRAM_ADMIN_BOT_TOKEN) {
      await this.telegramService.deleteWebhook(env.TELEGRAM_ADMIN_BOT_TOKEN);
      loops.push(this.pollAdminBot(env.TELEGRAM_ADMIN_BOT_TOKEN));
    } else {
      logger.warn("Telegram admin bot token not configured");
    }

    if (loops.length === 0) {
      logger.warn("No Telegram bots configured. Add tokens to .env and run npm run telegram:dev");
      return;
    }

    logger.info("Telegram local polling started", {
      clientBot: Boolean(env.TELEGRAM_CLIENT_BOT_TOKEN),
      adminBot: Boolean(env.TELEGRAM_ADMIN_BOT_TOKEN)
    });

    await Promise.all(loops);
  }

  stop() {
    this.stopped = true;
  }

  async handleClientWebhookUpdate(update: TelegramUpdate) {
    if (!env.TELEGRAM_CLIENT_BOT_TOKEN) {
      throw new Error("Telegram client bot token not configured");
    }
    await this.handleClientUpdate(env.TELEGRAM_CLIENT_BOT_TOKEN, update);
  }

  private async pollClientBot(botToken: string) {
    while (!this.stopped) {
      try {
        const updates = await this.telegramService.getUpdates(botToken, this.clientOffset);
        for (const update of updates) {
          this.clientOffset = update.update_id + 1;
          await this.handleClientUpdate(botToken, update);
        }
      } catch (error) {
        logger.error("Telegram client polling error", {
          error: error instanceof Error ? error.message : "unknown"
        });
        await sleep(env.TELEGRAM_POLL_INTERVAL_MS);
      }
    }
  }

  private async pollAdminBot(botToken: string) {
    while (!this.stopped) {
      try {
        const updates = await this.telegramService.getUpdates(botToken, this.adminOffset);
        for (const update of updates) {
          this.adminOffset = update.update_id + 1;
          await this.handleAdminUpdate(botToken, update);
        }
      } catch (error) {
        logger.error("Telegram admin polling error", {
          error: error instanceof Error ? error.message : "unknown"
        });
        await sleep(env.TELEGRAM_POLL_INTERVAL_MS);
      }
    }
  }

  private async handleClientUpdate(botToken: string, update: TelegramUpdate) {
    if (update.callback_query) {
      await this.handleClientCallback(botToken, update);
      return;
    }

    const message = update.message;
    const chatId = message?.chat.id;

    if (!message || chatId === undefined) {
      return;
    }

    if (message.photo?.length || this.isSupportedProofDocument(message.document)) {
      const largestPhoto = message.photo?.[message.photo.length - 1] ?? null;
      const result = await this.conversationService.handleIncomingAttachment({
        from: this.buildTelegramCustomerId(chatId),
        to: "telegram-client",
        attachmentType: largestPhoto ? "image" : "document",
        caption: message.caption ?? null,
        fileId: largestPhoto?.file_id ?? message.document?.file_id ?? null,
        mimeType: message.document?.mime_type ?? (largestPhoto ? "image/telegram-photo" : null)
      });

      if (result.reply.trim()) {
        await this.telegramService.sendMessage(botToken, chatId, result.reply);
      }
      return;
    }

    if (!message.text) {
      await this.telegramService.sendMessage(
        botToken,
        chatId,
        "Por ahora puedo interpretar texto y recibir comprobantes en imagen. Escribeme tu pedido o adjunta el comprobante cuando lo tengas 🍓"
      );
      return;
    }

    if (/^\/(start|newchat)\b/i.test(message.text)) {
      const customerId = this.buildTelegramCustomerId(chatId);
      this.pendingClosures.delete(chatId);
      this.awaitingFailureComment.delete(chatId);
      await this.telegramService.sendMessage(
        botToken,
        chatId,
        this.conversationService.startNewConversation(customerId)
      );
      return;
    }

    if (/^\/closechat\b/i.test(message.text)) {
      await this.promptCloseChatEvaluation(botToken, chatId);
      return;
    }

    if (/^\/summary\b/i.test(message.text)) {
      await this.telegramService.sendMessage(botToken, chatId, this.formatManualQaSummary());
      return;
    }

    const pendingFailure = this.awaitingFailureComment.get(chatId);
    if (pendingFailure) {
      await this.recordManualQaAndStartNewChat(botToken, chatId, "failure", message.text);
      return;
    }

    const result = await this.conversationService.handleIncomingMessage({
      from: this.buildTelegramCustomerId(chatId),
      to: "telegram-client",
      text: message.text
    });

    if (result.reply.trim()) {
      await this.telegramService.sendMessage(botToken, chatId, result.reply);
    }
    for (const attachment of result.attachments) {
      if (attachment.type === "document") {
        await this.telegramService.sendDocument(
          botToken,
          chatId,
          attachment.pathOrUrl,
          attachment.caption
        );
      } else if (attachment.type === "photo") {
        await this.telegramService.sendPhoto(
          botToken,
          chatId,
          attachment.pathOrUrl,
          attachment.caption
        );
      }
    }
  }

  private async configureClientCommands(botToken: string) {
    await this.telegramService.setMyCommands(botToken, [
      { command: "newchat", description: "Iniciar una conversación nueva" },
      { command: "closechat", description: "Cerrar y calificar esta prueba" },
      { command: "summary", description: "Resumen QA manual del día" }
    ]);
  }

  private async handleClientCallback(botToken: string, update: TelegramUpdate) {
    const callback = update.callback_query;
    const chatId = callback?.message?.chat.id ?? callback?.from?.id;
    const data = callback?.data ?? "";

    if (!callback || chatId === undefined || !data.startsWith("qa_close:")) {
      return;
    }

    await this.telegramService.answerCallbackQuery(botToken, callback.id);

    const [, rawResult, token] = data.split(":");
    const pending = this.pendingClosures.get(chatId);
    if (!pending || pending.token !== token) {
      await this.telegramService.sendMessage(
        botToken,
        chatId,
        "Esta evaluación ya fue registrada o expiró. Usa /closechat si quieres cerrar el caso actual."
      );
      return;
    }

    if (rawResult === "success") {
      await this.recordManualQaAndStartNewChat(botToken, chatId, "success", null);
      return;
    }

    if (rawResult === "failure") {
      this.awaitingFailureComment.set(chatId, pending);
      await this.telegramService.sendMessage(
        botToken,
        chatId,
        [
          "Marcado como fracaso.",
          "Escríbeme ahora qué falló en esta conversación:",
          "",
          "Ejemplo: no pidió barrio, confundió producto, repitió pregunta, cerró sin datos."
        ].join("\n")
      );
      return;
    }
  }

  private async promptCloseChatEvaluation(botToken: string, chatId: number) {
    const token = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    this.pendingClosures.set(chatId, {
      token,
      createdAt: new Date().toISOString()
    });
    this.awaitingFailureComment.delete(chatId);

    await this.telegramService.sendMessage(
      botToken,
      chatId,
      "Cerrando esta prueba manual. ¿Cómo calificas la conversación?",
      {
        inline_keyboard: [
          [
            { text: "✅ Éxito", callback_data: `qa_close:success:${token}` },
            { text: "❌ Fracaso", callback_data: `qa_close:failure:${token}` }
          ]
        ]
      }
    );
  }

  private async recordManualQaAndStartNewChat(
    botToken: string,
    chatId: number,
    result: ManualQaResult,
    comment: string | null
  ) {
    const customerId = this.buildTelegramCustomerId(chatId);
    const snapshot = this.buildManualQaConversationSnapshot(customerId);

    this.appendManualQaRecord({
      id: `manual_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      date: this.colombiaDateKey(),
      chatId,
      customerId,
      conversationId: snapshot?.conversationId ?? null,
      result,
      comment: comment?.trim() || null,
      closedAt: new Date().toISOString(),
      snapshot
    });

    this.pendingClosures.delete(chatId);
    this.awaitingFailureComment.delete(chatId);

    const label = result === "success" ? "Éxito" : "Fracaso";
    await this.telegramService.sendMessage(
      botToken,
      chatId,
      [
        `Caso guardado como ${label}.`,
        result === "failure" ? "Comentario registrado." : "Buenísimo, sumamos una conversación verde.",
        "",
        "Abro un chat nuevo para la siguiente prueba:"
      ].join("\n")
    );

    await this.telegramService.sendMessage(
      botToken,
      chatId,
      this.conversationService.startNewConversation(customerId)
    );
  }

  private buildManualQaConversationSnapshot(customerId: string): ManualQaConversationSnapshot | null {
    const conversation = demoStore.conversations.find(
      (entry) => entry.customerPhone === customerId
    );
    if (!conversation) {
      return null;
    }

    const messages = demoStore.messages
      .filter((message) => message.conversationId === conversation.id)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
      .map((message) => ({
        role: message.role,
        text: message.text,
        createdAt: message.createdAt
      }));

    const traces = demoStore.conversationTraces
      .filter((trace) => trace.conversationId === conversation.id)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
      .map((trace) => ({
        id: trace.id,
        createdAt: trace.createdAt,
        customerText: trace.customerText,
        finalReply: trace.finalReply,
        provider: trace.provider,
        classificationSource: trace.classificationSource,
        replySource: trace.replySource,
        stateBefore: trace.stateBefore,
        stateAfter: trace.stateAfter,
        draftBefore: trace.draftBefore,
        draftAfter: trace.draftAfter,
        openAIJson: trace.openAIJson,
        openAIError: trace.openAIError,
        proposedReply: trace.proposedReply,
        replyWasOverridden: trace.replyWasOverridden,
        backendAppliedPatch: trace.backendAppliedPatch,
        guardrailsApplied: trace.guardrailsApplied,
        alerts: trace.alerts,
        severity: trace.severity
      }));

    return {
      conversationId: conversation.id,
      state: conversation.state,
      activeOrderId: conversation.activeOrderId,
      draftOrder: conversation.draftOrder,
      messages,
      traces
    };
  }

  private appendManualQaRecord(record: ManualQaRecord) {
    const records = this.readManualQaRecords(record.date);
    records.push(record);
    this.writeManualQaRecords(record.date, records);
  }

  private formatManualQaSummary() {
    const date = this.colombiaDateKey();
    const records = this.readManualQaRecords(date);
    const successes = records.filter((record) => record.result === "success");
    const failures = records.filter((record) => record.result === "failure");

    if (records.length === 0) {
      return "Todavía no hay pruebas cerradas hoy. Usa /closechat al terminar cada conversación.";
    }

    const failureLines = failures.length
      ? failures.map((record, index) =>
          `${index + 1}. ${this.formatColombiaTime(record.closedAt)} - ${record.comment ?? "Sin comentario"}`
        )
      : ["Sin fracasos registrados."];

    return [
      `Resumen QA manual ${date}`,
      "",
      `Total conversaciones cerradas: ${records.length}`,
      `✅ Éxitos: ${successes.length}`,
      `❌ Fracasos: ${failures.length}`,
      "",
      "Fracasos/comentarios:",
      ...failureLines
    ].join("\n");
  }

  private readManualQaRecords(date = this.colombiaDateKey()): ManualQaRecord[] {
    const path = this.manualQaFilePath(date);
    if (!existsSync(path)) {
      return [];
    }

    try {
      return JSON.parse(readFileSync(path, "utf8")) as ManualQaRecord[];
    } catch {
      return [];
    }
  }

  private writeManualQaRecords(date: string, records: ManualQaRecord[]) {
    const path = this.manualQaFilePath(date);
    mkdirSync(join(process.cwd(), "qa-output"), { recursive: true });
    writeFileSync(path, JSON.stringify(records, null, 2));
  }

  private manualQaFilePath(date: string) {
    return join(process.cwd(), "qa-output", `telegram-manual-qa-${date}.json`);
  }

  private colombiaDateKey(date = new Date()) {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Bogota",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).formatToParts(date);
    const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
    return `${value("year")}-${value("month")}-${value("day")}`;
  }

  private formatColombiaTime(isoDate: string) {
    return new Intl.DateTimeFormat("es-CO", {
      timeZone: "America/Bogota",
      hour: "2-digit",
      minute: "2-digit"
    }).format(new Date(isoDate));
  }

  private async handleAdminUpdate(botToken: string, update: TelegramUpdate) {
    const message = update.message;
    const chatId = message?.chat.id;

    if (!message || chatId === undefined || !message.text) {
      return;
    }

    const normalized = message.text.trim().toLowerCase();

    if (/^\/(start|id)\b/.test(normalized)) {
      await this.telegramService.sendMessage(
        botToken,
        chatId,
        [
          "Bot admin activo.",
          `Tu chat_id es: ${chatId}`,
          "Pon ese valor en TELEGRAM_ADMIN_CHAT_ID para recibir pedidos aqui.",
          "",
          "Comandos: /ping, /pedidos"
        ].join("\n")
      );
      return;
    }

    if (/^\/ping\b/.test(normalized)) {
      await this.telegramService.sendMessage(botToken, chatId, "Admin bot activo.");
      return;
    }

    if (/^\/(pedidos|orders)\b/.test(normalized)) {
      await this.telegramService.sendMessage(botToken, chatId, this.formatRecentOrders());
      return;
    }

    await this.telegramService.sendMessage(
      botToken,
      chatId,
      "Comandos disponibles: /id, /ping, /pedidos"
    );
  }

  private isSupportedProofDocument(document: TelegramMessage["document"] | undefined) {
    if (!document) {
      return false;
    }

    const mimeType = document.mime_type?.toLowerCase() ?? "";
    return mimeType.startsWith("image/") || mimeType === "application/pdf";
  }

  private formatRecentOrders() {
    const orders = this.orderService.listOrders().slice(-5).reverse();

    if (orders.length === 0) {
      return "Todavia no hay pedidos creados en esta sesion local.";
    }

    return [
      "Ultimos pedidos en memoria:",
      "",
      ...orders.map((order) =>
        [
          `${order.id} - ${order.status}`,
          `Cliente: ${order.customerName ?? "Pendiente"}`,
          `Total: ${formatCurrency(order.pricing.total)}`
        ].join("\n")
      )
    ].join("\n\n");
  }

  private buildTelegramCustomerId(chatId: number) {
    return `telegram:${chatId}`;
  }
}
