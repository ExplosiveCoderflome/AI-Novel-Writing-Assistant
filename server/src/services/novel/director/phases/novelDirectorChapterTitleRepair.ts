import type { DirectorConfirmRequest } from "@ai-novel/shared/types/novelDirector";
import { buildNovelEditResumeTarget } from "../../workflow/novelWorkflow.shared";
import { getChapterTitleDiversityIssue } from "../../volume/chapterTitleDiversity";
import { resolveVolumeChapterBeatKey } from "../../volume/volumeGenerationHelpers";
import type { NovelVolumeService } from "../../volume/NovelVolumeService";
import type { NovelWorkflowService } from "../../workflow/NovelWorkflowService";
import { buildDirectorSessionState } from "../runtime/novelDirectorHelpers";
import { DIRECTOR_PROGRESS } from "../projections/novelDirectorProgress";
import { buildChapterTitleDiversityTaskNotice } from "../projections/novelDirectorTaskNotice";

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

function shouldRefreshBeatSheetForRepair(lastError: string | null | undefined): boolean {
  const normalized = lastError?.trim() ?? "";
  return normalized.includes("当前卷节奏板的章节跨度异常");
}

function resolveRepairBeatKeys(input: {
  volume: Awaited<ReturnType<NovelVolumeService["getVolumes"]>>["volumes"][number];
  beatSheet: Awaited<ReturnType<NovelVolumeService["getVolumes"]>>["beatSheets"][number];
}): string[] {
  const seenTitles = new Set<string>();
  const repairBeatKeys = new Set<string>();
  for (const chapter of input.volume.chapters.slice().sort((left, right) => left.chapterOrder - right.chapterOrder)) {
    const title = chapter.title.trim();
    const beatKey = resolveVolumeChapterBeatKey({ chapter, volume: input.volume, beatSheet: input.beatSheet });
    if (seenTitles.has(title) && beatKey) {
      repairBeatKeys.add(beatKey);
    }
    seenTitles.add(title);
  }
  return repairBeatKeys.size > 0 ? [...repairBeatKeys] : input.beatSheet.beats.map((beat) => beat.key);
}

async function loadWorkflowTaskForTitleRepair(
  workflowService: NovelWorkflowService,
  taskId: string,
): Promise<Awaited<ReturnType<NovelWorkflowService["getTaskByIdWithoutHealing"]>> | null> {
  const reader = workflowService as Partial<Pick<NovelWorkflowService, "getTaskByIdWithoutHealing" | "getTaskById">>;
  if (typeof reader.getTaskByIdWithoutHealing === "function") {
    return reader.getTaskByIdWithoutHealing(taskId);
  }
  if (typeof reader.getTaskById === "function") {
    return reader.getTaskById(taskId);
  }
  return null;
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
  const currentTask = await loadWorkflowTaskForTitleRepair(input.workflowService, input.taskId);
  let workingWorkspace = currentWorkspace;
  const hasTargetBeatSheet = workingWorkspace.beatSheets.some((sheet) => (
    sheet.volumeId === targetVolume.id && sheet.beats.length > 0
  ));
  if (shouldRefreshBeatSheetForRepair(currentTask?.lastError) || !hasTargetBeatSheet) {
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
          itemLabel: event.label.trim() || `正在重整第 ${targetVolume.sortOrder} 卷节奏板`,
          progress: DIRECTOR_PROGRESS.beatSheet,
        });
      },
    });
  }

  const targetBeatSheet = workingWorkspace.beatSheets.find((sheet) => (
    sheet.volumeId === targetVolume.id && sheet.beats.length > 0
  ));
  if (!targetBeatSheet) {
    throw new Error("当前卷缺少可用节奏板，无法安全重写章节标题。");
  }

  const repairBeatKeys = resolveRepairBeatKeys({
    volume: targetVolume,
    beatSheet: targetBeatSheet,
  });
  for (const beat of targetBeatSheet.beats.filter((item) => repairBeatKeys.includes(item.key))) {
    workingWorkspace = await input.volumeService.generateVolumes(input.novelId, {
      provider: input.request.provider,
      model: input.request.model,
      temperature: input.request.temperature,
      scope: "chapter_list",
      generationMode: "single_beat",
      targetBeatKey: beat.key,
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
  }
  const persistedWorkspace = await input.volumeService.updateVolumes(input.novelId, {
    ...workingWorkspace,
    syncToChapterExecution: true,
  });
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
