import type { BaseMessageChunk } from "@langchain/core/messages";
import type { QualityScore, ReviewIssue } from "@ai-novel/shared/types/novel";
import type { StreamDoneHelpers } from "../../../../llm/streaming";
import { prisma } from "../../../../db/prisma";
import { streamTextPrompt } from "../../../../prompting/core/promptRunner";
import { withChapterRepairContext } from "../../../../prompting/prompts/novel/chapterLayeredContext";
import { auditService } from "../../../audit/AuditService";
import { ChapterPatchRepairFailedError } from "../../chapterPatchRepairService";
import {
  isPass,
  logPipelineError,
  type RepairOptions,
  type ReviewOptions,
} from "../../novelCoreShared";
import type { ChapterArtifactSyncService } from "../ChapterArtifactSyncService";
import type { GenerationContextAssembler } from "../GenerationContextAssembler";
import type { ChapterTimelineFinalizationService } from "../ChapterTimelineFinalizationService";
import {
  ChapterContextAssemblyError,
  assembleChapterAuditContextPackage,
} from "./chapterAuditContext";
import {
  createHeavyRepairPromptExecution,
  prepareChapterRepairExecution,
} from "./chapterRepairRuntime";

interface RepairReviewResult {
  score: QualityScore;
  issues: ReviewIssue[];
}

export interface ChapterRepairStreamRuntimeDeps {
  assembler?: Pick<GenerationContextAssembler, "assemble">;
  artifactSyncService: Pick<ChapterArtifactSyncService, "syncChapterArtifacts">;
  reviewChapterAfterRepair: (
    novelId: string,
    chapterId: string,
    options: ReviewOptions,
  ) => Promise<RepairReviewResult>;
  resolveAuditIssues?: (novelId: string, issueIds: string[]) => Promise<unknown>;
  timelineFinalizer?: Pick<ChapterTimelineFinalizationService, "finalizeCurrentContent">;
}

export class ChapterRepairStreamRuntime {
  constructor(private readonly deps: ChapterRepairStreamRuntimeDeps) {}

  async createRepairStream(
    novelId: string,
    chapterId: string,
    options: RepairOptions = {},
  ): Promise<{
    stream: AsyncIterable<BaseMessageChunk>;
    onDone: (fullContent: string, helpers: StreamDoneHelpers) => Promise<void>;
  }> {
    const [novel, chapter, bible] = await Promise.all([
      prisma.novel.findUnique({ where: { id: novelId } }),
      prisma.chapter.findFirst({ where: { id: chapterId, novelId } }),
      prisma.novelBible.findUnique({ where: { novelId } }),
    ]);
    if (!novel || !chapter) {
      throw new Error("小说或章节不存在");
    }

    const issues = await this.resolveRepairIssues(novelId, chapterId, options);
    const assembledContextPackage = await assembleChapterAuditContextPackage({
      assembler: this.deps.assembler,
      novelId,
      chapterId,
      options,
      operation: "repair",
    });
    const repairContextPackage = withChapterRepairContext(assembledContextPackage, issues);
    if (!repairContextPackage.chapterRepairContext) {
      const error = new Error("chapterRepairContext missing after successful context assembly");
      logPipelineError("Failed to derive repair context from assembled chapter context package.", {
        novelId,
        chapterId,
        operation: "repair",
        provider: options.provider ?? null,
        model: options.model ?? null,
        error: error.message,
      });
      throw new ChapterContextAssemblyError(novelId, chapterId, "repair", error);
    }

    const prepared = await prepareChapterRepairExecution({
      novelId,
      chapterId,
      novelTitle: novel.title,
      chapterTitle: chapter.title,
      content: chapter.content ?? "",
      issues,
      repairContext: repairContextPackage.chapterRepairContext,
      bibleContent: bible?.rawContent ?? "",
      options: {
        provider: options.provider,
        model: options.model,
        temperature: options.temperature,
        repairMode: options.repairMode,
      },
    });

    if (prepared.kind === "patched") {
      return {
        stream: createSingleChunkStream(prepared.content),
        onDone: async (fullContent: string, helpers: StreamDoneHelpers) => {
          await this.finalizeRepairResult({
            novelId,
            chapterId,
            options,
            content: prepared.content.trim() || fullContent,
            helpers,
          });
        },
      };
    }

    const streamed = await streamTextPrompt(createHeavyRepairPromptExecution(prepared));
    return {
      stream: streamed.stream as AsyncIterable<BaseMessageChunk>,
      onDone: async (fullContent: string, helpers: StreamDoneHelpers) => {
        const completed = await streamed.complete;
        await this.finalizeRepairResult({
          novelId,
          chapterId,
          options,
          content: completed.output.trim() || fullContent,
          helpers,
        });
      },
    };
  }

  private async resolveRepairIssues(
    novelId: string,
    chapterId: string,
    options: RepairOptions,
  ): Promise<ReviewIssue[]> {
    if (Array.isArray(options.reviewIssues)) {
      return options.reviewIssues;
    }

    const auditIssues = options.auditIssueIds?.length
      ? await prisma.auditIssue.findMany({
        where: { id: { in: options.auditIssueIds } },
        orderBy: { createdAt: "asc" },
      })
      : [];
    if (auditIssues.length > 0) {
      return auditIssues.map((item) => ({
        severity: item.severity as ReviewIssue["severity"],
        category: item.auditType === "continuity"
          ? "coherence"
          : item.auditType === "character"
            ? "logic"
            : "pacing",
        evidence: item.evidence,
        fixSuggestion: item.fixSuggestion,
      }));
    }

    const fallbackReview = await this.deps.reviewChapterAfterRepair(novelId, chapterId, options);
    return fallbackReview.issues;
  }

  private async finalizeRepairResult(input: {
    novelId: string;
    chapterId: string;
    options: RepairOptions;
    content: string;
    helpers: StreamDoneHelpers;
  }): Promise<void> {
    const runId = `chapter-repair:${input.chapterId}`;
    input.helpers.writeFrame({
      type: "run_status",
      runId,
      status: "running",
      phase: "finalizing",
      message: "修复稿已生成，正在保存正文并重新审校。",
    });

    const repairedContent = input.content.trim();
    if (!repairedContent) {
      throw new ChapterPatchRepairFailedError("修复结果为空，未保存章节正文。");
    }

    await prisma.chapter.update({
      where: { id: input.chapterId },
      data: { content: repairedContent, generationState: "repaired" },
    });
    await this.deps.artifactSyncService.syncChapterArtifacts(
      input.novelId,
      input.chapterId,
      repairedContent,
      { scheduleBackgroundSync: true },
    );

    const review = await this.deps.reviewChapterAfterRepair(input.novelId, input.chapterId, {
      provider: input.options.provider,
      model: input.options.model,
      temperature: input.options.temperature,
      content: repairedContent,
    });
    if (isPass(review.score)) {
      if (this.deps.timelineFinalizer) {
        const assembledContextPackage = await assembleChapterAuditContextPackage({
          assembler: this.deps.assembler,
          novelId: input.novelId,
          chapterId: input.chapterId,
          options: input.options,
          operation: "repair",
        });
        await this.deps.timelineFinalizer.finalizeCurrentContent({
          novelId: input.novelId,
          chapterId: input.chapterId,
          content: repairedContent,
          contextPackage: assembledContextPackage,
          request: input.options,
          sourceStage: "repair_accepted",
        });
      }
      await prisma.chapter.update({
        where: { id: input.chapterId },
        data: { generationState: "approved" },
      });
      if (input.options.auditIssueIds?.length) {
        const resolveAuditIssues = this.deps.resolveAuditIssues
          ?? ((novelId: string, issueIds: string[]) => auditService.resolveIssues(novelId, issueIds));
        await resolveAuditIssues(input.novelId, input.options.auditIssueIds).catch(() => null);
      }
    }

    input.helpers.writeFrame({
      type: "run_status",
      runId,
      status: "succeeded",
      phase: "completed",
      message: isPass(review.score)
        ? "章节修复已完成，本章已达到可继续推进状态。"
        : "修复稿已保存，但仍有问题待继续处理。",
    });
  }
}

async function* createSingleChunkStream(content: string): AsyncIterable<BaseMessageChunk> {
  yield { content } as BaseMessageChunk;
}
