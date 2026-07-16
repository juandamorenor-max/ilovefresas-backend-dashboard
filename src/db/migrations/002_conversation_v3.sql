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

create index if not exists idx_bot_turn_traces_external_message
  on bot_turn_traces (channel, external_message_id);

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

create table if not exists operational_runtime_store (
  id text primary key,
  version integer not null,
  snapshot_json jsonb not null,
  saved_at timestamptz not null,
  updated_at timestamptz not null default now()
);
