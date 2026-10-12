import type { PromptRenderContext } from "../promptTypes";
const scopes = ["book", "volume", "request"] as const;
export function renderCacheOrderedContextBlocks(context: PromptRenderContext, emptyLabel = "none"): string {
    return scopes.flatMap(scope => context.blocks.filter(b => (b.reuseScope ?? "request") === scope).map(b => b.content.trim()).filter(Boolean)).join("\n\n") || emptyLabel;
}
export function renderCacheContextSections(context: PromptRenderContext): {
    stable: string;
    dynamic: string;
} {
    const render = (stable: boolean) => renderCacheOrderedContextBlocks({ ...context, blocks: context.blocks.filter(b => ((b.reuseScope ?? "request") !== "request") === stable) }, "");
    return { stable: render(true), dynamic: render(false) };
}
export { declarePromptCacheBoundary } from "../../../platform/llm/cache";
