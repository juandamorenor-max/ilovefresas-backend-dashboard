import { strict as assert } from "node:assert";
import type { Server } from "node:http";

process.env.NODE_ENV = "production";
process.env.BOT_INTEGRATION_SECRET = "qa-telegram-secret";
process.env.TELEGRAM_CLIENT_BOT_TOKEN = "qa-telegram-token";

const { createApp } = await import("../app.js");

const app = createApp({ loadRuntime: false });
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
