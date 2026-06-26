import { strict as assert } from "node:assert";
import type { Server } from "node:http";

process.env.DASHBOARD_ACCESS_PASSWORD = "qa-dashboard-password";
process.env.DASHBOARD_SESSION_SECRET = "qa-dashboard-session-secret";

const { createApp } = await import("../app.js");

const app = createApp();
const server = await new Promise<Server>((resolve) => {
  const instance = app.listen(0, () => resolve(instance));
});

const address = server.address();
assert(address && typeof address === "object", "Expected server address");
const baseUrl = `http://127.0.0.1:${address.port}`;

try {
  const session = await fetch(`${baseUrl}/admin/session`);
  assert.equal(session.status, 200);
  const sessionBody = await session.json() as { enabled: boolean; authenticated: boolean };
  assert.equal(sessionBody.enabled, true);
  assert.equal(sessionBody.authenticated, false);

  const blocked = await fetch(`${baseUrl}/admin/dashboard/orders`);
  assert.equal(blocked.status, 401);

  const failedLogin = await fetch(`${baseUrl}/admin/session/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password: "wrong" })
  });
  assert.equal(failedLogin.status, 401);

  const login = await fetch(`${baseUrl}/admin/session/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password: "qa-dashboard-password" })
  });
  assert.equal(login.status, 200);
  const cookie = login.headers.get("set-cookie");
  if (!cookie?.includes("ilf_dashboard_session=")) {
    throw new Error("login should set session cookie");
  }
  const sessionCookie: string = cookie;

  const allowed = await fetch(`${baseUrl}/admin/dashboard/orders`, {
    headers: { cookie: sessionCookie }
  });
  assert.equal(allowed.status, 200);

  const logout = await fetch(`${baseUrl}/admin/session/logout`, {
    method: "POST",
    headers: { cookie: sessionCookie }
  });
  assert.equal(logout.status, 200);

  console.log("dashboard-auth smoke OK");
} finally {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}
