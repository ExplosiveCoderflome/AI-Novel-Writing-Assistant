import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import type {
  CreationDirection, CreationIntentInterpretation, CreationRevisionStrategy, ShortStoryPlanContract,
} from "@ai-novel/shared/types/creationStudio";
import { prisma } from "../../../../db/prisma";
import { AppError } from "../../../../middleware/errorHandler";
import { runStructuredPrompt } from "../../../../prompting/core/promptRunner";
import {
  shortStoryPatchRepairPrompt, shortStorySegmentWritePrompt,
} from "../../../../prompting/prompts/shortStory/shortStory.prompts";
import { appendSnapshot, parseJson, type RevisionBaseline } from "../domain/revisionState";
import { assertBaseline, loadRevisionContext, RevisionConflict } from "./ShortStoryContext";
import {
  buildShortStoryWriterContextBlocks, parseWritingPlatformSnapshot, shortStoryPlatformText,
} from "./shortStoryPromptContext";

export interface RevisionPreviewData {
  baseline: RevisionBaseline;
  originalIdea: string;
  mode: "revision" | "replan";
  candidatePlan: ShortStoryPlanContract | null;
  selectedDirectionId: string;
  revision: {
    understoodGoal: string;
    affectedSegmentOrders: number[];
    recommendedStrategy: CreationRevisionStrategy;
    recommendedTargetWordCount: number;
    revisedDirection: CreationDirection;
  };
}

const LEASE_MS = 90000;

export class ShortStoryRevisionService {
  private readonly running = new Set<string>();

  async confirm(novelId: string, intentVersionId: string): Promise<{ taskId: string }> {
    const existing = await prisma.shortStoryRevisionJob.findUnique({ where: { intentVersionId } });
    if (existing) {
      if (existing.novelId !== novelId) throw new AppError("修改预览不存在。", 404);
      // Repeated confirmation never resumes a cancelled or failed operation.
      return { taskId: existing.workflowTaskId };
    }
    const context = await loadRevisionContext(novelId);
    const proposed = await prisma.novelIntentVersion.findFirst({
      where: { id: intentVersionId, novelId, workflowTaskId: context.task.id, status: "proposed", source: "revision" },
    });
    const preview = parseJson<RevisionPreviewData | null>(proposed?.impactScopeJson, null);
    if (!proposed || !preview?.baseline) throw new AppError("修改预览已失效，请重新生成。", 409);
    assertBaseline(context, preview.baseline);
    if (context.task.status === "running" || context.task.status === "queued") {
      throw new AppError("请等待当前生成结束后再确认修改。", 409);
    }
    if (JSON.stringify(preview.baseline.checkpoint) !== JSON.stringify({
      status: context.task.status, type: context.task.checkpointType, summary: context.task.checkpointSummary,
      operationId: context.task.shortStoryOperationId, pendingManualRecovery: context.task.pendingManualRecovery,
      cancelRequestedAt: context.task.cancelRequestedAt?.toISOString() ?? null,
    })) throw new AppError("等待确认的任务已变化，请重新查看调整方案。", 409);
    if (context.task.checkpointType === "replan_required" && preview.mode !== "replan") {
      throw new AppError("请先查看并确认故事调整方案。", 409);
    }
    try {
      await prisma.$transaction(async (tx) => {
        // The task compare-and-swap serializes competing previews and cancellation.
        const claimed = await tx.novelWorkflowTask.updateMany({
          where: {
            id: context.task.id, status: context.task.status,
            checkpointType: context.task.checkpointType, checkpointSummary: context.task.checkpointSummary,
            shortStoryOperationId: context.task.shortStoryOperationId,
            pendingManualRecovery: context.task.pendingManualRecovery, cancelRequestedAt: context.task.cancelRequestedAt,
          },
          data: {
            status: "queued", shortStoryOperationId: proposed.id,
            checkpointType: null, checkpointSummary: null, pendingManualRecovery: false,
            cancelRequestedAt: null, finishedAt: null, lastError: null, progress: 0,
            currentItemKey: "revision_apply", currentItemLabel: "正在准备确认的修改",
          },
        });
        if (!claimed.count) throw new RevisionConflict();
        await this.checkVersions(tx, preview.baseline, novelId);
        await tx.shortStoryRevisionJob.create({
          data: {
            id: proposed.id, novelId, workflowTaskId: context.task.id, intentVersionId: proposed.id,
            strategy: preview.revision.recommendedStrategy, baselineJson: JSON.stringify(preview.baseline),
            candidatePlanJson: preview.candidatePlan ? JSON.stringify(preview.candidatePlan) : null,
          },
        });
      }, { isolationLevel: "Serializable" });
    } catch (error) {
      const winner = await prisma.shortStoryRevisionJob.findUnique({ where: { intentVersionId } });
      if (!winner || winner.novelId !== novelId) throw error;
    }
    return { taskId: context.task.id };
  }

  async retry(jobId: string): Promise<void> {
    try {
      await prisma.$transaction(async (tx) => {
        const job = await tx.shortStoryRevisionJob.findUniqueOrThrow({ where: { id: jobId } });
        if (job.status === "completed") return;
        if (job.status === "conflict") throw new RevisionConflict();
        const task = await tx.novelWorkflowTask.findUniqueOrThrow({ where: { id: job.workflowTaskId } });
        if (task.shortStoryOperationId !== job.id || task.checkpointType === "replan_required") throw new RevisionConflict();
        if (task.status === "queued" || task.status === "running") return;
        if (task.status !== "failed" && task.status !== "cancelled") throw new AppError("当前修改不需要重试。", 409);
        if (job.leaseExpiresAt && job.leaseExpiresAt > new Date()) {
          throw new AppError("修改正在停止，请稍后继续。", 409);
        }
        await this.checkVersions(tx, parseJson<RevisionBaseline>(job.baselineJson, null!), job.novelId);
        const updated = await tx.novelWorkflowTask.updateMany({
          where: { id: task.id, status: task.status, shortStoryOperationId: job.id },
          data: {
            status: "queued", cancelRequestedAt: null, pendingManualRecovery: false,
            lastError: null, finishedAt: null, checkpointType: null, checkpointSummary: null,
            attemptCount: { increment: 1 }, currentItemKey: "revision_apply", currentItemLabel: "正在继续确认的修改",
          },
        });
        if (!updated.count) return;
        await tx.shortStoryRevisionJob.update({
          where: { id: job.id }, data: { status: "queued", lastError: null },
        });
      }, { isolationLevel: "Serializable" });
    } catch (error) {
      if (error instanceof RevisionConflict) {
        await prisma.$transaction(async (tx) => {
          const job = await tx.shortStoryRevisionJob.findUniqueOrThrow({ where: { id: jobId } });
          await tx.shortStoryRevisionJob.updateMany({
            where: { id: jobId, status: { in: ["failed", "queued"] } },
            data: { status: "conflict", lastError: error.message },
          });
          await tx.novelWorkflowTask.updateMany({
            where: { id: job.workflowTaskId, shortStoryOperationId: jobId, status: { in: ["failed", "cancelled"] } },
            data: { lastError: error.message, currentItemLabel: "请重新预览修改范围" },
          });
        });
      }
      throw error;
    }
  }

  async run(jobId: string): Promise<void> {
    if (this.running.has(jobId)) return;
    this.running.add(jobId);
    const token = randomUUID();
    let heartbeat: ReturnType<typeof setInterval> | undefined;
    try {
      const job = await prisma.shortStoryRevisionJob.findUnique({ where: { id: jobId } });
      if (!job || job.status === "completed" || job.status === "conflict") return;
      const task = await prisma.novelWorkflowTask.findUnique({ where: { id: job.workflowTaskId } });
      if (!task || task.shortStoryOperationId !== jobId || task.cancelRequestedAt
        || task.pendingManualRecovery || task.checkpointType === "replan_required"
        || (task.status !== "queued" && task.status !== "running")) return;
      if (job.leaseExpiresAt && job.leaseExpiresAt > new Date()) {
        const timer = setTimeout(() => { void this.run(jobId).catch(console.error); },
          job.leaseExpiresAt.getTime() - Date.now() + 50);
        timer.unref();
        return;
      }
      const claim = await prisma.shortStoryRevisionJob.updateMany({
        where: { id: jobId, status: { in: ["queued", "running", "failed"] },
          OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lte: new Date() } }] },
        data: { status: "running", leaseToken: token, leaseExpiresAt: new Date(Date.now() + LEASE_MS), lastError: null },
      });
      if (!claim.count) return;
      heartbeat = setInterval(() => {
        void prisma.shortStoryRevisionJob.updateMany({
          where: { id: jobId, leaseToken: token, status: "running", leaseExpiresAt: { gt: new Date() } },
          data: { leaseExpiresAt: new Date(Date.now() + LEASE_MS) },
        }).then(async ({ count }) => {
          if (count) await prisma.novelWorkflowTask.updateMany({
            where: { id: task.id, shortStoryOperationId: jobId, status: "running", cancelRequestedAt: null },
            data: { heartbeatAt: new Date() },
          });
        }).catch((error) => console.error("[short-story.revision] heartbeat failed", error));
      }, 20000);
      heartbeat.unref();
      const baseline = parseJson<RevisionBaseline>(job.baselineJson, null!);
      const context = await loadRevisionContext(job.novelId);
      assertBaseline(context, baseline);
      const intent = await prisma.novelIntentVersion.findUniqueOrThrow({ where: { id: job.intentVersionId } });
      const preview = parseJson<RevisionPreviewData>(intent.impactScopeJson, null!);
      const interpretation = parseJson<CreationIntentInterpretation>(intent.structuredIntentJson, null!);
      const direction = interpretation.directions.find((item) => item.id === preview.selectedDirectionId);
      if (!direction) throw new Error("修改缺少已确认的方向，请重新预览。");
      const plan = parseJson<ShortStoryPlanContract | null>(job.candidatePlanJson, null);
      await this.assertRunnable(jobId, token);
      await prisma.novelWorkflowTask.updateMany({
        where: { id: task.id, shortStoryOperationId: jobId, status: { in: ["queued", "running"] }, cancelRequestedAt: null },
        data: { status: "running", currentItemKey: "revision_apply", currentItemLabel: "正在按确认的范围修改作品", heartbeatAt: new Date() },
      });
      if (job.strategy === "full_replan") {
        if (!plan) throw new Error("完整调整方案缺失，请重新预览。");
        let previousContinuity = "";
        let previousContentTail = "";
        for (const segment of context.segments) {
          await this.assertRunnable(jobId, token);
          await this.checkVersions(prisma, baseline, job.novelId);
          await prisma.novelWorkflowTask.updateMany({
            where: { id: task.id, shortStoryOperationId: jobId, status: "running", cancelRequestedAt: null },
            data: { currentItemLabel: `正在调整正文（${segment.order}/${context.segments.length}）`,
              progress: (segment.order - 1) / context.segments.length * 0.95 },
          });
          let candidate = await prisma.shortStoryRevisionCandidate.findUnique({
            where: { jobId_segmentId: { jobId, segmentId: segment.id } },
          });
          if (!candidate) {
            const segmentPlan = plan.segments.find((item) => item.order === segment.order);
            if (!segmentPlan) throw new Error("调整方案的正文范围不完整。");
            const platform = parseWritingPlatformSnapshot(context.novel.writingPlatformSnapshotJson);
            const bookStyle = context.novel.styleTone ?? direction.styleKeywords.join("、");
            const input = {
              originalIdea: preview.originalIdea, understanding: interpretation.understanding, direction,
              plan, segment: segmentPlan, previousContinuity, previousContentTail,
              writingPlatform: shortStoryPlatformText(platform, "drafting"), bookStyle,
              productionFoundation: context.productionFoundation, reference: context.reference,
            };
            const generated = await runStructuredPrompt({
              asset: shortStorySegmentWritePrompt, promptInput: input,
              contextBlocks: buildShortStoryWriterContextBlocks({ ...input, platform }),
              options: {
                novelId: job.novelId, taskId: task.id, stage: "short_story_draft",
                itemKey: `revision_segment:${segment.order}`, entrypoint: "short_story_studio", temperature: 0.75,
                maxTokens: Math.min(12000, Math.max(2500, segmentPlan.targetWordCount * 2)),
              },
            });
            await this.assertRunnable(jobId, token);
            if (!generated.output.content.trim()) throw new Error("本段修改没有生成可用正文，请重试。");
            candidate = await prisma.shortStoryRevisionCandidate.create({
              data: { jobId, segmentId: segment.id, order: segment.order, content: generated.output.content.trim(),
                targetWordCount: segmentPlan.targetWordCount, continuitySummary: generated.output.continuitySummary },
            });
          }
          previousContinuity = candidate.continuitySummary ?? "";
          previousContentTail = candidate.content.slice(-1800);
        }
      } else {
        const candidates = await prisma.shortStoryRevisionCandidate.findMany({ where: { jobId } });
        if (candidates.length !== baseline.affectedIds.length) {
          const affected = context.segments.filter((segment) => baseline.affectedIds.includes(segment.id));
          const repaired = await runStructuredPrompt({
            asset: shortStoryPatchRepairPrompt,
            promptInput: {
              originalIdea: preview.originalIdea, understanding: interpretation.understanding, direction,
              plan: context.plan, content: context.segments.map((segment) => segment.content).join("\n\n"),
              audit: { decision: "patchable", summary: preview.revision.understoodGoal,
                issues: affected.map((segment) => ({
                  code: "confirmed_revision", description: preview.revision.understoodGoal,
                  affectedSegmentOrders: [segment.order], repairInstruction: preview.revision.understoodGoal,
                })) },
              segments: context.segments.map((segment) => ({
                order: segment.order, content: segment.content, humanEdited: !baseline.affectedIds.includes(segment.id),
              })),
              writingPlatform: shortStoryPlatformText(parseWritingPlatformSnapshot(context.novel.writingPlatformSnapshotJson), "repairing"),
              productionFoundation: context.productionFoundation, reference: context.reference,
            },
            options: { novelId: job.novelId, taskId: task.id, stage: "short_story_review", itemKey: "revision_apply",
              entrypoint: "short_story_studio", temperature: 0.5, maxTokens: 12000 },
          });
          const patches = repaired.output.patches;
          if (patches.length !== affected.length || new Set(patches.map((patch) => patch.segmentOrder)).size !== affected.length
            || affected.some((segment) => !patches.some((patch) => patch.segmentOrder === segment.order && patch.content.trim()))) {
            throw new Error("修改结果未覆盖确认的全部范围，请继续修改。");
          }
          await this.assertRunnable(jobId, token);
          await prisma.$transaction(async (tx) => {
            const lease = await tx.shortStoryRevisionJob.updateMany({
              where: { id: jobId, leaseToken: token, status: "running", leaseExpiresAt: { gt: new Date() } },
              data: { qualityDebtJson: JSON.stringify(repaired.output.residualQualityDebt) },
            });
            if (!lease.count) throw new Error("修改执行权已变化，请重新打开作品。");
            for (const segment of affected) {
              const patch = patches.find((item) => item.segmentOrder === segment.order)!;
              await tx.shortStoryRevisionCandidate.upsert({
                where: { jobId_segmentId: { jobId, segmentId: segment.id } }, update: {},
                create: { jobId, segmentId: segment.id, order: segment.order,
                  content: patch.content.trim(), targetWordCount: segment.targetWordCount },
              });
            }
          });
        }
      }
      await this.publish(jobId, token);
    } catch (error) {
      const message = error instanceof Error ? error.message : "作品修改未完成。";
      const conflict = error instanceof RevisionConflict;
      await prisma.$transaction(async (tx) => {
        const job = await tx.shortStoryRevisionJob.findUnique({ where: { id: jobId } });
        if (!job || job.leaseToken !== token || job.status === "completed") return;
        await tx.shortStoryRevisionJob.update({
          where: { id: jobId }, data: { status: conflict ? "conflict" : "failed", lastError: message,
            leaseToken: null, leaseExpiresAt: null },
        });
        await tx.novelWorkflowTask.updateMany({
          where: { id: job.workflowTaskId, shortStoryOperationId: jobId,
            status: { in: ["queued", "running"] }, cancelRequestedAt: null },
          data: { status: "failed", lastError: message, currentItemKey: "revision_apply",
            currentItemLabel: conflict ? "请重新预览修改范围" : "修改暂时中断，可继续修改", finishedAt: new Date() },
        });
      });
      throw error;
    } finally {
      if (heartbeat) clearInterval(heartbeat);
      this.running.delete(jobId);
      await prisma.shortStoryRevisionJob.updateMany({
        where: { id: jobId, leaseToken: token }, data: { leaseToken: null, leaseExpiresAt: null },
      });
    }
  }

  private async assertRunnable(jobId: string, token: string): Promise<void> {
    const job = await prisma.shortStoryRevisionJob.findUniqueOrThrow({ where: { id: jobId }, include: { workflowTask: true } });
    if (job.leaseToken !== token || !job.leaseExpiresAt || job.leaseExpiresAt <= new Date()
      || job.workflowTask.shortStoryOperationId !== jobId || job.workflowTask.cancelRequestedAt
      || job.workflowTask.pendingManualRecovery || job.workflowTask.checkpointType === "replan_required"
      || (job.workflowTask.status !== "queued" && job.workflowTask.status !== "running")) {
      throw new AppError("修改已停止，正文保持已保存的内容。", 409);
    }
  }

  private async checkVersions(tx: Prisma.TransactionClient, baseline: RevisionBaseline, novelId: string): Promise<void> {
    const plan = await tx.shortStoryPlan.findUnique({ where: { novelId }, include: { segments: { orderBy: { order: "asc" } } } });
    const active = await tx.novelIntentVersion.findFirst({
      where: { novelId, status: "active" }, orderBy: { version: "desc" },
    });
    if (!plan || plan.id !== baseline.planId || plan.updatedAt.toISOString() !== baseline.planUpdatedAt
      || active?.id !== baseline.intentId || plan.segments.length !== baseline.segments.length
      || plan.segments.some((segment) => !baseline.segments.some((item) => item.id === segment.id
        && item.order === segment.order && item.version === segment.version))) throw new RevisionConflict();
  }

  private async publish(jobId: string, token: string): Promise<void> {
    await this.assertRunnable(jobId, token);
    await prisma.$transaction(async (tx) => {
      const job = await tx.shortStoryRevisionJob.findUniqueOrThrow({ where: { id: jobId }, include: { candidates: true, intentVersion: true } });
      if (job.status === "completed") return;
      const baseline = parseJson<RevisionBaseline>(job.baselineJson, null!);
      await this.checkVersions(tx, baseline, job.novelId);
      if (job.candidates.length !== baseline.affectedIds.length
        || baseline.affectedIds.some((id) => !job.candidates.some((candidate) => candidate.segmentId === id && candidate.content.trim()))) {
        throw new Error("确认范围内仍有正文未完成，请继续修改。");
      }
      const originals = await tx.shortStorySegment.findMany({ where: { planId: baseline.planId } });
      if (job.candidates.every((candidate) => originals.find((segment) => segment.id === candidate.segmentId)?.content.trim() === candidate.content.trim())) {
        throw new RevisionConflict("修改结果与原文相同，请重新预览并确认修改。");
      }
      const claimed = await tx.shortStoryRevisionJob.updateMany({
        where: { id: jobId, status: "running", leaseToken: token, leaseExpiresAt: { gt: new Date() } },
        data: { status: "completed", leaseToken: null, leaseExpiresAt: null, lastError: null },
      });
      if (!claimed.count) throw new Error("修改执行权已变化，请重新打开作品。");
      const task = await tx.novelWorkflowTask.updateMany({
        where: { id: job.workflowTaskId, shortStoryOperationId: jobId, status: "running",
          cancelRequestedAt: null, pendingManualRecovery: false, checkpointType: null },
        data: { status: "succeeded", progress: 1, checkpointType: "workflow_completed",
          checkpointSummary: "已按确认的范围更新作品。", currentItemKey: "short_story_review",
          currentItemLabel: "修改已完成", lastError: null, finishedAt: new Date(), heartbeatAt: new Date() },
      });
      if (!task.count) throw new AppError("任务状态已变化，正文保持已保存的内容。", 409);
      for (const candidate of job.candidates) {
        const segment = originals.find((item) => item.id === candidate.segmentId)!;
        const updated = await tx.shortStorySegment.updateMany({
          where: { id: segment.id, version: baseline.segments.find((item) => item.id === segment.id)!.version },
          data: { content: candidate.content, version: { increment: 1 }, targetWordCount: candidate.targetWordCount,
            humanSnapshotJson: appendSnapshot(segment.humanSnapshotJson, segment.content, segment.version),
            userEditedAt: null, generatedAt: new Date(), status: "completed",
            qualityResultJson: JSON.stringify({ continuitySummary: candidate.continuitySummary, revised: true }) },
        });
        if (!updated.count) throw new RevisionConflict();
      }
      const preview = parseJson<RevisionPreviewData>(job.intentVersion.impactScopeJson, null!);
      const plan = parseJson<ShortStoryPlanContract | null>(job.candidatePlanJson, null);
      await tx.shortStoryPlan.update({
        where: { id: baseline.planId }, data: {
          intentVersionId: job.intentVersionId, status: "completed", auditResultJson: null,
          qualityDebtJson: job.qualityDebtJson ?? "[]",
          ...(plan ? { structureJson: JSON.stringify(plan), targetWordCount: plan.targetWordCount,
            endingPromise: plan.endingPromise, schemaVersion: 2 } : {}),
        },
      });
      await tx.novelIntentVersion.update({ where: { id: baseline.intentId }, data: { status: "superseded" } });
      await tx.novelIntentVersion.update({ where: { id: job.intentVersionId }, data: { status: "active" } });
      const direction = preview.revision.revisedDirection;
      await tx.novel.update({
        where: { id: job.novelId }, data: { title: direction.title, description: direction.premise,
          bookSellingPoint: direction.coreExperience, targetWordCount: preview.revision.recommendedTargetWordCount },
      });
    }, { isolationLevel: "Serializable" });
  }
}

export const shortStoryRevisionService = new ShortStoryRevisionService();
