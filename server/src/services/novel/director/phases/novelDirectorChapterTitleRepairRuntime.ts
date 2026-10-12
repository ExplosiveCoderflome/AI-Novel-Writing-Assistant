import { DirectorTaskStateWriter } from "../state";
import type { DirectorConfirmRequest } from "@ai-novel/shared/types/novelDirector";
import { getChapterTitleDiversityIssue, isChapterTitleDiversityIssue } from "../../volume/chapterTitleDiversity";
import type { NovelVolumeService } from "../../volume/NovelVolumeService";
import type { NovelWorkflowService } from "../../workflow/NovelWorkflowService";
import {
  buildNovelEditResumeTarget,
} from "../../workflow/novelWorkflow.shared";
import { DirectorStateReader, toDirectorTaskDataView } from "../state/DirectorStateReader";
import { getDirectorInputFromSeedPayload, getDirectorLlmOptionsFromSeedPayload, type DirectorWorkflowSeedPayload } from "../runtime/novelDirectorHelpers";
import { buildDirectorSessionState } from "../runtime/novelDirectorHelpers";
import { repairDirectorChapterTitles } from "./novelDirectorChapterTitleRepair";
import { DIRECTOR_PROGRESS } from "../projections/novelDirectorProgress";

export class NovelDirectorChapterTitleRepairRuntime {
  constructor(private readonly deps: {
    workflowService: NovelWorkflowService;
    volumeService: NovelVolumeService;
    buildDirectorSeedPayload: (
      input: DirectorConfirmRequest,
      novelId: string | null,
      extra?: Record<string, unknown>,
    ) => Record<string, unknown>;
    scheduleBackgroundRun: (taskId: string, runner: () => Promise<void>) => void;
  }) {}

  async repairChapterTitles(taskId: string, input?: {
    volumeId?: string | null;
  }): Promise<void> {
    const row = await this.deps.workflowService.getTaskById(taskId);
    if (!row) {
      throw new Error("当前自动导演任务不存在。");
    }
    if (row.lane !== "auto_director") {
      throw new Error("只有自动导演任务支持 AI 修复章节标题。");
    }
    const storedState = await new DirectorStateReader().readTaskStateById(row.id);
    const directorTaskData = (storedState ? toDirectorTaskDataView(storedState) : {}) as DirectorWorkflowSeedPayload;
    const directorInput = getDirectorInputFromSeedPayload(directorTaskData);
    const novelId = row.novelId ?? directorTaskData.novelId ?? null;
    if (!directorInput || !novelId) {
      throw new Error("当前自动导演任务缺少恢复 AI 修复所需的上下文。");
    }

    const notice = directorTaskData.taskNotice;
    const requestedVolumeId = input?.volumeId?.trim() || null;
    const resumeTarget = storedState?.run.resumeTarget ?? null;
    const targetVolumeId = requestedVolumeId
      || notice?.action?.volumeId?.trim()
      || resumeTarget?.volumeId?.trim()
      || null;
    const workspace = await this.deps.volumeService.getVolumes(novelId);
    const targetVolume = targetVolumeId
      ? workspace.volumes.find((volume) => volume.id === targetVolumeId)
      : workspace.volumes.find((volume) => getChapterTitleDiversityIssue(volume.chapters.map((chapter) => chapter.title)));
    if (!targetVolume) {
      throw new Error("当前任务没有可直接 AI 修复的重复章节标题。");
    }
    const taskHasTitleWarning = notice?.code === "CHAPTER_TITLE_DIVERSITY"
      || isChapterTitleDiversityIssue(row.lastError)
      || Boolean(getChapterTitleDiversityIssue(targetVolume.chapters.map((chapter) => chapter.title)));
    if (!taskHasTitleWarning) {
      throw new Error("当前任务没有可直接 AI 修复的章节标题提醒。");
    }

    const boundLlm = getDirectorLlmOptionsFromSeedPayload(directorTaskData);
    const repairRequest: DirectorConfirmRequest = {
      ...directorInput,
      provider: boundLlm?.provider ?? directorInput.provider,
      model: boundLlm?.model ?? directorInput.model,
      temperature: typeof boundLlm?.temperature === "number"
        ? boundLlm.temperature
        : directorInput.temperature,
    };
    const directorSession = buildDirectorSessionState({
      runMode: repairRequest.runMode,
      phase: "structured_outline",
      isBackgroundRunning: true,
    });
    const resumeTargetForRepair = buildNovelEditResumeTarget({
      novelId,
      taskId,
      stage: "structured",
      volumeId: targetVolume.id,
    });
    await new DirectorTaskStateWriter(this.deps.workflowService).initializeTask({
      workflowTaskId: taskId,
      novelId,
      lane: "auto_director",
      title: repairRequest.candidate.workingTitle,
      directorState: this.deps.buildDirectorSeedPayload(repairRequest, novelId, {
        directorSession,
        resumeTarget: resumeTargetForRepair,
        taskNotice: null,
      }),
    });
    await new DirectorTaskStateWriter(this.deps.workflowService).markRunning(taskId, {
      stage: "structured_outline",
      itemKey: "chapter_list",
      itemLabel: `正在 AI 修复第 ${targetVolume.sortOrder} 卷章节标题`,
      progress: DIRECTOR_PROGRESS.chapterList,
      clearCheckpoint: true,
    });
    this.deps.scheduleBackgroundRun(taskId, async () => {
      await repairDirectorChapterTitles({
        taskId,
        novelId,
        targetVolumeId: targetVolume.id,
        request: repairRequest,
        volumeService: this.deps.volumeService,
        workflowService: this.deps.workflowService,
        buildDirectorSeedPayload: (request, targetNovelId, extra) => (
          this.deps.buildDirectorSeedPayload(request, targetNovelId, extra)
        ),
      });
    });
  }
}
