import type { PrismaClient } from "@prisma/client";
import type { InvocationUsageRecord } from "../application/InvocationUsageObserver";
export type UsageDelegate = Pick<PrismaClient["llmInvocationUsageRecord"], "create" | "findUnique" | "findMany">;
export class PrismaInvocationUsageRepository {
    constructor(private readonly rows: UsageDelegate, private readonly warn: (...args: unknown[]) => void = console.warn) { }
    async record(record: InvocationUsageRecord): Promise<void> {
        const { invocationId, usage, ...identity } = record;
        const count = (n: number | null | undefined) => n != null && Number.isSafeInteger(n) && n >= 0 && n <= 2147483647 ? n : null;
        const invalid = usage && [usage.promptTokens, usage.completionTokens, usage.totalTokens, usage.inputCache?.cacheHitTokens, usage.inputCache?.cacheMissTokens, usage.inputCache?.cacheWriteTokens].some(n => n != null && count(n) === null);
        const data = { id: invocationId, ...identity, promptTokens: invalid ? null : count(usage?.promptTokens), completionTokens: invalid ? null : count(usage?.completionTokens), totalTokens: invalid ? null : count(usage?.totalTokens),
            cacheHitTokens: invalid ? null : count(usage?.inputCache?.cacheHitTokens), cacheMissTokens: invalid ? null : count(usage?.inputCache?.cacheMissTokens), cacheWriteTokens: invalid ? null : count(usage?.inputCache?.cacheWriteTokens),
            cacheUsageStatus: invalid ? "invalid" : usage?.inputCache?.cacheUsageStatus ?? "unavailable", cacheDiagnostic: invalid ? "token_count_out_of_database_range" : null };
        try {
            await this.rows.create({ data });
        }
        catch (error) {
            if ((error as {
                code?: string;
            })?.code !== "P2002")
                throw error;
            const existing = await this.rows.findUnique({ where: { id: invocationId } });
            const same = existing && Object.entries(data).every(([key, value]) => {
                const before = (existing as unknown as Record<string, unknown>)[key];
                return value instanceof Date ? before instanceof Date && before.getTime() === value.getTime() : before === value;
            });
            if (!same)
                this.warn("[llm-usage] invocation identity conflict", invocationId);
        }
    }
}
