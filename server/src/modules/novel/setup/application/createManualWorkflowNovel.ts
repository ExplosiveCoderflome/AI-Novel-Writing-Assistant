import { prisma } from "../../../../db/prisma";
import { withSqliteRetry } from "../../../../db/sqliteRetry";
import { AppError } from "../../../../middleware/errorHandler";
import { NovelCoreCrudService } from "../../../../services/novel/novelCoreCrudService";
import { normalizeNovelOutput, type CreateNovelInput } from "../../../../services/novel/novelCoreShared";
import { queueRagUpsert } from "../../../../services/novel/novelCoreSupport";
import { defaultProgressForStage, stageLabel } from "../../../../services/novel/workflow/novelWorkflow.helpers";
import { buildNovelEditResumeTarget, stringifyResumeTarget } from "../../../../services/novel/workflow/novelWorkflow.shared";

export async function createManualWorkflowNovel(taskId: string, resolveInput: () => Promise<CreateNovelInput>) {
  const task = await prisma.novelWorkflowTask.findUnique({where: {id: taskId}, include: {novel: true}});
  if (!task || task.lane !== "manual_create") throw new AppError("找不到这次手动开书任务。", 404);
  if (task.novel) return normalizeNovelOutput(task.novel);

  // Resource recommendation can call a model. Keep it outside the write transaction.
  const input = await resolveInput();
  const result = await withSqliteRetry(() => prisma.$transaction(async tx => {
    const claim = await tx.novelWorkflowTask.updateMany({
      where: {id: taskId, lane: "manual_create", novelId: null}, data: {heartbeatAt: new Date()},
    });
    if (!claim.count) {
      const linked = await tx.novelWorkflowTask.findUnique({where: {id: taskId}, include: {novel: true}});
      if (!linked?.novel || linked.lane !== "manual_create") throw new AppError("无法恢复这次手动开书任务。", 409);
      return {novel: normalizeNovelOutput(linked.novel), created: false};
    }
    const novel = await new NovelCoreCrudService().createNovel(input, tx);
    const resumeTarget = buildNovelEditResumeTarget({novelId: novel.id, taskId, lane: "manual_create", stage: "basic"});
    await tx.novelWorkflowTask.update({where: {id: taskId}, data: {
      novelId: novel.id, title: novel.title, progress: Math.max(task.progress, defaultProgressForStage("project_setup")),
      currentStage: stageLabel("project_setup"), currentItemKey: "project_setup", currentItemLabel: "小说项目已创建",
      resumeTargetJson: stringifyResumeTarget(resumeTarget),
    }});
    return {novel, created: true};
  }));
  if (result.created) {
    queueRagUpsert("novel", result.novel.id);
    if (result.novel.worldId) queueRagUpsert("world", result.novel.worldId);
  }
  return result.novel;
}
