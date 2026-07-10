import { env } from "../config/env.js";
import { createPostgresClient } from "../db/postgres.js";
import { logger } from "../utils/logger.js";
import { demoStore } from "./demoStore.js";

const persistedKeys = [
  "businesses",
  "businessHours",
  "specialClosures",
  "deliveryZones",
  "modifierGroups",
  "modifierOptions",
  "products",
  "promotions",
  "customers",
  "conversations",
  "conversationTraces",
  "messages",
  "orders",
  "adminUsers"
] as const;

type PersistedKey = typeof persistedKeys[number];
type RuntimeSnapshot = {
  version: 2;
  savedAt: string;
} & { [K in PersistedKey]: unknown[] };

const schemaSql = `
create table if not exists operational_runtime_store (
  id text primary key,
  version integer not null,
  snapshot_json jsonb not null,
  saved_at timestamptz not null,
  updated_at timestamptz not null default now()
);
`;

export class PostgresRuntimeStoreService {
  private schemaReady: Promise<void> | null = null;

  constructor(private readonly db = createPostgresClient()) {}

  isEnabled() {
    return env.OPERATIONAL_STORE_MODE === "postgres" && this.db.configured;
  }

  async load() {
    if (!this.isEnabled()) return false;
    await this.ensureSchema();
    const rows = await this.db.query<{ snapshot_json: RuntimeSnapshot }>(
      `select snapshot_json from operational_runtime_store where id = 'primary'`
    );
    const snapshot = rows[0]?.snapshot_json;
    if (!snapshot) return false;

    for (const key of persistedKeys) {
      const value = snapshot[key];
      if (!Array.isArray(value)) continue;
      const target = demoStore[key];
      target.splice(0, target.length, ...(value as never[]));
    }
    return true;
  }

  async persist() {
    if (!this.isEnabled()) return false;
    await this.ensureSchema();
    const snapshot = this.snapshot();
    await this.db.query(
      `insert into operational_runtime_store (id, version, snapshot_json, saved_at)
       values ('primary', $1, $2::jsonb, $3)
       on conflict (id) do update set
         version = excluded.version,
         snapshot_json = excluded.snapshot_json,
         saved_at = excluded.saved_at,
         updated_at = now()`,
      [snapshot.version, JSON.stringify(snapshot), snapshot.savedAt]
    );
    return true;
  }

  private snapshot(): RuntimeSnapshot {
    const snapshot = {
      version: 2 as const,
      savedAt: new Date().toISOString()
    } as RuntimeSnapshot;
    for (const key of persistedKeys) {
      snapshot[key] = demoStore[key];
    }
    return snapshot;
  }

  private async ensureSchema() {
    this.schemaReady ??= this.db.query(schemaSql).then(() => undefined);
    return this.schemaReady;
  }
}

const postgresRuntimeStore = new PostgresRuntimeStoreService();
let persistenceTail = Promise.resolve();

export function schedulePostgresRuntimeStorePersist() {
  if (!postgresRuntimeStore.isEnabled()) return false;
  persistenceTail = persistenceTail
    .catch(() => undefined)
    .then(() => postgresRuntimeStore.persist())
    .then(() => undefined)
    .catch((error) => {
      logger.error("Postgres operational store persistence failed", {
        error: error instanceof Error ? error.message : "unknown"
      });
    });
  return true;
}

export async function flushPostgresRuntimeStore() {
  await persistenceTail;
}

export function getPostgresRuntimeStore() {
  return postgresRuntimeStore;
}

