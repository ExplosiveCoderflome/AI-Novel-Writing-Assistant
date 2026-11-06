import { gzip, gunzip } from "node:zlib";
import { promisify } from "node:util";
import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../../../../db/prisma";
import type { LlmInvocationPayloadData } from "@ai-novel/shared/types/llmUsage";

const compress = promisify(gzip), decompress = promisify(gunzip);
const settingKey = "llm.invocationHistory";
export const invocationHistorySettingsSchema = z.object({
  enabled: z.boolean(), retentionDays: z.number().int().min(1).max(365), maxMb: z.number().int().min(1).max(4096),
});
export type InvocationHistorySettings = z.infer<typeof invocationHistorySettingsSchema>;
const defaults: InvocationHistorySettings = { enabled: false, retentionDays: 7, maxMb: 100 };
let cached: { value: InvocationHistorySettings; expires: number } | undefined;

export async function getInvocationHistorySettings(): Promise<InvocationHistorySettings> {
  if (cached && cached.expires > Date.now()) return cached.value;
  const row = await prisma.appSetting.findUnique({ where: { key: settingKey } });
  const value = row ? invocationHistorySettingsSchema.parse(JSON.parse(row.value)) : defaults;
  cached = { value, expires: Date.now() + 30_000 };
  return value;
}
export async function saveInvocationHistorySettings(input: InvocationHistorySettings): Promise<InvocationHistorySettings> {
  const value = invocationHistorySettingsSchema.parse(input);
  await prisma.appSetting.upsert({ where: { key: settingKey }, create: { key: settingKey, value: JSON.stringify(value) }, update: { value: JSON.stringify(value) } });
  cached = { value, expires: Date.now() + 30_000 };
  return value;
}

/** Payloads are allowlisted by the invocation adapter; configuration/headers never enter here. */
export function redactInvocationPayload<T>(value: T, secrets: readonly string[] = []): T {
  let text = JSON.stringify(value, (key, item) => {
    if (/^(api[_-]?key|authorization|access[_-]?token|secret|password|credentials|headers)$/i.test(key)) return "[REDACTED]";
    if (typeof item !== "string") return item;
    return item.replace(/\b(?:Bearer\s+)[\w.\-]+|\bsk-[\w-]+/gi, "[REDACTED]");
  });
  for (const secret of secrets) if (secret) text = text.split(JSON.stringify(secret).slice(1, -1)).join("[REDACTED]");
  return JSON.parse(text);
}
export async function encodeInvocationPayload(data: LlmInvocationPayloadData, secrets: readonly string[] = []): Promise<Buffer> {
  return compress(Buffer.from(JSON.stringify(redactInvocationPayload(data, secrets)), "utf8"));
}
export async function decodeInvocationPayload(data: Uint8Array): Promise<LlmInvocationPayloadData> {
  return JSON.parse((await decompress(data)).toString("utf8"));
}
export class InvocationPayloadStore {
  constructor(private readonly rows: PrismaClient["llmInvocationPayload"]) {}
  async save(usageRecordId: string, data: LlmInvocationPayloadData, secrets: readonly string[]): Promise<void> {
    const compressed = await encodeInvocationPayload(data, secrets);
    await this.rows.create({ data: { usageRecordId, compressed: new Uint8Array(compressed), compressedBytes: compressed.length } });
  }
  async setParse(usageRecordId: string, parsed: unknown, error: string | null, secrets: readonly string[]): Promise<void> {
    const row = await this.rows.findUnique({ where: { usageRecordId } });
    // A retention sweep may remove the payload while a repair is running.
    if (!row) return;
    const data = await decodeInvocationPayload(row.compressed);
    const compressed = await encodeInvocationPayload({ ...data, parsed, error }, secrets);
    await this.rows.updateMany({ where: { usageRecordId }, data: { compressed: new Uint8Array(compressed), compressedBytes: compressed.length } });
  }
  async read(usageRecordId: string): Promise<LlmInvocationPayloadData | null> {
    const row = await this.rows.findUnique({ where: { usageRecordId } });
    return row ? decodeInvocationPayload(row.compressed) : null;
  }
  /** Only disposable history payloads are removed; usage rows and manuscripts are retained. */
  async cleanup(settings: InvocationHistorySettings, now = new Date()): Promise<number> {
    const expired = await this.rows.deleteMany({ where: { createdAt: { lt: new Date(now.getTime() - settings.retentionDays * 86_400_000) } } });
    const total = await this.rows.aggregate({ _sum: { compressedBytes: true } });
    let bytes = total._sum.compressedBytes ?? 0, removed = expired.count;
    const maxBytes = settings.maxMb * 1024 * 1024;
    while (bytes > maxBytes) {
      const oldest = await this.rows.findMany({ orderBy: [{ createdAt: "asc" }, { usageRecordId: "asc" }], take: 100, select: { usageRecordId: true, compressedBytes: true } });
      if (!oldest.length) break;
      const ids: string[] = [];
      for (const row of oldest) {
        ids.push(row.usageRecordId); bytes -= row.compressedBytes;
        if (bytes <= maxBytes) break;
      }
      removed += (await this.rows.deleteMany({ where: { usageRecordId: { in: ids } } })).count;
    }
    return removed;
  }
}
export const invocationPayloadStore = new InvocationPayloadStore(prisma.llmInvocationPayload);
export function startInvocationPayloadRetention(): () => void {
  let running = false;
  const sweep = async () => {
    if (running) return;
    running = true;
    try { await invocationPayloadStore.cleanup(await getInvocationHistorySettings()); }
    catch { console.warn("[llm-history] retention cleanup failed"); }
    finally { running = false; }
  };
  const timer = setInterval(() => void sweep(), 15 * 60_000);
  timer.unref();
  void sweep();
  return () => clearInterval(timer);
}
