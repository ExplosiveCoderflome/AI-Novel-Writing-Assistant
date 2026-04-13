import type { PromptRenderContext } from "./promptTypes";

export function renderSelectedContextBlocks(context: PromptRenderContext, emptyLabel = "none"): string {
  if (context.blocks.length === 0) {
    return emptyLabel;
  }
  return context.blocks
    .map((block) => block.content.trim())
    .filter(Boolean)
    .join("\n\n");
}
