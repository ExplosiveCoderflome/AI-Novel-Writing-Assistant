import { unknownCache, type LlmTokenUsageSnapshot } from "./types";
/** Different physical calls add; absent reports invalidate aggregate coverage. */
export function summarizeUsage(items: readonly (LlmTokenUsageSnapshot | null)[]): LlmTokenUsageSnapshot | null {
    const known = items.filter((item): item is LlmTokenUsageSnapshot => item !== null);
    if (!known.length)
        return null;
    const sum = (key: "promptTokens" | "completionTokens" | "totalTokens") => known.reduce((n, u) => n + u[key], 0);
    const complete = items.every(u => u?.inputCache?.cacheUsageStatus === "reported");
    const reasoning = known.some(u => u.reasoningTokens !== undefined);
    return { promptTokens: sum("promptTokens"), completionTokens: sum("completionTokens"), totalTokens: sum("totalTokens"),
        ...(reasoning ? { reasoningTokens: known.reduce((n, u) => n + (u.reasoningTokens ?? 0), 0) } : {}),
        inputCache: complete ? {
            cacheHitTokens: known.reduce((n, u) => n + u.inputCache!.cacheHitTokens!, 0),
            cacheMissTokens: known.reduce((n, u) => n + u.inputCache!.cacheMissTokens!, 0),
            cacheWriteTokens: known.every(u => u.inputCache?.cacheWriteTokens !== null) ? known.reduce((n, u) => n + u.inputCache!.cacheWriteTokens!, 0) : null,
            cacheUsageStatus: "reported",
        } : unknownCache(known.some(u => u.inputCache?.cacheUsageStatus === "invalid") ? "invalid" : "unavailable"),
    };
}
