import crypto from "node:crypto";
import type { Request, Response } from "express";
import { env } from "../config/env.js";

const cookieName = "ilf_dashboard_session";
const ttlMs = 12 * 60 * 60 * 1000;

export class DashboardAuthService {
  isEnabled() {
    return Boolean(env.DASHBOARD_ACCESS_PASSWORD);
  }

  getSession(request: Request) {
    if (!this.isEnabled()) {
      return { enabled: false, authenticated: true, expiresAt: null };
    }

    const token = this.readCookie(request, cookieName);
    const expiresAt = this.verifyToken(token);
    return {
      enabled: true,
      authenticated: Boolean(expiresAt),
      expiresAt
    };
  }

  login(password: string, response: Response) {
    if (!this.isEnabled()) {
      return { enabled: false, authenticated: true, expiresAt: null };
    }

    if (!this.passwordMatches(password)) {
      return { enabled: true, authenticated: false, expiresAt: null };
    }

    const expiresAt = new Date(Date.now() + ttlMs).toISOString();
    response.setHeader("Set-Cookie", this.buildCookie(this.signToken(expiresAt), ttlMs));
    return { enabled: true, authenticated: true, expiresAt };
  }

  logout(response: Response) {
    response.setHeader("Set-Cookie", this.buildCookie("", 0));
    return { enabled: this.isEnabled(), authenticated: false, expiresAt: null };
  }

  private passwordMatches(password: string) {
    const expected = env.DASHBOARD_ACCESS_PASSWORD ?? "";
    const receivedHash = crypto.createHash("sha256").update(password).digest();
    const expectedHash = crypto.createHash("sha256").update(expected).digest();
    return crypto.timingSafeEqual(receivedHash, expectedHash);
  }

  private signToken(expiresAt: string) {
    const payload = Buffer.from(JSON.stringify({ expiresAt })).toString("base64url");
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
      };
      if (!parsed.expiresAt || new Date(parsed.expiresAt).getTime() <= Date.now()) {
        return null;
      }
      return parsed.expiresAt;
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
