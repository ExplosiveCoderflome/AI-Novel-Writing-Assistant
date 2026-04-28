import type {
  BookSpec,
  DirectorConfirmApiResponse,
  DirectorConfirmRequest,
} from "@ai-novel/shared/types/novelDirector";
import type { NovelContextService } from "../NovelContextService";
import type { NovelWorkflowService } from "../workflow/NovelWorkflowService";
import {
  buildNovelEditResumeTarget,
  parseSeedPayload,
  parseResumeTarget,
} from "../workflow/novelWorkflow.shared";
import { novelFramingSuggestionService } from "../NovelFramingSuggestionService";
import { resolveDirectorBookFraming } from "./novelDirectorFraming";
import {
  buildDirectorSessionState,
  normalizeDirectorRunMode,
  toBookSpec,
  type DirectorWorkflowSeedPayload,
} from "./novelDirectorHelpers";
import { DIRECTOR_PROGRESS } from "./novelDirectorProgress";
import type { DirectorRuntimeService } from "./runtime/DirectorRuntimeService";
import type { NovelDirectorRuntimeOrchestrator } from "./novelDirectorRuntimeOrchestrator";
import type { NovelDirectorPipelineRuntime } from "./novelDirectorPipelineRuntime";
import { getDirectorConfirmNovelCreateStepModule } from "./workflowStepRuntime/directorWorkflowStepModules";

type WorkflowTaskSnapshot = Awaited<ReturnType<NovelWorkflowService["getTaskByIdWithoutHealing"]>>;

const DIRECTOR_CONFIRM_DUPLICATE_WAIT_MS = 150;
const DIRECTOR_CONFIRM_DUPLICATE_ATTEMPTS = 20;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class NovelDirectorConfirmRuntime {
  constructor(private readonly deps: {
    workflowService: NovelWorkflowService;
    novelContextService: NovelContextService;
    directorRuntime: DirectorRuntimeService;
    runtimeOrchestrator: NovelDirectorRuntimeOrchestrator;
    pipelineRuntime: NovelDirectorPipelineRuntime;
    buildDirectorSeedPayload: (
      input: DirectorConfirmRequest,
      novelId: string | null,
      extra?: Record<string, unknown>,
    ) => Record<string, unknown>;
    enrichDirectorStyleContext: (input: DirectorConfirmRequest) => Promise<DirectorConfirmRequest>;
    ensurePrimaryNovelStyleBinding: (novelId: string, styleProfileId: string | null | undefined) => Promise<void>;
    withWorkflowTaskUsage: <T>(workflowTaskId: string | null | undefined, runner: () => Promise<T>) => Promise<T>;
    scheduleBackgroundRun: (taskId: string, runner: () => Promise<void>) => void;
  }) {}

  async confirmCandidate(input: DirectorConfirmRequest): Promise<DirectorConfirmApiResponse> {
    const resolvedInput = await this.deps.enrichDirectorStyleContext(input);
    const runMode = normalizeDirectorRunMode(resolvedInput.runMode);
    const title = resolvedInput.candidate.workingTitle.trim() || resolvedInput.title?.trim() || "未命名项目";
    const description = resolvedInput.description?.trim() || resolvedInput.candidate.logline.trim();
    const bookSpec = toBookSpec(
      resolvedInput.candidate,
      resolvedInput.idea,
      resolvedInput.estimatedChapterCount,
    );
    const workflowTask = await this.deps.workflowService.bootstrapTask({
      workflowTaskId: resolvedInput.workflowTaskId,
      lane: "auto_director",
      title,
      seedPayload: this.deps.buildDirectorSeedPayload({ ...resolvedInput, runMode }, null, {
        directorSession: buildDirectorSessionState({
          runMode,
          phase: "candidate_selection",
          isBackgroundRunning: false,
        }),
      }),
    });
    await this.deps.directorRuntime.initializeRun({
      taskId: workflowTask.id,
      novelId: workflowTask.novelId,
      entrypoint: "candidate_confirm",
      policyMode: runMode === "stage_review" ? "run_next_step" : "run_until_gate",
      summary: "自动导演确认方案后进入统一运行时。",
    });

    if (workflowTask.novelId) {
      await this.deps.ensurePrimaryNovelStyleBinding(workflowTask.novelId, resolvedInput.styleProfileId);
      return this.buildExistingConfirmResponse(workflowTask, resolvedInput, bookSpec);
    }

    const novelCreationClaim = await this.deps.workflowService.claimAutoDirectorNovelCreation(workflowTask.id, {
      itemLabel: "正在创建小说项目",
      progress: DIRECTOR_PROGRESS.novelCreate,
    });
    if (novelCreationClaim.status === "attached") {
      const attachedTask = novelCreationClaim.task;
      if (!attachedTask) {
        throw new Error("自动导演确认链缺少已附着的任务快照。");
      }
      if (attachedTask.novelId) {
        await this.deps.directorRuntime.initializeRun({
          taskId: workflowTask.id,
          novelId: attachedTask.novelId,
          entrypoint: "candidate_confirm",
          policyMode: runMode === "stage_review" ? "run_next_step" : "run_until_gate",
          summary: "自动导演复用已创建的小说项目并进入统一运行时。",
        });
        await this.deps.ensurePrimaryNovelStyleBinding(attachedTask.novelId, resolvedInput.styleProfileId);
      }
      return this.buildExistingConfirmResponse(attachedTask, resolvedInput, bookSpec);
    }
    if (novelCreationClaim.status === "in_progress") {
      const existingTask = await this.waitForExistingConfirmedNovel(workflowTask.id);
      if (existingTask?.novelId) {
        await this.deps.directorRuntime.initializeRun({
          taskId: workflowTask.id,
          novelId: existingTask.novelId,
          entrypoint: "candidate_confirm",
          policyMode: runMode === "stage_review" ? "run_next_step" : "run_until_gate",
          summary: "自动导演复用正在创建完成的小说项目并进入统一运行时。",
        });
        await this.deps.ensurePrimaryNovelStyleBinding(existingTask.novelId, resolvedInput.styleProfileId);
        return this.buildExistingConfirmResponse(existingTask, resolvedInput, bookSpec);
      }
      if (existingTask?.status === "failed" || existingTask?.status === "cancelled") {
        throw new Error(existingTask.lastError?.trim() || "当前导演建书流程已中断，请重新尝试。");
      }
      throw new Error("当前导演方案正在创建小说，请勿重复提交。");
    }

    try {
      return await this.deps.withWorkflowTaskUsage(workflowTask.id, async () => {
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

        const novelCreateModule = getDirectorConfirmNovelCreateStepModule();
        const createdNovel = await this.deps.runtimeOrchestrator.runNode({
          taskId: workflowTask.id,
          nodeKey: novelCreateModule.nodeKey,
          label: novelCreateModule.label,
          reads: novelCreateModule.reads,
          writes: novelCreateModule.writes,
          policyAction: novelCreateModule.policyAction,
          mayModifyUserContent: novelCreateModule.mayModifyUserContent,
          requiresApprovalByDefault: novelCreateModule.requiresApprovalByDefault,
          supportsAutoRetry: novelCreateModule.supportsAutoRetry,
          targetType: novelCreateModule.targetType,
          targetId: workflowTask.id,
          runner: async () => {
            await this.deps.workflowService.markTaskRunning(workflowTask.id, {
              stage: "auto_director",
              itemKey: "novel_create",
              itemLabel: "正在创建小说项目",
              progress: DIRECTOR_PROGRESS.novelCreate,
            });
            const novel = await this.deps.novelContextService.createNovel({
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
            await this.deps.workflowService.attachNovelToTask(workflowTask.id, novel.id, "project_setup");
            return novel;
          },
          collectArtifacts: async (novel) => {
            if (!novel?.id) {
              return [];
            }
            const analysis = await this.deps.directorRuntime.analyzeWorkspace({
              novelId: novel.id,
              workflowTaskId: workflowTask.id,
              includeAiInterpretation: false,
            }).catch(() => null);
            return analysis?.inventory.artifacts ?? [];
          },
        });
        if (!createdNovel?.id) {
          throw new Error("自动导演建书节点没有返回小说项目。");
        }
        await this.deps.ensurePrimaryNovelStyleBinding(createdNovel.id, resolvedInput.styleProfileId);
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
        await this.deps.workflowService.bootstrapTask({
          workflowTaskId: workflowTask.id,
          novelId: createdNovel.id,
          lane: "auto_director",
          title,
          seedPayload: this.deps.buildDirectorSeedPayload(directorInput, createdNovel.id, {
            directorSession,
            resumeTarget,
          }),
        });
        await this.deps.directorRuntime.initializeRun({
          taskId: workflowTask.id,
          novelId: createdNovel.id,
          entrypoint: "candidate_confirm",
          policyMode: runMode === "stage_review" ? "run_next_step" : "run_until_gate",
          summary: "自动导演已创建小说项目并进入统一运行时。",
        });
        await this.deps.runtimeOrchestrator.markTaskRunning(
          workflowTask.id,
          "story_macro",
          "book_contract",
          "正在准备 Book Contract 与故事宏观规划",
          DIRECTOR_PROGRESS.bookContract,
        );
        this.deps.scheduleBackgroundRun(workflowTask.id, async () => {
          await this.deps.pipelineRuntime.runPipeline({
            taskId: workflowTask.id,
            novelId: createdNovel.id,
            input: directorInput,
            startPhase: "story_macro",
            scope: "book",
          });
        });
        const novel = await this.deps.novelContextService.getNovelById(createdNovel.id) as unknown as DirectorConfirmApiResponse["novel"];
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
      const message = error instanceof Error ? error.message : "自动导演确认链执行失败。";
      await this.deps.workflowService.markTaskFailed(workflowTask.id, message);
      throw error;
    }
  }

  private async buildExistingConfirmResponse(
    task: WorkflowTaskSnapshot,
    input: DirectorConfirmRequest,
    bookSpec: BookSpec,
  ): Promise<DirectorConfirmApiResponse> {
    if (!task?.novelId) {
      throw new Error("自动导演确认链缺少已创建的小说项目。");
    }
    const novel = await this.deps.novelContextService.getNovelById(task.novelId) as unknown as DirectorConfirmApiResponse["novel"];
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

  private async waitForExistingConfirmedNovel(taskId: string): Promise<WorkflowTaskSnapshot> {
    for (let attempt = 0; attempt < DIRECTOR_CONFIRM_DUPLICATE_ATTEMPTS; attempt += 1) {
      const task = await this.deps.workflowService.getTaskByIdWithoutHealing(taskId);
      if (!task || task.novelId || task.status === "failed" || task.status === "cancelled") {
        return task;
      }
      await sleep(DIRECTOR_CONFIRM_DUPLICATE_WAIT_MS);
    }
    return this.deps.workflowService.getTaskByIdWithoutHealing(taskId);
  }
}
