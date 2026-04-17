import type { DirectorConfirmRequest } from "@ai-novel/shared/types/novelDirector";
import { buildNovelEditResumeTarget } from "../workflow/novelWorkflow.shared";
import { getChapterTitleDiversityIssue } from "../volume/chapterTitleDiversity";
import type { NovelVolumeService } from "../volume/NovelVolumeService";
import type { NovelWorkflowService } from "../workflow/NovelWorkflowService";
import { buildDirectorSessionState } from "./novelDirectorHelpers";
import { DIRECTOR_PROGRESS } from "./novelDirectorProgress";
import { buildChapterTitleDiversityTaskNotice } from "./novelDirectorTaskNotice";

function buildRepairStatusLabel(input: {
  volumeOrder: number;
  phase: string;
  label: string;
}): string {
  const normalizedLabel = input.label.trim();
  if (normalizedLabel) {
    return normalizedLabel;
  }
  if (input.phase === "load_context") {
    return `正在整理第 ${input.volumeOrder} 卷拆章上下文`;
  }
  return `正在 AI 修复第 ${input.volumeOrder} 卷章节标题`;
}

function hasTargetBeatSheet(workspace: Awaited<ReturnType<NovelVolumeService["getVolumes"]>>, volumeId: string): boolean {
  return workspace.beatSheets.some((item) => item.volumeId === volumeId && item.beats.length > 0);
}

export async function repairDirectorChapterTitles(input: {
  taskId: string;
  novelId: string;
  targetVolumeId: string;
  request: DirectorConfirmRequest;
  volumeService: NovelVolumeService;
  workflowService: NovelWorkflowService;
  buildDirectorSeedPayload: (
    request: DirectorConfirmRequest,
    novelId: string,
    extra?: Record<string, unknown>,
  ) => Record<string, unknown>;
}): Promise<void> {
  const currentWorkspace = await input.volumeService.getVolumes(input.novelId);
  const targetVolume = currentWorkspace.volumes.find((volume) => volume.id === input.targetVolumeId);
  if (!targetVolume) {
    throw new Error("当前任务对应的目标卷不存在，无法继续 AI 修复章节标题。");
  }

  const resumeTarget = buildNovelEditResumeTarget({
    novelId: input.novelId,
    taskId: input.taskId,
    stage: "structured",
    volumeId: targetVolume.id,
  });
  let workingWorkspace = currentWorkspace;
  if (!hasTargetBeatSheet(workingWorkspace, targetVolume.id)) {
    workingWorkspace = await input.volumeService.generateVolumes(input.novelId, {
      provider: input.request.provider,
      model: input.request.model,
      temperature: input.request.temperature,
      scope: "beat_sheet",
      targetVolumeId: targetVolume.id,
      draftWorkspace: workingWorkspace,
      onPhaseStart: async (event) => {
        await input.workflowService.markTaskRunning(input.taskId, {
          stage: "structured_outline",
          itemKey: "beat_sheet",
          itemLabel: event.label.trim() || `正在补齐第 ${targetVolume.sortOrder} 卷节奏板`,
          progress: DIRECTOR_PROGRESS.beatSheet,
        });
      },
    });
  }

  const repairedWorkspace = await input.volumeService.generateVolumes(input.novelId, {
    provider: input.request.provider,
    model: input.request.model,
    temperature: input.request.temperature,
    scope: "chapter_list",
    targetVolumeId: targetVolume.id,
    draftWorkspace: workingWorkspace,
    onPhaseStart: async (event) => {
      await input.workflowService.markTaskRunning(input.taskId, {
        stage: "structured_outline",
        itemKey: "chapter_list",
        itemLabel: buildRepairStatusLabel({
          volumeOrder: targetVolume.sortOrder,
          phase: event.phase,
          label: event.label,
        }),
        progress: DIRECTOR_PROGRESS.chapterList,
      });
    },
  });
  const persistedWorkspace = await input.volumeService.updateVolumes(input.novelId, repairedWorkspace);
  const repairedVolume = persistedWorkspace.volumes.find((volume) => volume.id === targetVolume.id);
  if (!repairedVolume) {
    throw new Error("AI 已返回新的章节标题结果，但保存后的当前卷丢失，无法完成修复。");
  }

  const titleDiversityIssue = getChapterTitleDiversityIssue(
    repairedVolume.chapters.map((chapter) => chapter.title),
  );
  const pausedSession = buildDirectorSessionState({
    runMode: input.request.runMode,
    phase: "structured_outline",
    isBackgroundRunning: false,
  });
  await input.workflowService.markTaskWaitingApproval(input.taskId, {
    stage: "structured_outline",
    itemKey: "chapter_list",
    itemLabel: titleDiversityIssue
      ? `第 ${repairedVolume.sortOrder} 卷章节标题已重写，但结构仍建议继续分散`
      : `第 ${repairedVolume.sortOrder} 卷章节标题已完成 AI 修复`,
    progress: DIRECTOR_PROGRESS.chapterList,
    volumeId: repairedVolume.id,
    clearCheckpoint: true,
    seedPayload: input.buildDirectorSeedPayload(input.request, input.novelId, {
      directorSession: pausedSession,
      resumeTarget,
      taskNotice: titleDiversityIssue
        ? buildChapterTitleDiversityTaskNotice({
          issue: titleDiversityIssue,
          volumeId: repairedVolume.id,
        })
        : null,
    }),
  });
}
