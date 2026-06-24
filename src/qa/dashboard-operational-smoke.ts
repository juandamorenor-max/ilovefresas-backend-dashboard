import { strict as assert } from "node:assert";
import type { Server } from "node:http";

process.env.BOT_INTEGRATION_SECRET = "qa-dashboard-secret";
process.env.TELEGRAM_CLIENT_BOT_TOKEN = "";
process.env.TELEGRAM_ADMIN_BOT_TOKEN = "";

const { createApp } = await import("../app.js");
const { demoStore } = await import("../data/demoStore.js");
const integrationSecret = process.env.BOT_INTEGRATION_SECRET ?? "qa-dashboard-secret";

type Json = Record<string, unknown>;

const app = createApp();
const server = await new Promise<Server>((resolve) => {
  const instance = app.listen(0, () => resolve(instance));
});

const address = server.address();
assert(address && typeof address === "object", "Expected server address");
const baseUrl = `http://127.0.0.1:${address.port}`;
const secretHeaders = { "x-bot-secret": integrationSecret };

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
  const adminBotCatalog = await request("/admin/dashboard/bot-catalog") as {
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
  assert.deepEqual(
    adminBotCatalog,
    availableCatalog,
    "Admin bot catalog preview must match the catalog consumed by the bot"
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

  const blockedReview = await fetch(`${baseUrl}/bot/conversations/${conversation.id}/orders/review`, {
    method: "POST",
    headers: secretHeaders
  });
  assert.equal(blockedReview.status, 404, "Transfer order without proof should not enter review");

  await request(`/bot/conversations/${conversation.id}/state`, {
    method: "PATCH",
    headers: secretHeaders,
    body: JSON.stringify({
      comprobante_pago_recibido: true,
      payment_proof_note: "comprobante prematuro QA",
      needs_human: true,
      next_expected: "humano"
    })
  });

  const prematureProofReview = await fetch(`${baseUrl}/bot/conversations/${conversation.id}/orders/review`, {
    method: "POST",
    headers: secretHeaders
  });
  assert.equal(
    prematureProofReview.status,
    404,
    "Premature payment proof should not enter review before payment proof step"
  );

  await request(`/bot/conversations/${conversation.id}/state`, {
    method: "PATCH",
    headers: secretHeaders,
    body: JSON.stringify({
      pedido_confirmado_por_cliente: true,
      comprobante_pago_pendiente: true,
      next_expected: "comprobante_pago"
    })
  });

  await request(`/bot/conversations/${conversation.id}/state`, {
    method: "PATCH",
    headers: secretHeaders,
    body: JSON.stringify({
      comprobante_pago_recibido: true,
      payment_proof_note: "comprobante QA",
      needs_human: true,
      next_expected: "humano"
    })
  });

  const order = await request(`/bot/conversations/${conversation.id}/orders/review`, {
    method: "POST",
    headers: secretHeaders
  }) as {
    id: string;
    items: Array<{ unitBasePrice: number }>;
    pricing: { total: number };
    paymentProofReceived: boolean;
  };
  assert.equal(order.items[0]?.unitBasePrice, 17000);
  assert.equal(order.pricing.total, 22000);
  assert.equal(order.paymentProofReceived, true);

  const dashboardOrders = await request("/admin/dashboard/orders") as Array<{
    id: string;
    paymentProofReceived: boolean;
    paymentStatusLabel: string;
  }>;
  const dashboardOrder = dashboardOrders.find((entry) => entry.id === order.id);
  assert(dashboardOrder, "Created review order should be visible in dashboard orders");
  assert.equal(dashboardOrder.paymentProofReceived, true);
  assert.equal(dashboardOrder.paymentStatusLabel, "Comprobante recibido, pendiente de verificacion");

  const dispatchedOrder = await request(`/admin/dashboard/orders/${order.id}/notify-dispatched`, {
    method: "POST",
    body: JSON.stringify({})
  }) as { status: string };
  assert.equal(dispatchedOrder.status, "dispatched");
  assert(
    demoStore.messages.some((message) =>
      message.conversationId === conversation.id &&
      message.role === "bot" &&
      message.text === "Tu pedido ha sido despachado! 🍓"
    ),
    "dispatch notification should save exact customer message"
  );

  const paymentMethods = await request("/admin/dashboard/payment-methods") as Array<{
    id: string;
    accountLabel: string | null;
    accountValue: string | null;
  }>;
  const nequiMethod = paymentMethods.find((method) => method.id === "pm_nequi");
  assert(nequiMethod, "Nequi payment method should exist");
  const originalNequi = {
    accountLabel: nequiMethod.accountLabel,
    accountValue: nequiMethod.accountValue
  };
  await request("/admin/payment-methods/pm_nequi", {
    method: "PATCH",
    body: JSON.stringify({
      accountLabel: "Nequi pruebas",
      accountValue: "3111111111"
    })
  });

  const dynamicPaymentConversation = await request("/bot/conversations/telegram/dashboard-payment-method-test/new", {
    method: "POST",
    headers: secretHeaders
  }) as { id: string };
  await request(`/bot/conversations/${dynamicPaymentConversation.id}/state`, {
    method: "PATCH",
    headers: secretHeaders,
    body: JSON.stringify({
      items: [
        {
          producto: "Fresas con crema tradicional",
          cantidad: 1
        }
      ],
      nombre: "Pago Dinamico",
      direccion: "Cra 39A #41-99",
      barrio: "Cabecera del Llano",
      referencia: "Porteria",
      metodo_pago: "Nequi",
      modalidad_entrega: "domicilio"
    })
  });
  const dynamicPaymentTurn = await request("/bot/turn", {
    method: "POST",
    headers: secretHeaders,
    body: JSON.stringify({
      channel: "telegram",
      chatId: "dashboard-payment-method-test",
      text: "si"
    })
  }) as { responseText: string; orderId: string | null };
  assert(dynamicPaymentTurn.responseText.includes("Nequi pruebas: 3111111111"));
  assert.equal(dynamicPaymentTurn.orderId, null);
  await request("/admin/payment-methods/pm_nequi", {
    method: "PATCH",
    body: JSON.stringify(originalNequi)
  });

  await request(`/admin/products/${traditional.id}`, {
    method: "PATCH",
    body: JSON.stringify({ basePrice: originalProduct.basePrice })
  });

  const reset = await request("/admin/dashboard/reset-operational-data", {
    method: "POST",
    body: JSON.stringify({})
  }) as { ok: boolean; deleted: { orders: number; conversations: number } };
  assert.equal(reset.ok, true);
  assert(reset.deleted.orders > 0, "reset should delete orders");
  assert(reset.deleted.conversations > 0, "reset should delete conversations");
  assert.equal(demoStore.orders.length, 0);
  assert.equal(demoStore.conversations.length, 0);
  assert.equal(demoStore.messages.length, 0);

  console.log("dashboard-operational smoke OK");
} finally {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}
