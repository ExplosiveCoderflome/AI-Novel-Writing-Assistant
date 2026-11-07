import type { Prisma } from "@prisma/client";
import type { RunContract } from "../../../../modules/director";
import type { PreparedChapter, UnitRun } from "../../../../modules/production";
import { canonicalProductionJson } from "../../../../modules/production/common";
import { AppError } from "../../../../middleware/errorHandler";

/** Explicit retry of a known empty response; successful preparation and accounting stay intact. */
export async function retryUnusableDraft(tx: Prisma.TransactionClient, contract: RunContract, runs: UnitRun[]): Promise<number> {
  const failed = runs.filter(run => {
    const draft = run.progress.stageResults?.draft;
    return draft?.stage === "draft" && draft.contentHash === null;
  });
  if (failed.length > 1) throw new AppError("存在多个未完成的写作步骤，请检查运行记录。", 409);
  for (const run of failed) {
    const unit = run.progress.unit, range = contract.chapterRange;
    const baseline = (run.artifacts.prepared as unknown as PreparedChapter | undefined)?.baseline;
    const draft = run.progress.stageResults?.draft;
    if (!range || unit.novelId !== contract.novelId || unit.order < range.from || unit.order > range.to
      || run.activeStage || run.activeRequestKey || !baseline || run.artifacts.original?.trim()
      || !run.progress.completed.includes("draft") || run.progress.completed.some(stage => stage !== "prepare" && stage !== "draft")
      || run.progress.original || run.progress.candidate || run.progress.selected || run.progress.committedContentHash
      || draft?.stage !== "draft" || draft.contentHash !== null) {
      throw new AppError("写作失败记录与保存结果不一致，请检查章节。", 409);
    }
    const chapter = await tx.chapter.findFirst({where: {id: unit.chapterId, novelId: unit.novelId, order: unit.order}});
    if (!chapter || chapter.content !== baseline.content) throw new AppError("正文已被修改，请先从章节页面检查。", 409);
    const locked = await tx.chapter.updateMany({where: {id: chapter.id, content: chapter.content, updatedAt: chapter.updatedAt}, data: {updatedAt: chapter.updatedAt}});
    if (locked.count !== 1) throw new AppError("正文在恢复期间发生变化，请刷新后重试。", 409);
    const progress = {...run.progress, completed: run.progress.completed.filter(stage => stage !== "draft"), stageResults: {...run.progress.stageResults}};
    delete progress.stageResults.draft;
    const artifacts = {...run.artifacts, receipts: {...run.artifacts.receipts}};
    delete artifacts.receipts.draft;
    delete artifacts.original;
    const changed = await tx.productionUnitRun.updateMany({where: {id: run.id, ownerKey: run.ownerKey, version: run.version, activeStage: null, activeRequestKey: null},
      data: {progressJson: canonicalProductionJson(progress), stageArtifactsJson: canonicalProductionJson(artifacts), version: {increment: 1}}});
    if (changed.count !== 1) throw new AppError("写作进度发生变化，请刷新后重试。", 409);
    const latest = await tx.directorNextEvent.findFirst({where: {runId: contract.runId}, orderBy: {seq: "desc"}, select: {seq: true}});
    const seq = (latest?.seq ?? 0) + 1;
    await tx.directorNextEvent.create({data: {id: `${contract.runId}:${seq}`, runId: contract.runId, seq,
      type: "production_kernel_draft_retry", payloadJson: canonicalProductionJson({unitRunId: run.id, previousVersion: run.version, receipt: run.artifacts.receipts.draft ?? null})}});
  }
  return failed.length;
}
