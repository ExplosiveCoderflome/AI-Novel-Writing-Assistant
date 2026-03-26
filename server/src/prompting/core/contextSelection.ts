import { summarizeContextBlock } from "./contextBudget";
import type { ContextPolicy, PromptContextBlock } from "./promptTypes";

export interface ContextSelectionResult {
  selectedBlocks: PromptContextBlock[];
  droppedBlockIds: string[];
  summarizedBlockIds: string[];
  estimatedTokens: number;
}

function dedupeConflictBlocks(blocks: PromptContextBlock[]): { kept: PromptContextBlock[]; droppedIds: string[] } {
  const droppedIds: string[] = [];
  const byConflictGroup = new Map<string, PromptContextBlock>();
  const kept: PromptContextBlock[] = [];

  for (const block of blocks) {
    if (!block.conflictGroup) {
      kept.push(block);
      continue;
    }

    const previous = byConflictGroup.get(block.conflictGroup);
    if (!previous) {
      byConflictGroup.set(block.conflictGroup, block);
      continue;
    }

    const previousFreshness = previous.freshness ?? 0;
    const nextFreshness = block.freshness ?? 0;
    const shouldReplace = nextFreshness > previousFreshness
      || (nextFreshness === previousFreshness && block.priority > previous.priority)
      || (nextFreshness === previousFreshness && block.priority === previous.priority && block.required && !previous.required);
    const mergedBlock = {
      ...block,
      required: block.required || previous.required,
      allowSummary: block.allowSummary && previous.allowSummary,
    } satisfies PromptContextBlock;

    if (shouldReplace) {
      droppedIds.push(previous.id);
      byConflictGroup.set(block.conflictGroup, mergedBlock);
    } else {
      if (block.required && !previous.required) {
        byConflictGroup.set(block.conflictGroup, {
          ...previous,
          required: true,
        });
      }
      droppedIds.push(block.id);
    }
  }

  return {
    kept: [...kept, ...byConflictGroup.values()],
    droppedIds,
  };
}

function sortOptionalBlocks(blocks: PromptContextBlock[], policy: ContextPolicy): PromptContextBlock[] {
  const preferred = new Set(policy.preferredGroups ?? []);
  const dropOrder = new Map((policy.dropOrder ?? []).map((group, index) => [group, index]));

  return [...blocks].sort((left, right) => {
    const leftPreferred = preferred.has(left.group) ? 1 : 0;
    const rightPreferred = preferred.has(right.group) ? 1 : 0;
    if (leftPreferred !== rightPreferred) {
      return rightPreferred - leftPreferred;
    }

    if (left.priority !== right.priority) {
      return right.priority - left.priority;
    }

    const leftDrop = dropOrder.get(left.group) ?? Number.MAX_SAFE_INTEGER;
    const rightDrop = dropOrder.get(right.group) ?? Number.MAX_SAFE_INTEGER;
    if (leftDrop !== rightDrop) {
      return leftDrop - rightDrop;
    }

    const leftFreshness = left.freshness ?? 0;
    const rightFreshness = right.freshness ?? 0;
    if (leftFreshness !== rightFreshness) {
      return rightFreshness - leftFreshness;
    }

    return left.id.localeCompare(right.id);
  });
}

export function selectContextBlocks(blocks: PromptContextBlock[], policy: ContextPolicy): ContextSelectionResult {
  const normalizedBlocks = blocks.filter((block) => block.content.trim().length > 0 && block.estimatedTokens > 0);
  const deduped = dedupeConflictBlocks(normalizedBlocks);
  const requiredGroups = new Set(policy.requiredGroups ?? []);
  const requiredBlocks = deduped.kept
    .filter((block) => block.required || requiredGroups.has(block.group))
    .sort((left, right) => right.priority - left.priority);
  const optionalBlocks = sortOptionalBlocks(
    deduped.kept.filter((block) => !requiredBlocks.some((required) => required.id === block.id)),
    policy,
  );

  const selectedBlocks: PromptContextBlock[] = [];
  const droppedBlockIds = [...deduped.droppedIds];
  const summarizedBlockIds: string[] = [];
  let usedTokens = 0;

  const addBlock = (block: PromptContextBlock) => {
    selectedBlocks.push(block);
    usedTokens += block.estimatedTokens;
  };

  for (const block of requiredBlocks) {
    if (usedTokens + block.estimatedTokens <= policy.maxTokensBudget) {
      addBlock(block);
      continue;
    }

    const remaining = Math.max(0, policy.maxTokensBudget - usedTokens);
    const summarized = summarizeContextBlock(block, remaining);
    if (summarized && usedTokens + summarized.estimatedTokens <= policy.maxTokensBudget) {
      if (summarized !== block && !summarizedBlockIds.includes(block.id)) {
        summarizedBlockIds.push(block.id);
      }
      addBlock(summarized);
      continue;
    }

    addBlock(block);
  }

  for (const block of optionalBlocks) {
    if (usedTokens + block.estimatedTokens <= policy.maxTokensBudget) {
      addBlock(block);
      continue;
    }

    const remaining = Math.max(0, policy.maxTokensBudget - usedTokens);
    const summarized = summarizeContextBlock(block, remaining);
    if (summarized && usedTokens + summarized.estimatedTokens <= policy.maxTokensBudget) {
      if (summarized !== block && !summarizedBlockIds.includes(block.id)) {
        summarizedBlockIds.push(block.id);
      }
      addBlock(summarized);
      continue;
    }

    droppedBlockIds.push(block.id);
  }

  return {
    selectedBlocks,
    droppedBlockIds,
    summarizedBlockIds,
    estimatedTokens: usedTokens,
  };
}
