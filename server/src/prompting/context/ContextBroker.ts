import { selectContextBlocks } from "../core/contextSelection";
import type { ContextPolicy, PromptContextBlock, PromptContextRequirement } from "../core/promptTypes";
import { ContextResolverRegistry } from "./ContextResolverRegistry";
import type { ContextBrokerResolution, ContextBrokerResolveInput, PromptContextResolverResult } from "./types";

export function estimateContextTokens(content: string): number {
  return Math.max(1, Math.ceil(content.trim().length / 3));
}

function stringifyContextError(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message.trim();
  }
  if (typeof error === "string" && error.trim().length > 0) {
    return error.trim();
  }
  return String(error);
}

function toBlocks(value: PromptContextResolverResult): PromptContextBlock[] {
  if (!value) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

function mergeRequirement(
  current: PromptContextRequirement | undefined,
  next: PromptContextRequirement,
): PromptContextRequirement {
  if (!current) {
    return next;
  }
  return {
    ...current,
    ...next,
    required: Boolean(current.required || next.required),
    priority: Math.max(current.priority, next.priority),
    maxTokens: current.maxTokens && next.maxTokens
      ? Math.min(current.maxTokens, next.maxTokens)
      : current.maxTokens ?? next.maxTokens,
    freshness: next.freshness ?? current.freshness,
    sourceHint: next.sourceHint ?? current.sourceHint,
  };
}

function dedupeRequirements(requirements: PromptContextRequirement[]): PromptContextRequirement[] {
  const byGroup = new Map<string, PromptContextRequirement>();
  for (const requirement of requirements) {
    byGroup.set(requirement.group, mergeRequirement(byGroup.get(requirement.group), requirement));
  }
  return [...byGroup.values()].sort((left, right) => right.priority - left.priority);
}

function normalizeBlock(block: PromptContextBlock, requirement: PromptContextRequirement): PromptContextBlock {
  const content = block.content.trim();
  return {
    ...block,
    group: block.group || requirement.group,
    priority: Number.isFinite(block.priority) ? block.priority : requirement.priority,
    required: Boolean(block.required || requirement.required),
    estimatedTokens: block.estimatedTokens > 0 ? block.estimatedTokens : estimateContextTokens(content),
    content,
  };
}

function buildSelectionPolicy(input: {
  requirements: PromptContextRequirement[];
  rawBlocks: PromptContextBlock[];
  maxTokensBudget?: number;
}): ContextPolicy {
  const totalTokens = input.rawBlocks.reduce((sum, block) => sum + block.estimatedTokens, 0);
  return {
    maxTokensBudget: input.maxTokensBudget ?? totalTokens,
    requiredGroups: input.requirements
      .filter((requirement) => requirement.required)
      .map((requirement) => requirement.group),
    preferredGroups: input.requirements
      .filter((requirement) => !requirement.required)
      .map((requirement) => requirement.group),
  };
}

export class ContextBroker {
  constructor(private readonly registry: ContextResolverRegistry) {}

  async resolve(input: ContextBrokerResolveInput): Promise<ContextBrokerResolution> {
    const requirements = dedupeRequirements(input.requirements ?? []);
    const rawBlocks: PromptContextBlock[] = [];
    const missingRequiredGroups: string[] = [];
    const resolverErrors: ContextBrokerResolution["resolverErrors"] = [];

    for (const requirement of requirements) {
      const resolver = this.registry.get(requirement.group);
      if (!resolver) {
        if (requirement.required) {
          missingRequiredGroups.push(requirement.group);
        }
        continue;
      }

      try {
        const mode = input.mode ?? requirement.freshness ?? "snapshot";
        const blocks = toBlocks(await resolver.resolve({
          executionContext: input.executionContext,
          requirement,
          mode,
        })).map((block) => normalizeBlock(block, requirement));
        if (blocks.length === 0 && requirement.required) {
          missingRequiredGroups.push(requirement.group);
        }
        rawBlocks.push(...blocks);
      } catch (error) {
        resolverErrors.push({
          group: requirement.group,
          message: stringifyContextError(error),
        });
        if (requirement.required) {
          missingRequiredGroups.push(requirement.group);
        }
      }
    }

    const selection = selectContextBlocks(rawBlocks, buildSelectionPolicy({
      requirements,
      rawBlocks,
      maxTokensBudget: input.maxTokensBudget,
    }));

    return {
      blocks: selection.selectedBlocks,
      selectedBlockIds: selection.selectedBlocks.map((block) => block.id),
      droppedBlockIds: selection.droppedBlockIds,
      summarizedBlockIds: selection.summarizedBlockIds,
      estimatedInputTokens: selection.estimatedTokens,
      missingRequiredGroups: [...new Set(missingRequiredGroups)],
      resolverErrors,
    };
  }
}
