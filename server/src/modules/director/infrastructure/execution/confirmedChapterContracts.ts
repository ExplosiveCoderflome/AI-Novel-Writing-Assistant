import type { PrismaClient } from "@prisma/client";
import { savedExecutionContract, type RunContract } from "../../domain";
import { artifactContentHash } from "../artifactContentHash";

type Database = Pick<PrismaClient, "directorNextRun" | "directorNextArtifact" | "chapter" | "$transaction">;

type ContractText = Pick<ReturnType<typeof savedExecutionContract>, "taskSheet" | "sceneCards">;

export async function readExecutionContracts(db: Pick<Database, "chapter">, contract: RunContract) {
  const range = contract.chapterRange;
  if (!range) throw new Error("缺少已授权的章节范围。");
  const rows = await db.chapter.findMany({
    where: {novelId: contract.novelId, order: {gte: range.from, lte: range.to}},
    orderBy: {order: "asc"}, select: {id: true, order: true, taskSheet: true, sceneCards: true,
      targetWordCount: true, conflictLevel: true, revealLevel: true, mustAvoid: true},
  });
  if (rows.length !== range.to - range.from + 1 || rows.some((row, i) =>
    row.order !== range.from + i || !row.taskSheet?.trim() || !row.sceneCards?.trim())) {
    throw new Error("请保存本批每一章完整的章节任务与场景。");
  }
  return rows.map(savedExecutionContract);
}

/** The director owns the approval. Ordinary manual and autonomous writing retain their JIT policy. */
export async function verifyConfirmedExecutionContract(
  matchesStoryPlanProjection: (rawPlan: string | null, current: ContractText, approved: ContractText) => boolean,
  db: Database,
  novelId: string,
  runId: string,
  chapterId: string,
) {
  const run = await db.directorNextRun.findFirst({
    where: {id: runId, novelId, driver: "assisted"}, select: {contractJson: true},
  });
  if (!run) return false;
  const contract = JSON.parse(run.contractJson) as RunContract;
  const selectApproval = {
    where: {novelId, scope: contract.scope, type: "chapter_execution_contract"},
    orderBy: {version: "desc" as const}, select: {status: true, contentHash: true, version: true},
  };
  const approval = await db.directorNextArtifact.findFirst(selectApproval);
  if (!approval || !["confirmed", "user_edited"].includes(approval.status)) return false;
  const saved = await readExecutionContracts(db, contract);
  const mismatch = () => new Error("本批章节任务或场景与确认稿不符，请返回导演台重新核对。");
  if (!saved.some(row => row.chapterId === chapterId)) throw mismatch();
  if (artifactContentHash(saved) === approval.contentHash) return true;
  if (approval.status === "user_edited") {
    // Earlier edit receipts recorded only the first chapter. A multi-chapter receipt still
    // needs its preceding whole-batch sync as evidence for the other chapters.
    const first = saved[0];
    const legacy = {id: first.chapterId, order: first.chapterOrder, taskSheet: first.taskSheet, sceneCards: first.sceneCards,
      targetWordCount: first.targetWordCount, mustAvoid: first.mustAvoid};
    if (artifactContentHash(legacy) === approval.contentHash) {
      if (saved.length === 1) return true;
      const prior = await db.directorNextArtifact.findFirst({...selectApproval,
        where: {...selectApproval.where, version: {lt: approval.version}}});
      if (prior?.contentHash === artifactContentHash(saved)) return true;
    }
  }

  // Older planner versions wrote their derived task/scene text into Chapter. Restore only a proven
  // projection from the author-approved source. Any unrelated edit aborts the entire transaction.
  await db.$transaction(async tx => {
    const active = await tx.directorNextArtifact.findFirst(selectApproval);
    if (active?.version !== approval.version || active?.status !== approval.status || active?.contentHash !== approval.contentHash) throw mismatch();
    const current = await readExecutionContracts(tx, contract);
    const source = await tx.volumeChapterPlan.findMany({where: {volume: {novelId},
      chapterId: {in: current.map(row => row.chapterId)}}, select: {chapterId: true, taskSheet: true, sceneCards: true}});
    const byId = new Map(source.map(row => [row.chapterId, row]));
    const approved = current.map(row => {
      const plan = byId.get(row.chapterId);
      if (!plan) throw mismatch();
      return {...row, taskSheet: plan.taskSheet, sceneCards: plan.sceneCards};
    });
    if (source.length !== current.length || artifactContentHash(approved) !== approval.contentHash) throw mismatch();
    for (const [i, row] of current.entries()) {
      const target = approved[i];
      if (row.taskSheet === target.taskSheet && row.sceneCards === target.sceneCards) continue;
      const planner = await tx.storyPlan.findFirst({where: {novelId, chapterId: row.chapterId, level: "chapter"},
        orderBy: {updatedAt: "desc"}, select: {rawPlanJson: true}});
      if (!matchesStoryPlanProjection(planner?.rawPlanJson ?? null, row, target)) throw mismatch();
      const changed = await tx.chapter.updateMany({where: {id: row.chapterId, novelId, taskSheet: row.taskSheet, sceneCards: row.sceneCards},
        data: {taskSheet: target.taskSheet, sceneCards: target.sceneCards}});
      if (changed.count !== 1) throw mismatch();
    }
  });
  return true;
}
