import type { CacheCapability, PromptCacheBoundary } from "../domain/CacheCapabilities";
const boundaries = new WeakMap<object, PromptCacheBoundary>();
export function declarePromptCacheBoundary(messages: object, boundary: PromptCacheBoundary): void { boundaries.set(messages, { ...boundary }); }
export function getPromptCacheBoundary(messages: unknown): PromptCacheBoundary | null { return messages && typeof messages === "object" ? boundaries.get(messages) ?? null : null; }
export function applyCacheRequestPolicy<T extends Record<string, unknown>>(request: T, capability: CacheCapability, boundary: PromptCacheBoundary | null): T {
    if (process.env.LLM_EXPLICIT_CACHE_ENABLED === "false" || capability.mode !== "explicit" || !boundary || !Number.isInteger(boundary.messageIndex) || boundary.messageIndex < 0)
        return request;
    const contentIndex = boundary.contentBlockIndex ?? 0;
    if (!Number.isInteger(contentIndex) || contentIndex < 0)
        return request;
    const mark = (content: unknown): unknown => {
        const blocks = typeof content === "string" ? [{ type: "text", text: content }] : Array.isArray(content) ? content : null;
        if (!blocks || contentIndex >= blocks.length)
            return content;
        const block = blocks[contentIndex];
        if (!block || block.type !== "text" || typeof block.text !== "string" || !block.text.trim() || block.cache_control)
            return content;
        return blocks.map((b, i) => i === contentIndex ? { ...b, cache_control: { type: "ephemeral" } } : b);
    };
    if (capability.protocol === "anthropic" && boundary.messageIndex === 0) {
        const system = mark(request.system);
        return system === request.system ? request : { ...request, system };
    }
    const messageIndex = capability.protocol === "anthropic" ? boundary.messageIndex - 1 : boundary.messageIndex;
    const messages = request.messages;
    if (!Array.isArray(messages) || messageIndex >= messages.length)
        return request;
    const target = messages[messageIndex];
    if (!target || typeof target !== "object")
        return request;
    const content = mark(target.content);
    return content === target.content ? request : { ...request, messages: messages.map((m, i) => i === messageIndex ? { ...m, content } : m) };
}
