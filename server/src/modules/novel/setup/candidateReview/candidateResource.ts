import type { Prisma } from "@prisma/client";
import type { DirectorCandidate } from "@ai-novel/shared/types/novelDirector";
import { AppError } from "../../../../middleware/errorHandler";
import { DirectorTaskStateWriter, readDirectorTaskState } from "../../../../services/novel/director/state";
import { mergeSeedPayload } from "../../../../services/novel/workflow/novelWorkflow.shared";

export interface CandidateAddress { taskId: string; batchId: string; candidateId: string }
export const scopeOf = ({ taskId, batchId, candidateId }: CandidateAddress) =>
  JSON.stringify(["opening-candidate", taskId, batchId, candidateId]);
export const versionConflict = () => new AppError("这套方向有更新，请刷新方向候选，再继续讨论或采纳。", 409);

const selection = {
  lane: "auto_director", status: "waiting_approval", checkpointType: "candidate_selection_required",
  pendingManualRecovery: false, novelId: null, cancelRequestedAt: null,
  directorCommands: { none: { status: { in: ["queued", "leased", "running"] } } },
} satisfies Prisma.NovelWorkflowTaskWhereInput;

export async function readCandidate(db: Prisma.TransactionClient, address: CandidateAddress) {
  const row = await db.novelWorkflowTask.findFirst({
    where: { id: address.taskId, ...selection }, select: { seedPayloadJson: true, resumeTargetJson: true },
  });
  if (!row) throw new AppError("这次开书未在等待选择方向，请返回开书页查看进度。", 409);
  const state = readDirectorTaskState(row);
  if (state.launch.directorInput?.candidate) throw versionConflict();
  const batch = state.run.batches?.find(item => item.id === address.batchId);
  const candidate = batch?.candidates.find(item => item.id === address.candidateId);
  if (!batch || !candidate) throw new AppError("找不到这轮开书中的候选方向。", 404);
  return { row, state, batch, candidate, revision: candidate.reviewRevision ?? 0 };
}

export async function saveCandidate(db: Prisma.TransactionClient, address: CandidateAddress,
  source: Awaited<ReturnType<typeof readCandidate>>, candidate: DirectorCandidate) {
  const batches = source.state.run.batches!.map(batch => batch.id !== address.batchId ? batch : {
    ...batch, candidates: batch.candidates.map(item => item.id === candidate.id ? candidate : item),
  });
  const seedPayloadJson = mergeSeedPayload(source.row.seedPayloadJson, { batches });
  const saved = await new DirectorTaskStateWriter().updateRunState({
    where: { id: address.taskId, ...selection, seedPayloadJson: source.row.seedPayloadJson }, data: { seedPayloadJson },
  }, { transaction: db, many: true });
  if (!saved.count) throw versionConflict();
}
