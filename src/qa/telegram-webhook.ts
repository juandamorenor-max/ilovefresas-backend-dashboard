import { strict as assert } from "node:assert";
import type { Server } from "node:http";

process.env.NODE_ENV = "production";
process.env.BOT_INTEGRATION_SECRET = "qa-telegram-secret";
process.env.TELEGRAM_CLIENT_BOT_TOKEN = "qa-telegram-token";

const { createApp } = await import("../app.js");
const { TelegramBotRunnerService } = await import("../services/telegram-bot-runner.service.js");

const agentFlowTurns: Array<Record<string, unknown>> = [];
const telegramReplies: Array<{ chatId: string | number; text: string }> = [];
const webhookRunner = new TelegramBotRunnerService(
  {
    sendMessage: async (_token: string, chatId: string | number, text: string) => {
      telegramReplies.push({ chatId, text });
      return {};
    }
  } as never,
  {} as never,
  {} as never,
  {
    handleTurn: async (input: Record<string, unknown>) => {
      agentFlowTurns.push(input);
      return {
        responseText: "Respuesta desde AgentFlow",
        shouldSendReply: true
      };
    }
  } as never
);

await webhookRunner.handleClientWebhookUpdate({
  update_id: 10,
  message: {
    message_id: 20,
    chat: { id: 531515729, type: "private" },
    text: "quiero un waffle tradicional"
  }
});

assert.equal(agentFlowTurns.length, 1);
assert.equal(agentFlowTurns[0]?.channel, "telegram");
assert.equal(agentFlowTurns[0]?.chatId, "531515729");
assert.equal(agentFlowTurns[0]?.text, "quiero un waffle tradicional");
assert.deepEqual(telegramReplies, [{
  chatId: 531515729,
  text: "Respuesta desde AgentFlow"
}]);

const app = createApp();
const server = await new Promise<Server>((resolve) => {
  const instance = app.listen(0, () => resolve(instance));
});

const address = server.address();
assert(address && typeof address === "object", "Expected server address");
const baseUrl = `http://127.0.0.1:${address.port}`;

try {
  const unauthorized = await fetch(`${baseUrl}/webhook/telegram`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ update_id: 1 })
  });
  assert.equal(unauthorized.status, 401);

  const invalid = await fetch(`${baseUrl}/webhook/telegram`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-telegram-bot-api-secret-token": "qa-telegram-secret"
    },
    body: JSON.stringify({})
  });
  assert.equal(invalid.status, 400);

  const accepted = await fetch(`${baseUrl}/webhook/telegram`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-telegram-bot-api-secret-token": "qa-telegram-secret"
    },
    body: JSON.stringify({ update_id: 2 })
  });
  assert.equal(accepted.status, 200);
  assert.deepEqual(await accepted.json(), { received: true, queued: true });

  console.log("telegram-webhook smoke OK");
} finally {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}
