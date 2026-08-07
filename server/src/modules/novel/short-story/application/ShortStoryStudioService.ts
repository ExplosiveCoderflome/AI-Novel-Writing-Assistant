import type {
  CreationDirection,
  CreationIntentInterpretation,
  ShortStoryPlanContract,
  ShortStoryProjection,
  ShortStoryRevisionImpact,
  ShortStorySegmentUpdateRequest,
} from "@ai-novel/shared/types/creationStudio";
import { prisma } from "../../../../db/prisma";
import { AppError } from "../../../../middleware/errorHandler";
import { runStructuredPrompt } from "../../../../prompting/core/promptRunner";
import {
  shortStoryPatchRepairPrompt,
  shortStoryPlanPrompt,
  shortStoryRevisionImpactPrompt,
  shortStorySegmentWritePrompt,
} from "../../../../prompting/prompts/shortStory/shortStory.prompts";
import { NovelWorkflowService } from "../../../../services/novel/workflow/NovelWorkflowService";
import { shortStoryProductionService } from "./ShortStoryProductionService";
import {
  buildShortStoryWriterContextBlocks,
  parseWritingPlatformSnapshot,
  shortStoryProductionFoundationText,
  shortStoryPlatformText,
} from "./shortStoryPromptContext";

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function wordCount(content: string): number {
  return content.replace(/\s+/g, "").length;
}

function appendSnapshot(raw: string | null, content: string, version: number): string {
  const history = parseJson<Array<{ content: string; version: number; createdAt: string }>>(raw, []);
  return JSON.stringify([
    ...history.slice(-9),
    { content, version, createdAt: new Date().toISOString() },
  ]);
}

export class ShortStoryStudioService {
  private readonly workflowService = new NovelWorkflowService();
  private readonly applying = new Set<string>();

  async getProjection(novelId: string): Promise<ShortStoryProjection> {
    const novel = await prisma.novel.findUnique({
      where: { id: novelId },
      include: {
        shortStoryPlan: {
          include: { segments: { orderBy: { order: "asc" } } },
        },
        intentVersions: {
          where: { status: "active" },
          orderBy: { version: "desc" },
          take: 1,
        },
        workflowTasks: {
          where: { lane: "creation_studio" },
          orderBy: { updatedAt: "desc" },
          take: 1,
        },
      },
    });
    if (!novel || novel.narrativeForm !== "short_story") {
      throw new AppError("短篇作品不存在。", 404);
    }
    const intentRow = novel.intentVersions[0] ?? null;
    const interpretation = intentRow
      ? parseJson<CreationIntentInterpretation | null>(intentRow.structuredIntentJson, null)
      : null;
    const selected = intentRow
      ? parseJson<{ selectedDirectionId?: string }>(intentRow.impactScopeJson, {})
      : {};
    const direction = interpretation?.directions.find((item) => item.id === selected.selectedDirectionId) ?? null;
    const plan = novel.shortStoryPlan;
    const task = novel.workflowTasks[0] ?? null;
    return {
      novel: {
        id: novel.id,
        title: novel.title,
        narrativeForm: novel.narrativeForm,
        targetWordCount: novel.targetWordCount ?? plan?.targetWordCount ?? 0,
        derivedFromNovelId: novel.derivedFromNovelId,
        writingPlatform: novel.writingPlatform as ShortStoryProjection["novel"]["writingPlatform"],
        writingPlatformProfileVersion: novel.writingPlatformProfileVersion,
      },
      intent: intentRow && interpretation && direction ? {
        id: intentRow.id,
        version: intentRow.version,
        originalExpression: intentRow.originalExpression,
        understanding: interpretation.understanding,
        direction,
      } : null,
      plan: plan ? {
        id: plan.id,
        status: plan.status as ShortStoryProjection["plan"] extends infer P
          ? P extends { status: infer S } ? S : never
          : never,
        endingPromise: plan.endingPromise,
        qualityDebt: parseJson<string[]>(plan.qualityDebtJson, []),
        schemaVersion: plan.schemaVersion,
      } : null,
      segments: (plan?.segments ?? []).map((segment) => ({
        id: segment.id,
        order: segment.order,
        content: segment.content,
        status: segment.status as "pending" | "generating" | "completed" | "failed",
        version: segment.version,
        targetWordCount: segment.targetWordCount,
        wordCount: wordCount(segment.content),
        humanEdited: Boolean(segment.userEditedAt),
        qualityResult: parseJson(segment.qualityResultJson, null),
        updatedAt: segment.updatedAt.toISOString(),
      })),
      continuousContent: (plan?.segments ?? [])
        .map((segment) => segment.content.trim())
        .filter(Boolean)
        .join("\n\n"),
      production: {
        taskId: task?.id ?? null,
        status: task?.status ?? null,
        progress: task?.progress ?? 0,
        currentAction: task?.currentItemLabel ?? null,
        error: task?.lastError ?? null,
      },
    };
  }

  async retryProduction(novelId: string): Promise<{ taskId: string }> {
    const task = await prisma.novelWorkflowTask.findFirst({
      where: {
        novelId,
        lane: "creation_studio",
      },
      orderBy: { updatedAt: "desc" },
    });
    if (!task) {
      throw new AppError("没有可继续的短篇生成任务。", 404);
    }
    if (task.checkpointType === "replan_required") {
      throw new AppError("这篇作品需要先确认新的创作方向。", 409);
    }
    if (task.status !== "failed" && task.status !== "cancelled") {
      throw new AppError("当前生成任务不需要重试。", 409);
    }
    await this.workflowService.retryTask(task.id);
    shortStoryProductionService.schedule(task.id);
    return { taskId: task.id };
  }

  async updateSegment(
    novelId: string,
    segmentId: string,
    input: ShortStorySegmentUpdateRequest,
  ) {
    const segment = await prisma.shortStorySegment.findFirst({
      where: { id: segmentId, novelId },
    });
    if (!segment) {
      throw new AppError("要保存的正文片段不存在。", 404);
    }
    const content = input.content.trim();
    if (!content) {
      throw new AppError("正文不能为空。", 400);
    }
    const updated = await prisma.shortStorySegment.updateMany({
      where: { id: segment.id, version: input.expectedVersion },
      data: {
        content,
        version: { increment: 1 },
        status: "completed",
        humanSnapshotJson: appendSnapshot(segment.humanSnapshotJson, segment.content, segment.version),
        userEditedAt: new Date(),
      },
    });
    if (updated.count === 0) {
      throw new AppError("正文已在其他位置更新，请刷新后再保存。", 409);
    }
    return prisma.shortStorySegment.findUniqueOrThrow({ where: { id: segment.id } });
  }

  async previewRevision(novelId: string, instruction: string): Promise<ShortStoryRevisionImpact> {
    const context = await this.loadRevisionContext(novelId);
    const generated = await runStructuredPrompt({
      asset: shortStoryRevisionImpactPrompt,
      promptInput: {
        instruction: instruction.trim(),
        originalIdea: context.activeIntent.originalExpression,
        understanding: context.interpretation.understanding,
        direction: context.direction,
        plan: context.plan,
        segments: context.segments.map((segment) => ({
          order: segment.order,
          content: segment.content,
          humanEdited: Boolean(segment.userEditedAt),
        })),
      },
      options: {
        novelId,
        taskId: context.task.id,
        stage: "short_story_review",
        itemKey: "revision_preview",
        entrypoint: "short_story_studio",
        temperature: 0.35,
      },
    });
    const latest = await prisma.novelIntentVersion.findFirst({
      where: { workflowTaskId: context.task.id },
      orderBy: { version: "desc" },
    });
    const revisedDirection: CreationDirection = {
      ...generated.output.revisedDirection,
      id: context.direction.id,
    };
    const revisedInterpretation: CreationIntentInterpretation = {
      ...context.interpretation,
      recommendedTargetWordCount: generated.output.recommendedTargetWordCount,
      directions: context.interpretation.directions.map((direction) => (
        direction.id === context.direction.id ? revisedDirection : direction
      )) as [CreationDirection, CreationDirection],
    };
    const intentVersion = await prisma.novelIntentVersion.create({
      data: {
        novelId,
        workflowTaskId: context.task.id,
        previousVersionId: context.activeIntent.id,
        version: (latest?.version ?? context.activeIntent.version) + 1,
        status: "proposed",
        source: "revision",
        originalExpression: instruction.trim(),
        structuredIntentJson: JSON.stringify(revisedInterpretation),
        impactScopeJson: JSON.stringify({
          selectedDirectionId: revisedDirection.id,
          revision: generated.output,
        }),
      },
    });
    const affectedIds = generated.output.affectedSegmentOrders
      .map((order) => context.segments.find((segment) => segment.order === order)?.id)
      .filter((id): id is string => Boolean(id));
    return {
      intentVersionId: intentVersion.id,
      understoodGoal: generated.output.understoodGoal,
      affectedSegmentIds: affectedIds,
      changesEnding: generated.output.changesEnding,
      changesScale: generated.output.changesScale,
      changesCoreIntent: generated.output.changesCoreIntent,
      recommendedTargetWordCount: generated.output.recommendedTargetWordCount,
      recommendedStrategy: generated.output.recommendedStrategy,
      summary: generated.output.summary,
    };
  }

  async applyRevision(novelId: string, intentVersionId: string): Promise<{ taskId: string }> {
    const context = await this.loadRevisionContext(novelId);
    const proposed = await prisma.novelIntentVersion.findFirst({
      where: {
        id: intentVersionId,
        novelId,
        workflowTaskId: context.task.id,
        status: "proposed",
        source: "revision",
      },
    });
    if (!proposed) {
      throw new AppError("修改预览已失效，请重新生成。", 409);
    }
    await prisma.$transaction([
      prisma.novelIntentVersion.update({
        where: { id: context.activeIntent.id },
        data: { status: "superseded" },
      }),
      prisma.novelIntentVersion.update({
        where: { id: proposed.id },
        data: { status: "active" },
      }),
    ]);
    await this.workflowService.markTaskRunning(context.task.id, {
      stage: "short_story_review",
      itemKey: "revision_apply",
      itemLabel: "正在按确认的修改方向调整作品",
      progress: 0.9,
    });
    setImmediate(() => {
      void this.runRevision(novelId, proposed.id).catch((error) => {
        console.error(`[short-story.revision] failed novelId=${novelId}`, error);
      });
    });
    return { taskId: context.task.id };
  }

  private async runRevision(novelId: string, intentVersionId: string): Promise<void> {
    if (this.applying.has(novelId)) return;
    this.applying.add(novelId);
    try {
      const context = await this.loadRevisionContext(novelId);
      const intentRow = await prisma.novelIntentVersion.findUniqueOrThrow({ where: { id: intentVersionId } });
      const interpretation = parseJson<CreationIntentInterpretation>(intentRow.structuredIntentJson, context.interpretation);
      const scope = parseJson<{
        selectedDirectionId: string;
        revision: {
          understoodGoal: string;
          affectedSegmentOrders: number[];
          recommendedStrategy: "local_patch" | "rewrite_downstream" | "full_replan";
          recommendedTargetWordCount: number;
        };
      }>(intentRow.impactScopeJson, {
        selectedDirectionId: context.direction.id,
        revision: {
          understoodGoal: intentRow.originalExpression,
          affectedSegmentOrders: context.segments.map((segment) => segment.order),
          recommendedStrategy: "local_patch",
          recommendedTargetWordCount: context.plan.targetWordCount,
        },
      });
      const direction = interpretation.directions.find((item) => item.id === scope.selectedDirectionId) ?? context.direction;
      if (scope.revision.recommendedStrategy === "full_replan") {
        await this.applyFullReplan(context, direction, scope.revision);
      } else {
        await this.applyRevisionPatch(context, direction, scope.revision);
      }
      await prisma.novel.update({
        where: { id: novelId },
        data: {
          title: direction.title,
          description: direction.premise,
          bookSellingPoint: direction.coreExperience,
          targetWordCount: scope.revision.recommendedTargetWordCount,
        },
      });
      await this.workflowService.recordCheckpoint(context.task.id, {
        stage: "short_story_review",
        checkpointType: "workflow_completed",
        checkpointSummary: "已按确认的修改方向更新作品。",
        itemLabel: "修改已完成",
        progress: 1,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "作品修改未完成。";
      const task = await prisma.novelWorkflowTask.findFirst({
        where: { novelId, lane: "creation_studio" },
        orderBy: { updatedAt: "desc" },
      });
      if (task) {
        await this.workflowService.markTaskFailed(task.id, message, {
          stage: "short_story_review",
          itemKey: "revision_apply",
          itemLabel: "修改暂时中断，可重试",
        });
      }
      throw error;
    } finally {
      this.applying.delete(novelId);
    }
  }

  private async applyRevisionPatch(
    context: Awaited<ReturnType<ShortStoryStudioService["loadRevisionContext"]>>,
    direction: CreationDirection,
    revision: {
      understoodGoal: string;
      affectedSegmentOrders: number[];
      recommendedStrategy: "local_patch" | "rewrite_downstream" | "full_replan";
    },
  ): Promise<void> {
    const affected = revision.recommendedStrategy === "rewrite_downstream"
      ? context.segments.filter((segment) => segment.order >= Math.min(...revision.affectedSegmentOrders))
      : context.segments.filter((segment) => revision.affectedSegmentOrders.includes(segment.order));
    const repaired = await runStructuredPrompt({
      asset: shortStoryPatchRepairPrompt,
      promptInput: {
        originalIdea: context.activeIntent.originalExpression,
        understanding: context.interpretation.understanding,
        direction,
        plan: context.plan,
        content: context.segments.map((segment) => segment.content).join("\n\n"),
        audit: {
          decision: "patchable",
          summary: revision.understoodGoal,
          issues: affected.map((segment) => ({
            code: "confirmed_revision",
            description: revision.understoodGoal,
            affectedSegmentOrders: [segment.order],
            repairInstruction: revision.understoodGoal,
          })),
        },
        segments: context.segments.map((segment) => ({
          order: segment.order,
          content: segment.content,
          humanEdited: false,
        })),
        writingPlatform: shortStoryPlatformText(parseWritingPlatformSnapshot(context.novel.writingPlatformSnapshotJson), "repairing"),
        productionFoundation: context.productionFoundation,
      },
      options: {
        novelId: context.novel.id,
        taskId: context.task.id,
        stage: "short_story_review",
        itemKey: "revision_apply",
        entrypoint: "short_story_studio",
        temperature: 0.5,
        maxTokens: 12000,
      },
    });
    for (const patch of repaired.output.patches) {
      const segment = affected.find((item) => item.order === patch.segmentOrder);
      if (!segment) continue;
      await prisma.shortStorySegment.update({
        where: { id: segment.id },
        data: {
          content: patch.content.trim(),
          version: { increment: 1 },
          humanSnapshotJson: appendSnapshot(segment.humanSnapshotJson, segment.content, segment.version),
          userEditedAt: null,
          generatedAt: new Date(),
          status: "completed",
        },
      });
    }
    await prisma.shortStoryPlan.update({
      where: { id: context.planRow.id },
      data: { qualityDebtJson: JSON.stringify(repaired.output.residualQualityDebt) },
    });
  }

  private async applyFullReplan(
    context: Awaited<ReturnType<ShortStoryStudioService["loadRevisionContext"]>>,
    direction: CreationDirection,
    revision: {
      understoodGoal: string;
      affectedSegmentOrders: number[];
      recommendedTargetWordCount: number;
    },
  ): Promise<void> {
    const replanned = await runStructuredPrompt({
      asset: shortStoryPlanPrompt,
      promptInput: {
        originalIdea: context.activeIntent.originalExpression,
        understanding: context.interpretation.understanding,
        direction,
        targetWordCount: revision.recommendedTargetWordCount,
        revisionInstruction: revision.understoodGoal,
        requiredSegmentCount: context.segments.length,
        writingPlatform: shortStoryPlatformText(parseWritingPlatformSnapshot(context.novel.writingPlatformSnapshotJson), "planning"),
        productionFoundation: context.productionFoundation,
      },
      options: {
        novelId: context.novel.id,
        taskId: context.task.id,
        stage: "short_story_plan",
        itemKey: "revision_replan",
        entrypoint: "short_story_studio",
        temperature: 0.55,
      },
    });
    await prisma.shortStoryPlan.update({
      where: { id: context.planRow.id },
      data: {
        structureJson: JSON.stringify(replanned.output),
        targetWordCount: revision.recommendedTargetWordCount,
        endingPromise: replanned.output.endingPromise,
        schemaVersion: 2,
        status: "writing",
      },
    });
    let previousContinuity = "";
    let previousContentTail = "";
    for (const segment of context.segments) {
      const segmentPlan = replanned.output.segments.find((item) => item.order === segment.order);
      if (!segmentPlan) continue;
      const generated = await runStructuredPrompt({
        asset: shortStorySegmentWritePrompt,
        promptInput: {
          originalIdea: context.activeIntent.originalExpression,
          understanding: context.interpretation.understanding,
          direction,
          plan: replanned.output,
          segment: segmentPlan,
          previousContinuity,
          previousContentTail,
          writingPlatform: shortStoryPlatformText(parseWritingPlatformSnapshot(context.novel.writingPlatformSnapshotJson), "drafting"),
          bookStyle: context.novel.styleTone ?? direction.styleKeywords.join("、"),
          productionFoundation: context.productionFoundation,
        },
        contextBlocks: buildShortStoryWriterContextBlocks({
          originalIdea: context.activeIntent.originalExpression,
          understanding: context.interpretation.understanding,
          direction,
          plan: replanned.output,
          segment: segmentPlan,
          previousContinuity,
          previousContentTail,
          platform: parseWritingPlatformSnapshot(context.novel.writingPlatformSnapshotJson),
          bookStyle: context.novel.styleTone ?? direction.styleKeywords.join("、"),
          productionFoundation: context.productionFoundation,
        }),
        options: {
          novelId: context.novel.id,
          taskId: context.task.id,
          stage: "short_story_draft",
          itemKey: `revision_segment:${segment.order}`,
          entrypoint: "short_story_studio",
          temperature: 0.75,
          maxTokens: Math.min(12000, Math.max(2500, segmentPlan.targetWordCount * 2)),
        },
      });
      await prisma.shortStorySegment.update({
        where: { id: segment.id },
        data: {
          content: generated.output.content.trim(),
          targetWordCount: segmentPlan.targetWordCount,
          version: { increment: 1 },
          humanSnapshotJson: appendSnapshot(segment.humanSnapshotJson, segment.content, segment.version),
          userEditedAt: null,
          generatedAt: new Date(),
          status: "completed",
          qualityResultJson: JSON.stringify({ continuitySummary: generated.output.continuitySummary }),
        },
      });
      previousContinuity = generated.output.continuitySummary;
      previousContentTail = generated.output.content.slice(-1800);
    }
    await prisma.shortStoryPlan.update({
      where: { id: context.planRow.id },
      data: { status: "completed", qualityDebtJson: "[]" },
    });
  }

  private async loadRevisionContext(novelId: string) {
    const novel = await prisma.novel.findUnique({
      where: { id: novelId },
      include: {
        genre: true,
        primaryStoryMode: true,
        secondaryStoryMode: true,
        shortStoryPlan: {
          include: { segments: { orderBy: { order: "asc" } } },
        },
        intentVersions: {
          where: { status: "active" },
          orderBy: { version: "desc" },
          take: 1,
        },
        workflowTasks: {
          where: { lane: "creation_studio" },
          orderBy: { updatedAt: "desc" },
          take: 1,
        },
      },
    });
    if (!novel || novel.narrativeForm !== "short_story" || !novel.shortStoryPlan) {
      throw new AppError("短篇作品尚未准备好。", 409);
    }
    const activeIntent = novel.intentVersions[0];
    const task = novel.workflowTasks[0];
    if (!activeIntent || !task) {
      throw new AppError("短篇作品缺少可恢复的创作上下文。", 409);
    }
    const interpretation = parseJson<CreationIntentInterpretation | null>(activeIntent.structuredIntentJson, null);
    const selected = parseJson<{ selectedDirectionId?: string }>(activeIntent.impactScopeJson, {});
    const direction = interpretation?.directions.find((item) => item.id === selected.selectedDirectionId);
    if (!interpretation || !direction) {
      throw new AppError("短篇作品缺少生效中的创作方向。", 409);
    }
    return {
      novel,
      planRow: novel.shortStoryPlan,
      plan: parseJson<ShortStoryPlanContract>(novel.shortStoryPlan.structureJson, {
        title: novel.title,
        targetWordCount: novel.targetWordCount ?? novel.shortStoryPlan.targetWordCount,
        endingPromise: novel.shortStoryPlan.endingPromise,
        segments: [],
      }),
      segments: novel.shortStoryPlan.segments,
      activeIntent,
      interpretation,
      direction,
      task,
      productionFoundation: shortStoryProductionFoundationText(novel),
    };
  }
}

export const shortStoryStudioService = new ShortStoryStudioService();
