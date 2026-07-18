import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { env } from "../config/env.js";
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
  "botQuotes",
  "adminUsers"
] as const;

type PersistedKey = typeof persistedKeys[number];
type RuntimeSnapshot = {
  version: 1;
  savedAt: string;
} & {
  [K in PersistedKey]?: unknown;
};

export function loadRuntimeStore() {
  const storePath = runtimeStorePath();
  if (!storePath || !existsSync(storePath)) {
    return false;
  }

  const parsed = JSON.parse(readFileSync(storePath, "utf8")) as RuntimeSnapshot;
  for (const key of persistedKeys) {
    const value = parsed[key];
    if (!Array.isArray(value)) {
      continue;
    }

    const target = demoStore[key];
    target.splice(0, target.length, ...(value as never[]));
  }

  return true;
}

export function persistRuntimeStore() {
  const storePath = runtimeStorePath();
  if (!storePath) {
    return false;
  }

  mkdirSync(path.dirname(storePath), { recursive: true });
  const snapshot: RuntimeSnapshot = {
    version: 1,
    savedAt: new Date().toISOString()
  };

  for (const key of persistedKeys) {
    snapshot[key] = demoStore[key];
  }

  writeFileSync(storePath, JSON.stringify(snapshot, null, 2), "utf8");
  return true;
}

export function getRuntimeStoreStatus() {
  const storePath = runtimeStorePath();
  if (!storePath) {
    return {
      configured: false,
      mode: "memory",
      path: null,
      exists: false,
      writable: false
    };
  }

  try {
    mkdirSync(path.dirname(storePath), { recursive: true });
    const probePath = `${storePath}.healthcheck`;
    writeFileSync(probePath, new Date().toISOString(), "utf8");
    rmSync(probePath, { force: true });

    return {
      configured: true,
      mode: "snapshot-json",
      path: storePath,
      exists: existsSync(storePath),
      writable: true
    };
  } catch (error) {
    return {
      configured: true,
      mode: "snapshot-json",
      path: storePath,
      exists: existsSync(storePath),
      writable: false,
      error: error instanceof Error ? error.message : "unknown"
    };
  }
}

function runtimeStorePath() {
  return env.RUNTIME_STORE_PATH ? path.resolve(env.RUNTIME_STORE_PATH) : null;
}
