import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import type { UnifiedTaskDetail } from "@ai-novel/shared/types/task";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { flattenGenreTreeOptions, getGenreTree } from "@/api/genre";
import { flattenStoryModeTreeOptions, getStoryModeTree } from "@/api/storyMode";
import { bootstrapNovelWorkflow, selectNovelProductionExperience } from "@/api/novelWorkflow";
import { setNovelCreationExperience } from "@/api/novel";
import { queryKeys } from "@/api/queryKeys";
import { getWorldList } from "@/api/world";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import {
  createDefaultNovelBasicFormState,
  patchNovelBasicForm,
  type NovelBasicFormState,
} from "../novelBasicInfo.shared";
import StageBasicSetup from "./StageBasicSetup";
import StageCandidates from "./StageCandidates";
import StageIdea from "./StageIdea";
import StageModelRun from "./StageModelRun";
import StageSummaryCard from "./StageSummaryCard";
import StageWorldStyle from "./StageWorldStyle";
import {
  AUTO_DIRECTOR_CREATE_STAGES,
  type AutoDirectorCreateStageKey,
  summarizeBasicStage,
  summarizeIdea,
  summarizeModelRunStage,
  summarizeWorldStyleStage,
} from "./directorCreateStages";
import { useAutoDirectorCreateController } from "./useAutoDirectorCreateController";
import { extractDirectorTaskSeedPayloadFromMeta } from "@ai-novel/shared/types/novelDirector";

const STAGE_ORDER: AutoDirectorCreateStageKey[] = ["idea", "basic", "world_style", "model_run", "candidates"];

function buildAutoDirectorCreateLink(taskId?: string): string {
  if (!taskId) {
    return "/novels/auto-director";
  }
  const searchParams = new URLSearchParams();
  searchParams.set("taskId", taskId);
  return `/novels/auto-director?${searchParams.toString()}`;
}

function completedThrough(stage: AutoDirectorCreateStageKey): Set<AutoDirectorCreateStageKey> {
  const index = STAGE_ORDER.indexOf(stage);
  return new Set(STAGE_ORDER.slice(0, Math.max(0, index + 1)));
}

export default function AutoDirectorCreatePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const reducedMotion = useReducedMotion();
  const taskIdFromQuery = searchParams.get("taskId")?.trim() ?? "";
  const legacyTaskIdFromQuery = searchParams.get("workflowTaskId")?.trim() ?? "";
  const normalizedTaskId = taskIdFromQuery || legacyTaskIdFromQuery;
  const hasLegacyParams = Boolean(legacyTaskIdFromQuery || searchParams.get("mode"));
  const [basicForm, setBasicForm] = useState(() => createDefaultNovelBasicFormState());
  const [restoredWorkflowTask, setRestoredWorkflowTask] = useState<UnifiedTaskDetail | null>(null);
  const [activeStage, setActiveStage] = useState<AutoDirectorCreateStageKey>("idea");
  const [completedStages, setCompletedStages] = useState<Set<AutoDirectorCreateStageKey>>(() => new Set());
  const restoreHandledRef = useRef<string | null>(null);

  const worldListQuery = useQuery({
    queryKey: queryKeys.worlds.all,
    queryFn: getWorldList,
  });
  const genreTreeQuery = useQuery({
    queryKey: queryKeys.genres.all,
    queryFn: getGenreTree,
  });
  const storyModeTreeQuery = useQuery({
    queryKey: queryKeys.storyModes.all,
    queryFn: getStoryModeTree,
  });
  const genreTree = genreTreeQuery.data?.data ?? [];
  const storyModeTree = storyModeTreeQuery.data?.data ?? [];
  const genreOptions = flattenGenreTreeOptions(genreTree);
  const storyModeOptions = flattenStoryModeTreeOptions(storyModeTree);
  const worldOptions = worldListQuery.data?.data ?? [];

  useEffect(() => {
    if (!hasLegacyParams) {
      return;
    }
    navigate(buildAutoDirectorCreateLink(normalizedTaskId), { replace: true });
  }, [hasLegacyParams, navigate, normalizedTaskId]);

  const replaceTaskId = (taskId: string) => {
    navigate(buildAutoDirectorCreateLink(taskId), { replace: true });
  };

  const restoreWorkflowMutation = useMutation({
    mutationFn: () => bootstrapNovelWorkflow({
      workflowTaskId: normalizedTaskId || undefined,
      lane: "auto_director",
    }),
    onSuccess: (response) => {
      const task = response.data ?? null;
      setRestoredWorkflowTask(task);
      if (!task) {
        return;
      }
      const seedPayload = (task.meta.seedPayload ?? null) as { basicForm?: Partial<NovelBasicFormState> } | null;
      if (seedPayload?.basicForm) {
        setBasicForm((prev) => patchNovelBasicForm(prev, seedPayload.basicForm ?? {}));
      }
      if (task.id && task.id !== normalizedTaskId) {
        replaceTaskId(task.id);
      }
      if (task.id && restoreHandledRef.current !== task.id) {
        restoreHandledRef.current = task.id;
        setCompletedStages(completedThrough("model_run"));
        setActiveStage("candidates");
      }
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "恢复自动导演任务失败。");
    },
  });

  useEffect(() => {
    if (!normalizedTaskId || hasLegacyParams) {
      if (!normalizedTaskId) {
        setRestoredWorkflowTask(null);
      }
      return;
    }
    restoreWorkflowMutation.mutate();
  }, [hasLegacyParams, normalizedTaskId]);

  const controller = useAutoDirectorCreateController({
    basicForm,
    genreOptions,
    storyModeOptions,
    worldOptions,
    workflowTaskId: normalizedTaskId,
    restoredTask: restoredWorkflowTask,
    onWorkflowTaskChange: replaceTaskId,
    onBasicFormChange: (patch) => setBasicForm((prev) => patchNovelBasicForm(prev, patch)),
  });
  const createdNovelId = controller.directorTask?.resumeTarget?.novelId?.trim() ?? "";
  const productionExperience = controller.directorTask
    ? (extractDirectorTaskSeedPayloadFromMeta(controller.directorTask.meta) as {
      productionExperience?: "simple" | "professional";
    } | null)?.productionExperience
    : null;
  const createdNovelRoute = productionExperience === "simple"
    ? `/novels/${createdNovelId}/simple`
    : `/novels/${createdNovelId}/edit`;
  const enterSimpleMutation = useMutation({
    mutationFn: () => selectNovelProductionExperience(controller.directorTask!.id, "simple"),
    onSuccess: (response) => {
      if (!response.data) {
        toast.error("没有找到简易创作入口。");
        return;
      }
      navigate(response.data.targetRoute, { replace: true });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "进入简易模式失败，请重试。"),
  });
  const enterProfessionalMutation = useMutation({
    mutationFn: () => setNovelCreationExperience(createdNovelId, "professional"),
    onSuccess: () => navigate(`/novels/${createdNovelId}/edit`, { replace: true }),
    onError: (error) => toast.error(error instanceof Error ? error.message : "进入专业模式失败，请重试。"),
  });

  useEffect(() => {
    if (controller.batches.length === 0 && !controller.hasActiveDirectorTask) {
      return;
    }
    setCompletedStages((prev) => new Set([...prev, ...completedThrough("model_run")]));
  }, [controller.batches.length, controller.hasActiveDirectorTask]);

  const latestProductionFoundation = controller.batches.at(-1)?.candidates[0]?.productionFoundation ?? null;
  const selectedGenre = genreOptions.find((option) => option.id === controller.directorBasicForm.genreId) ?? null;
  const selectedStoryMode = storyModeOptions.find(
    (option) => option.id === controller.directorBasicForm.primaryStoryModeId,
  ) ?? null;
  const latestGenreFoundation = latestProductionFoundation?.genre;
  const latestPrimaryStoryModeFoundation = latestProductionFoundation?.primaryStoryMode;
  const selectedGenreSource = latestGenreFoundation?.id === selectedGenre?.id
    ? latestGenreFoundation?.source
    : selectedGenre ? "user_selected" as const : undefined;
  const selectedStoryModeSource = latestPrimaryStoryModeFoundation?.id === selectedStoryMode?.id
    ? latestPrimaryStoryModeFoundation?.source
    : selectedStoryMode ? "user_selected" as const : undefined;

  const summaries = useMemo(() => ({
    idea: summarizeIdea(controller.idea, {
      genre: selectedGenre?.path,
      storyMode: selectedStoryMode?.path,
    }),
    basic: summarizeBasicStage(controller.directorBasicForm),
    world_style: summarizeWorldStyleStage({
      basicForm: controller.directorBasicForm,
      worldOptions,
      worldSetupMode: controller.worldSetupMode,
      styleProfileId: controller.selectedStyleProfileId,
      styleProfiles: controller.styleProfiles,
      selectedStyleSummary: controller.selectedStyleSummary,
    }),
    model_run: summarizeModelRunStage({
      runMode: controller.runMode,
      runModeOptions: controller.runModeOptions,
      postGenerationStyleReviewEnabled: controller.directorBasicForm.postGenerationStyleReviewEnabled,
    }),
    candidates: controller.batches.length > 0
      ? `已生成 ${controller.batches.length} 批方向候选`
      : controller.hasActiveDirectorTask
        ? "导演任务进行中"
        : "等待生成方向候选",
  }), [
    controller.batches.length,
    controller.directorBasicForm,
    controller.hasActiveDirectorTask,
    controller.idea,
    controller.runMode,
    controller.runModeOptions,
    controller.selectedStyleProfileId,
    controller.selectedStyleSummary,
    controller.styleProfiles,
    controller.worldSetupMode,
    selectedGenre?.path,
    selectedStoryMode?.path,
    worldOptions,
  ]);

  const markStageCompleted = (stage: AutoDirectorCreateStageKey) => {
    setCompletedStages((prev) => new Set([...prev, stage]));
  };

  const startGenerate = () => {
    if (!controller.canGenerate) {
      return;
    }
    setCompletedStages(completedThrough("model_run"));
    setActiveStage("candidates");
    controller.generateMutation.mutate();
  };

  const renderStage = () => {
    if (activeStage === "idea") {
      return (
        <StageIdea
          idea={controller.idea}
          onIdeaChange={controller.setIdea}
          ideaInspirations={controller.ideaInspirations}
          isGeneratingIdeaInspirations={controller.isGeneratingIdeaInspirations}
          onGenerateIdeaInspirations={controller.generateIdeaInspirations}
          onContinue={() => {
            markStageCompleted("idea");
            setActiveStage("basic");
          }}
          onQuickGenerate={startGenerate}
          canContinue={controller.idea.trim().length > 0}
          isGenerating={controller.generateMutation.isPending}
          genreTree={genreTree}
          storyModeTree={storyModeTree}
          selectedGenreId={controller.directorBasicForm.genreId}
          selectedGenreLabel={selectedGenre
            ? `故事类型：${selectedGenre.path}`
            : controller.directorBasicForm.genreId ? "故事类型：选择已失效" : ""}
          selectedGenreSource={selectedGenreSource}
          selectedStoryModeId={controller.directorBasicForm.primaryStoryModeId}
          selectedStoryModeLabel={selectedStoryMode
            ? `推进方式：${selectedStoryMode.path}`
            : controller.directorBasicForm.primaryStoryModeId ? "推进方式：选择已失效" : ""}
          selectedStoryModeSource={selectedStoryModeSource}
          genreLoading={genreTreeQuery.isPending}
          genreError={genreTreeQuery.isError}
          storyModeLoading={storyModeTreeQuery.isPending}
          storyModeError={storyModeTreeQuery.isError}
          isUpdatingFoundation={controller.isUpdatingFoundation}
          onRetryGenres={() => void genreTreeQuery.refetch()}
          onRetryStoryModes={() => void storyModeTreeQuery.refetch()}
          onFoundationChange={controller.updateProductionFoundation}
        />
      );
    }
    if (activeStage === "basic") {
      return (
        <StageBasicSetup
          basicForm={controller.directorBasicForm}
          genreOptions={genreOptions}
          idea={controller.idea}
          onBasicFormChange={controller.onBasicFormChange}
          onBack={() => setActiveStage("idea")}
          onConfirm={() => {
            markStageCompleted("basic");
            setActiveStage("world_style");
          }}
        />
      );
    }
    if (activeStage === "world_style") {
      return (
        <StageWorldStyle
          basicForm={controller.directorBasicForm}
          worldOptions={worldOptions}
          worldSetupMode={controller.worldSetupMode}
          onWorldSetupModeChange={controller.setWorldSetupMode}
          styleProfileOptions={controller.styleProfiles.map((profile) => ({ id: profile.id, name: profile.name }))}
          selectedStyleProfileId={controller.selectedStyleProfileId}
          selectedStyleSummary={controller.selectedStyleSummary}
          onStyleProfileChange={controller.setSelectedStyleProfileId}
          onBasicFormChange={controller.onBasicFormChange}
          onBack={() => setActiveStage("basic")}
          onConfirm={() => {
            markStageCompleted("world_style");
            setActiveStage("model_run");
          }}
        />
      );
    }
    if (activeStage === "model_run") {
      return (
        <StageModelRun
          basicForm={controller.directorBasicForm}
          onBasicFormChange={controller.onBasicFormChange}
          canGenerate={controller.canGenerate}
          isGenerating={controller.generateMutation.isPending}
          onBack={() => setActiveStage("world_style")}
          onGenerate={startGenerate}
        />
      );
    }
    return (
      <StageCandidates
        controller={controller}
        onRegenerateSettings={() => setActiveStage("model_run")}
      />
    );
  };

  const showSummaryBar = activeStage !== "idea" || completedStages.size > 0 || controller.workflowTaskId;

  return (
    <div className="mx-auto max-w-6xl space-y-4 px-3 py-4 sm:px-4 lg:px-0">
      {showSummaryBar ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="text-2xl font-semibold tracking-normal text-foreground">AI 自动导演创建</div>
            <div className="mt-1 text-sm leading-6 text-muted-foreground">
              从一个起始想法开始，AI 会持续准备创作资源；项目建立后即可打开查看已完成成果。
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {createdNovelId && productionExperience !== "simple" ? (
              <Button
                type="button"
                variant="default"
                disabled={enterSimpleMutation.isPending}
                onClick={() => enterSimpleMutation.mutate()}
              >
                {enterSimpleMutation.isPending ? "正在进入…" : "简易模式"}
              </Button>
            ) : null}
            {createdNovelId && productionExperience === "simple" ? (
              <Button type="button" variant="outline" disabled={enterProfessionalMutation.isPending} onClick={() => enterProfessionalMutation.mutate()}>
                {enterProfessionalMutation.isPending ? "正在进入…" : "专业模式"}
              </Button>
            ) : createdNovelId ? (
              <Button type="button" variant="outline" asChild>
                <Link to={createdNovelRoute}>专业模式</Link>
              </Button>
            ) : null}
            <Button type="button" variant="outline" asChild>
              <Link to="/novels/create">手动创建</Link>
            </Button>
          </div>
        </div>
      ) : null}

      {showSummaryBar ? (
        <div className="flex min-w-0 flex-wrap gap-2">
          {AUTO_DIRECTOR_CREATE_STAGES.map((stage) => {
            const active = activeStage === stage.key;
            const completed = completedStages.has(stage.key) || stage.key === "candidates" && controller.batches.length > 0;
            const canOpen = active || completed || stage.key === "candidates" && Boolean(controller.workflowTaskId || controller.batches.length > 0);
            return (
              <StageSummaryCard
                key={stage.key}
                order={stage.order}
                label={stage.label}
                stageKey={stage.key}
                summary={summaries[stage.key]}
                active={active}
                completed={completed}
                disabled={!canOpen}
                onClick={setActiveStage}
              />
            );
          })}
        </div>
      ) : null}

      {restoreWorkflowMutation.isPending && normalizedTaskId ? (
        <div className="rounded-lg bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
          正在恢复自动导演现场。
        </div>
      ) : null}

      <AnimatePresence mode="wait">
        <motion.div
          key={activeStage}
          initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: -8 }}
          transition={{ duration: reducedMotion ? 0 : 0.18 }}
        >
          {renderStage()}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
