import { strict as assert } from "node:assert";
import type { Server } from "node:http";

process.env.BOT_INTEGRATION_SECRET = "qa-reset-conversations-secret";
process.env.TELEGRAM_CLIENT_BOT_TOKEN = "";
process.env.TELEGRAM_ADMIN_BOT_TOKEN = "";

const { createApp } = await import("../app.js");
const { demoStore } = await import("../data/demoStore.js");
const { createId, nowIso } = await import("../utils/id.js");

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
  const timestamp = nowIso();
  const existingOrders = demoStore.orders;
  demoStore.conversations = [
    {
      id: createId("conv"),
      createdAt: timestamp,
      updatedAt: timestamp,
      businessId: "biz_ilovefresas",
      customerPhone: "telegram:reset-test",
      state: "idle",
      aiUsageCount: 0,
      draftOrder: null,
      activeOrderId: null,
      botPausedUntil: null,
      botPausedReason: null,
      postOrderEvents: [],
      memory: {
        recentMessages: [],
        summary: null,
        lastBotOffer: null
      }
    }
  ];
  demoStore.messages = [
    {
      id: createId("msg"),
      createdAt: timestamp,
      updatedAt: timestamp,
      businessId: "biz_ilovefresas",
      conversationId: demoStore.conversations[0].id,
      customerPhone: "telegram:reset-test",
      role: "customer",
      text: "hola"
    }
  ];
  demoStore.conversationTraces = [
    {
      id: createId("trace"),
      createdAt: timestamp,
      updatedAt: timestamp,
      businessId: "biz_ilovefresas",
      conversationId: demoStore.conversations[0].id,
      customerPhone: "telegram:reset-test",
      customerMessageId: null,
      botMessageId: null,
      customerText: "hola",
      finalReply: "hola",
      provider: "qa",
      classificationSource: "qa",
      replySource: "qa",
      stateBefore: "idle",
      stateAfter: "idle",
      activeOrderIdBefore: null,
      activeOrderIdAfter: null,
      draftBefore: null,
      draftAfter: null,
      openAIJson: null,
      openAIError: null,
      proposedReply: null,
      replyWasOverridden: false,
      backendAppliedPatch: null,
      guardrailsApplied: [],
      alerts: [],
      severity: "info",
      feedback: {
        status: "unreviewed",
        note: null,
        updatedAt: null
      }
    }
  ];
  demoStore.orders = existingOrders;
  const orderCountBefore = demoStore.orders.length;

  const result = await request("/admin/dashboard/reset-conversations", {
    method: "POST"
  }) as {
    ok: boolean;
    deleted: {
      conversations: number;
      messages: number;
      conversationTraces: number;
    };
  };

  assert.equal(result.ok, true);
  assert.equal(result.deleted.conversations, 1);
  assert.equal(result.deleted.messages, 1);
  assert.equal(result.deleted.conversationTraces, 1);
  assert.equal(demoStore.conversations.length, 0);
  assert.equal(demoStore.messages.length, 0);
  assert.equal(demoStore.conversationTraces.length, 0);
  assert.equal(demoStore.orders.length, orderCountBefore, "orders should not be deleted");

  console.log("reset-conversations smoke OK");
} finally {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}
