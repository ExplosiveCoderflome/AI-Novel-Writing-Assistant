import i18next from "i18next";
const t = (key: string, options?: any) => i18next.t(key, options) as string;
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import type { UnifiedTaskDetail } from "@ai-novel/shared/types/task";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { flattenGenreTreeOptions, getGenreTree } from "@/api/genre";
import { bootstrapNovelWorkflow } from "@/api/novelWorkflow";
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
  const genreOptions = flattenGenreTreeOptions(genreTreeQuery.data?.data ?? []);
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
      toast.error(error instanceof Error ? error.message : t("gen.pages.novels.autoDirector.AutoDirectorCreatePage.gen_d20b5da1"));
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
    worldOptions,
    workflowTaskId: normalizedTaskId,
    restoredTask: restoredWorkflowTask,
    onWorkflowTaskChange: replaceTaskId,
    onBasicFormChange: (patch) => setBasicForm((prev) => patchNovelBasicForm(prev, patch)),
    onConfirmed: ({ novelId, workflowTaskId, resumeTarget }) => {
      const search = new URLSearchParams();
      search.set("stage", resumeTarget?.stage ?? "story_macro");
      if (workflowTaskId) {
        search.set("directorTaskId", workflowTaskId);
      }
      if (resumeTarget?.chapterId) {
        search.set("chapterId", resumeTarget.chapterId);
      }
      if (resumeTarget?.volumeId) {
        search.set("volumeId", resumeTarget.volumeId);
      }
      navigate(`/novels/${novelId}/edit?${search.toString()}`);
    },
  });

  useEffect(() => {
    if (controller.batches.length === 0 && !controller.hasActiveDirectorTask) {
      return;
    }
    setCompletedStages((prev) => new Set([...prev, ...completedThrough("model_run")]));
    setActiveStage("candidates");
  }, [controller.batches.length, controller.hasActiveDirectorTask]);

  const summaries = useMemo(() => ({
    idea: summarizeIdea(controller.idea),
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
        ? t("gen.pages.novels.autoDirector.AutoDirectorCreatePage.gen_d3ec695c")
        : t("gen.pages.novels.autoDirector.AutoDirectorCreatePage.gen_7c5ab588"),
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
          runMode={controller.runMode}
          runModeOptions={controller.runModeOptions}
          onRunModeChange={controller.setRunMode}
          autoExecutionDraft={controller.autoExecutionDraft}
          onAutoExecutionDraftChange={(patch) => controller.setAutoExecutionDraft((prev) => ({ ...prev, ...patch }))}
          autoApprovalEnabled={controller.autoApprovalDraft.enabled}
          autoApprovalCodes={controller.autoApprovalDraft.codes}
          autoApprovalGroups={controller.autoApprovalDraft.groups}
          autoApprovalPoints={controller.autoApprovalDraft.points}
          onAutoApprovalEnabledChange={controller.autoApprovalDraft.setEnabled}
          onAutoApprovalCodesChange={controller.autoApprovalDraft.setCodes}
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
            <div className="text-2xl font-semibold tracking-normal text-foreground">{t("gen.pages.novels.autoDirector.AutoDirectorCreatePage.aiAutoDirectorCreate")}</div>
            <div className="mt-1 text-sm leading-6 text-muted-foreground">
              从一个起始想法开始，逐步确认默认设置，再选择整本书方向。
            </div>
          </div>
          <Button type="button" variant="outline" asChild>
            <Link to="/novels/create">{t("gen.pages.novels.autoDirector.AutoDirectorCreatePage.gen_4364e2f1")}</Link>
          </Button>
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
