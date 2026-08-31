import {
  Component,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ErrorInfo,
  type ReactNode,
} from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import type { UnifiedTaskDetail } from "@ai-novel/shared/types/task";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { flattenGenreTreeOptions, getGenreTree } from "@/api/genre";
import { flattenStoryModeTreeOptions, getStoryModeTree } from "@/api/storyMode";
import { bootstrapNovelWorkflow } from "@/api/novelWorkflow";
import { setNovelCreationExperience } from "@/api/novel";
import { queryKeys } from "@/api/queryKeys";
import { getWorldList } from "@/api/world";
import { getMarketCreativeBrief } from "@/api/marketRadar";
import { createStyleProfileFromBookAnalysis, getStyleProfiles } from "@/api/styleEngine";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { useLLMStore } from "@/store/llmStore";
import ReferenceNovelStartDialog from "../components/ReferenceNovelStartDialog";
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
  fillMissingCreationFoundation,
  fillMissingMarketCreativeFraming,
  resolveMarketOpeningIdea,
} from "./creationFoundationPickerState";
import {
  AUTO_DIRECTOR_CREATE_STAGES,
  type AutoDirectorCreateStageKey,
  summarizeBasicStage,
  summarizeIdea,
  summarizeModelRunStage,
  summarizeWorldStyleStage,
} from "./directorCreateStages";
import {
  buildAutoDirectorCreateDraftScope,
  clearAutoDirectorCreateDraft,
  loadAutoDirectorCreateDraft,
  saveAutoDirectorCreateDraft,
} from "./draft/autoDirectorCreateDraft";
import { useAutoDirectorCreateController } from "./useAutoDirectorCreateController";

const STAGE_ORDER: AutoDirectorCreateStageKey[] = ["idea", "basic", "world_style", "model_run", "candidates"];
const ALL_BOOK_ANALYSIS_SECTIONS = [
  "overview",
  "plot_structure",
  "timeline",
  "character_system",
  "worldbuilding",
  "themes",
  "style_technique",
  "market_highlights",
] as const;
const TRANSFERABLE_BOOK_ANALYSIS_SECTIONS = [
  "plot_structure",
  "themes",
  "style_technique",
  "market_highlights",
] as const;

function buildAutoDirectorCreateLink(taskId?: string, marketBriefId?: string): string {
  if (!taskId && !marketBriefId) {
    return "/novels/auto-director";
  }
  const searchParams = new URLSearchParams();
  if (taskId) searchParams.set("taskId", taskId);
  if (marketBriefId) searchParams.set("marketBriefId", marketBriefId);
  return `/novels/auto-director?${searchParams.toString()}`;
}

function completedThrough(stage: AutoDirectorCreateStageKey): Set<AutoDirectorCreateStageKey> {
  const index = STAGE_ORDER.indexOf(stage);
  return new Set(STAGE_ORDER.slice(0, Math.max(0, index + 1)));
}

function getDraftStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function AutoDirectorCreatePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const reducedMotion = useReducedMotion();
  const queryClient = useQueryClient();
  const llm = useLLMStore();
  const taskIdFromQuery = searchParams.get("taskId")?.trim() ?? "";
  const legacyTaskIdFromQuery = searchParams.get("workflowTaskId")?.trim() ?? "";
  const normalizedTaskId = taskIdFromQuery || legacyTaskIdFromQuery;
  const marketBriefId = searchParams.get("marketBriefId")?.trim() ?? "";
  const referenceMode = searchParams.get("referenceMode") === "continuation" ? "continuation"
    : searchParams.get("referenceMode") === "adaptation" ? "adaptation"
      : "";
  const referenceBookAnalysisId = searchParams.get("bookAnalysisId")?.trim() ?? "";
  const referenceDocumentId = searchParams.get("sourceDocumentId")?.trim() ?? "";
  const referenceTitle = searchParams.get("referenceTitle")?.trim() ?? "";
  const initialStyleProfileId = searchParams.get("styleProfileId")?.trim() ?? "";
  const hasLegacyParams = Boolean(legacyTaskIdFromQuery || searchParams.get("mode"));
  const draftScopeKey = useMemo(() => buildAutoDirectorCreateDraftScope({
    marketBriefId,
    referenceMode,
    referenceBookAnalysisId,
    referenceDocumentId,
    initialStyleProfileId,
  }), [
    initialStyleProfileId,
    marketBriefId,
    referenceBookAnalysisId,
    referenceDocumentId,
    referenceMode,
  ]);
  const initialDraft = useMemo(() => {
    const storage = getDraftStorage();
    return !normalizedTaskId && storage
      ? loadAutoDirectorCreateDraft(storage, draftScopeKey)
      : null;
  }, [draftScopeKey, normalizedTaskId]);
  const [basicForm, setBasicForm] = useState(() => patchNovelBasicForm(
    createDefaultNovelBasicFormState(),
    initialDraft?.basicForm ?? {},
  ));
  const [referenceStartOpen, setReferenceStartOpen] = useState(searchParams.get("start") === "reference");
  const [restoredWorkflowTask, setRestoredWorkflowTask] = useState<UnifiedTaskDetail | null>(null);
  const [activeStage, setActiveStage] = useState<AutoDirectorCreateStageKey>(
    initialDraft?.activeStage ?? "idea",
  );
  const [completedStages, setCompletedStages] = useState<Set<AutoDirectorCreateStageKey>>(
    () => new Set(initialDraft?.completedStages ?? []),
  );
  const restoreHandledRef = useRef<string | null>(null);
  const marketBriefFormAppliedRef = useRef<string | null>(null);
  const marketBriefIdeaAppliedRef = useRef<string | null>(null);
  const referenceAppliedRef = useRef<string | null>(null);

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
  const marketBriefQuery = useQuery({
    queryKey: queryKeys.marketRadar.brief(marketBriefId || "none"),
    queryFn: () => getMarketCreativeBrief(marketBriefId),
    enabled: Boolean(marketBriefId),
  });
  const referenceStyleProfileQuery = useQuery({
    queryKey: [
      "reference-novel-style-profile",
      referenceBookAnalysisId || "none",
      llm.provider,
      llm.model,
    ],
    queryFn: async () => {
      const profileList = await getStyleProfiles();
      const existingProfile = (profileList.data ?? []).find((profile) => (
        profile.sourceType === "from_book_analysis"
        && profile.sourceRefId === referenceBookAnalysisId
        && profile.status === "active"
      ));
      if (existingProfile) {
        return existingProfile;
      }
      const created = await createStyleProfileFromBookAnalysis({
        bookAnalysisId: referenceBookAnalysisId,
        name: `${referenceTitle || "参考小说"}参考写法`,
        provider: llm.provider || undefined,
        model: llm.model || undefined,
        temperature: llm.temperature,
      });
      if (!created.data) {
        throw new Error("参考写法准备失败。");
      }
      return created.data;
    },
    enabled: Boolean(referenceMode && referenceBookAnalysisId && !initialStyleProfileId),
    retry: false,
  });
  const resolvedInitialStyleProfileId = initialStyleProfileId || referenceStyleProfileQuery.data?.id || "";
  const genreTree = genreTreeQuery.data?.data ?? [];
  const storyModeTree = storyModeTreeQuery.data?.data ?? [];
  const genreOptions = flattenGenreTreeOptions(genreTree);
  const storyModeOptions = flattenStoryModeTreeOptions(storyModeTree);
  const worldOptions = worldListQuery.data?.data ?? [];

  useEffect(() => {
    const referenceKey = `${referenceMode}:${referenceBookAnalysisId}:${referenceDocumentId}`;
    if (!referenceMode || !referenceBookAnalysisId || referenceAppliedRef.current === referenceKey) {
      return;
    }
    referenceAppliedRef.current = referenceKey;
    const sourceLabel = referenceTitle ? `《${referenceTitle}》` : "这份拆书";
    setBasicForm((current) => patchNovelBasicForm(current, referenceMode === "continuation"
      ? {
        writingMode: "continuation",
        continuationSourceType: "knowledge_document",
        sourceKnowledgeDocumentId: referenceDocumentId,
        continuationBookAnalysisId: referenceBookAnalysisId,
        continuationBookAnalysisSections: [...ALL_BOOK_ANALYSIS_SECTIONS],
        description: current.description || `基于${sourceLabel}现有角色、世界规则、终局状态和未完线索，继续创作后续故事。`,
      }
      : {
        writingMode: "original",
        referenceBookAnalysisId,
        referenceBookAnalysisSections: [...TRANSFERABLE_BOOK_ANALYSIS_SECTIONS],
        description: current.description || `参考${sourceLabel}的结构机制、节奏和写法，创作一部拥有全新角色、世界和剧情的独立小说。`,
      }));
  }, [referenceBookAnalysisId, referenceDocumentId, referenceMode, referenceTitle]);

  useEffect(() => {
    if (!referenceStyleProfileQuery.data?.id) {
      return;
    }
    void queryClient.invalidateQueries({ queryKey: queryKeys.styleEngine.profiles });
  }, [queryClient, referenceStyleProfileQuery.data?.id]);

  useEffect(() => {
    const brief = marketBriefQuery.data?.data;
    if (!marketBriefId || !brief || marketBriefFormAppliedRef.current === marketBriefId) {
      return;
    }
    marketBriefFormAppliedRef.current = marketBriefId;
    setBasicForm((current) => patchNovelBasicForm(current, {
      ...(brief.productionFoundation ? fillMissingCreationFoundation(current, {
        genreId: brief.productionFoundation.genre.id,
        primaryStoryModeId: brief.productionFoundation.primaryStoryMode.id,
        secondaryStoryModeId: brief.productionFoundation.secondaryStoryMode?.id,
      }) : {}),
      ...fillMissingMarketCreativeFraming(current, brief.creativeSeed),
    }));
  }, [marketBriefId, marketBriefQuery.data?.data]);

  useEffect(() => {
    if (!hasLegacyParams) {
      return;
    }
    navigate(buildAutoDirectorCreateLink(normalizedTaskId, marketBriefId), { replace: true });
  }, [hasLegacyParams, marketBriefId, navigate, normalizedTaskId]);

  const replaceTaskId = (taskId: string) => {
    const storage = getDraftStorage();
    if (storage) {
      clearAutoDirectorCreateDraft(storage, draftScopeKey);
    }
    const nextSearchParams = new URLSearchParams(searchParams);
    nextSearchParams.delete("workflowTaskId");
    nextSearchParams.delete("mode");
    nextSearchParams.set("taskId", taskId);
    navigate(`/novels/auto-director?${nextSearchParams.toString()}`, { replace: true });
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
    marketBriefId,
    initialStyleProfileId: resolvedInitialStyleProfileId,
    basicForm,
    genreOptions,
    storyModeOptions,
    worldOptions,
    initialDraft,
    workflowTaskId: normalizedTaskId,
    restoredTask: restoredWorkflowTask,
    onWorkflowTaskChange: replaceTaskId,
    onBasicFormChange: (patch) => setBasicForm((prev) => patchNovelBasicForm(prev, patch)),
  });
  useEffect(() => {
    const seed = marketBriefQuery.data?.data?.creativeSeed;
    if (!marketBriefId || !seed || marketBriefIdeaAppliedRef.current === marketBriefId) {
      return;
    }
    marketBriefIdeaAppliedRef.current = marketBriefId;
    controller.setIdea(resolveMarketOpeningIdea(controller.idea, seed));
  }, [controller.idea, controller.setIdea, marketBriefId, marketBriefQuery.data?.data?.creativeSeed]);
  useEffect(() => {
    const storage = getDraftStorage();
    if (!storage) {
      return;
    }
    if (normalizedTaskId || controller.workflowTaskId) {
      clearAutoDirectorCreateDraft(storage, draftScopeKey);
      return;
    }
    saveAutoDirectorCreateDraft(storage, draftScopeKey, {
      idea: controller.idea,
      basicForm,
      activeStage,
      completedStages,
      runMode: controller.runMode,
      worldSetupMode: controller.worldSetupMode,
      selectedStyleProfileId: controller.selectedStyleProfileId,
    });
  }, [
    activeStage,
    basicForm,
    completedStages,
    controller.idea,
    controller.runMode,
    controller.selectedStyleProfileId,
    controller.workflowTaskId,
    controller.worldSetupMode,
    draftScopeKey,
    normalizedTaskId,
  ]);
  const createdNovelId = controller.directorTask?.resumeTarget?.novelId?.trim() ?? "";
  const enterSimpleMutation = useMutation({
    mutationFn: () => setNovelCreationExperience(createdNovelId, "simple"),
    onSuccess: () => navigate(`/novels/${createdNovelId}/simple`, { replace: true }),
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
  const marketProductionFoundation = marketBriefQuery.data?.data?.productionFoundation ?? null;
  const selectedGenre = genreOptions.find((option) => option.id === controller.directorBasicForm.genreId) ?? null;
  const selectedStoryMode = storyModeOptions.find(
    (option) => option.id === controller.directorBasicForm.primaryStoryModeId,
  ) ?? null;
  const latestGenreFoundation = latestProductionFoundation?.genre;
  const latestPrimaryStoryModeFoundation = latestProductionFoundation?.primaryStoryMode;
  const selectedGenreSource = latestGenreFoundation?.id === selectedGenre?.id
    ? latestGenreFoundation?.source
    : marketProductionFoundation?.genre.id === selectedGenre?.id
      ? marketProductionFoundation?.genre.source
    : selectedGenre ? "user_selected" as const : undefined;
  const selectedStoryModeSource = latestPrimaryStoryModeFoundation?.id === selectedStoryMode?.id
    ? latestPrimaryStoryModeFoundation?.source
    : marketProductionFoundation?.primaryStoryMode.id === selectedStoryMode?.id
      ? marketProductionFoundation?.primaryStoryMode.source
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
          ideaConstellationOptions={controller.ideaConstellationOptions}
          isGeneratingIdeaConstellationOptions={controller.isGeneratingIdeaConstellationOptions}
          isComposingIdeaConstellation={controller.isComposingIdeaConstellation}
          onGenerateIdeaConstellationOptions={controller.generateIdeaConstellationOptions}
          onComposeIdeaConstellation={controller.composeIdeaConstellation}
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
      <ReferenceNovelStartDialog open={referenceStartOpen} onOpenChange={setReferenceStartOpen} />
      {referenceMode ? (
        <div className="rounded-xl bg-muted/45 px-4 py-3 text-sm">
          <div className="font-medium text-foreground">
            {referenceMode === "continuation" ? "续写原作" : "参考创作新书"}
            {referenceTitle ? ` · ${referenceTitle}` : ""}
          </div>
          <div className="mt-1 text-xs leading-5 text-muted-foreground">
            {referenceMode === "continuation"
              ? "拆书结论会持续用于方向、大纲、角色和卷章规划；原作事实会作为续写约束。"
              : "拆书结论会持续用于方向、大纲和卷章规划；只继承结构与节奏，不带入原作事实。"}
          </div>
          <div className="mt-2 text-xs leading-5 text-muted-foreground">
            {referenceStyleProfileQuery.isFetching
              ? "参考写法正在后台准备，不影响继续设置。"
              : referenceStyleProfileQuery.isError
                ? "拆书结论已带入；参考写法暂未完成，可继续开书并稍后补充。"
                : resolvedInitialStyleProfileId
                  ? "参考写法会随项目进入后续正文生成。"
                  : "拆书结论已带入，可以继续设置。"}
          </div>
        </div>
      ) : null}
      {showSummaryBar ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="text-2xl font-semibold tracking-normal text-foreground">AI 自动导演创建</div>
            <div className="mt-1 text-sm leading-6 text-muted-foreground">
              从一个起始想法开始，AI 会持续准备创作资源；项目建立后即可打开查看已完成成果。
            </div>
          </div>
          <div className="flex flex-wrap items-end gap-3 sm:justify-end">
              {createdNovelId ? (
                <div className="space-y-1.5">
                  <div className="text-xs font-medium text-muted-foreground">选择创作界面</div>
                  <div className="flex items-center gap-1 rounded-lg bg-muted/55 p-1" role="group" aria-label="选择创作模式">
                    <Button type="button" size="sm" variant="secondary" disabled={enterSimpleMutation.isPending} onClick={() => enterSimpleMutation.mutate()}>
                      {enterSimpleMutation.isPending ? "正在打开…" : "简易模式"}
                    </Button>
                    <Button type="button" size="sm" variant="secondary" disabled={enterProfessionalMutation.isPending} onClick={() => enterProfessionalMutation.mutate()}>
                      {enterProfessionalMutation.isPending ? "正在打开…" : "专业模式"}
                    </Button>
                  </div>
              </div>
            ) : null}
            <Button type="button" size="sm" variant="ghost" asChild>
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

      {marketBriefId ? (
        <section className="border-y border-border/60 py-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <span className="h-2 w-2 rounded-full bg-primary" aria-hidden="true" />
                雷达开书参考
                {marketBriefQuery.data?.data?.selectedSignals.length ? (
                  <span className="font-normal text-muted-foreground">
                    {marketBriefQuery.data.data.selectedSignals.length} 项信号
                  </span>
                ) : null}
              </div>
              <p className="mt-1 max-w-4xl text-sm leading-6 text-muted-foreground">
                {marketBriefQuery.data?.data?.summary || (marketBriefQuery.isPending ? "正在读取市场创作简报。" : "市场简报暂时无法读取，仍可继续按你的想法开书。")}
              </p>
            </div>
            <Button type="button" variant="ghost" size="sm" className="shrink-0" asChild>
              <Link to="/market-radar">调整雷达信号</Link>
            </Button>
          </div>

          {marketBriefQuery.data?.data?.selectedSignals.length ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {marketBriefQuery.data.data.selectedSignals.map((signal) => (
                <span key={signal.id} className="rounded-full bg-muted/70 px-2.5 py-1 text-xs text-foreground">
                  {signal.label}
                </span>
              ))}
            </div>
          ) : null}

          {marketBriefQuery.data?.data?.creativeSeed ? (
            <div className="mt-4 grid gap-4 border-t border-border/50 pt-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.35fr)]">
              <div className="min-w-0">
                <div className="text-xs font-medium text-muted-foreground">金手指 / 核心优势</div>
                <p className="mt-1 line-clamp-2 text-sm leading-6 text-foreground">
                  {marketBriefQuery.data.data.creativeSeed.coreAdvantage}
                </p>
              </div>
              <div className="min-w-0">
                <div className="text-xs font-medium text-muted-foreground">开书思路</div>
                <p className="mt-1 line-clamp-2 text-sm leading-6 text-foreground">
                  {marketBriefQuery.data.data.creativeSeed.openingIdea}
                </p>
              </div>
              <details className="lg:col-span-2">
                <summary className="w-fit cursor-pointer list-none text-xs font-medium text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden">
                  查看完整雷达设定
                </summary>
                <div className="mt-3 grid gap-4 text-sm leading-6 sm:grid-cols-2">
                  <div>
                    <div className="text-xs text-muted-foreground">完整核心优势</div>
                    <p className="mt-1 text-foreground">{marketBriefQuery.data.data.creativeSeed.coreAdvantage}</p>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">完整开书思路</div>
                    <p className="mt-1 text-foreground">{marketBriefQuery.data.data.creativeSeed.openingIdea}</p>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">核心卖点</div>
                    <p className="mt-1 text-foreground">{marketBriefQuery.data.data.creativeSeed.bookSellingPoint}</p>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">前 30 章承诺</div>
                    <p className="mt-1 text-foreground">{marketBriefQuery.data.data.creativeSeed.first30ChapterPromise}</p>
                  </div>
                </div>
              </details>
            </div>
          ) : marketBriefQuery.data?.data ? (
            <div className="mt-3 text-sm leading-6 text-amber-700 dark:text-amber-300">
              这份简报缺少完整开书思路，请返回雷达重新确认信号。
            </div>
          ) : null}

          {marketProductionFoundation ? (
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
              <span><span className="text-foreground">题材基底</span> {marketProductionFoundation.genre.path}</span>
              <span><span className="text-foreground">主要推进</span> {marketProductionFoundation.primaryStoryMode.path}</span>
              {marketProductionFoundation.secondaryStoryMode ? (
                <span><span className="text-foreground">辅助推进</span> {marketProductionFoundation.secondaryStoryMode.path}</span>
              ) : null}
            </div>
          ) : null}
        </section>
      ) : activeStage === "idea" ? (
        <div className="flex flex-col gap-3 rounded-xl bg-muted/35 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
          <span className="text-muted-foreground">也可以从一部参考小说或近期热门方向开始。</span>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => setReferenceStartOpen(true)}>照着一本书写</Button>
            <Button type="button" variant="outline" size="sm" asChild><Link to="/market-radar">参考热门题材</Link></Button>
          </div>
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

interface AutoDirectorCreateErrorBoundaryState {
  failed: boolean;
}

class AutoDirectorCreateErrorBoundary extends Component<
  { children: ReactNode },
  AutoDirectorCreateErrorBoundaryState
> {
  state: AutoDirectorCreateErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): AutoDirectorCreateErrorBoundaryState {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Auto-director creation page crashed", error, info);
  }

  render() {
    if (!this.state.failed) {
      return this.props.children;
    }

    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4 py-12">
        <div className="w-full max-w-lg text-center">
          <h1 className="text-2xl font-semibold text-foreground">创建页遇到问题</h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            重新加载后，系统会尝试恢复保存在本机的开书草稿；已创建的任务和小说不会受影响。
          </p>
          <Button type="button" className="mt-6" onClick={() => window.location.reload()}>
            重新加载创建页
          </Button>
        </div>
      </div>
    );
  }
}

export default function AutoDirectorCreateRoute() {
  return (
    <AutoDirectorCreateErrorBoundary>
      <AutoDirectorCreatePage />
    </AutoDirectorCreateErrorBoundary>
  );
}
