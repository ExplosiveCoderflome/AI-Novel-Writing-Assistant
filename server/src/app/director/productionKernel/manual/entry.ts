import {randomUUID} from "node:crypto";
import {setTimeout as wait} from "node:timers/promises";
import type {PrismaClient} from "@prisma/client";
import type {DirectorNextServices} from "../../../../modules/director";
import {readNovelDirectorIdentity} from "../../../../modules/novel/director-routing";
import {hashProductionContent} from "../../../../modules/production";
import type {PreparedChapter} from "../../../../modules/production";
import type {RunContract} from "../../../../modules/director";
import type {AuditReport} from "@ai-novel/shared/types/novel";
import {AppError} from "../../../../middleware/errorHandler";
import {resolveLLMClientOptions} from "../../../../llm/factory";
import {chapterRuntimeRequestSchema} from "../../../../services/novel/runtime/chapterRuntimeSchema";
import type {ChapterAcceptanceAssessmentResult} from "../../../../services/novel/runtime/ChapterAcceptanceAssessmentService";
import {getDirectorChapterBudgetSettings} from "../../../../services/settings/chapterBudget";
import {buildRuntimePackage} from "../../../../services/novel/runtime/chapterRuntimePackageBuilders";
import {openConflictService} from "../../../../services/state/OpenConflictService";
import {PlannerService} from "../../../../services/planner/PlannerService";
import {productionBatchOwnerKey} from "../execution/ownership";
import {productionKernelV2ChaptersEnabled} from "../batch/router";
import type {ManualChapterOperation, ManualChapterLaunchInput} from "./contract";
import {readManualChapterRequest} from "./contract";

interface ManualChapterEntryDependencies {
  db: PrismaClient;
  commands(): DirectorNextServices["http"]["commandService"];
  wake(): void;
  enabled?: () => boolean;
  readTokenLimit?: () => Promise<number>;
  resolveModel?: typeof resolveLLMClientOptions;
}

export function createManualChapterEntry(deps: ManualChapterEntryDependencies) {
  const source = (novelId: string) => `/lab/director/${encodeURIComponent(novelId)}`;
  async function handles(novelId: string): Promise<boolean> {
    if (!(deps.enabled ?? productionKernelV2ChaptersEnabled)()) return false;
    return (await readNovelDirectorIdentity(novelId, deps.db)).version === "v2";
  }
  async function start(novelId: string, chapterId: string, operation: ManualChapterOperation,
    input: Record<string, unknown>): Promise<string> {
    const identity = await readNovelDirectorIdentity(novelId, deps.db);
    if (identity.version !== "v2") throw new AppError("请从本书对应版本的正文页面操作。", 409);
    const [novel, chapter] = await Promise.all([
      deps.db.novel.findUniqueOrThrow({where: {id: novelId}, select: {title: true, description: true, estimatedChapterCount: true}}),
      deps.db.chapter.findFirst({where: {id: chapterId, novelId}, select: {id: true, order: true, content: true, updatedAt: true}}),
    ]);
    if (!chapter) throw new AppError("找不到这本书的对应章节。", 404);
    if (operation === "write" && chapter.content?.trim()) throw new AppError("本章已有正文，请使用修章或重新审校。", 409);
    if (operation !== "write" && !chapter.content?.trim()) throw new AppError("请先保存本章正文，再修章或审校。", 400);
    if (typeof input.content === "string" && input.content !== (chapter.content ?? "")) {
      throw new AppError("请先保存当前正文，再重新审校。", 409);
    }
    if (Array.isArray(input.auditIssueIds) && input.auditIssueIds.length) {
      const count = await deps.db.auditIssue.count({where: {id: {in: [...new Set(input.auditIssueIds as string[])]}, report: {novelId, chapterId}, status: "open"}});
      if (count !== new Set(input.auditIssueIds).size) throw new AppError("所选问题已变化，请刷新本章审校结果。", 409);
    }
    const {workflowTaskId: _oldTask, ...options} = chapterRuntimeRequestSchema.parse(input);
    const model = await (deps.resolveModel ?? resolveLLMClientOptions)(options.provider,
      {model: options.model, temperature: options.temperature, taskType: "writer"});
    const chapterTokenLimit = await (deps.readTokenLimit ?? (async () => (await getDirectorChapterBudgetSettings()).tokenLimit))();
    const launchInput: ManualChapterLaunchInput = {storyInput: novel.description?.trim() || novel.title,
      estimatedChapterCount: Math.max(novel.estimatedChapterCount ?? 1, chapter.order), worldMode: "skip", targetMode: "opening",
      executionRange: {from: chapter.order, to: chapter.order}, chapterTokenLimit,
      provider: model.provider, model: model.model, temperature: options.temperature,
      manualChapter: {operation, chapterId, baseline: {content: chapter.content, updatedAt: chapter.updatedAt.toISOString()}, options}};
    const result = await deps.commands().execute({type: "open_run", novelId, driver: "auto", stepIdsInScope: ["chapter_batch"],
      launchInput, idempotencyKey: `manual-chapter:${randomUUID()}`});
    deps.wake();
    return result.runId;
  }
  async function result(novelId: string, chapterId: string, runId: string) {
    const row = await deps.db.productionUnitRun.findUnique({where: {ownerKey_chapterId: {ownerKey: productionBatchOwnerKey(runId), chapterId}}});
    if (!row || row.novelId !== novelId) throw new AppError("本章结果尚未保存，请从正文页面查看创作进度。", 409);
    const progress = JSON.parse(row.progressJson), artifacts = JSON.parse(row.stageArtifactsJson);
    const chapter = await deps.db.chapter.findFirstOrThrow({where: {id: chapterId, novelId}, select: {content: true, generationState: true}});
    if (!progress.completed.includes("reconcile") || !progress.committedContentHash
      || hashProductionContent(chapter.content ?? "") !== progress.committedContentHash) {
      throw new AppError("本章正文已变化，请重新审校当前保存的版本。", 409);
    }
    const review = artifacts.stageData?.[progress.selected === "candidate" ? "verify" : "accept"] as ChapterAcceptanceAssessmentResult;
    const auditReports = JSON.parse(JSON.stringify(await deps.db.auditReport.findMany({where: {novelId, chapterId}, include: {issues: true}, orderBy: {createdAt: "desc"}}))) as AuditReport[];
    const savedRun = await deps.db.directorNextRun.findUniqueOrThrow({where: {id: runId}, select: {contractJson: true}});
    const contract = JSON.parse(savedRun.contractJson) as RunContract, manual = readManualChapterRequest(contract)!;
    const prepared = artifacts.prepared as PreparedChapter;
    const runtimePackage = buildRuntimePackage({novelId, chapterId, request: {...manual.options,
      provider: contract.launchInput!.provider as ManualChapterLaunchInput["manualChapter"]["options"]["provider"], model: contract.launchInput!.model},
      contextPackage: prepared.contextPackage, finalContent: chapter.content ?? "", auditResult: {score: review.score, auditReports},
      activeOpenConflicts: await openConflictService.listOpenConflicts(novelId, {beforeChapterOrder: progress.unit.order, includeCurrentChapter: true, limit: 8}),
      styleReview: {report: review.styleReviewReport ?? null, signalScan: review.styleSignalScan, autoRewritten: false, originalContent: null, finalContent: chapter.content ?? ""},
      acceptance: review.assessment, runId, plannerService: new PlannerService()});
    runtimePackage.draft.generationState = progress.selected === "candidate" ? "repaired" : "drafted";
    return {content: chapter.content ?? "", review: {...review, auditReports}, progress, prepared, runtimePackage};
  }
  async function waitForResult(novelId: string, chapterId: string, runId: string, signal?: AbortSignal) {
    for (;;) {
      signal?.throwIfAborted();
      const control = await deps.db.directorNextRunControl.findUniqueOrThrow({where: {runId}});
      if (control.status === "completed") return result(novelId, chapterId, runId);
      if (!["queued", "running"].includes(control.status)) {
        const pause = control.pauseJson ? JSON.parse(control.pauseJson) as {reason?: string} : null;
        throw new AppError(pause?.reason ?? control.failureReason ?? "本章创作需要处理，请返回本书工作台查看。", 409,
          {runId, sourceRoute: source(novelId)});
      }
      await wait(1000, undefined, {signal});
    }
  }
  return {handles, start, result, waitForResult};
}
