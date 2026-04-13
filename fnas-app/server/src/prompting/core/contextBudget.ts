import type { PromptContextBlock } from "./promptTypes";

export function estimateTextTokens(text: string): number {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return 0;
  }
  return Math.max(1, Math.ceil(normalized.length / 4));
}

export function createContextBlock(input: {
  id: string;
  group: string;
  priority: number;
  required?: boolean;
  content: string;
  conflictGroup?: string;
  freshness?: number;
  allowSummary?: boolean;
}): PromptContextBlock {
  return {
    id: input.id,
    group: input.group,
    priority: input.priority,
    required: input.required ?? false,
    content: input.content.trim(),
    estimatedTokens: estimateTextTokens(input.content),
    conflictGroup: input.conflictGroup,
    freshness: input.freshness,
    allowSummary: input.allowSummary ?? true,
  };
}

export function summarizeContextBlock(block: PromptContextBlock, maxTokens: number): PromptContextBlock | null {
  if (!block.allowSummary || maxTokens <= 0) {
    return null;
  }

  const lines = block.content
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) {
    return null;
  }

  const header = lines[0];
  const body = lines.slice(1);
  const summaryLines = [header];
  let usedTokens = estimateTextTokens(header);

  for (const line of body) {
    const nextTokens = estimateTextTokens(line);
    if (usedTokens + nextTokens > maxTokens) {
      break;
    }
    summaryLines.push(line);
    usedTokens += nextTokens;
  }

  if (summaryLines.length === lines.length && block.estimatedTokens <= maxTokens) {
    return block;
  }

  const content = `${summaryLines.join("\n")}\n[context summarized]`;
  return {
    ...block,
    content,
    estimatedTokens: estimateTextTokens(content),
  };
}
