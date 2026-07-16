import { env } from "../config/env.js";
import { createPostgresClient } from "../db/postgres.js";
import { logger } from "../utils/logger.js";
import { TelegramService } from "./telegram.service.js";

type OutboxStatus = "pending" | "processing" | "sent" | "failed";

type OutboxRow = {
  id: string;
  turn_id: string | null;
  channel: "telegram" | "whatsapp";
  chat_id: string;
  event_type: "text" | "document" | "photo";
  payload_json: Record<string, unknown>;
  status: OutboxStatus;
  attempt_count: number;
  available_at: string;
  last_error: string | null;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
};

export class OutboxDeliveryService {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private schemaReady: Promise<void> | null = null;

  constructor(
    private readonly db = createPostgresClient(),
    private readonly telegramService = new TelegramService()
  ) {}

  isEnabled() {
    return env.TURN_PERSISTENCE_MODE === "postgres" && this.db.configured;
  }

  start() {
    if (!this.isEnabled() || this.timer) return;
    void this.deliverPending();
    this.timer = setInterval(() => void this.deliverPending(), 5_000);
    this.timer.unref();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async deliverTurn(turnId: string) {
    if (!this.isEnabled()) return { configured: false, sent: 0, failed: 0 };
    return this.deliverPending(turnId);
  }

  async deliverPending(turnId?: string) {
    if (!this.isEnabled() || this.running) {
      return { configured: this.isEnabled(), sent: 0, failed: 0 };
    }
    this.running = true;
    let sent = 0;
    let failed = 0;
    try {
      await this.ensureSchema();
      await this.db.query(
        `update bot_outbox
         set status = 'pending', available_at = now(), updated_at = now()
         where status = 'processing' and updated_at < now() - interval '1 minute'`
      );
      const rows = await this.claimRows(turnId);
      for (const row of rows) {
        try {
          await this.deliver(row);
          await this.db.query(
            `update bot_outbox
             set status = 'sent', sent_at = now(), last_error = null, updated_at = now()
             where id = $1`,
            [row.id]
          );
          sent += 1;
        } catch (error) {
          const message = error instanceof Error ? error.message : "unknown";
          const nextAttempt = Number(row.attempt_count) + 1;
          const permanentlyFailed = nextAttempt >= 5;
          const delaySeconds = Math.min(300, 2 ** nextAttempt * 5);
          await this.db.query(
            `update bot_outbox
             set status = $2,
                 attempt_count = $3,
                 available_at = now() + ($4 * interval '1 second'),
                 last_error = $5,
                 updated_at = now()
             where id = $1`,
            [row.id, permanentlyFailed ? "failed" : "pending", nextAttempt, delaySeconds, message]
          );
          logger.warn("Outbox delivery failed", {
            outboxId: row.id,
            channel: row.channel,
            attempt: nextAttempt,
            error: message
          });
          failed += 1;
        }
      }
      return { configured: true, sent, failed };
    } finally {
      this.running = false;
    }
  }

  async listFailed(limit = 100) {
    if (!this.isEnabled()) return { configured: false, rows: [] };
    await this.ensureSchema();
    const safeLimit = Math.max(1, Math.min(500, Math.trunc(limit)));
    const rows = await this.db.query<OutboxRow>(
      `select * from bot_outbox
       where status in ('failed', 'pending') and attempt_count > 0
       order by updated_at desc
       limit $1`,
      [safeLimit]
    );
    return { configured: true, rows: rows.map((row) => this.toPublicRow(row)) };
  }

  async retry(outboxId: string) {
    if (!this.isEnabled()) return null;
    await this.ensureSchema();
    const rows = await this.db.query<OutboxRow>(
      `update bot_outbox
       set status = 'pending', attempt_count = 0, available_at = now(), last_error = null, updated_at = now()
       where id = $1 and status <> 'sent'
       returning *`,
      [outboxId]
    );
    if (!rows[0]) return null;
    await this.deliverPending(rows[0].turn_id ?? undefined);
    const refreshed = await this.db.query<OutboxRow>("select * from bot_outbox where id = $1", [outboxId]);
    return refreshed[0] ? this.toPublicRow(refreshed[0]) : null;
  }

  private async claimRows(turnId?: string) {
    return this.db.transaction(async (transaction) => transaction.query<OutboxRow>(
      `with selected as (
         select id from bot_outbox
         where status = 'pending'
           and available_at <= now()
           and ($1::text is null or turn_id = $1)
         order by created_at, id
         for update skip locked
         limit 25
       )
       update bot_outbox outbox
       set status = 'processing', updated_at = now()
       from selected
       where outbox.id = selected.id
       returning outbox.*`,
      [turnId ?? null]
    ));
  }

  private async ensureSchema() {
    this.schemaReady ??= this.db.query(`
      create table if not exists bot_outbox (
        id text primary key,
        turn_id text,
        channel text not null,
        chat_id text not null,
        event_type text not null,
        payload_json jsonb not null,
        status text not null default 'pending' check (status in ('pending', 'processing', 'sent', 'failed')),
        attempt_count integer not null default 0,
        available_at timestamptz not null default now(),
        last_error text,
        sent_at timestamptz,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      );
      alter table bot_outbox add column if not exists turn_id text;
      create index if not exists idx_bot_outbox_pending on bot_outbox (status, available_at);
      create index if not exists idx_bot_outbox_turn on bot_outbox (turn_id, created_at);
    `).then(() => undefined);
    return this.schemaReady;
  }

  private async deliver(row: OutboxRow) {
    if (row.channel !== "telegram") {
      throw new Error(`Outbox channel ${row.channel} is not enabled in this release`);
    }
    if (!env.TELEGRAM_CLIENT_BOT_TOKEN) {
      throw new Error("Telegram client bot token is not configured");
    }

    if (row.event_type === "text") {
      await this.telegramService.sendMessage(
        env.TELEGRAM_CLIENT_BOT_TOKEN,
        row.chat_id,
        String(row.payload_json.text ?? "")
      );
      return;
    }

    const pathOrUrl = String(row.payload_json.pathOrUrl ?? "");
    const caption = row.payload_json.caption ? String(row.payload_json.caption) : undefined;
    if (row.event_type === "document") {
      await this.telegramService.sendDocument(
        env.TELEGRAM_CLIENT_BOT_TOKEN,
        row.chat_id,
        pathOrUrl,
        caption
      );
      return;
    }

    await this.telegramService.sendPhoto(
      env.TELEGRAM_CLIENT_BOT_TOKEN,
      row.chat_id,
      pathOrUrl,
      caption
    );
  }

  private toPublicRow(row: OutboxRow) {
    return {
      id: row.id,
      turnId: row.turn_id,
      channel: row.channel,
      chatId: row.chat_id,
      eventType: row.event_type,
      status: row.status,
      attemptCount: Number(row.attempt_count),
      availableAt: row.available_at,
      lastError: row.last_error,
      sentAt: row.sent_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }
}
