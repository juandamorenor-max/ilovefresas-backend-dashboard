import { strict as assert } from "node:assert";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Server } from "node:http";

const tempDir = mkdtempSync(path.join(tmpdir(), "ilf-runtime-store-"));
process.env.RUNTIME_STORE_PATH = path.join(tempDir, "runtime-store.json");
process.env.BOT_INTEGRATION_SECRET = "qa-runtime-secret";
process.env.TELEGRAM_CLIENT_BOT_TOKEN = "";
process.env.TELEGRAM_ADMIN_BOT_TOKEN = "";

const { createApp } = await import("../app.js");
const { demoStore } = await import("../data/demoStore.js");
const { loadRuntimeStore } = await import("../data/runtime-store.js");

const app = createApp();
const server = await new Promise<Server>((resolve) => {
  const instance = app.listen(0, () => resolve(instance));
});

const address = server.address();
assert(address && typeof address === "object", "Expected server address");
const baseUrl = `http://127.0.0.1:${address.port}`;

async function request(pathname: string, options: RequestInit = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    ...options,
    headers: {
      ...(options.body ? { "content-type": "application/json" } : {}),
      ...(options.headers ?? {})
    }
  });
  const text = await response.text();
  assert(response.ok, `${options.method ?? "GET"} ${pathname} failed ${response.status}: ${text}`);
  return text ? JSON.parse(text) : null;
}

try {
  const product = demoStore.products.find((entry) => entry.name === "Fresas con crema tradicional");
  assert(product, "Expected Fresas con crema tradicional");
  const original = {
    basePrice: product.basePrice,
    isActive: product.isActive,
    isOutOfStock: product.isOutOfStock
  };

  await request(`/admin/products/${product.id}`, {
    method: "PATCH",
    body: JSON.stringify({ basePrice: 19000 })
  });
  await request(`/admin/products/${product.id}/availability`, {
    method: "PATCH",
    body: JSON.stringify({ isActive: true, isOutOfStock: true })
  });

  assert(existsSync(process.env.RUNTIME_STORE_PATH!), "Runtime store file should be written");

  product.basePrice = original.basePrice;
  product.isActive = original.isActive;
  product.isOutOfStock = original.isOutOfStock;

  assert(loadRuntimeStore(), "Runtime store should load from disk");
  const restored = demoStore.products.find((entry) => entry.id === product.id);
  assert(restored, "Restored product should exist");
  assert.equal(restored.basePrice, 19000);
  assert.equal(restored.isActive, true);
  assert.equal(restored.isOutOfStock, true);

  restored.basePrice = original.basePrice;
  restored.isActive = original.isActive;
  restored.isOutOfStock = original.isOutOfStock;

  console.log("runtime-store smoke OK");
} finally {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
  rmSync(tempDir, { recursive: true, force: true });
}
