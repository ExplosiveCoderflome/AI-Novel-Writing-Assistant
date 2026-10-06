import type {Prisma} from "@prisma/client";
import type {DirectorVersion, NovelDirectorIdentity} from "@ai-novel/shared/types/director/version";
import {prisma} from "../../../db/prisma";
import {AppError} from "../../../middleware/errorHandler";
import {withSqliteRetry} from "../../../db/sqliteRetry";

type Database = Pick<Prisma.TransactionClient, "novel" | "novelWorkflowTask" | "directorNextRun" | "directorNextRunControl" | "directorRunCommand" | "generationJob">;
export const directorV2Available = () => ["true", "1"].includes(process.env.DIRECTOR_NEXT_ENABLED ?? "");
const activeRuns = ["queued", "running", "waiting_gate", "paused"];
const activeTasks = ["queued", "running", "waiting_approval"] as const;
const openingCommands = new Set(["generate_candidates", "refine_candidates", "patch_candidate", "refine_titles", "confirm_candidate"]);

export function directorSourceRoute(novelId: string, version: DirectorVersion): string {
  return version === "v2" ? `/lab/director/${encodeURIComponent(novelId)}` : `/novels/${encodeURIComponent(novelId)}/edit`;
}

export async function readNovelDirectorIdentity(novelId: string, db: Database = prisma): Promise<Pick<NovelDirectorIdentity, "novelId" | "version" | "epoch" | "sourceRoute">> {
  const book = await db.novel.findUnique({where: {id: novelId}, select: {directorVersion: true, directorEpoch: true, narrativeForm: true}});
  if (!book) throw new AppError("找不到这本小说。", 404);
  if (book.narrativeForm === "short_story") throw new AppError("导演版本选择适用于长篇小说。", 400);
  if (book.directorVersion && !["v1", "v2"].includes(book.directorVersion)) throw new AppError("小说导演归属无效，请检查运行记录。", 409);
  const version: DirectorVersion = book.directorVersion as DirectorVersion
    || (await db.directorNextRun.findFirst({where: {novelId}, select: {id: true}}) ? "v2" : "v1");
  return {novelId, version, epoch: book.directorEpoch, sourceRoute: directorSourceRoute(novelId, version)};
}

export async function assertNovelDirectorVersion(novelId: string, version: DirectorVersion, epoch?: number, db: Database = prisma) {
  const identity = await readNovelDirectorIdentity(novelId, db);
  if (identity.version !== version || (epoch !== undefined && epoch !== identity.epoch)) {
    throw new AppError(`请从本书导演 ${identity.version.toUpperCase()} 工作台开始新的创作。`, 409, {sourceRoute: identity.sourceRoute});
  }
  if (version === "v2" && !directorV2Available()) throw new AppError("导演 V2 未启用，请启用后继续本书创作。", 409);
  return identity;
}

export async function canExecuteLegacyTask(taskId: string, db: Database = prisma): Promise<boolean> {
  const task = await db.novelWorkflowTask.findUnique({where: {id: taskId}, select: {novelId: true, directorVersion: true, directorEpoch: true}});
  if (!task) return false;
  if (!task.novelId) return !task.directorVersion || task.directorVersion === "v1";
  const identity = await readNovelDirectorIdentity(task.novelId, db);
  return identity.version === "v1" && (!task.directorVersion || task.directorVersion === "v1") && (task.directorEpoch ?? 0) === identity.epoch;
}

export async function assertLegacyTaskExecution(taskId: string, commandType?: string, allowV2Opening = false, db: Database = prisma): Promise<void> {
  const task = await db.novelWorkflowTask.findUnique({where: {id: taskId}, select: {novelId: true, directorVersion: true}});
  if (!task) throw new AppError("找不到这项创作任务。", 404);
  if (allowV2Opening && !task.novelId && task.directorVersion === "v2" && commandType && openingCommands.has(commandType)) return;
  if (!await canExecuteLegacyTask(taskId, db)) throw new AppError("这项任务属于其他导演版本或已结束的创作代次，请打开小说对应的工作台。", 409);
}

export async function assertV2RunExecution(runId: string): Promise<void> {
  const run = await prisma.directorNextRun.findUnique({where: {id: runId}, select: {novelId: true, contractJson: true}});
  if (!run) throw new AppError("找不到这次导演 V2 创作。", 404);
  await assertNovelDirectorVersion(run.novelId, "v2", readRunExecutionEpoch(run.contractJson));
}

export function readRunExecutionEpoch(contractJson: string): number {
  try {
    const value = JSON.parse(contractJson).executionEpoch ?? 0;
    if (Number.isSafeInteger(value) && value >= 0) return value;
  } catch { /* Invalid ownership is never guessed. */ }
  throw new AppError("创作任务的执行归属损坏，请检查运行记录。", 409);
}

async function hasActiveProduction(novelId: string, epoch: number, db: Database): Promise<boolean> {
  const identity = await readNovelDirectorIdentity(novelId, db);
  const [runs, task, jobs, liveCommand, liveV2Lease] = await Promise.all([
    identity.version === "v2" ? db.directorNextRunControl.findMany({where: {novelId, status: {in: activeRuns}}, select: {run: {select: {contractJson: true}}}}) : [],
    identity.version === "v1" ? db.novelWorkflowTask.findFirst({where: {novelId, OR: [{directorEpoch: epoch}, ...(epoch === 0 ? [{directorEpoch: null}] : [])], AND: [{OR: [{status: {in: [...activeTasks]}}, {pendingManualRecovery: true}]}, {OR: [{currentItemKey: null}, {currentItemKey: {not: "opening_complete"}}]}]}, select: {id: true}}) : null,
    db.generationJob.findMany({where: {novelId, OR: [{status: {in: ["queued", "running"]}}, {pendingManualRecovery: true}]}, select: {payload: true, executionLeaseExpiresAt: true}}),
    db.directorRunCommand.findFirst({where: {task: {novelId}, OR: [
      {status: {in: ["leased", "running"]}, leaseExpiresAt: {gt: new Date()}},
      ...(identity.version === "v1" ? [{status: "queued", task: {status: {not: "cancelled" as const}, AND: [
        {OR: [{directorEpoch: epoch}, ...(epoch === 0 ? [{directorEpoch: null}] : [])]},
        {OR: [{directorVersion: "v1"}, {directorVersion: null}]},
      ]}}] : []),
    ]}, select: {id: true}}),
    db.directorNextRunControl.findFirst({where: {novelId, leaseExpiresAt: {gt: new Date()}, leaseOwner: {not: null}}, select: {runId: true}}),
  ]);
  if (task || liveCommand || liveV2Lease || runs.some(run => readRunExecutionEpoch(run.run.contractJson) === epoch)) return true;
  for (const job of jobs) {
    if (job.executionLeaseExpiresAt && job.executionLeaseExpiresAt > new Date()) return true;
    let payload: {directorNext?: {runId: string}; workflowTaskId?: string};
    try {payload = JSON.parse(job.payload || "{}");} catch {return true;}
    if (payload.directorNext) {
      const owner = await db.directorNextRun.findUnique({where: {id: payload.directorNext.runId}, select: {contractJson: true}});
      if (!owner || (identity.version === "v2" && readRunExecutionEpoch(owner.contractJson) === epoch)) return true;
    } else if (payload.workflowTaskId) {
      const owner = await db.novelWorkflowTask.findUnique({where: {id: payload.workflowTaskId}, select: {directorEpoch: true}});
      if (!owner || (identity.version === "v1" && (owner.directorEpoch ?? 0) === epoch)) return true;
    } else return true;
  }
  return false;
}

export async function getNovelDirectorIdentity(novelId: string): Promise<NovelDirectorIdentity> {
  const identity = await readNovelDirectorIdentity(novelId);
  const blocked = await hasActiveProduction(novelId, identity.epoch, prisma);
  return {...identity, availableVersions: directorV2Available() ? ["v1", "v2"] : ["v1"], canSwitch: !blocked,
    blockedReason: blocked ? "请先结束本书当前创作任务，再选择导演版本。" : null};
}

export async function switchNovelDirectorVersion(novelId: string, version: DirectorVersion, expectedEpoch: number): Promise<NovelDirectorIdentity> {
  if (version === "v2" && !directorV2Available()) throw new AppError("导演 V2 未启用。", 409);
  await withSqliteRetry(() => prisma.$transaction(async tx => {
    const locked = await tx.novel.updateMany({where: {id: novelId, directorEpoch: expectedEpoch}, data: {directorEpoch: {increment: 0}}});
    if (locked.count !== 1) throw new AppError("本书导演设置已变化，请刷新后重新选择。", 409);
    const identity = await readNovelDirectorIdentity(novelId, tx);
    if (identity.version === version) return;
    if (await hasActiveProduction(novelId, expectedEpoch, tx)) throw new AppError("请先结束本书当前创作任务，再选择导演版本。", 409);
    await tx.novel.update({where: {id: novelId}, data: {directorVersion: version, directorEpoch: {increment: 1}}});
  }), {label: "director.switch_version"});
  return getNovelDirectorIdentity(novelId);
}

export async function readOpeningVersion(taskId: string | undefined, requested?: DirectorVersion): Promise<DirectorVersion> {
  const task = taskId ? await prisma.novelWorkflowTask.findUnique({where: {id: taskId}, select: {directorVersion: true}}) : null;
  const frozen = task ? (task.directorVersion ?? "v1") : null;
  if (frozen && requested && frozen !== requested) throw new AppError("请结束当前开书任务后再选择其他导演版本。", 409);
  const version = (frozen as DirectorVersion | null) ?? requested ?? "v1";
  if (!["v1", "v2"].includes(version)) throw new AppError("开书任务的导演归属无效，请检查运行记录。", 409);
  if (version === "v2" && !directorV2Available()) throw new AppError("导演 V2 未启用。", 409);
  return version;
}
