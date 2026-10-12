import type { LLMProvider } from "@ai-novel/shared/types/llm";
import type { ReviewIssue } from "@ai-novel/shared/types/novel";
import type { ChapterRepairContext, ChapterRuntimePackage } from "@ai-novel/shared/types/chapterRuntime";
import {
  applyChapterPatchRepairPlan,
  type ChapterPatchApplyResult,
  type ChapterPatchRepairPlan,
} from "@ai-novel/shared/types/chapterPatchRepair";
import { runStructuredPrompt } from "../../prompting/core/promptRunner";
import { buildChapterPatchRepairContextBlocks } from "../../prompting/prompts/novel/chapterLayeredContext";
import { chapterPatchRepairPrompt } from "../../prompting/prompts/novel/chapterPatchRepair.prompts";
import { isStyleIssueRewritable, type StyleRewriteGuard, type StyleRewriteBaseline } from "@ai-novel/shared/types/styleEngine";
import { guardStylePatches, isStyleRewriteBlocked } from "../styleEngine/rewrite";

export type PatchRepairMode =
  | "detect_only"
  | "light_repair"
  | "heavy_repair"
  | "continuity_only"
  | "character_only"
  | "ending_only";

export interface ChapterPatchRepairInput {
  novelId?: string;
  chapterId?: string;
  novelTitle: string;
  chapterTitle: string;
  content: string;
  issues: ReviewIssue[];
  issuesJson?: string;
  modeHint?: string;
  repairContext?: ChapterRepairContext | null;
  runtimePackage?: ChapterRuntimePackage | null;
  provider?: LLMProvider;
  model?: string;
  temperature?: number;
  repairMode?: PatchRepairMode;
}

export interface ChapterPatchRepairResult {
  content: string;
  plan: ChapterPatchRepairPlan;
  appliedPatchIds: string[];
  rewriteGuard?: StyleRewriteGuard;
  styleRewriteBaseline?: StyleRewriteBaseline;
}

export class ChapterPatchRepairFailedError extends Error {
  constructor(
    message: string,
    readonly plan?: ChapterPatchRepairPlan,
    readonly applyResult?: ChapterPatchApplyResult,
    readonly rewriteGuard?: StyleRewriteGuard,
  ) {
    super(message);
    this.name = "ChapterPatchRepairFailedError";
  }
}

export class ChapterPatchRepairService {
  async repair(input: ChapterPatchRepairInput): Promise<ChapterPatchRepairResult> {
    if (!input.content.trim()) {
      throw new ChapterPatchRepairFailedError("章节正文为空，不能执行局部补丁修复。");
    }
    if (input.repairMode === "detect_only") {
      throw new ChapterPatchRepairFailedError("当前为只检测模式，未执行章节修复。");
    }
    if (input.repairMode === "heavy_repair") {
      throw new ChapterPatchRepairFailedError("当前修复模式允许整章重写，跳过局部补丁。");
    }

    const repairContext = input.repairContext ?? input.runtimePackage?.context.chapterRepairContext;
    const issuesJson = input.issuesJson ?? JSON.stringify(input.issues);
    const styleIssues = input.runtimePackage?.styleReview?.report?.violations ?? [];
    const styleIds = new Set(styleIssues.map(issue => issue.issueCode).filter((id): id is string => Boolean(id)));
    const allowedStyleIds = styleIssues.filter(issue => isStyleIssueRewritable(issue))
      .map(issue => issue.issueCode).filter((id): id is string => Boolean(id));
    const nonStyleIds = (input.runtimePackage?.audit.openIssues ?? [])
      .filter(issue => !styleIds.has(issue.code ?? ""))
      .flatMap(issue => [issue.id, issue.code].filter((id): id is string => Boolean(id)));
    const obligationIds = (input.runtimePackage?.obligationCoverage?.missing ?? [])
      .map(item => `${item.kind}:${item.summary}`);
    const allowedIssueIds = [...new Set([...allowedStyleIds, ...nonStyleIds, ...obligationIds])];
    const protectedTerms = repairContext?.writeContext.characterHardFacts?.map(item => item.name) ?? [];
    const contextBlocks = repairContext
      ? buildChapterPatchRepairContextBlocks(repairContext, issuesJson)
      : undefined;
    let generated: { output: ChapterPatchRepairPlan };
    try {
      generated = await runStructuredPrompt({
        asset: chapterPatchRepairPrompt,
        promptInput: {
          novelTitle: input.novelTitle,
          chapterTitle: input.chapterTitle,
          chapterContent: input.content,
          issuesJson,
          modeHint: input.modeHint,
          styleProtection: styleIssues.length ? JSON.stringify({ allowedIssueIds, styleIssueIds: allowedStyleIds,
            reportOnly: styleIssues.filter(issue => !isStyleIssueRewritable(issue)), protectedTerms,
            wholeChapterTouchedRatioMax: 0.3, wholeChapterAddedRatioMax: 0.05 }) : undefined,
        },
        contextBlocks,
        options: {
          provider: input.provider,
          model: input.model,
          temperature: Math.min(input.temperature ?? 0.35, 0.45),
          maxTokens: 4200,
          novelId: input.novelId,
          chapterId: input.chapterId,
          stage: "chapter_patch",
          triggerReason: input.repairMode ?? "patch_first",
        },
      });
    } catch (error) {
      const message = error instanceof Error && error.message.trim()
        ? error.message.trim()
        : String(error);
      throw new ChapterPatchRepairFailedError(`局部补丁计划未通过结构校验：${message}`);
    }

    let applied: ChapterPatchApplyResult;
    try {
      applied = applyChapterPatchRepairPlan(input.content, generated.output);
    } catch (error) {
      const message = formatPatchRepairApplyError(error);
      throw new ChapterPatchRepairFailedError(
        `局部补丁计划不可安全应用：${message}`,
        generated.output,
      );
    }
    if (!applied.success) {
      const reason = applied.failures.map((failure) => `${failure.patchId}: ${failure.reason}`).join("；")
        || generated.output.escalationReason
        || "局部补丁没有产生有效正文变化。";
      throw new ChapterPatchRepairFailedError(reason, generated.output, applied);
    }

    // A shared repair can carry both factual and expression fixes. Once style
    // issues are present, bind every patch to the server's actual issue set.
    const protection = styleIssues.length ? guardStylePatches({ original: input.content,
      plan: generated.output, allowedIssueIds, styleIssueIds: allowedStyleIds, protectedTerms }) : undefined;
    if (protection && isStyleRewriteBlocked(protection.guard)) {
      throw new ChapterPatchRepairFailedError("表达修文超出许可或保护范围，保留原稿。",
        generated.output, applied, protection.guard);
    }

    return {
      content: applied.content,
      plan: generated.output,
      appliedPatchIds: applied.appliedPatchIds,
      rewriteGuard: protection?.guard,
      styleRewriteBaseline: protection?.baseline,
    };
  }
}

function formatPatchRepairApplyError(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }
  return String(error);
}
