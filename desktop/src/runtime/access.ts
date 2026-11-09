import { randomBytes } from "node:crypto";

/** Managed servers and their renderer share a fresh, process-local credential. */
export function configureDesktopAccessToken(isPackaged: boolean): string | undefined {
  const mode = process.env.AI_NOVEL_DESKTOP_SERVER_MODE ?? (isPackaged ? "managed" : "external");
  const configured = process.env.AI_NOVEL_ACCESS_TOKEN?.trim();
  if (configured) return configured;
  if (mode === "external") return undefined;
  const token = randomBytes(32).toString("hex");
  process.env.AI_NOVEL_ACCESS_TOKEN = token;
  return token;
}
