import { strict as assert } from "node:assert";
import type { Server } from "node:http";

process.env.DASHBOARD_ACCESS_PASSWORD = "qa-dashboard-password";
process.env.DASHBOARD_OPERATOR_PASSWORD = "qa-operator-password";
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

  const operatorLogin = await fetch(`${baseUrl}/admin/session/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password: "qa-operator-password", role: "operator" })
  });
  assert.equal(operatorLogin.status, 200);
  const operatorBody = await operatorLogin.json() as { role: string };
  assert.equal(operatorBody.role, "operator");
  const cookie = operatorLogin.headers.get("set-cookie");
  if (!cookie?.includes("ilf_dashboard_session=")) {
    throw new Error("login should set session cookie");
  }
  const operatorCookie: string = cookie;

  const allowed = await fetch(`${baseUrl}/admin/dashboard/orders`, {
    headers: { cookie: operatorCookie }
  });
  assert.equal(allowed.status, 200);

  const adminBlocked = await fetch(`${baseUrl}/admin/dashboard/accounting/dispatched-orders`, {
    headers: { cookie: operatorCookie }
  });
  assert.equal(adminBlocked.status, 403);

  const adminLogin = await fetch(`${baseUrl}/admin/session/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password: "qa-dashboard-password", role: "admin" })
  });
  assert.equal(adminLogin.status, 200);
  const adminBody = await adminLogin.json() as { role: string };
  assert.equal(adminBody.role, "admin");
  const adminCookie = adminLogin.headers.get("set-cookie");
  assert(adminCookie, "admin login should set session cookie");

  const adminAllowed = await fetch(`${baseUrl}/admin/dashboard/accounting/dispatched-orders`, {
    headers: { cookie: adminCookie }
  });
  assert.equal(adminAllowed.status, 200);

  const logout = await fetch(`${baseUrl}/admin/session/logout`, {
    method: "POST",
    headers: { cookie: operatorCookie }
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
