import crypto from "node:crypto";
import type { Request, Response } from "express";
import { env } from "../config/env.js";

const cookieName = "ilf_dashboard_session";
const ttlMs = 12 * 60 * 60 * 1000;
export type DashboardRole = "operator" | "admin";

export class DashboardAuthService {
  isEnabled() {
    return Boolean(env.DASHBOARD_ACCESS_PASSWORD || env.DASHBOARD_OPERATOR_PASSWORD);
  }

  getSession(request: Request) {
    if (!this.isEnabled()) {
      return { enabled: false, authenticated: true, expiresAt: null, role: "admin" as const, demoEnabled: env.NODE_ENV !== "production" };
    }

    const token = this.readCookie(request, cookieName);
    const verified = this.verifyToken(token);
    return {
      enabled: true,
      authenticated: Boolean(verified),
      expiresAt: verified?.expiresAt ?? null,
      role: verified?.role ?? null,
      demoEnabled: env.NODE_ENV !== "production"
    };
  }

  login(password: string, requestedRole: DashboardRole, response: Response) {
    if (!this.isEnabled()) {
      return { enabled: false, authenticated: true, expiresAt: null, role: "admin" as const, demoEnabled: env.NODE_ENV !== "production" };
    }

    const role = this.resolveRole(password, requestedRole);
    if (!role) {
      return { enabled: true, authenticated: false, expiresAt: null, role: null, demoEnabled: env.NODE_ENV !== "production" };
    }

    const expiresAt = new Date(Date.now() + ttlMs).toISOString();
    response.setHeader("Set-Cookie", this.buildCookie(this.signToken(expiresAt, role), ttlMs));
    return { enabled: true, authenticated: true, expiresAt, role, demoEnabled: env.NODE_ENV !== "production" };
  }

  logout(response: Response) {
    response.setHeader("Set-Cookie", this.buildCookie("", 0));
    return { enabled: this.isEnabled(), authenticated: false, expiresAt: null, role: null, demoEnabled: env.NODE_ENV !== "production" };
  }

  private resolveRole(password: string, requestedRole: DashboardRole): DashboardRole | null {
    if (env.DASHBOARD_ACCESS_PASSWORD && this.passwordMatches(password, env.DASHBOARD_ACCESS_PASSWORD)) {
      return requestedRole === "operator" && !env.DASHBOARD_OPERATOR_PASSWORD ? "operator" : "admin";
    }
    if (
      requestedRole === "operator" &&
      env.DASHBOARD_OPERATOR_PASSWORD &&
      this.passwordMatches(password, env.DASHBOARD_OPERATOR_PASSWORD)
    ) {
      return "operator";
    }
    return null;
  }

  private passwordMatches(password: string, expected: string) {
    const receivedHash = crypto.createHash("sha256").update(password).digest();
    const expectedHash = crypto.createHash("sha256").update(expected).digest();
    return crypto.timingSafeEqual(receivedHash, expectedHash);
  }

  private signToken(expiresAt: string, role: DashboardRole) {
    const payload = Buffer.from(JSON.stringify({ expiresAt, role })).toString("base64url");
    const signature = crypto
      .createHmac("sha256", this.secret())
      .update(payload)
      .digest("base64url");
    return `${payload}.${signature}`;
  }

  private verifyToken(token: string | null) {
    if (!token) return null;
    const [payload, signature] = token.split(".");
    if (!payload || !signature) return null;
    const expectedSignature = crypto
      .createHmac("sha256", this.secret())
      .update(payload)
      .digest("base64url");
    const signatureBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expectedSignature);
    if (
      signatureBuffer.length !== expectedBuffer.length ||
      !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)
    ) {
      return null;
    }

    try {
      const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
        expiresAt?: string;
        role?: DashboardRole;
      };
      if (
        !parsed.expiresAt ||
        !["operator", "admin"].includes(parsed.role ?? "") ||
        new Date(parsed.expiresAt).getTime() <= Date.now()
      ) {
        return null;
      }
      return { expiresAt: parsed.expiresAt, role: parsed.role as DashboardRole };
    } catch {
      return null;
    }
  }

  private secret() {
    return env.DASHBOARD_SESSION_SECRET || env.DASHBOARD_ACCESS_PASSWORD || "dev-dashboard-session";
  }

  private buildCookie(value: string, maxAgeMs: number) {
    const parts = [
      `${cookieName}=${encodeURIComponent(value)}`,
      "Path=/",
      "HttpOnly",
      "SameSite=Lax",
      `Max-Age=${Math.floor(maxAgeMs / 1000)}`
    ];
    if (env.NODE_ENV === "production") {
      parts.push("Secure");
    }
    return parts.join("; ");
  }

  private readCookie(request: Request, name: string) {
    const header = request.headers.cookie;
    if (!header) return null;
    const cookies = header.split(";").map((entry) => entry.trim());
    const found = cookies.find((entry) => entry.startsWith(`${name}=`));
    return found ? decodeURIComponent(found.slice(name.length + 1)) : null;
  }
}
