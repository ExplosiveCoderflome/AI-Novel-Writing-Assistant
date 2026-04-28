import type {
  ChapterRepairContext,
  ChapterReviewContext,
  ChapterWriteContext,
  MacroConstraintContext,
} from "@ai-novel/shared/types/chapterRuntime";
import type {
  DirectorManualEditInventory,
  DirectorWorkspaceInventory,
} from "@ai-novel/shared/types/directorRuntime";
import { createContextBlock } from "../core/contextBudget";
import type { PromptContextBlock } from "../core/promptTypes";
import {
  buildChapterRepairContextBlocks,
  buildChapterReviewContextBlocks,
  buildChapterWriterContextBlocks,
  type ChapterWriterBlockMode,
} from "../prompts/novel/chapterLayeredContext";
import { buildDirectorManualEditImpactContextBlocks } from "../prompts/novel/directorManualEditImpact.prompts";
import { buildDirectorWorkspaceAnalysisContextBlocks } from "../prompts/novel/directorWorkspaceAnalysis.prompts";
import type { PromptContextResolver, PromptExecutionContext } from "./types";

const CHAPTER_CONTEXT_GROUPS = [
  "book_contract",
  "story_macro",
  "chapter_mission",
  "state_goal",
  "volume_window",
  "participant_subset",
  "character_dynamics",
  "character_resource",
  "character_resource_context",
  "local_state",
  "open_conflicts",
  "recent_chapters",
  "opening_constraints",
  "style_contract",
  "continuation_constraints",
  "payoff_ledger",
  "scene_plan",
  "structure_obligations",
  "world_rules",
  "world_slice",
  "historical_issues",
  "rag_context",
  "scene_contract",
  "current_draft_excerpt",
] as const;

const WORKSPACE_CONTEXT_GROUPS = [
  "workspace_inventory",
  "manual_edit_inventory",
] as const;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function getMetadata(context: PromptExecutionContext): Record<string, unknown> {
  return asRecord(context.metadata) ?? {};
}

function getString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function readChapterBlockMode(metadata: Record<string, unknown>): ChapterWriterBlockMode {
  const mode = getString(metadata.chapterBlockMode);
  return mode === "incremental" || mode === "review" || mode === "repair" ? mode : "full";
}

function resolveReviewContext(metadata: Record<string, unknown>): ChapterReviewContext | null {
  return asRecord(metadata.chapterReviewContext) as ChapterReviewContext | null;
}

function resolveRepairContext(metadata: Record<string, unknown>): ChapterRepairContext | null {
  return asRecord(metadata.chapterRepairContext) as ChapterRepairContext | null;
}

function resolveWriteContext(metadata: Record<string, unknown>): ChapterWriteContext | null {
  const explicit = asRecord(metadata.chapterWriteContext) as ChapterWriteContext | null;
  if (explicit) {
    return explicit;
  }
  const reviewContext = resolveReviewContext(metadata);
  if (reviewContext) {
    return reviewContext as unknown as ChapterWriteContext;
  }
  return resolveRepairContext(metadata)?.writeContext ?? null;
}

function buildBookContractBlock(writeContext: ChapterWriteContext): PromptContextBlock {
  const contract = writeContext.bookContract;
  return createContextBlock({
    id: "book_contract",
    group: "book_contract",
    priority: 100,
    required: true,
    content: [
      `Title: ${contract.title}`,
      `Genre: ${contract.genre}`,
      `Target audience: ${contract.targetAudience}`,
      `Selling point: ${contract.sellingPoint}`,
      `First 30 chapter promise: ${contract.first30ChapterPromise}`,
      `Narrative POV: ${contract.narrativePov}`,
      `Pace preference: ${contract.pacePreference}`,
      `Emotion intensity: ${contract.emotionIntensity}`,
      contract.toneGuardrails.length > 0 ? `Tone guardrails: ${contract.toneGuardrails.join(" | ")}` : "",
      contract.hardConstraints.length > 0 ? `Hard constraints: ${contract.hardConstraints.join(" | ")}` : "",
    ].filter(Boolean).join("\n"),
  });
}

function buildStoryMacroBlock(macro: MacroConstraintContext | null): PromptContextBlock | null {
  if (!macro) {
    return null;
  }
  return createContextBlock({
    id: "story_macro",
    group: "story_macro",
    priority: 98,
    content: [
      `Selling point: ${macro.sellingPoint}`,
      `Core conflict: ${macro.coreConflict}`,
      `Main hook: ${macro.mainHook}`,
      `Progression loop: ${macro.progressionLoop}`,
      `Growth path: ${macro.growthPath}`,
      `Ending flavor: ${macro.endingFlavor}`,
      macro.hardConstraints.length > 0 ? `Hard constraints: ${macro.hardConstraints.join(" | ")}` : "",
    ].filter(Boolean).join("\n"),
  });
}

function isPromptContextBlock(value: unknown): value is PromptContextBlock {
  const record = asRecord(value);
  return Boolean(
    record
    && typeof record.id === "string"
    && typeof record.group === "string"
    && typeof record.priority === "number"
    && typeof record.content === "string",
  );
}

function readExtraBlocks(metadata: Record<string, unknown>): PromptContextBlock[] {
  const raw = metadata.extraContextBlocks;
  return Array.isArray(raw) ? raw.filter(isPromptContextBlock) : [];
}

function buildChapterRuntimeBlocks(context: PromptExecutionContext): PromptContextBlock[] {
  const metadata = getMetadata(context);
  const writeContext = resolveWriteContext(metadata);
  const blocks = readExtraBlocks(metadata);
  if (!writeContext) {
    return blocks;
  }

  blocks.push(buildBookContractBlock(writeContext));
  const storyMacroBlock = buildStoryMacroBlock(writeContext.macroConstraints);
  if (storyMacroBlock) {
    blocks.push(storyMacroBlock);
  }

  const repairContext = resolveRepairContext(metadata);
  if (repairContext) {
    blocks.push(...buildChapterRepairContextBlocks(repairContext));
    return blocks;
  }

  const reviewContext = resolveReviewContext(metadata);
  if (reviewContext) {
    blocks.push(...buildChapterReviewContextBlocks(reviewContext));
    return blocks;
  }

  blocks.push(...buildChapterWriterContextBlocks(writeContext, {
    mode: readChapterBlockMode(metadata),
  }));
  return blocks;
}

function buildRagContextBlock(context: PromptExecutionContext): PromptContextBlock | null {
  const ragContext = getString(getMetadata(context).ragContext);
  if (!ragContext) {
    return null;
  }
  return createContextBlock({
    id: "rag_context",
    group: "rag_context",
    priority: 60,
    content: ragContext,
  });
}

function resolveWorkspaceInventory(context: PromptExecutionContext): DirectorWorkspaceInventory | null {
  return asRecord(getMetadata(context).workspaceInventory) as DirectorWorkspaceInventory | null;
}

function resolveManualEditInventory(context: PromptExecutionContext): DirectorManualEditInventory | null {
  return asRecord(getMetadata(context).manualEditInventory) as DirectorManualEditInventory | null;
}

function aliasBlockGroup(block: PromptContextBlock, group: string): PromptContextBlock {
  return {
    ...block,
    id: block.id === block.group ? group : `${group}:${block.id}`,
    group,
  };
}

function resolveRuntimeBlocksForGroup(group: string, context: PromptExecutionContext): PromptContextBlock[] {
  const blocks = buildChapterRuntimeBlocks(context);
  const directMatches = blocks.filter((block) => block.group === group);
  if (directMatches.length > 0) {
    return directMatches;
  }

  if (group === "character_resource") {
    return blocks
      .filter((block) => block.group === "character_resource_context")
      .map((block) => aliasBlockGroup(block, group));
  }
  if (group === "world_slice") {
    return blocks
      .filter((block) => block.group === "world_rules")
      .map((block) => aliasBlockGroup(block, group));
  }
  if (group === "rag_context") {
    const ragBlock = buildRagContextBlock(context);
    return ragBlock ? [ragBlock] : [];
  }
  if (group === "workspace_inventory") {
    const inventory = resolveWorkspaceInventory(context);
    return inventory ? buildDirectorWorkspaceAnalysisContextBlocks({ inventory }) : [];
  }
  if (group === "manual_edit_inventory") {
    const inventory = resolveWorkspaceInventory(context);
    const editInventory = resolveManualEditInventory(context);
    return inventory && editInventory
      ? buildDirectorManualEditImpactContextBlocks({ inventory, editInventory })
        .filter((block) => block.group === "manual_edit_inventory")
      : [];
  }
  return [];
}

function createRuntimeContextResolver(group: string): PromptContextResolver {
  return {
    group,
    description: `Runtime context block resolver for ${group}.`,
    resolve: ({ executionContext }) => resolveRuntimeBlocksForGroup(group, executionContext),
  };
}

export function createRuntimeContextResolvers(): PromptContextResolver[] {
  return [
    ...CHAPTER_CONTEXT_GROUPS,
    ...WORKSPACE_CONTEXT_GROUPS,
  ].map((group) => createRuntimeContextResolver(group));
}
