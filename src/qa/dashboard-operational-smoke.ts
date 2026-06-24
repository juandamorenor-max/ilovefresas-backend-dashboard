import { strict as assert } from "node:assert";
import type { Server } from "node:http";

process.env.BOT_INTEGRATION_SECRET = "qa-dashboard-secret";
process.env.TELEGRAM_CLIENT_BOT_TOKEN = "";
process.env.TELEGRAM_ADMIN_BOT_TOKEN = "";

const { createApp } = await import("../app.js");
const { demoStore } = await import("../data/demoStore.js");

type Json = Record<string, unknown>;

const app = createApp();
const server = await new Promise<Server>((resolve) => {
  const instance = app.listen(0, () => resolve(instance));
});

const address = server.address();
assert(address && typeof address === "object", "Expected server address");
const baseUrl = `http://127.0.0.1:${address.port}`;
const secretHeaders = { "x-bot-secret": "qa-dashboard-secret" };

async function request(path: string, options: RequestInit = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      ...(options.body ? { "content-type": "application/json" } : {}),
      ...(options.headers ?? {})
    }
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  assert(response.ok, `${options.method ?? "GET"} ${path} failed ${response.status}: ${text}`);
  return body;
}

async function expectStatus(path: string, expectedStatus: number, options: RequestInit = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      ...(options.body ? { "content-type": "application/json" } : {}),
      ...(options.headers ?? {})
    }
  });
  const text = await response.text();
  assert.equal(response.status, expectedStatus, `${options.method ?? "GET"} ${path} expected ${expectedStatus}, got ${response.status}: ${text}`);
}

try {
  demoStore.conversations = [];
  demoStore.messages = [];
  demoStore.orders = [];

  const traditional = demoStore.products.find((product) => product.name === "Fresas con crema tradicional");
  const oreo = demoStore.modifierOptions.find((modifier) => modifier.name === "Oreo");
  assert(traditional, "Expected Fresas con crema tradicional in catalog");
  assert(oreo, "Expected Oreo modifier in catalog");

  const originalProduct = {
    basePrice: traditional.basePrice,
    isActive: traditional.isActive,
    isOutOfStock: traditional.isOutOfStock
  };
  const originalOreo = { isActive: oreo.isActive };

  await expectStatus(`/admin/products/${traditional.id}/availability`, 400, {
    method: "PATCH",
    body: JSON.stringify({ isActive: "false", isOutOfStock: false })
  });
  await expectStatus(`/admin/products/${traditional.id}`, 400, {
    method: "PATCH",
    body: JSON.stringify({ basePrice: 0 })
  });
  await expectStatus(`/admin/modifiers/${oreo.id}/availability`, 400, {
    method: "PATCH",
    body: JSON.stringify({ isActive: "false" })
  });

  await request(`/admin/products/${traditional.id}/availability`, {
    method: "PATCH",
    body: JSON.stringify({ isActive: true, isOutOfStock: true })
  });

  const availableCatalog = await request("/bot/catalog/available", {
    headers: secretHeaders
  }) as {
    productos: Array<{ id: string }>;
    agotados: { productos: Array<{ id: string }> };
  };
  assert(
    !availableCatalog.productos.some((product) => product.id === traditional.id),
    "Dashboard-disabled product must disappear from available bot catalog"
  );
  assert(
    availableCatalog.agotados.productos.some((product) => product.id === traditional.id),
    "Dashboard-disabled product must be listed as agotado for bot guardrails"
  );

  const unavailableProductTurn = await request("/bot/turn", {
    method: "POST",
    headers: secretHeaders,
    body: JSON.stringify({
      channel: "telegram",
      chatId: "qa-dashboard-product",
      text: "quiero unas fresas tradicionales"
    })
  }) as Json;
  assert.equal(unavailableProductTurn.source, "backend_catalog_availability");
  assert.match(String(unavailableProductTurn.responseText), /agotad/i);

  await request(`/admin/products/${traditional.id}/availability`, {
    method: "PATCH",
    body: JSON.stringify({
      isActive: originalProduct.isActive,
      isOutOfStock: originalProduct.isOutOfStock
    })
  });

  await request(`/admin/modifiers/${oreo.id}/availability`, {
    method: "PATCH",
    body: JSON.stringify({ isActive: false })
  });

  const unavailableModifierTurn = await request("/bot/turn", {
    method: "POST",
    headers: secretHeaders,
    body: JSON.stringify({
      channel: "telegram",
      chatId: "qa-dashboard-modifier",
      text: "quiero unas fresas tradicionales con oreo"
    })
  }) as Json;
  assert.equal(unavailableModifierTurn.source, "backend_catalog_availability");
  assert.match(String(unavailableModifierTurn.responseText), /oreo/i);
  assert.match(String(unavailableModifierTurn.responseText), /agotad/i);

  await request(`/admin/modifiers/${oreo.id}/availability`, {
    method: "PATCH",
    body: JSON.stringify({ isActive: originalOreo.isActive })
  });

  await request(`/admin/products/${traditional.id}`, {
    method: "PATCH",
    body: JSON.stringify({ basePrice: 17000 })
  });

  const dashboardProducts = await request("/admin/dashboard/products") as Array<{
    id: string;
    basePrice?: number;
    price?: number;
  }>;
  const dashboardTraditional = dashboardProducts.find((product) => product.id === traditional.id);
  assert(dashboardTraditional, "Updated product should be visible in dashboard products");
  assert.equal(dashboardTraditional.basePrice ?? dashboardTraditional.price, 17000);

  const conversation = await request("/bot/conversations/telegram/qa-dashboard-price/new", {
    method: "POST",
    headers: secretHeaders
  }) as { id: string };

  await request(`/bot/conversations/${conversation.id}/state`, {
    method: "PATCH",
    headers: secretHeaders,
    body: JSON.stringify({
      items: [{ producto: "Fresas con crema tradicional", cantidad: 1 }],
      nombre: "Cliente QA",
      direccion: "Cra 39A #41-99",
      barrio: "Cabecera del Llano",
      referencia: "Porteria",
      metodo_pago: "Nequi",
      modalidad_entrega: "domicilio"
    })
  });

  const order = await request(`/bot/conversations/${conversation.id}/orders/review`, {
    method: "POST",
    headers: secretHeaders
  }) as {
    items: Array<{ unitBasePrice: number }>;
    pricing: { total: number };
  };
  assert.equal(order.items[0]?.unitBasePrice, 17000);
  assert.equal(order.pricing.total, 22000);

  await request(`/admin/products/${traditional.id}`, {
    method: "PATCH",
    body: JSON.stringify({ basePrice: originalProduct.basePrice })
  });

  console.log("dashboard-operational smoke OK");
} finally {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}
