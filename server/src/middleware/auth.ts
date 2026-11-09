import type { NextFunction, Request, Response } from "express";
import { createHash, timingSafeEqual } from "node:crypto";

const COOKIE_NAME = "ai_novel_access";
const loopbackHosts = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
const publicRequests = new Set([
  "GET /api/health", "GET /api/health/",
  "POST /api/auto-director/channel-callbacks/dingtalk",
  "POST /api/auto-director/channel-callbacks/wecom",
  "GET /api/auto-director/channel-callbacks/dingtalk/execute",
  "GET /api/auto-director/channel-callbacks/wecom/execute",
]);

function isLocalDevelopment(req: Request): boolean {
  if (process.env.NODE_ENV === "production") return false;
  if (!["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(req.socket.remoteAddress ?? "")) return false;
  if (!loopbackHosts.has(req.hostname)) return false;
  const origin = req.get("origin");
  if (!origin) return true;
  try { return loopbackHosts.has(new URL(origin).hostname); } catch { return false; }
}

function cookieToken(req: Request): string {
  const value = req.headers.cookie?.split(";").map(part => part.trim()).find(part => part.startsWith(`${COOKIE_NAME}=`));
  try { return value ? decodeURIComponent(value.slice(COOKIE_NAME.length + 1)) : ""; } catch { return ""; }
}

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const pathname = req.originalUrl.split("?")[0].replace(/\/$/, "");
  if (publicRequests.has(`${req.method} ${pathname}`)) { next(); return; }
  const expected = process.env.AI_NOVEL_ACCESS_TOKEN?.trim();
  if (!expected) {
    if (isLocalDevelopment(req)) { next(); return; }
    res.status(503).json({ success: false, code: "ACCESS_TOKEN_NOT_CONFIGURED", error: "请先在服务端配置访问令牌，再连接工作台。" });
    return;
  }
  const authorization = req.get("authorization");
  const token = authorization ? /^Bearer (.+)$/i.exec(authorization)?.[1] ?? "" : cookieToken(req);
  const digest = (value: string) => createHash("sha256").update(value).digest();
  if (!token || !timingSafeEqual(digest(token), digest(expected))) {
    res.status(401).json({ success: false, code: "ACCESS_TOKEN_REQUIRED", error: "请输入有效的访问令牌。" });
    return;
  }
  next();
}

/** Browser sessions keep credentials out of URLs and support native EventSource. */
export function establishAccessSession(req: Request, res: Response): void {
  const token = process.env.AI_NOVEL_ACCESS_TOKEN?.trim();
  if (token) res.cookie(COOKIE_NAME, token, { httpOnly: true, sameSite: "strict", secure: req.secure, path: "/api" });
  res.setHeader("Cache-Control", "no-store");
  res.json({ success: true });
}
