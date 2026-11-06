import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import type { ChatOpenAI } from "@langchain/openai";
import { PrismaInvocationUsageRepository, captureInvocationUsageObserver, extractLlmTokenUsage, mergeStreamTokenUsage, getInvocationHistorySettings, invocationPayloadStore, type InvocationUsageRecord, type LlmTokenUsageSnapshot } from "../../platform/llm/usage";
import { prisma } from "../../db/prisma";
import { getLlmUsageTrackingContext, recordTrackedLlmUsage, runWithLlmUsageTracking, type LlmUsageTrackingMeta } from "../usageTracking";
import { nextInvocationAttempt, attachInvocationParse, invocationMessages, invocationChunkText, hasInvocationToken } from "./observation";
const LLM_USAGE_PATCHED = Symbol("LLM_USAGE_PATCHED");
type PatchableChatOpenAI = ChatOpenAI & { [LLM_USAGE_PATCHED]?: boolean };
// Object identity distinguishes SDK batch children already observed through invoke.
const batchObservations = new AsyncLocalStorage<readonly WeakSet<object>[]>();
function beginAttempt(meta: LlmUsageTrackingMeta | undefined, input: unknown, secrets: readonly string[], startedAt = new Date()) {
    const context = getLlmUsageTrackingContext();
    const notify = captureInvocationUsageObserver();
    const invocationId = randomUUID();
    const identity = nextInvocationAttempt(invocationId);
    const parseScope = () => attachInvocationParse(invocationId, secrets);
    const settings = getInvocationHistorySettings().catch(() => { console.warn("[llm-history] settings read failed"); return { enabled: false }; });
    let firstTokenMs: number | null = null;
    let response = "";
    const protocol = meta?.requestProtocol === "anthropic" ? "anthropic" : "openai-compatible";
    let finished = false;
    return { async observe(chunk: unknown, streaming = true) {
            if (streaming && firstTokenMs === null && hasInvocationToken(chunk)) firstTokenMs = Date.now() - startedAt.getTime();
            if ((await settings).enabled) response += invocationChunkText(chunk);
        }, decode: (output: unknown) => extractLlmTokenUsage(output, { protocol }),
        async finish(usage: LlmTokenUsageSnapshot | null, status: InvocationUsageRecord["status"], error?: unknown) {
            if (finished)
                return;
            finished = true;
            const record: InvocationUsageRecord = { invocationId, ...identity, firstTokenMs, durationMs: Date.now() - startedAt.getTime(), structuredMode: meta?.structuredMode ?? null, startedAt, finishedAt: new Date(), usage, status,
                provider: meta?.provider ? String(meta.provider) : null, model: meta?.model ?? null, requestProtocol: protocol,
                runId: context?.directorNextRunId ?? null, generationJobId: context?.generationJobId ?? null,
                workflowTaskId: context?.workflowTaskId ?? null, novelId: context?.novelId ?? meta?.promptMeta?.novelId ?? null,
                chapterId: meta?.promptMeta?.chapterId ?? null, stage: meta?.promptMeta?.stage ?? context?.stage ?? null,
                promptId: meta?.promptMeta?.promptId ?? null, promptVersion: meta?.promptMeta?.promptVersion ?? null };
            await notify(record);
            await new PrismaInvocationUsageRepository(prisma.llmInvocationUsageRecord).record(record).then(async () => {
                if ((await settings).enabled) {
                    await invocationPayloadStore.save(invocationId, { messages: invocationMessages(input), response, parsed: null,
                        error: error ? error instanceof Error ? error.message : String(error) : status === "completed" ? null : "Stream did not complete" }, secrets);
                    parseScope();
                }
            }).catch(() => console.warn("[llm-usage] journal or payload write failed", record.invocationId));
            await runWithLlmUsageTracking(context ?? {}, () => recordTrackedLlmUsage(usage, { ...identity, invocationId, firstTokenMs, structuredMode: meta?.structuredMode, meta, status, durationMs: record.durationMs }));
        } };
}
export function attachLLMUsageTracking(llm: ChatOpenAI, meta?: LlmUsageTrackingMeta, secrets: readonly string[] = []): ChatOpenAI {
    const patchable = llm as PatchableChatOpenAI;
    if (patchable[LLM_USAGE_PATCHED])
        return llm;
    const invoke = llm.invoke.bind(llm), stream = llm.stream.bind(llm), batch = llm.batch.bind(llm);
    patchable.invoke = (async (...args: Parameters<ChatOpenAI["invoke"]>) => {
        const attempt = beginAttempt(meta, args[0], secrets);
        try {
            const result = await invoke(...args);
            if (result && typeof result === 'object')
                for (const scope of batchObservations.getStore() ?? [])
                    scope.add(result);
            await attempt.observe(result, false);
            await attempt.finish(attempt.decode(result), "completed");
            return result;
        }
        catch (error) {
            if (error && typeof error === "object")
                for (const scope of batchObservations.getStore() ?? [])
                    scope.add(error);
            await attempt.finish(null, "failed", error);
            throw error;
        }
    }) as ChatOpenAI["invoke"];
    patchable.stream = (async (...args: Parameters<ChatOpenAI["stream"]>) => {
        const attempt = beginAttempt(meta, args[0], secrets);
        let raw: AsyncIterable<unknown>;
        try {
            raw = await stream(...args);
        }
        catch (error) {
            await attempt.finish(null, "failed", error);
            throw error;
        }
        return { async *[Symbol.asyncIterator]() {
                let usage: LlmTokenUsageSnapshot | null = null;
                let completed = false;
                let streamError: unknown;
                let hasOutput = false;
                try {
                    for await (const chunk of raw) {
                        hasOutput ||= hasInvocationToken(chunk);
                        await attempt.observe(chunk);
                        usage = mergeStreamTokenUsage(usage, attempt.decode(chunk));
                        yield chunk;
                    }
                    completed = true;
                }
                catch (error) { streamError = error; throw error; }
                finally {
                    await attempt.finish(usage, completed ? "completed" : hasOutput || usage ? "partial" : "failed", streamError);
                }
            } } as Awaited<ReturnType<ChatOpenAI["stream"]>>;
    }) as ChatOpenAI["stream"];
    patchable.batch = (async (...args: Parameters<ChatOpenAI["batch"]>) => {
        const startedAt = new Date();
        const observedResults = new WeakSet<object>();
        const scopes = [...(batchObservations.getStore() ?? []), observedResults];
        const result = await batchObservations.run(scopes, () => batch(...args));
        for (const [index, item] of result.entries()) {
            if (item && typeof item === 'object' && observedResults.has(item))
                continue;
            const attempt = beginAttempt(meta, args[0][index], secrets, startedAt);
            await attempt.observe(item, false);
            await attempt.finish(attempt.decode(item), item instanceof Error ? "failed" : "completed", item instanceof Error ? item : undefined);
            if (item && typeof item === 'object')
                for (const scope of scopes)
                    scope.add(item);
        }
        return result;
    }) as ChatOpenAI["batch"];
    Object.defineProperty(patchable, LLM_USAGE_PATCHED, { value: true });
    return llm;
}
