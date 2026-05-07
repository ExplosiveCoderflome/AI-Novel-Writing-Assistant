import type { BookSpec, DirectorConfirmApiResponse, DirectorConfirmRequest } from "@ai-novel/shared/types/novelDirector";
import type { NovelContextService } from "../novel/NovelContextService";
import { NovelService } from "../novel/NovelService";
import type { NovelWorkflowService } from "../novel/workflow/NovelWorkflowService";
import { buildNovelEditResumeTarget, parseSeedPayload, parseResumeTarget } from "../novel/workflow/novelWorkflow.shared";
import { DIRECTOR_PROGRESS } from "./progress";
import { resolveDirectorBookFraming } from "./framing";
import { novelFramingSuggestionService } from "../novel/NovelFramingSuggestionService";
import {
  buildDirectorSessionState,
  normalizeDirectorRunMode,
  type DirectorWorkflowSeedPayload,
} from "./helpers";
import { stringifyDirectorTaskError } from "./runtime";

type WorkflowTaskSnapshot = Awaited<ReturnType<NovelWorkflowService["getTaskByIdWithoutHealing"]>>;

const DIRECTOR_CONFIRM_DUPLICATE_WAIT_MS = 150;
const DIRECTOR_CONFIRM_DUPLICATE_ATTEMPTS = 20;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface DirectorConfirmCandidateFlowDeps {
  workflowService: NovelWorkflowService;
  novelContextService: NovelContextService;
  novelService: NovelService;
  ensurePrimaryNovelStyleBinding: (novelId: string, styleProfileId: string | null | undefined) => Promise<void>;
  buildDirectorSeedPayload: (
    input: DirectorConfirmRequest,
    novelId: string | null,
    extra?: Record<string, unknown>,
  ) => Record<string, unknown>;
  withWorkflowTaskUsage: <T>(workflowTaskId: string | null | undefined, runner: () => Promise<T>) => Promise<T>;
  markDirectorTaskRunning: (
    taskId: string,
    stage: "auto_director" | "story_macro" | "character_setup" | "volume_strategy" | "structured_outline",
    itemKey: "novel_create" | "book_contract",
    itemLabel: string,
    progress: number,
  ) => Promise<void>;
  runDirectorPipeline: (input: {
    taskId: string;
    novelId: string;
    input: DirectorConfirmRequest;
    startPhase: "story_macro" | "character_setup" | "volume_strategy" | "structured_outline";
    scope?: string | null;
    batchAlreadyStartedCount?: number;
  }) => Promise<void>;
  scheduleBackgroundRun: (taskId: string, runner: () => Promise<void>) => void;
  markTaskFailedWithLatestDiagnostic: (taskId: string, message: string) => Promise<void>;
}

export async function buildExistingConfirmResponse(
  deps: DirectorConfirmCandidateFlowDeps,
  task: WorkflowTaskSnapshot,
  input: DirectorConfirmRequest,
  bookSpec: BookSpec,
): Promise<DirectorConfirmApiResponse> {
  if (!task?.novelId) {
    throw new Error("自动导演确认链缺少已创建的小说项目。");
  }
  const novel = await deps.novelContextService.getNovelById(task.novelId) as unknown as DirectorConfirmApiResponse["novel"];
  if (!novel) {
    throw new Error("自动导演确认链未能读取已创建的小说项目。");
  }
  const seedPayload = parseSeedPayload<DirectorWorkflowSeedPayload>(task.seedPayloadJson) ?? {};
  const directorSession = seedPayload.directorSession ?? buildDirectorSessionState({
    runMode: normalizeDirectorRunMode(input.runMode),
    phase: "story_macro",
    isBackgroundRunning: true,
  });
  const resumeTarget = parseResumeTarget(task.resumeTargetJson) ?? buildNovelEditResumeTarget({
    novelId: task.novelId,
    taskId: task.id,
    stage: "story_macro",
  });
  const seededPlanDigests = {
    book: null,
    arcs: [],
    chapters: [],
  };

  return {
    novel,
    storyMacroPlan: null,
    bookSpec,
    batch: {
      id: input.batchId,
      round: input.round,
    },
    createdChapterCount: 0,
    createdArcCount: 0,
    workflowTaskId: task.id,
    directorSession,
    resumeTarget,
    plans: seededPlanDigests,
    seededPlans: seededPlanDigests,
  };
}

export async function waitForExistingConfirmedNovel(
  deps: DirectorConfirmCandidateFlowDeps,
  taskId: string,
): Promise<WorkflowTaskSnapshot> {
  for (let attempt = 0; attempt < DIRECTOR_CONFIRM_DUPLICATE_ATTEMPTS; attempt += 1) {
    const task = await deps.workflowService.getTaskByIdWithoutHealing(taskId);
    if (!task || task.novelId || task.status === "failed" || task.status === "cancelled") {
      return task;
    }
    await sleep(DIRECTOR_CONFIRM_DUPLICATE_WAIT_MS);
  }
  return deps.workflowService.getTaskByIdWithoutHealing(taskId);
}

export async function confirmCandidate(
  deps: DirectorConfirmCandidateFlowDeps,
  input: DirectorConfirmRequest,
  resolvedInput: DirectorConfirmRequest,
  bookSpec: BookSpec,
): Promise<DirectorConfirmApiResponse> {
  const runMode = normalizeDirectorRunMode(resolvedInput.runMode);
  const title = resolvedInput.candidate.workingTitle.trim() || resolvedInput.title?.trim() || "未命名项目";
  const description = resolvedInput.description?.trim() || resolvedInput.candidate.logline.trim();
  const workflowTask = await deps.workflowService.bootstrapTask({
    workflowTaskId: resolvedInput.workflowTaskId,
    lane: "auto_director",
    title,
    seedPayload: deps.buildDirectorSeedPayload({ ...resolvedInput, runMode }, null, {
      directorSession: buildDirectorSessionState({
        runMode,
        phase: "candidate_selection",
        isBackgroundRunning: false,
      }),
    }),
  });

  if (workflowTask.novelId) {
    await deps.ensurePrimaryNovelStyleBinding(workflowTask.novelId, resolvedInput.styleProfileId);
    return buildExistingConfirmResponse(deps, workflowTask, resolvedInput, bookSpec);
  }

  const novelCreationClaim = await deps.workflowService.claimAutoDirectorNovelCreation(workflowTask.id, {
    itemLabel: "正在创建小说项目",
    progress: DIRECTOR_PROGRESS.novelCreate,
  });
  if (novelCreationClaim.status === "attached") {
    const attachedTask = novelCreationClaim.task;
    if (!attachedTask) {
      throw new Error("自动导演确认链缺少已附着的任务快照。");
    }
    if (attachedTask.novelId) {
      await deps.ensurePrimaryNovelStyleBinding(attachedTask.novelId, resolvedInput.styleProfileId);
    }
    return buildExistingConfirmResponse(deps, attachedTask, resolvedInput, bookSpec);
  }
  if (novelCreationClaim.status === "in_progress") {
    const existingTask = await waitForExistingConfirmedNovel(deps, workflowTask.id);
    if (existingTask?.novelId) {
      await deps.ensurePrimaryNovelStyleBinding(existingTask.novelId, resolvedInput.styleProfileId);
      return buildExistingConfirmResponse(deps, existingTask, resolvedInput, bookSpec);
    }
    if (existingTask?.status === "failed" || existingTask?.status === "cancelled") {
      throw new Error(existingTask.lastError?.trim() || "当前导演建书流程已中断，请重新尝试。");
    }
    throw new Error("当前导演方案正在创建小说，请勿重复提交。");
  }

  try {
    return await deps.withWorkflowTaskUsage(workflowTask.id, async () => {
      const resolvedBookFraming = await resolveDirectorBookFraming({
        context: resolvedInput,
        title,
        description,
        suggest: (suggestInput) => novelFramingSuggestionService.suggest({
          ...suggestInput,
          provider: resolvedInput.provider,
          model: resolvedInput.model,
          temperature: resolvedInput.temperature,
        }),
      });
      const directorInput: DirectorConfirmRequest = {
        ...resolvedInput,
        ...resolvedBookFraming,
        runMode,
      };

      await deps.markDirectorTaskRunning(
        workflowTask.id,
        "auto_director",
        "novel_create",
        "正在创建小说项目",
        DIRECTOR_PROGRESS.novelCreate,
      );
      const createdNovel = await deps.novelContextService.createNovel({
        title,
        description,
        targetAudience: resolvedBookFraming.targetAudience,
        bookSellingPoint: resolvedBookFraming.bookSellingPoint,
        competingFeel: resolvedBookFraming.competingFeel,
        first30ChapterPromise: resolvedBookFraming.first30ChapterPromise,
        commercialTags: resolvedBookFraming.commercialTags,
        genreId: resolvedInput.genreId?.trim() || undefined,
        primaryStoryModeId: resolvedInput.primaryStoryModeId?.trim() || undefined,
        secondaryStoryModeId: resolvedInput.secondaryStoryModeId?.trim() || undefined,
        worldId: resolvedInput.worldId?.trim() || undefined,
        writingMode: resolvedInput.writingMode,
        projectMode: resolvedInput.projectMode,
        narrativePov: resolvedInput.narrativePov,
        pacePreference: resolvedInput.pacePreference,
        styleTone: resolvedInput.styleTone?.trim() || undefined,
        emotionIntensity: resolvedInput.emotionIntensity,
        aiFreedom: resolvedInput.aiFreedom,
        defaultChapterLength: resolvedInput.defaultChapterLength,
        estimatedChapterCount: resolvedInput.estimatedChapterCount ?? bookSpec.targetChapterCount,
        projectStatus: resolvedInput.projectStatus,
        storylineStatus: resolvedInput.storylineStatus,
        outlineStatus: resolvedInput.outlineStatus,
        resourceReadyScore: resolvedInput.resourceReadyScore,
        sourceNovelId: resolvedInput.sourceNovelId ?? undefined,
        sourceKnowledgeDocumentId: resolvedInput.sourceKnowledgeDocumentId ?? undefined,
        continuationBookAnalysisId: resolvedInput.continuationBookAnalysisId ?? undefined,
        continuationBookAnalysisSections: resolvedInput.continuationBookAnalysisSections ?? undefined,
      });
      await deps.ensurePrimaryNovelStyleBinding(createdNovel.id, resolvedInput.styleProfileId);
      await deps.workflowService.attachNovelToTask(workflowTask.id, createdNovel.id, "project_setup");
      const directorSession = buildDirectorSessionState({
        runMode,
        phase: "story_macro",
        isBackgroundRunning: true,
      });
      const resumeTarget = buildNovelEditResumeTarget({
        novelId: createdNovel.id,
        taskId: workflowTask.id,
        stage: "story_macro",
      });
      await deps.workflowService.bootstrapTask({
        workflowTaskId: workflowTask.id,
        novelId: createdNovel.id,
        lane: "auto_director",
        title,
        seedPayload: deps.buildDirectorSeedPayload(directorInput, createdNovel.id, {
          directorSession,
          resumeTarget,
        }),
      });
      await deps.markDirectorTaskRunning(
        workflowTask.id,
        "story_macro",
        "book_contract",
        "正在准备 Book Contract 与故事宏观规划",
        DIRECTOR_PROGRESS.bookContract,
      );
      deps.scheduleBackgroundRun(workflowTask.id, async () => {
        await deps.runDirectorPipeline({
          taskId: workflowTask.id,
          novelId: createdNovel.id,
          input: directorInput,
          startPhase: "story_macro",
          scope: "book",
        });
      });
      const novel = await deps.novelContextService.getNovelById(createdNovel.id) as unknown as DirectorConfirmApiResponse["novel"];
      const seededPlanDigests = {
        book: null,
        arcs: [],
        chapters: [],
      };

      return {
        novel,
        storyMacroPlan: null,
        bookSpec,
        batch: {
          id: input.batchId,
          round: input.round,
        },
        createdChapterCount: 0,
        createdArcCount: 0,
        workflowTaskId: workflowTask.id,
        directorSession,
        resumeTarget,
        plans: seededPlanDigests,
        seededPlans: seededPlanDigests,
      };
    });
  } catch (error) {
    await deps.markTaskFailedWithLatestDiagnostic(
      workflowTask.id,
      stringifyDirectorTaskError(error, "自动导演确认链执行失败。"),
    );
    throw error;
  }
}
