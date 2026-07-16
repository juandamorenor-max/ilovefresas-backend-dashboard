import { env } from "../config/env.js";
import type { CustomerTurn, TurnResult } from "../contracts/customer-turn.js";
import { createPostgresClient } from "../db/postgres.js";
import { logger } from "../utils/logger.js";

const schemaSql = `
create table if not exists bot_processed_turns (
  channel text not null,
  external_message_id text not null,
  chat_id text not null,
  turn_id text not null,
  status text not null check (status in ('processing', 'completed', 'failed')),
  response_json jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (channel, external_message_id)
);
create table if not exists bot_turn_traces (
  turn_id text primary key,
  conversation_id text,
  channel text not null,
  chat_id text not null,
  external_message_id text not null,
  engine_version text not null,
  source text,
  next_expected text,
  order_id text,
  duration_ms integer not null default 0,
  request_json jsonb not null,
  response_json jsonb,
  error_message text,
  created_at timestamptz not null default now()
);
create index if not exists idx_bot_turn_traces_conversation_date
  on bot_turn_traces (conversation_id, created_at desc);
create table if not exists bot_turn_shadow_results (
  turn_id text primary key,
  agentflow_id text not null,
  decision_json jsonb,
  error_message text,
  duration_ms integer not null default 0,
  created_at timestamptz not null default now()
);
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
create index if not exists idx_bot_outbox_pending
  on bot_outbox (status, available_at);
create index if not exists idx_bot_outbox_turn
  on bot_outbox (turn_id, created_at);
`;

type TraceInput = {
  turnId: string;
  turn: CustomerTurn;
  result: TurnResult | null;
  durationMs: number;
  error: string | null;
};

export class TurnPersistenceService {
  private readonly memoryResults = new Map<string, TurnResult>();
  private schemaReady: Promise<void> | null = null;

  constructor(private readonly db = createPostgresClient()) {}

  async getCompleted(turn: CustomerTurn) {
    const memory = this.memoryResults.get(this.key(turn));
    if (memory) return { ...memory, duplicate: true, shouldSendReply: false };
    if (!this.usePostgres()) return null;

    await this.ensureSchema();
    const rows = await this.db.query<{ response_json: TurnResult }>(
      `select response_json from bot_processed_turns
       where channel = $1 and external_message_id = $2 and status = 'completed'`,
      [turn.channel, turn.externalMessageId]
    );
    const result = rows[0]?.response_json;
    return result ? { ...result, duplicate: true, shouldSendReply: false } : null;
  }

  async claim(turn: CustomerTurn, turnId: string) {
    if (!this.usePostgres()) return true;
    await this.ensureSchema();
    const rows = await this.db.query<{ turn_id: string }>(
      `insert into bot_processed_turns (
         channel, external_message_id, chat_id, turn_id, status
       ) values ($1, $2, $3, $4, 'processing')
       on conflict (channel, external_message_id) do nothing
       returning turn_id`,
      [turn.channel, turn.externalMessageId, turn.chatId, turnId]
    );
    return rows.length === 1;
  }

  async complete(turn: CustomerTurn, result: TurnResult) {
    if (!this.usePostgres()) {
      this.memoryResults.set(this.key(turn), result);
      return;
    }
    await this.ensureSchema();
    await this.db.transaction(async (transaction) => {
      await transaction.query(
        `update bot_processed_turns
         set status = 'completed', response_json = $3::jsonb, error_message = null, updated_at = now()
         where channel = $1 and external_message_id = $2`,
        [turn.channel, turn.externalMessageId, JSON.stringify(result)]
      );

      if (turn.channel !== "telegram") {
        return;
      }

      const events = this.buildOutboxEvents(turn, result);
      for (const event of events) {
        await transaction.query(
          `insert into bot_outbox (
             id, turn_id, channel, chat_id, event_type, payload_json, status
           ) values ($1, $2, $3, $4, $5, $6::jsonb, 'pending')
           on conflict (id) do nothing`,
          [
            event.id,
            result.turnId,
            turn.channel,
            turn.chatId,
            event.eventType,
            JSON.stringify(event.payload)
          ]
        );
      }
    });
    this.memoryResults.set(this.key(turn), result);
  }

  async fail(turn: CustomerTurn, error: string) {
    if (!this.usePostgres()) return;
    await this.ensureSchema();
    await this.db.query(
      `update bot_processed_turns
       set status = 'failed', error_message = $3, updated_at = now()
       where channel = $1 and external_message_id = $2`,
      [turn.channel, turn.externalMessageId, error]
    );
  }

  async trace(input: TraceInput) {
    if (!this.usePostgres()) return;
    try {
      await this.ensureSchema();
      await this.db.query(
        `insert into bot_turn_traces (
           turn_id, conversation_id, channel, chat_id, external_message_id,
           engine_version, source, next_expected, order_id, duration_ms,
           request_json, response_json, error_message
         ) values (
           $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12::jsonb, $13
         ) on conflict (turn_id) do nothing`,
        [
          input.turnId,
          input.result?.conversationId ?? null,
          input.turn.channel,
          input.turn.chatId,
          input.turn.externalMessageId,
          env.TURN_ENGINE_VERSION,
          input.result?.source ?? null,
          input.result?.nextExpected ?? null,
          input.result?.orderId ?? null,
          input.durationMs,
          JSON.stringify(this.redactTurn(input.turn)),
          input.result ? JSON.stringify(input.result) : null,
          input.error
        ]
      );
    } catch (error) {
      logger.warn("Turn trace persistence failed", {
        turnId: input.turnId,
        error: error instanceof Error ? error.message : "unknown"
      });
    }
  }

  async recordShadowResult(input: {
    turnId: string;
    agentflowId: string;
    decision: unknown | null;
    error: string | null;
    durationMs: number;
  }) {
    if (!this.usePostgres()) return;
    try {
      await this.ensureSchema();
      await this.db.query(
        `insert into bot_turn_shadow_results (
           turn_id, agentflow_id, decision_json, error_message, duration_ms
         ) values ($1, $2, $3::jsonb, $4, $5)
         on conflict (turn_id) do update set
           agentflow_id = excluded.agentflow_id,
           decision_json = excluded.decision_json,
           error_message = excluded.error_message,
           duration_ms = excluded.duration_ms,
           created_at = now()`,
        [
          input.turnId,
          input.agentflowId,
          input.decision ? JSON.stringify(input.decision) : null,
          input.error,
          input.durationMs
        ]
      );
    } catch (error) {
      logger.warn("Flowise V3 shadow persistence failed", {
        turnId: input.turnId,
        error: error instanceof Error ? error.message : "unknown"
      });
    }
  }

  async listTraces(limit = 100) {
    if (!this.usePostgres()) {
      return { configured: false, rows: [] };
    }
    await this.ensureSchema();
    const safeLimit = Math.max(1, Math.min(500, Math.trunc(limit)));
    const rows = await this.db.query<{
      turn_id: string;
      conversation_id: string | null;
      channel: string;
      chat_id: string;
      external_message_id: string;
      engine_version: string;
      source: string | null;
      next_expected: string | null;
      order_id: string | null;
      duration_ms: number;
      request_json: unknown;
      response_json: unknown;
      error_message: string | null;
      created_at: string;
      shadow_decision_json: unknown;
      shadow_error_message: string | null;
      shadow_duration_ms: number | null;
    }>(
      `select
         trace.turn_id, trace.conversation_id, trace.channel, trace.chat_id,
         trace.external_message_id, trace.engine_version, trace.source,
         trace.next_expected, trace.order_id, trace.duration_ms,
         trace.request_json, trace.response_json, trace.error_message, trace.created_at,
         shadow.decision_json as shadow_decision_json,
         shadow.error_message as shadow_error_message,
         shadow.duration_ms as shadow_duration_ms
       from bot_turn_traces trace
       left join bot_turn_shadow_results shadow on shadow.turn_id = trace.turn_id
       order by trace.created_at desc
       limit $1`,
      [safeLimit]
    );
    return {
      configured: true,
      rows: rows.map((row) => ({
        turnId: row.turn_id,
        conversationId: row.conversation_id,
        channel: row.channel,
        chatId: row.chat_id,
        externalMessageId: row.external_message_id,
        engineVersion: row.engine_version,
        source: row.source,
        nextExpected: row.next_expected,
        orderId: row.order_id,
        durationMs: Number(row.duration_ms),
        request: row.request_json,
        response: row.response_json,
        error: row.error_message,
        createdAt: row.created_at,
        shadowDecision: row.shadow_decision_json,
        shadowError: row.shadow_error_message,
        shadowDurationMs: row.shadow_duration_ms === null ? null : Number(row.shadow_duration_ms)
      }))
    };
  }

  private buildOutboxEvents(turn: CustomerTurn, result: TurnResult) {
    const events: Array<{
      id: string;
      eventType: "text" | "document" | "photo";
      payload: Record<string, unknown>;
    }> = [];

    if (result.shouldSendReply && result.responseText.trim()) {
      events.push({
        id: `outbox_${result.turnId}_text`,
        eventType: "text",
        payload: { turnId: result.turnId, text: result.responseText }
      });
    }

    result.attachments.forEach((attachment, index) => {
      events.push({
        id: `outbox_${result.turnId}_${attachment.type}_${index}`,
        eventType: attachment.type,
        payload: {
          turnId: result.turnId,
          pathOrUrl: attachment.pathOrUrl,
          filename: attachment.filename,
          caption: attachment.caption ?? null
        }
      });
    });

    return events;
  }

  private usePostgres() {
    return env.TURN_PERSISTENCE_MODE === "postgres" && this.db.configured;
  }

  private async ensureSchema() {
    this.schemaReady ??= this.db.query(schemaSql).then(() => undefined);
    return this.schemaReady;
  }

  private key(turn: CustomerTurn) {
    return `${turn.channel}:${turn.externalMessageId}`;
  }

  private redactTurn(turn: CustomerTurn) {
    return {
      ...turn,
      text: env.TURN_TRACE_INCLUDE_TEXT ? turn.text : "[redacted]",
      attachments: turn.attachments.map((attachment) => ({
        ...attachment,
        caption: env.TURN_TRACE_INCLUDE_TEXT ? attachment.caption : null
      }))
    };
  }
}
