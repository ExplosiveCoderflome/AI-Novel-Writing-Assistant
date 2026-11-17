import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import type { LlmInvocationPayloadData } from "@ai-novel/shared/types/llmUsage";
import { invocationPayloadStore } from "../../platform/llm/usage";
import { prisma } from "../../db/prisma";

interface AttemptChain { id: string; next: number; parentId: string | null }
interface ParseScope { attempt?: { id: string; secrets: readonly string[]; hasPayload: boolean }; recorded?: boolean }
const chains = new AsyncLocalStorage<AttemptChain>();
const parses = new AsyncLocalStorage<ParseScope>();

export function runWithInvocationChain<T>(run: () => Promise<T>): Promise<T> {
  return chains.getStore() ? run() : chains.run({ id: randomUUID(), next: 0, parentId: null }, run);
}
export function nextInvocationAttempt(id: string) {
  const chain = chains.getStore();
  const identity = { chainId: chain?.id ?? id, attemptNumber: chain ? ++chain.next : 1, parentInvocationId: chain?.parentId ?? null };
  if (chain) chain.parentId = id;
  return identity;
}
export function captureInvocationParse(id: string, secrets: readonly string[]): (hasPayload: boolean) => void {
  const scope = parses.getStore();
  return hasPayload => {
    if (scope && !scope.attempt) scope.attempt = { id, secrets, hasPayload };
  };
}
async function saveParse(attempt: NonNullable<ParseScope["attempt"]>, parsed: unknown, error: string | null): Promise<void> {
  await Promise.all([
    prisma.llmInvocationUsageRecord.updateMany({
      where: { id: attempt.id },
      data: { structureStatus: error === null ? "valid" : "invalid" },
    }).catch(() => console.warn("[llm-usage] structure status write failed", attempt.id)),
    attempt.hasPayload ? invocationPayloadStore.setParse(attempt.id, parsed, error, attempt.secrets)
      .catch(() => console.warn("[llm-history] parse result write failed", attempt.id)) : undefined,
  ]);
}
export async function recordInvocationParseFailure(error: string): Promise<void> {
  const scope = parses.getStore();
  if (!scope?.attempt) return;
  scope.recorded = true;
  await saveParse(scope.attempt, null, error);
}
/** A parse scope owns its first physical request; nested JSON repair owns a separate scope. */
export function createInvocationParseScope() {
  const scope: ParseScope = {};
  const chain = chains.getStore() ?? { id: randomUUID(), next: 0, parentId: null };
  return {
    run<T>(operation: () => T): T {
      return chains.run(chain, () => parses.run(scope, operation));
    },
    async save(parsed: unknown, error: string | null) {
      if (scope.attempt && !scope.recorded) {
        scope.recorded = true;
        await saveParse(scope.attempt, parsed, error);
      }
    },
  };
}
export function observeInvocationParse<T>(run: () => Promise<T>, result: (value: T) => unknown): Promise<T> {
  const parse = createInvocationParseScope();
  return parse.run(async () => {
    try { const value = await run(); await parse.save(result(value), null); return value; }
    catch (error) { await parse.save(null, error instanceof Error ? error.message : String(error)); throw error; }
  });
}

export function invocationMessages(input: unknown): LlmInvocationPayloadData["messages"] {
  if (typeof input === "string") return [{ role: "user", content: input }];
  const messages = Array.isArray(input) ? input : (input as { toChatMessages?: () => unknown[] })?.toChatMessages?.() ?? [];
  return messages.map((message: any) => typeof message === "string" ? { role: "user", content: message }
    : Array.isArray(message) ? { role: String(message[0]), content: message[1] }
    : { role: message.role ?? message.getType?.() ?? "unknown", content: message.content });
}
export function invocationChunkText(chunk: any): string {
  const content = typeof chunk?.content === "string" ? chunk.content : Array.isArray(chunk?.content)
    ? chunk.content.map((block: any) => block.text ?? block.thinking ?? "").join("") : "";
  const tools = (chunk?.tool_call_chunks ?? []).map((call: any) => call.args ?? "").join("")
    || (chunk?.tool_calls ?? []).map((call: any) => JSON.stringify(call.args)).join("");
  return content + tools;
}
export function hasInvocationToken(chunk: any): boolean {
  return Boolean(invocationChunkText(chunk) || chunk?.additional_kwargs?.reasoning_content || chunk?.additional_kwargs?.reasoning);
}
