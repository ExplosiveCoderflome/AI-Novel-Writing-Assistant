import type { ChapterRepairContext, ChapterRuntimePackage } from "@ai-novel/shared/types/chapterRuntime";
import type { LLMProvider } from "@ai-novel/shared/types/llm";
import type { ReviewIssue } from "@ai-novel/shared/types/novel";
import { runTextPrompt } from "../../../../prompting/core/promptRunner";
import { buildChapterRepairContextBlocks } from "../../../../prompting/prompts/novel/chapterLayeredContext";
import { chapterRepairPrompt } from "../../../../prompting/prompts/novel/review.prompts";
import {
  ChapterPatchRepairFailedError,
  ChapterPatchRepairService,
  type PatchRepairMode,
} from "../../chapterPatchRepairService";

export interface ChapterRepairExecutionOptions {
  provider?: LLMProvider;
  model?: string;
  temperature?: number;
  repairMode?: PatchRepairMode;
}

export interface PrepareChapterRepairExecutionInput {
  novelId: string;
  chapterId: string;
  novelTitle: string;
  chapterTitle: string;
  content: string;
  issues: ReviewIssue[];
  runtimePackage?: ChapterRuntimePackage | null;
  repairContext?: ChapterRepairContext | null;
  bibleContent?: string | null;
  forceFullRewrite?: boolean;
  options: ChapterRepairExecutionOptions;
}

export interface ChapterHeavyRepairPromptRequest {
  promptInput: {
    novelTitle: string;
    bibleContent: string;
    chapterTitle: string;
    chapterContent: string;
    issuesJson: string;
    ragContext: string;
    modeHint: string;
  };
  contextBlocks?: ReturnType<typeof buildChapterRepairContextBlocks>;
  options: {
    provider?: LLMProvider;
    model?: string;
    temperature: number;
    novelId: string;
    chapterId: string;
    stage: "chapter_repair";
    triggerReason: PatchRepairMode;
  };
  fallbackContent: string;
}

export type PreparedChapterRepairExecution =
  | {
      kind: "patched";
      content: string;
      issues: ReviewIssue[];
      finalRepairMode: PatchRepairMode;
      modeHint: string;
      escalatedFromPatch: false;
      patchFailure: null;
    }
  | {
      kind: "heavy_repair";
      issues: ReviewIssue[];
      finalRepairMode: "heavy_repair";
      modeHint: string;
      escalatedFromPatch: boolean;
      patchFailure: ChapterPatchRepairFailedError | null;
      prompt: ChapterHeavyRepairPromptRequest;
    };

export interface ExecutedChapterRepair {
  content: string;
  finalRepairMode: PatchRepairMode;
  escalatedFromPatch: boolean;
  patchFailure: ChapterPatchRepairFailedError | null;
}

function normalizeRepairIssues(issues: ReviewIssue[]): ReviewIssue[] {
  return issues.length > 0
    ? issues
    : [{
        severity: "medium",
        category: "coherence",
        evidence: "Pipeline quality threshold not met.",
        fixSuggestion: "Tighten continuity, sharpen conflict progression, and improve readability.",
      }];
}

function resolveIssueCodes(runtimePackage: ChapterRuntimePackage | null | undefined): string[] {
  return runtimePackage?.audit.openIssues
    ?.map((issue) => issue.code)
    .filter((code): code is string => typeof code === "string" && code.trim().length > 0)
    ?? [];
}

/**
 * 构建修复 prompt 所用的结构化 issuesJson。
 *
 * Root A 修复：在 ReviewIssue 列表之外，额外透传：
 *  - missingObligations：本章未兑现的义务（kind/summary/evidence），修复器可据此定向补写
 *  - blockingIssueCodes：审计层给出的精确 code（如 OBLIGATION_UNMET / LENGTH_OVER_HARD_MAX），
 *    避免修复器只看压扁文本猜问题类型
 */
function buildRepairIssuesPayload(
  issues: ReviewIssue[],
  runtimePackage: ChapterRuntimePackage | null | undefined,
): string {
  const missingObligations = runtimePackage?.obligationCoverage?.missing ?? [];
  const blockingIssueCodes = resolveIssueCodes(runtimePackage);

  if (missingObligations.length === 0 && blockingIssueCodes.length === 0) {
    return JSON.stringify(issues, null, 2);
  }

  return JSON.stringify(
    {
      issues,
      missingObligations: missingObligations.map((o) => ({
        kind: o.kind,
        summary: o.summary,
        ...(o.evidence ? { evidence: o.evidence } : {}),
      })),
      blockingIssueCodes,
    },
    null,
    2,
  );
}

function resolveRepairContext(input: {
  repairContext?: ChapterRepairContext | null;
  runtimePackage?: ChapterRuntimePackage | null;
}): ChapterRepairContext | null {
  return input.repairContext ?? input.runtimePackage?.context.chapterRepairContext ?? null;
}

function resolveBibleContent(input: {
  bibleContent?: string | null;
  runtimePackage?: ChapterRuntimePackage | null;
}): string {
  const explicitBible = input.bibleContent?.trim();
  if (explicitBible) {
    return explicitBible;
  }
  return buildRepairBibleFallback(input.runtimePackage);
}

function buildRepairRagContext(input: {
  repairContext?: ChapterRepairContext | null;
  runtimePackage?: ChapterRuntimePackage | null;
}): string {
  const repairContext = resolveRepairContext(input);
  const writeContext = repairContext?.writeContext ?? input.runtimePackage?.context.chapterWriteContext ?? null;
  if (!writeContext) {
    return "none";
  }
  const fragments = [
    writeContext.previousChapterTail
      ? `上一章尾段：${writeContext.previousChapterTail}`
      : "",
    writeContext.recentChapterSummaries?.length
      ? `最近章节摘要：\n${writeContext.recentChapterSummaries.slice(0, 3).map((item) => `- ${item}`).join("\n")}`
      : "",
    writeContext.openConflictSummaries?.length
      ? `待回收冲突：\n${writeContext.openConflictSummaries.slice(0, 5).map((item) => `- ${item}`).join("\n")}`
      : "",
    writeContext.characterHardFacts?.length
      ? `角色硬事实：\n${writeContext.characterHardFacts.slice(0, 6).map((item) => [
          item.name,
          item.currentState ? `状态=${item.currentState}` : "",
          item.currentGoal ? `目标=${item.currentGoal}` : "",
          item.currentLocation ? `位置=${item.currentLocation}` : "",
          item.prohibitions?.length ? `禁止=${item.prohibitions.join(" / ")}` : "",
        ].filter(Boolean).join(" | ")).join("\n")}`
      : "",
    writeContext.characterResourceContext
      ? [
          "资源事实：",
          ...writeContext.characterResourceContext.availableItems.slice(0, 4).map((item) => `- 可用：${item.name} / ${item.summary}`),
          ...writeContext.characterResourceContext.blockedItems.slice(0, 4).map((item) => `- 不可直接使用：${item.name} / ${item.status} / ${item.summary}`),
          ...writeContext.characterResourceContext.pendingReviewItems.slice(0, 3).map((item) => `- 待确认：${item.name} / ${item.summary}`),
        ].join("\n")
      : "",
  ].filter((item) => item.trim().length > 0);
  return fragments.join("\n\n") || "none";
}

export async function prepareChapterRepairExecution(
  input: PrepareChapterRepairExecutionInput,
): Promise<PreparedChapterRepairExecution> {
  const issues = normalizeRepairIssues(input.issues);
  const issueCodes = resolveIssueCodes(input.runtimePackage);
  let activeRepairMode = input.options.repairMode ?? "light_repair";
  let modeHint = getRepairModeHint(activeRepairMode, issueCodes);

  if (input.forceFullRewrite && activeRepairMode !== "heavy_repair") {
    activeRepairMode = "heavy_repair";
    modeHint = getRepairModeHint(activeRepairMode, issueCodes);
  }

  if (!input.forceFullRewrite && activeRepairMode !== "heavy_repair") {
    const patchRepairService = new ChapterPatchRepairService();
    try {
      const patched = await patchRepairService.repair({
        novelId: input.novelId,
        chapterId: input.chapterId,
        novelTitle: input.novelTitle,
        chapterTitle: input.chapterTitle,
        content: input.content,
        issues,
        runtimePackage: input.runtimePackage,
        repairContext: input.repairContext,
        provider: input.options.provider,
        model: input.options.model,
        temperature: input.options.temperature,
        repairMode: activeRepairMode,
        modeHint,
      });
      return {
        kind: "patched",
        content: patched.content,
        issues,
        finalRepairMode: activeRepairMode,
        modeHint,
        escalatedFromPatch: false,
        patchFailure: null,
      };
    } catch (error) {
      if (!(error instanceof ChapterPatchRepairFailedError)) {
        throw error;
      }
      if (activeRepairMode === "detect_only") {
        throw error;
      }

      // Root B 宽松锚点重试：patch 锚点失配时，用 continuity_only 模式再试一次，
      // 给 LLM 更宽泛的定位空间，避免直接升级 heavy_repair。
      const looseAnchorMode: PatchRepairMode = "continuity_only";
      const looseAnchorHint = "宽松锚点重试（anchor-loose retry）：不要求精确匹配原文，以段落语义为锚，优先修连续性问题。";
      try {
        const retried = await patchRepairService.repair({
          novelId: input.novelId,
          chapterId: input.chapterId,
          novelTitle: input.novelTitle,
          chapterTitle: input.chapterTitle,
          content: input.content,
          issues,
          runtimePackage: input.runtimePackage,
          repairContext: input.repairContext,
          provider: input.options.provider,
          model: input.options.model,
          temperature: input.options.temperature,
          repairMode: looseAnchorMode,
          modeHint: looseAnchorHint,
        });
        return {
          kind: "patched",
          content: retried.content,
          issues,
          finalRepairMode: looseAnchorMode,
          modeHint: looseAnchorHint,
          escalatedFromPatch: false,
          patchFailure: null,
        };
      } catch (retryError) {
        if (!(retryError instanceof ChapterPatchRepairFailedError)) {
          throw retryError;
        }
        // 宽松锚点重试仍失败 → 升级 heavy_repair
      }

      activeRepairMode = "heavy_repair";
      modeHint = getRepairModeHint(activeRepairMode, issueCodes);
      return {
        kind: "heavy_repair",
        issues,
        finalRepairMode: activeRepairMode,
        modeHint,
        escalatedFromPatch: true,
        patchFailure: error,
        prompt: {
          promptInput: {
            novelTitle: input.novelTitle,
            bibleContent: resolveBibleContent(input),
            chapterTitle: input.chapterTitle,
            chapterContent: input.content,
            issuesJson: buildRepairIssuesPayload(issues, input.runtimePackage),
            ragContext: buildRepairRagContext(input),
            modeHint,
          },
          contextBlocks: resolveRepairContext(input)
            ? buildChapterRepairContextBlocks(resolveRepairContext(input) as ChapterRepairContext)
            : undefined,
          options: {
            provider: input.options.provider,
            model: input.options.model,
            temperature: Math.min(input.options.temperature ?? 0.55, 0.65),
            novelId: input.novelId,
            chapterId: input.chapterId,
            stage: "chapter_repair",
            triggerReason: activeRepairMode,
          },
          fallbackContent: input.content,
        },
      };
    }
  }

  return {
    kind: "heavy_repair",
    issues,
    finalRepairMode: "heavy_repair",
    modeHint,
    escalatedFromPatch: false,
    patchFailure: null,
    prompt: {
      promptInput: {
        novelTitle: input.novelTitle,
        bibleContent: resolveBibleContent(input),
        chapterTitle: input.chapterTitle,
        chapterContent: input.content,
        issuesJson: buildRepairIssuesPayload(issues, input.runtimePackage),
        ragContext: buildRepairRagContext(input),
        modeHint,
      },
      contextBlocks: resolveRepairContext(input)
        ? buildChapterRepairContextBlocks(resolveRepairContext(input) as ChapterRepairContext)
        : undefined,
      options: {
        provider: input.options.provider,
        model: input.options.model,
        temperature: Math.min(input.options.temperature ?? 0.55, 0.65),
        novelId: input.novelId,
        chapterId: input.chapterId,
        stage: "chapter_repair",
        triggerReason: activeRepairMode,
      },
      fallbackContent: input.content,
    },
  };
}

export function createHeavyRepairPromptExecution(
  plan: Extract<PreparedChapterRepairExecution, { kind: "heavy_repair" }>,
): {
  asset: typeof chapterRepairPrompt;
  promptInput: ChapterHeavyRepairPromptRequest["promptInput"];
  contextBlocks?: ChapterHeavyRepairPromptRequest["contextBlocks"];
  options: ChapterHeavyRepairPromptRequest["options"];
} {
  return {
    asset: chapterRepairPrompt,
    promptInput: plan.prompt.promptInput,
    contextBlocks: plan.prompt.contextBlocks,
    options: plan.prompt.options,
  };
}

export async function runChapterRepairText(
  input: PrepareChapterRepairExecutionInput,
): Promise<ExecutedChapterRepair> {
  const prepared = await prepareChapterRepairExecution(input);
  if (prepared.kind === "patched") {
    return {
      content: prepared.content,
      finalRepairMode: prepared.finalRepairMode,
      escalatedFromPatch: false,
      patchFailure: null,
    };
  }

  const repaired = await runTextPrompt(createHeavyRepairPromptExecution(prepared));
  return {
    content: repaired.output.trim() || prepared.prompt.fallbackContent,
    finalRepairMode: prepared.finalRepairMode,
    escalatedFromPatch: prepared.escalatedFromPatch,
    patchFailure: prepared.patchFailure,
  };
}

function buildRepairBibleFallback(runtimePackage: ChapterRuntimePackage | null | undefined): string {
  const context = runtimePackage?.context;
  if (!context) {
    return "none";
  }
  const fragments = [
    context.bookContract?.sellingPoint ? `核心卖点：${context.bookContract.sellingPoint}` : "",
    context.bookContract?.first30ChapterPromise ? `前30章承诺：${context.bookContract.first30ChapterPromise}` : "",
    context.macroConstraints?.coreConflict ? `核心冲突：${context.macroConstraints.coreConflict}` : "",
    context.macroConstraints?.progressionLoop ? `推进回路：${context.macroConstraints.progressionLoop}` : "",
    context.volumeWindow?.missionSummary ? `当前卷使命：${context.volumeWindow.missionSummary}` : "",
  ].filter(Boolean);
  return fragments.join("\n") || "none";
}

export function getRepairModeHint(
  repairMode: PatchRepairMode | undefined,
  issueCodes: string[] = [],
): string {
  if (issueCodes.includes("LENGTH_OVER_HARD_MAX")) {
    return "compress_chapter_for_length：整章压缩重复表达、解释段和无效回合，保留核心推进与结尾压力。";
  }
  if (issueCodes.includes("LENGTH_OVER_SOFT_MAX")) {
    return "compress_tail_for_length：优先回收尾段冗余展开，保留结尾 hook 和关键冲突。";
  }
  if (issueCodes.includes("LENGTH_UNDER_SOFT_MIN")) {
    return "extend_for_length：只补最后的义务场景或结尾 hook，增加有效推进，不要回顾性凑字数。";
  }
  switch (repairMode) {
    case "continuity_only":
      return "优先修连续性、时间线和事件承接，不做大幅风格重写。";
    case "character_only":
      return "优先修人物言行一致性、动机和关系表现，不改变主线任务。";
    case "ending_only":
      return "优先修章节收束、钩子和结尾决断感，让章节尾部更有拉力。";
    case "heavy_repair":
      return "允许较大幅度重写句段，只要剧情方向不变即可。";
    case "light_repair":
    default:
      return "以轻修为主，优先保持原有内容框架和事件顺序。";
  }
}
