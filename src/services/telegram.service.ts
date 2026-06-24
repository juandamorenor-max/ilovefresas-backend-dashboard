import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { logger } from "../utils/logger.js";

export interface TelegramChat {
  id: number;
  type: string;
  username?: string;
  first_name?: string;
  last_name?: string;
}

export interface TelegramMessage {
  message_id: number;
  chat: TelegramChat;
  text?: string;
  caption?: string;
  photo?: Array<{
    file_id: string;
    file_unique_id?: string;
    width: number;
    height: number;
    file_size?: number;
  }>;
  document?: {
    file_id: string;
    file_unique_id?: string;
    file_name?: string;
    mime_type?: string;
    file_size?: number;
  };
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: {
    id: string;
    data?: string;
    message?: TelegramMessage;
    from?: TelegramChat;
  };
}

interface TelegramApiResponse<T> {
  ok: boolean;
  result?: T;
  description?: string;
}

interface TelegramFile {
  file_id: string;
  file_unique_id: string;
  file_size?: number;
  file_path?: string;
}

export class TelegramService {
  async sendMessage(
    botToken: string,
    chatId: string | number,
    text: string,
    replyMarkup?: Record<string, unknown>
  ) {
    return this.request<TelegramMessage>(botToken, "sendMessage", {
      chat_id: chatId,
      text: text.slice(0, 4096),
      ...(replyMarkup ? { reply_markup: replyMarkup } : {})
    });
  }

  async answerCallbackQuery(botToken: string, callbackQueryId: string, text?: string) {
    return this.request<boolean>(botToken, "answerCallbackQuery", {
      callback_query_id: callbackQueryId,
      ...(text ? { text: text.slice(0, 200) } : {})
    });
  }

  async setMyCommands(
    botToken: string,
    commands: Array<{ command: string; description: string }>
  ) {
    return this.request<boolean>(botToken, "setMyCommands", {
      commands
    });
  }

  async sendDocument(
    botToken: string,
    chatId: string | number,
    document: string,
    caption?: string
  ) {
    if (!/^https?:\/\//i.test(document)) {
      return this.uploadDocument(botToken, chatId, document, caption);
    }

    return this.request<TelegramMessage>(botToken, "sendDocument", {
      chat_id: chatId,
      document,
      caption: caption?.slice(0, 1024)
    });
  }

  async sendPhoto(
    botToken: string,
    chatId: string | number,
    photo: string,
    caption?: string
  ) {
    if (!/^https?:\/\//i.test(photo)) {
      return this.uploadPhoto(botToken, chatId, photo, caption);
    }

    return this.request<TelegramMessage>(botToken, "sendPhoto", {
      chat_id: chatId,
      photo,
      caption: caption?.slice(0, 1024)
    });
  }

  async getUpdates(botToken: string, offset?: number, timeoutSeconds = 20) {
    return this.request<TelegramUpdate[]>(botToken, "getUpdates", {
      offset,
      timeout: timeoutSeconds,
      allowed_updates: ["message", "callback_query"]
    });
  }

  async deleteWebhook(botToken: string) {
    return this.request<boolean>(botToken, "deleteWebhook", {
      drop_pending_updates: false
    });
  }

  async downloadFileById(botToken: string, fileId: string) {
    const file = await this.request<TelegramFile>(botToken, "getFile", {
      file_id: fileId
    });
    if (!file.file_path) {
      throw new Error("Telegram file_path missing");
    }

    const response = await fetch(
      `https://api.telegram.org/file/bot${botToken}/${file.file_path}`
    );
    if (!response.ok) {
      logger.error("Telegram file download failed", {
        status: response.status
      });
      throw new Error("Telegram file download failed");
    }

    return {
      bytes: new Uint8Array(await response.arrayBuffer()),
      mimeType: response.headers.get("content-type") ?? this.mimeTypeFromPath(file.file_path)
    };
  }

  private async request<T>(botToken: string, method: string, payload: Record<string, unknown>) {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const body = (await response.json()) as TelegramApiResponse<T>;

    if (!response.ok || !body.ok || body.result === undefined) {
      logger.error("Telegram API request failed", {
        method,
        status: response.status,
        description: body.description ?? "unknown"
      });
      throw new Error(`Telegram ${method} failed`);
    }

    return body.result;
  }

  private async uploadDocument(
    botToken: string,
    chatId: string | number,
    filePath: string,
    caption?: string
  ) {
    const buffer = await readFile(filePath);
    const form = new FormData();
    const blob = new Blob([new Uint8Array(buffer)], {
      type: "application/pdf"
    });

    form.append("chat_id", String(chatId));
    form.append("document", blob, basename(filePath));

    if (caption) {
      form.append("caption", caption.slice(0, 1024));
    }

    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendDocument`, {
      method: "POST",
      body: form
    });

    const body = (await response.json()) as TelegramApiResponse<TelegramMessage>;

    if (!response.ok || !body.ok || body.result === undefined) {
      logger.error("Telegram document upload failed", {
        status: response.status,
        description: body.description ?? "unknown"
      });
      throw new Error("Telegram sendDocument upload failed");
    }

    return body.result;
  }

  private async uploadPhoto(
    botToken: string,
    chatId: string | number,
    filePath: string,
    caption?: string
  ) {
    const buffer = await readFile(filePath);
    const form = new FormData();
    const blob = new Blob([new Uint8Array(buffer)], {
      type: this.photoMimeType(filePath)
    });

    form.append("chat_id", String(chatId));
    form.append("photo", blob, basename(filePath));

    if (caption) {
      form.append("caption", caption.slice(0, 1024));
    }

    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendPhoto`, {
      method: "POST",
      body: form
    });

    const body = (await response.json()) as TelegramApiResponse<TelegramMessage>;

    if (!response.ok || !body.ok || body.result === undefined) {
      logger.error("Telegram photo upload failed", {
        status: response.status,
        description: body.description ?? "unknown"
      });
      throw new Error("Telegram sendPhoto upload failed");
    }

    return body.result;
  }

  private photoMimeType(filePath: string) {
    const lower = filePath.toLowerCase();
    if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) {
      return "image/jpeg";
    }

    if (lower.endsWith(".webp")) {
      return "image/webp";
    }

    return "image/png";
  }

  private mimeTypeFromPath(filePath: string) {
    const lower = filePath.toLowerCase();
    if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
    if (lower.endsWith(".webp")) return "image/webp";
    if (lower.endsWith(".png")) return "image/png";
    if (lower.endsWith(".pdf")) return "application/pdf";
    return "application/octet-stream";
  }
}
