import { AsyncLocalStorage } from "node:async_hooks";
import type { LlmTokenUsageSnapshot, UsageProtocol } from "../domain/types";
export interface InvocationUsageRecord {
    invocationId: string;
    provider: string | null;
    model: string | null;
    requestProtocol: UsageProtocol;
    runId: string | null;
    generationJobId: string | null;
    workflowTaskId: string | null;
    novelId: string | null;
    chapterId: string | null;
    stage: string | null;
    promptId: string | null;
    promptVersion: string | null;
    status: "completed" | "partial" | "failed";
    startedAt: Date;
    finishedAt: Date;
    usage: LlmTokenUsageSnapshot | null;
}
export type InvocationUsageListener = (record: InvocationUsageRecord) => void | Promise<void>;
const store = new AsyncLocalStorage<readonly InvocationUsageListener[]>();
export function runWithInvocationUsageObserver<T>(listener: InvocationUsageListener, runner: () => T): T {
    return store.run([...(store.getStore() ?? []), listener], runner);
}
export function captureInvocationUsageObserver(): InvocationUsageListener {
    const listeners = store.getStore() ?? [];
    return async (record) => { for (const listener of listeners) {
        try {
            await listener(record);
        }
        catch {
            console.warn("[llm-usage] observer failed", record.invocationId);
        }
    } };
}
