import type { DirectorConfirmRequest } from "@ai-novel/shared/types/novelDirector";
import { isChapterTitleDiversityIssue } from "../volume/chapterTitleDiversity";
import type { NovelVolumeService } from "../volume/NovelVolumeService";
import type { NovelWorkflowService } from "../workflow/NovelWorkflowService";
import {
  buildNovelEditResumeTarget,
  parseSeedPayload,
  parseResumeTarget,
} from "../workflow/novelWorkflow.shared";
import { getDirectorInputFromSeedPayload, getDirectorLlmOptionsFromSeedPayload, type DirectorWorkflowSeedPayload } from "./novelDirectorHelpers";
import { buildDirectorSessionState } from "./novelDirectorHelpers";
import { repairDirectorChapterTitles } from "./novelDirectorChapterTitleRepair";
import { DIRECTOR_PROGRESS } from "./novelDirectorProgress";

function parseResumeTargetLike(value: unknown) {
  if (typeof value === "string") {
    return parseResumeTarget(value);
  }
  if (value && typeof value === "object") {
    return value as NonNullable<ReturnType<typeof parseResumeTarget>>;
  }
  return null;
}

function mergeResumeTargets(
  primary: ReturnType<typeof parseResumeTarget>,
  fallback: ReturnType<typeof parseResumeTarget>,
) {
  if (!primary) {
    return fallback;
  }
  if (!fallback) {
    return primary;
  }
  return {
    ...fallback,
    ...primary,
    stage: primary.stage === "basic" && fallback.stage !== "basic"
      ? fallback.stage
      : primary.stage,
    chapterId: primary.chapterId ?? fallback.chapterId ?? null,
    volumeId: primary.volumeId ?? fallback.volumeId ?? null,
  };
}

export class NovelDirectorChapterTitleRepairRuntime {
  constructor(private readonly deps: {
    workflowService: NovelWorkflowService;
    volumeService: NovelVolumeService;
    buildDirectorSeedPayload: (
      input: DirectorConfirmRequest,
      novelId: string | null,
      extra?: Record<string, unknown>,
    ) => Record<string, unknown>;
    assertHighMemoryStartAllowed: (input: {
      taskId: string;
      novelId: string;
      stage: "structured_outline";
      itemKey: "beat_sheet" | "chapter_list" | "chapter_detail_bundle" | "chapter_sync";
      volumeId?: string | null;
      chapterId?: string | null;
      scope?: string | null;
      batchAlreadyStartedCount?: number;
    }) => Promise<void>;
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
    if (row.status === "running") {
      throw new Error("当前自动导演仍在运行中，请等待当前步骤完成后再发起标题修复。");
    }

    const seedPayload = parseSeedPayload<DirectorWorkflowSeedPayload>(row.seedPayloadJson) ?? {};
    const directorInput = getDirectorInputFromSeedPayload(seedPayload);
    const novelId = row.novelId ?? seedPayload.novelId ?? null;
    if (!directorInput || !novelId) {
      throw new Error("当前自动导演任务缺少恢复 AI 修复所需的上下文。");
    }

    const notice = seedPayload.taskNotice;
    const taskHasTitleWarning = notice?.code === "CHAPTER_TITLE_DIVERSITY"
      || isChapterTitleDiversityIssue(row.lastError);
    if (!taskHasTitleWarning) {
      throw new Error("当前任务没有可直接 AI 修复的章节标题提醒。");
    }

    const requestedVolumeId = input?.volumeId?.trim() || null;
    const resumeTarget = mergeResumeTargets(
      parseResumeTarget(row.resumeTargetJson),
      parseResumeTargetLike(seedPayload.resumeTarget),
    );
    const targetVolumeId = requestedVolumeId
      || notice?.action?.volumeId?.trim()
      || resumeTarget?.volumeId?.trim()
      || null;
    if (!targetVolumeId) {
      throw new Error("当前任务缺少待修复的目标卷，无法继续 AI 修复章节标题。");
    }

    const workspace = await this.deps.volumeService.getVolumes(novelId);
    const targetVolume = workspace.volumes.find((volume) => volume.id === targetVolumeId);
    if (!targetVolume) {
      throw new Error("当前任务指向的目标卷不存在，无法继续 AI 修复章节标题。");
    }

    const boundLlm = getDirectorLlmOptionsFromSeedPayload(seedPayload);
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
    await this.deps.assertHighMemoryStartAllowed({
      taskId,
      novelId,
      stage: "structured_outline",
      itemKey: "chapter_list",
      volumeId: targetVolume.id,
      scope: `volume:${targetVolume.id}`,
    });
    await this.deps.workflowService.bootstrapTask({
      workflowTaskId: taskId,
      novelId,
      lane: "auto_director",
      title: repairRequest.candidate.workingTitle,
      seedPayload: this.deps.buildDirectorSeedPayload(repairRequest, novelId, {
        directorSession,
        resumeTarget: resumeTargetForRepair,
        taskNotice: null,
      }),
    });
    await this.deps.workflowService.markTaskRunning(taskId, {
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
