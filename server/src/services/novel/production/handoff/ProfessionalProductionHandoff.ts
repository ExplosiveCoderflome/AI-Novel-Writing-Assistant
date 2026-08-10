import { prisma } from "../../../../db/prisma";

export async function consumeProfessionalHandoffAtChapterBoundary(
  workflowTaskId: string | null | undefined,
  novelId: string,
): Promise<boolean> {
  if (!workflowTaskId) return false;
  const task = await prisma.novelWorkflowTask.findUnique({
    where: { id: workflowTaskId },
    select: { seedPayloadJson: true },
  });
  if (!task?.seedPayloadJson) return false;
  let seed: Record<string, unknown>;
  try {
    seed = JSON.parse(task.seedPayloadJson) as Record<string, unknown>;
  } catch {
    return false;
  }
  if (seed.pendingProductionExperience !== "professional") return false;
  const directorInput = seed.directorInput && typeof seed.directorInput === "object"
    ? { ...(seed.directorInput as Record<string, unknown>), runMode: "auto_to_ready", autoExecutionPlan: undefined }
    : seed.directorInput;
  const nextSeed = {
    ...seed,
    productionExperience: "professional",
    pendingProductionExperience: undefined,
    runMode: "auto_to_ready",
    autoExecutionPlan: undefined,
    directorInput,
  };
  await prisma.$transaction([
    prisma.novel.update({
      where: { id: novelId },
      data: { creationExperience: "professional" },
    }),
    prisma.novelWorkflowTask.update({
      where: { id: workflowTaskId },
      data: {
        seedPayloadJson: JSON.stringify(nextSeed),
        status: "succeeded",
        progress: 1,
        currentStage: "chapter_execution",
        currentItemKey: "professional_production_handoff",
        currentItemLabel: "已暂停并交接精细创作",
        checkpointType: "workflow_completed",
        checkpointSummary: "当前章节已安全保存，后续自动章节已停止。",
        pendingManualRecovery: false,
        finishedAt: new Date(),
      },
    }),
  ]);
  return true;
}
