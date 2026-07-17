import i18next from "i18next";
const t = (key: string, options?: any) => i18next.t(key, options) as string;
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { buildStyleIntentSummary } from "@ai-novel/shared/types/styleEngine";
import { normalizeCommercialTags } from "@ai-novel/shared/types/novelFraming";
import type {
  DirectorAutoExecutionPlan,
  DirectorRunMode,
  DirectorTakeoverEntryStep,
  DirectorTakeoverStrategy,
} from "@ai-novel/shared/types/novelDirector";
import { buildFullBookAutopilotExecutionPlan } from "@ai-novel/shared/types/novelDirector";
import { getDirectorTaskSnapshot, getDirectorTakeoverReadiness, startDirectorTakeover } from "@/api/novelDirector";
import { queryKeys } from "@/api/queryKeys";
import { getStyleBindings, getStyleProfiles } from "@/api/styleEngine";
import LLMSelector from "@/components/common/LLMSelector";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import AutoDirectorApprovalStrategyPanel from "@/components/autoDirector/AutoDirectorApprovalStrategyPanel";
import { useLLMStore } from "@/store/llmStore";
import { Switch } from "@/components/ui/switch";
import type { NovelBasicFormState } from "../novelBasicInfo.shared";
import {
  buildTakeoverAutoExecutionDraftFromExecutableRange,
  DirectorAutoExecutionPlanFields,
  buildDirectorAutoExecutionPlanFromDraft,
  buildDirectorAutoExecutionPlanLabel,
  createDefaultDirectorAutoExecutionDraftState,
} from "./directorAutoExecutionPlan.shared";
import {
  buildTakeoverChapterTarget,
  buildTakeoverProgressInspection,
  buildTakeoverGuidance,
  findTakeoverPreview,
  formatTakeoverStartError,
  isTakeoverEntryStepAllowedForScope,
  resolveRecommendedTakeoverEntryStep,
} from "./novelExistingProjectTakeoverViewModel";
import TakeoverContextSummaryPanel from "./takeover/TakeoverContextSummaryPanel";
import TakeoverDiagnosisPanel from "./takeover/TakeoverDiagnosisPanel";
import { useDirectorAutoApprovalDraft } from "./useDirectorAutoApprovalDraft";
import { AUTO_DIRECTOR_MOBILE_CLASSES } from "@/mobile/autoDirector";
import SelectControl from "@/components/common/SelectControl";

interface NovelExistingProjectTakeoverDialogProps {
  novelId: string;
  basicForm: NovelBasicFormState;
  genreOptions: Array<{ id: string; path: string; label: string }>;
  storyModeOptions: Array<{ id: string; path: string; name: string }>;
  worldOptions: Array<{ id: string; name: string }>;
  triggerVariant?: "default" | "outline" | "secondary";
  defaultEntryStep?: DirectorTakeoverEntryStep;
  workflowTaskId?: string | null;
}

const RUN_MODE_OPTIONS: Array<{ value: DirectorRunMode; label: string; description: string }> = [
  {
    value: "stage_review",
    label: "逐步协作",
    description: "每完成一个导演步骤就暂停，检查或完善后再继续下一步。",
  },
  {
    value: "full_book_autopilot",
    label: t("gen.pages.novels.components.NovelExistingProjectTakeoverDialog.gen_a86a8754"),
    description: t("gen.pages.novels.components.NovelExistingProjectTakeoverDialog.aiFillEntireBookGoal"),
  },
  {
    value: "auto_to_ready",
    label: t("gen.pages.novels.components.NovelExistingProjectTakeoverDialog.gen_0736c320"),
    description: t("gen.pages.novels.components.NovelExistingProjectTakeoverDialog.aiHandoverAfterResourceReady"),
  },
  {
    value: "auto_to_execution",
    label: t("gen.pages.novels.components.NovelExistingProjectTakeoverDialog.gen_88309d03"),
    description: t("gen.pages.novels.components.NovelExistingProjectTakeoverDialog.gen_19ede094"),
  },
];

const STRATEGY_OPTIONS: Array<{ value: DirectorTakeoverStrategy; label: string; description: string }> = [
  {
    value: "continue_existing",
    label: t("gen.pages.novels.components.NovelExistingProjectTakeoverDialog.gen_53d2332c"),
    description: t("gen.pages.novels.components.NovelExistingProjectTakeoverDialog.prioritizeSkipCompletedAssetsOnlyFillMissingOrRestoreCurrentBatch"),
  },
  {
    value: "restart_current_step",
    label: t("gen.pages.novels.components.NovelExistingProjectTakeoverDialog.gen_f231c588"),
    description: t("gen.pages.novels.components.NovelExistingProjectTakeoverDialog.gen_a5f11e53"),
  },
];

function summarizeCurrentContext(
  basicForm: NovelBasicFormState,
  genreOptions: Array<{ id: string; path: string; label: string }>,
  storyModeOptions: Array<{ id: string; path: string; name: string }>,
  worldOptions: Array<{ id: string; name: string }>,
): string[] {
  const commercialTags = normalizeCommercialTags(basicForm.commercialTagsText);
  const genrePath = genreOptions.find((item) => item.id === basicForm.genreId)?.path ?? basicForm.genreId;
  const primaryStoryModePath = storyModeOptions.find((item) => item.id === basicForm.primaryStoryModeId)?.path ?? basicForm.primaryStoryModeId;
  const worldName = worldOptions.find((item) => item.id === basicForm.worldId)?.name ?? basicForm.worldId;
  return [
    basicForm.description.trim() ? `概述：${basicForm.description.trim()}` : "",
    basicForm.targetAudience.trim() ? `目标读者：${basicForm.targetAudience.trim()}` : "",
    basicForm.bookSellingPoint.trim() ? `书级卖点：${basicForm.bookSellingPoint.trim()}` : "",
    genrePath ? `题材：${genrePath}` : "",
    primaryStoryModePath ? `主推进模式：${primaryStoryModePath}` : "",
    worldName ? `参考世界样本：${worldName}` : "",
    commercialTags.length > 0 ? `商业标签：${commercialTags.join(" / ")}` : "",
  ].filter(Boolean);
}

function buildEditRoute(input: {
  novelId: string;
  workflowTaskId: string;
  stage?: string | null;
  chapterId?: string | null;
  volumeId?: string | null;
}): string {
  const search = new URLSearchParams();
  search.set("directorTaskId", input.workflowTaskId);
  if (input.stage) search.set("stage", input.stage);
  if (input.chapterId) search.set("chapterId", input.chapterId);
  if (input.volumeId) search.set("volumeId", input.volumeId);
  return `/novels/${input.novelId}/edit?${search.toString()}`;
}

export default function NovelExistingProjectTakeoverDialog({
  novelId,
  basicForm,
  genreOptions,
  storyModeOptions,
  worldOptions,
  triggerVariant = "outline",
  defaultEntryStep = "basic",
  workflowTaskId,
}: NovelExistingProjectTakeoverDialogProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const llm = useLLMStore();
  const [open, setOpen] = useState(false);
  const [runMode, setRunMode] = useState<DirectorRunMode>("auto_to_ready");
  const [selectedEntryStep, setSelectedEntryStep] = useState<DirectorTakeoverEntryStep>(defaultEntryStep);
  const [selectedStrategy, setSelectedStrategy] = useState<DirectorTakeoverStrategy>("continue_existing");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [autoExecutionDraft, setAutoExecutionDraft] = useState(() => createDefaultDirectorAutoExecutionDraftState("takeover"));
  const [autoExecutionDraftTouched, setAutoExecutionDraftTouched] = useState(false);
  const [selectedChapterTargetOrder, setSelectedChapterTargetOrder] = useState<number | null>(null);
  const [selectedStyleProfileId, setSelectedStyleProfileId] = useState("");
  const [postGenerationStyleReviewEnabled, setPostGenerationStyleReviewEnabled] = useState(
    basicForm.postGenerationStyleReviewEnabled,
  );
  const autoApprovalDraft = useDirectorAutoApprovalDraft(open);
  const { reset: resetAutoApprovalDraft } = autoApprovalDraft;

  const readinessQuery = useQuery({
    queryKey: queryKeys.novels.autoDirectorTakeoverReadiness(novelId),
    queryFn: () => getDirectorTakeoverReadiness(novelId),
    enabled: open && Boolean(novelId),
    retry: false,
  });
  const contextTaskId = workflowTaskId?.trim() || "";
  const contextTaskSnapshotQuery = useQuery({
    queryKey: queryKeys.tasks.directorTaskSnapshot(contextTaskId || "none"),
    queryFn: () => getDirectorTaskSnapshot(contextTaskId),
    enabled: open && Boolean(contextTaskId),
    retry: false,
  });
  const styleProfilesQuery = useQuery({
    queryKey: queryKeys.styleEngine.profiles,
    queryFn: getStyleProfiles,
    enabled: open,
  });
  const novelStyleBindingsQuery = useQuery({
    queryKey: queryKeys.styleEngine.bindings(`novel-${novelId}`),
    queryFn: () => getStyleBindings({ targetType: "novel", targetId: novelId }),
    enabled: open && Boolean(novelId),
  });

  const readiness = readinessQuery.data?.data ?? null;
  const contextTaskSnapshot = contextTaskSnapshotQuery.data?.data?.snapshot ?? null;
  const contextTaskIsContinuable = Boolean(
    contextTaskSnapshot?.task
    && ["queued", "running", "waiting_approval"].includes(contextTaskSnapshot.task.status),
  );
  const styleProfiles = styleProfilesQuery.data?.data ?? [];
  const currentNovelStyleBindings = novelStyleBindingsQuery.data?.data ?? [];
  const selectedStyleProfile = useMemo(
    () => styleProfiles.find((item) => item.id === selectedStyleProfileId) ?? null,
    [selectedStyleProfileId, styleProfiles],
  );
  const selectedStyleSummary = useMemo(
    () => buildStyleIntentSummary({
      styleProfile: selectedStyleProfile,
      styleTone: basicForm.styleTone,
    }),
    [basicForm.styleTone, selectedStyleProfile],
  );
  const contextLines = useMemo(
    () => summarizeCurrentContext(basicForm, genreOptions, storyModeOptions, worldOptions),
    [basicForm, genreOptions, storyModeOptions, worldOptions],
  );
  const advancedAutoExecutionPlan: DirectorAutoExecutionPlan | undefined = runMode === "full_book_autopilot"
    ? buildFullBookAutopilotExecutionPlan()
    : runMode === "auto_to_execution"
      ? buildDirectorAutoExecutionPlanFromDraft(autoExecutionDraft, { usage: "takeover" })
      : undefined;
  const quickChapterTarget = useMemo(
    () => buildTakeoverChapterTarget(readiness, contextTaskSnapshot, selectedChapterTargetOrder),
    [contextTaskSnapshot, readiness, selectedChapterTargetOrder],
  );
  const effectiveRunMode: DirectorRunMode = !advancedOpen && quickChapterTarget ? "auto_to_execution" : runMode;
  const autoExecutionPlan: DirectorAutoExecutionPlan | undefined = !advancedOpen && quickChapterTarget
    ? quickChapterTarget.plan
    : advancedAutoExecutionPlan;
  const selectedScopeMode = effectiveRunMode === "auto_to_execution" || effectiveRunMode === "full_book_autopilot"
    ? autoExecutionPlan?.mode ?? autoExecutionDraft.mode
    : "book";
  const recommendedEntryStep = resolveRecommendedTakeoverEntryStep(readiness, selectedScopeMode);
  const effectiveEntryStep = advancedOpen ? selectedEntryStep : recommendedEntryStep ?? selectedEntryStep;
  const selectedEntry = readiness?.entrySteps.find((item) => item.step === effectiveEntryStep) ?? null;
  const selectedPreview = findTakeoverPreview(readiness, effectiveEntryStep, selectedStrategy);
  const selectedEntryAllowedForScope = isTakeoverEntryStepAllowedForScope(effectiveEntryStep, selectedScopeMode);
  const takeoverGuidance = buildTakeoverGuidance(
    readiness,
    effectiveEntryStep,
    selectedStrategy,
    effectiveRunMode,
    contextTaskIsContinuable ? contextTaskSnapshot : null,
  );
  const progressInspection = buildTakeoverProgressInspection(readiness, contextTaskSnapshot);
  const readinessErrorMessage = readinessQuery.isError
    ? readinessQuery.error instanceof Error ? readinessQuery.error.message : t("gen.pages.novels.components.NovelExistingProjectTakeoverDialog.gen_3cecd2a8")
    : null;

  const enterCurrentTask = () => {
    setOpen(false);
    const targetTaskId = (contextTaskIsContinuable ? contextTaskSnapshot?.task.id : null) ?? readiness?.activeTaskId ?? "";
    if (targetTaskId) {
      navigate(buildEditRoute({
        novelId,
        workflowTaskId: targetTaskId,
        stage: effectiveEntryStep === "basic" ? "basic" : effectiveEntryStep,
      }));
      return;
    }
    const search = new URLSearchParams();
    search.set("stage", effectiveEntryStep === "basic" ? "basic" : effectiveEntryStep);
    navigate(`/novels/${novelId}/edit?${search.toString()}`);
  };

  useEffect(() => {
    if (!open) {
      setSelectedEntryStep(defaultEntryStep);
      setSelectedStrategy("continue_existing");
      setRunMode("auto_to_ready");
      setAdvancedOpen(false);
      setAutoExecutionDraft(createDefaultDirectorAutoExecutionDraftState("takeover"));
      setAutoExecutionDraftTouched(false);
      setSelectedChapterTargetOrder(null);
      setSelectedStyleProfileId("");
      setPostGenerationStyleReviewEnabled(basicForm.postGenerationStyleReviewEnabled);
      resetAutoApprovalDraft();
    }
  }, [basicForm.postGenerationStyleReviewEnabled, defaultEntryStep, open, resetAutoApprovalDraft]);

  useEffect(() => {
    if (open) {
      setPostGenerationStyleReviewEnabled(basicForm.postGenerationStyleReviewEnabled);
    }
  }, [basicForm.postGenerationStyleReviewEnabled, open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const currentBookBinding = currentNovelStyleBindings[0];
    if (currentBookBinding?.styleProfileId) {
      setSelectedStyleProfileId((current) => current || currentBookBinding.styleProfileId);
    }
  }, [currentNovelStyleBindings, open]);

  useEffect(() => {
    if (!open || !quickChapterTarget) {
      return;
    }
    setSelectedChapterTargetOrder((current) => (
      current === quickChapterTarget.selectedOrder ? current : quickChapterTarget.selectedOrder
    ));
  }, [open, quickChapterTarget]);

  useEffect(() => {
    if (!readiness) {
      return;
    }
    const recommendedStep = resolveRecommendedTakeoverEntryStep(readiness, selectedScopeMode);
    if (recommendedStep) {
      setSelectedEntryStep((current) => {
        const currentStep = readiness.entrySteps.find((item) => item.step === current);
        return currentStep?.available && isTakeoverEntryStepAllowedForScope(current, selectedScopeMode)
          ? current
          : recommendedStep;
      });
    }
  }, [readiness, selectedScopeMode]);

  useEffect(() => {
    if (!open || runMode !== "auto_to_execution" || autoExecutionDraftTouched) {
      return;
    }
    const preferredDraft = buildTakeoverAutoExecutionDraftFromExecutableRange(
      readiness?.executableRange,
      selectedStrategy,
    );
    if (!preferredDraft) {
      return;
    }
    setAutoExecutionDraft((current) => ({
      ...preferredDraft,
      autoReview: current.autoReview,
      autoRepair: current.autoReview ? current.autoRepair : false,
    }));
  }, [
    autoExecutionDraftTouched,
    open,
    readiness?.executableRange,
    runMode,
    selectedStrategy,
  ]);

  const startMutation = useMutation({
    mutationFn: async () => startDirectorTakeover({
      novelId,
      entryStep: effectiveEntryStep,
      strategy: selectedStrategy,
      styleProfileId: selectedStyleProfileId || undefined,
      provider: llm.provider,
      model: llm.model,
      temperature: llm.temperature,
      runMode: effectiveRunMode,
      autoExecutionPlan,
      autoApproval: autoApprovalDraft.buildPayload(effectiveRunMode),
      postGenerationStyleReviewEnabled,
    }),
    onSuccess: async (response) => {
      const data = response.data;
      if (!data?.taskId) {
        toast.error(t("gen.pages.novels.components.NovelExistingProjectTakeoverDialog.gen_73ba7490"));
        return;
      }
      await queryClient.invalidateQueries({ queryKey: queryKeys.novels.autoDirectorTask(novelId) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.novels.detail(novelId) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.novels.directorBookAutomation(novelId) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.novels.autoDirectorTakeoverReadiness(novelId) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.styleEngine.bindings(`novel-${novelId}`) });
      await queryClient.invalidateQueries({ queryKey: ["tasks"] });
      setOpen(false);
      toast.success(
        effectiveRunMode === "full_book_autopilot"
          ? t("gen.pages.novels.components.NovelExistingProjectTakeoverDialog.gen_b4951973")
          : effectiveRunMode === "auto_to_execution"
          ? `自动导演接管任务已提交，可在 AI 驾驶舱查看 ${buildDirectorAutoExecutionPlanLabel(autoExecutionPlan)} 的执行进度。`
          : t("gen.pages.novels.components.NovelExistingProjectTakeoverDialog.gen_b87ce241"),
      );
      navigate(buildEditRoute({
        novelId,
        workflowTaskId: data.taskId,
        stage: effectiveEntryStep === "basic" ? "basic" : effectiveEntryStep,
      }));
    },
    onError: (error) => {
      toast.error(formatTakeoverStartError(error));
    },
  });
  const startDisabled = startMutation.isPending
    || readinessQuery.isLoading
    || !selectedEntry
    || !selectedEntry.available
    || !selectedEntryAllowedForScope;

  return (
    <>
      <Button type="button" variant={triggerVariant} size="sm" onClick={() => setOpen(true)}>
        AI 自动导演接管
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className={AUTO_DIRECTOR_MOBILE_CLASSES.takeoverDialogContent}>
          <DialogHeader className="shrink-0 border-b px-4 pb-4 pr-12 pt-5 text-left sm:px-6 sm:pt-6">
            <DialogTitle>{t("gen.pages.novels.components.NovelExistingProjectTakeoverDialog.gen_4af814f1")}</DialogTitle>
            <DialogDescription>
              先读取当前项目真实进度，再明确告诉你这次会跳过、继续还是重跑哪些步骤。
            </DialogDescription>
          </DialogHeader>
          <div className={AUTO_DIRECTOR_MOBILE_CLASSES.dialogBody}>
            <div className="min-w-0 space-y-4">
              <TakeoverContextSummaryPanel lines={contextLines} />
              <TakeoverDiagnosisPanel
                guidance={takeoverGuidance}
                inspection={progressInspection}
                isLoadingReadiness={readinessQuery.isLoading}
                readinessErrorMessage={readinessErrorMessage}
                isLoadingTaskSnapshot={contextTaskSnapshotQuery.isLoading}
                hasTaskSnapshotError={contextTaskSnapshotQuery.isError}
                hasCurrentTask={Boolean(readiness?.hasActiveTask || contextTaskIsContinuable)}
                chapterTarget={quickChapterTarget}
                isAdvancedOpen={advancedOpen}
                isStarting={startMutation.isPending}
                startDisabled={startDisabled}
                onEnterCurrentTask={enterCurrentTask}
                onChapterTargetChange={(order) => setSelectedChapterTargetOrder(order)}
                onStart={() => startMutation.mutate()}
              />
              <details
                className="min-w-0 rounded-xl border bg-background/80 p-3 sm:p-4"
                open={advancedOpen}
                onToggle={(event) => setAdvancedOpen(event.currentTarget.open)}
              >
                <summary className="cursor-pointer text-sm font-medium text-foreground">
                  高级设置
                </summary>
                <div className="mt-4 space-y-4">
              <div className="min-w-0 rounded-xl border bg-background/80 p-3 sm:p-4">
                <div className="text-sm font-medium text-foreground">{t("gen.pages.novels.components.NovelExistingProjectTakeoverDialog.gen_96467e71")}</div>
                <div className="mt-3"><LLMSelector /></div>
              </div>
              <div className="min-w-0 rounded-xl border bg-background/80 p-3 sm:p-4">
                <div className="text-sm font-medium text-foreground">{t("gen.pages.novels.components.NovelExistingProjectTakeoverDialog.gen_9b2f093e")}</div>
                <div className="mt-3 rounded-lg border bg-muted/15 p-3">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="space-y-1">
                      <div className="text-sm font-medium text-foreground">{t("gen.pages.novels.components.NovelExistingProjectTakeoverDialog.gen_9c8d9efd")}</div>
                      <div className={`text-xs leading-5 text-muted-foreground ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>
                        开启后，章节正文生成完成时会检测 AI 味风险，并在命中可修正问题时生成修订稿。
                      </div>
                    </div>
                    <Switch
                      aria-label={t("gen.pages.novels.components.NovelExistingProjectTakeoverDialog.gen_9c8d9efd")}
                      checked={postGenerationStyleReviewEnabled}
                      onCheckedChange={setPostGenerationStyleReviewEnabled}
                    />
                  </div>
                </div>
                <div className="mt-3 grid min-w-0 gap-3 sm:grid-cols-2">
                  {RUN_MODE_OPTIONS.map((option) => {
                    const active = option.value === runMode;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        className={`rounded-xl border px-3 py-3 text-left transition ${
                          active ? "border-primary bg-primary/10 shadow-sm" : "border-border bg-background hover:border-primary/40"
                        }`}
                        onClick={() => setRunMode(option.value)}
                      >
                        <div className="text-sm font-medium text-foreground">{option.label}</div>
                        <div className={`mt-1 text-xs leading-5 text-muted-foreground ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>{option.description}</div>
                      </button>
                    );
                  })}
                </div>
                {runMode === "auto_to_execution" ? (
                  <>
                    <DirectorAutoExecutionPlanFields
                      draft={autoExecutionDraft}
                      onChange={(patch) => {
                        setAutoExecutionDraftTouched(true);
                        setAutoExecutionDraft((prev) => ({ ...prev, ...patch }));
                      }}
                      usage="takeover"
                    />
                    <AutoDirectorApprovalStrategyPanel
                      enabled={autoApprovalDraft.enabled}
                      approvalPointCodes={autoApprovalDraft.codes}
                      groups={autoApprovalDraft.groups}
                      approvalPoints={autoApprovalDraft.points}
                      onEnabledChange={autoApprovalDraft.setEnabled}
                      onApprovalPointCodesChange={autoApprovalDraft.setCodes}
                    />
                  </>
                ) : null}
                {runMode === "full_book_autopilot" ? (
                  <div className={`mt-3 rounded-md border border-primary/15 bg-primary/5 p-3 text-xs leading-5 text-muted-foreground ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>
                    <div className="text-sm font-medium text-foreground">{t("gen.pages.novels.components.NovelExistingProjectTakeoverDialog.gen_a86a8754")}</div>
                    <div className="mt-1">
                      系统会以整本书为目标接管当前项目，继续补齐规划、章节执行、审校和修复。只有模型不可用、服务异常、正文保护或不可恢复风险会停下。
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="min-w-0 rounded-xl border bg-background/80 p-3 sm:p-4">
                <div className="text-sm font-medium text-foreground">{t("gen.pages.novels.components.NovelExistingProjectTakeoverDialog.gen_855ed7ff")}</div>
                <div className={`mt-1 text-xs leading-5 text-muted-foreground ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>
                  绑定书级默认写法后，接管时建议沿用它。前半段导演只读取轻量摘要，避免干扰结构规划。
                </div>
                <div className="mt-3 space-y-3">
                  <SelectControl
                    className="w-full rounded-md border bg-background p-2 text-sm"
                    value={selectedStyleProfileId}
                    onChange={(event) => setSelectedStyleProfileId(event.target.value)}
                  >
                    <option value="">{t("gen.pages.novels.components.NovelExistingProjectTakeoverDialog.gen_7097c369")}</option>
                    {styleProfiles.map((profile) => (
                      <option key={profile.id} value={profile.id}>{profile.name}</option>
                    ))}
                  </SelectControl>
                  {currentNovelStyleBindings.length > 0 ? (
                    <div className={`rounded-lg border bg-muted/15 p-3 text-xs leading-6 text-muted-foreground ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>
                      当前书级默认写法：{currentNovelStyleBindings
                        .map((binding) => binding.styleProfile?.name ?? binding.styleProfileId)
                        .join(" / ")}
                    </div>
                  ) : null}
                  {selectedStyleSummary?.stageSummaryLines.length ? (
                    <div className={`rounded-lg border bg-muted/15 p-3 text-xs leading-6 text-muted-foreground ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>
                      本阶段仅生效的写法摘要：{selectedStyleSummary.stageSummaryLines.join("；")}
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="min-w-0 rounded-xl border bg-background/80 p-3 sm:p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-medium text-foreground">{t("gen.pages.novels.components.NovelExistingProjectTakeoverDialog.gen_1837ba81")}</div>
                  {readinessQuery.isLoading ? <Badge variant="outline">{t("gen.pages.novels.components.NovelExistingProjectTakeoverDialog.gen_26d335b3")}</Badge> : null}
                </div>
                {readinessQuery.isError ? (
                  <div className={`mt-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>
                    {readinessQuery.error instanceof Error ? readinessQuery.error.message : t("gen.pages.novels.components.NovelExistingProjectTakeoverDialog.gen_3cecd2a8")}
                  </div>
                ) : null}

                {readiness ? (
                  <>
                    <div className="mt-3 grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      <div className="rounded-lg border bg-muted/15 p-3">
                        <div className="text-xs text-muted-foreground">{t("gen.pages.novels.components.NovelExistingProjectTakeoverDialog.chapterPlanning")}</div>
                        <div className="mt-1 text-sm font-medium text-foreground">{t("gen.pages.novels.components.NovelExistingProjectTakeoverDialog.storyMacroPlanReady")}</div>
                      </div>
                      <div className="rounded-lg border bg-muted/15 p-3">
                        <div className="text-xs text-muted-foreground">{t("gen.pages.novels.components.NovelExistingProjectTakeoverDialog.gen_7191a9b4")}</div>
                        <div className="mt-1 text-sm font-medium text-foreground">{t("gen.pages.novels.components.NovelExistingProjectTakeoverDialog.bookContractReady")}</div>
                      </div>
                      <div className="rounded-lg border bg-muted/15 p-3">
                        <div className="text-xs text-muted-foreground">{t("gen.pages.novels.components.NovelExistingProjectTakeoverDialog.gen_487f3949")}</div>
                        <div className="mt-1 text-sm font-medium text-foreground">{readiness.snapshot.characterCount}</div>
                      </div>
                      <div className="rounded-lg border bg-muted/15 p-3">
                        <div className="text-xs text-muted-foreground">{t("gen.pages.novels.components.NovelExistingProjectTakeoverDialog.gen_0b218e75")}</div>
                        <div className="mt-1 text-sm font-medium text-foreground">{readiness.snapshot.volumeCount} / {readiness.snapshot.firstVolumeChapterCount}</div>
                      </div>
                    </div>

                    {readiness.hasActiveTask ? (
                      <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4">
                        <div className="text-sm font-medium text-foreground">{t("gen.pages.novels.components.NovelExistingProjectTakeoverDialog.gen_de3efd01")}</div>
                        <div className="mt-1 text-sm text-muted-foreground">{t("gen.pages.novels.components.NovelExistingProjectTakeoverDialog.avoidRepeatHandover")}</div>
                        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:justify-end">
                          <Button
                            type="button"
                            variant="outline"
                            className="w-full sm:w-auto"
                            onClick={() => {
                              setOpen(false);
                              if (readiness.activeTaskId) {
                                navigate(buildEditRoute({
                                  novelId,
                                  workflowTaskId: readiness.activeTaskId,
                                  stage: effectiveEntryStep === "basic" ? "basic" : effectiveEntryStep,
                                }));
                                return;
                              }
                              const search = new URLSearchParams();
                              search.set("stage", effectiveEntryStep === "basic" ? "basic" : effectiveEntryStep);
                              navigate(`/novels/${novelId}/edit?${search.toString()}`);
                            }}
                          >
                            处理当前任务
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="mt-4 grid min-w-0 gap-3 md:grid-cols-2 xl:grid-cols-3">
                          {readiness.entrySteps.map((entry) => {
                            const active = entry.step === selectedEntryStep;
                            const allowedForScope = isTakeoverEntryStepAllowedForScope(entry.step, selectedScopeMode);
                            const disabled = !entry.available || !allowedForScope || startMutation.isPending;
                            return (
                              <button
                                key={entry.step}
                                type="button"
                                disabled={disabled}
                                className={`min-w-0 rounded-xl border px-4 py-4 text-left transition ${
                                  active ? "border-primary bg-primary/10 shadow-sm" : !disabled ? "border-border bg-background hover:border-primary/40" : "border-border/60 bg-muted/20 opacity-70"
                                }`}
                                onClick={() => setSelectedEntryStep(entry.step)}
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <div className="break-words text-sm font-medium text-foreground [overflow-wrap:anywhere]">{entry.label}</div>
                                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                                    {entry.recommended ? <Badge>{t("gen.pages.novels.components.NovelExistingProjectTakeoverDialog.gen_3f981012")}</Badge> : null}
                                    <Badge variant="outline">{entry.status}</Badge>
                                  </div>
                                </div>
                                <div className={`mt-2 text-xs leading-5 text-muted-foreground ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>{entry.description}</div>
                                <div className={`mt-3 text-xs leading-5 text-muted-foreground ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>
                                  {allowedForScope ? entry.reason : t("gen.pages.novels.components.NovelExistingProjectTakeoverDialog.gen_a6b2c5fb")}
                                </div>
                              </button>
                            );
                          })}
                        </div>

                        <div className="mt-4 grid min-w-0 gap-3 md:grid-cols-2">
                          {STRATEGY_OPTIONS.map((option) => {
                            const active = option.value === selectedStrategy;
                            return (
                              <button
                                key={option.value}
                                type="button"
                                className={`min-w-0 rounded-xl border px-4 py-4 text-left transition ${
                                  active ? "border-primary bg-primary/10 shadow-sm" : "border-border bg-background hover:border-primary/40"
                                }`}
                                onClick={() => setSelectedStrategy(option.value)}
                              >
                                <div className="break-words text-sm font-medium text-foreground [overflow-wrap:anywhere]">{option.label}</div>
                                <div className={`mt-2 text-xs leading-5 text-muted-foreground ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>{option.description}</div>
                              </button>
                            );
                          })}
                        </div>

                        {selectedEntry ? (
                          <div className="mt-4 min-w-0 rounded-xl border bg-muted/15 p-3 sm:p-4">
                            <div className="text-sm font-medium text-foreground">{t("gen.pages.novels.components.NovelExistingProjectTakeoverDialog.gen_a444c658")}</div>
                            <div className={`mt-2 text-sm text-muted-foreground ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>{selectedPreview?.summary ?? selectedEntry.reason}</div>
                            <div className={`mt-3 text-xs leading-5 text-muted-foreground ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>{selectedPreview?.effectSummary ?? selectedEntry.description}</div>
                            {selectedPreview ? (
                              <>
                                <div className="mt-3 flex min-w-0 flex-wrap gap-2">
                                  <Badge variant="secondary" className="max-w-full whitespace-normal break-words text-left [overflow-wrap:anywhere]">{t("gen.pages.novels.components.NovelExistingProjectTakeoverDialog.gen_66fab546")}</Badge>
                                  <Badge variant="outline" className="max-w-full whitespace-normal break-words text-left [overflow-wrap:anywhere]">{t("gen.pages.novels.components.NovelExistingProjectTakeoverDialog.gen_ffbc22d4")}</Badge>
                                  <Badge variant="outline" className="max-w-full whitespace-normal break-words text-left [overflow-wrap:anywhere]">{t("gen.pages.novels.components.NovelExistingProjectTakeoverDialog.gen_7bad3a35")}</Badge>
                                  {selectedPreview.usesCurrentBatch ? <Badge>{t("gen.pages.novels.components.NovelExistingProjectTakeoverDialog.gen_b3d4b4f4")}</Badge> : null}
                                </div>
                                {readiness.activePipelineJob ? (
                                  <div className={`mt-3 text-xs leading-5 text-muted-foreground ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>
                                    当前活动批次：{readiness.activePipelineJob.currentItemLabel || `范围 ${readiness.activePipelineJob.startOrder}-${readiness.activePipelineJob.endOrder}`}
                                  </div>
                                ) : null}
                                {readiness.latestCheckpoint?.checkpointType ? (
                                  <div className={`mt-2 text-xs leading-5 text-muted-foreground ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>
                                    最近检查点：{readiness.latestCheckpoint.checkpointType}
                                    {readiness.latestCheckpoint.chapterOrder ? ` · 第${readiness.latestCheckpoint.chapterOrder}章` : ""}
                                  </div>
                                ) : null}
                                {readiness.executableRange ? (
                                  <div className={`mt-2 text-xs leading-5 text-muted-foreground ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>
                                    当前可执行范围：第 {readiness.executableRange.startOrder}-{readiness.executableRange.endOrder} 章
                                    {readiness.executableRange.nextChapterOrder ? ` · 下一章第 ${readiness.executableRange.nextChapterOrder} 章` : ""}
                                  </div>
                                ) : null}
                                {selectedPreview.skipSteps.length > 0 ? (
                                  <div className={`mt-3 text-xs leading-5 text-muted-foreground ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>{t("gen.pages.novels.components.NovelExistingProjectTakeoverDialog.willSkipSelectedPreviewSkipStepsJoinBySlash")}</div>
                                ) : null}
                                <div className={`mt-3 space-y-1 text-xs leading-5 text-muted-foreground ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>
                                  {selectedPreview.impactNotes.map((note) => <div key={note}>• {note}</div>)}
                                </div>
                              </>
                            ) : null}
                          </div>
                        ) : null}

                        <div className={AUTO_DIRECTOR_MOBILE_CLASSES.takeoverSubmitBar}>
                          <Button
                            type="button"
                            className={AUTO_DIRECTOR_MOBILE_CLASSES.fullWidthAction}
                            disabled={startMutation.isPending || !selectedEntry || !selectedEntry.available || !selectedEntryAllowedForScope}
                            onClick={() => startMutation.mutate()}
                          >
                            {startMutation.isPending ? t("gen.pages.novels.components.NovelExistingProjectTakeoverDialog.gen_684c9230") : t("gen.pages.novels.components.NovelExistingProjectTakeoverDialog.gen_779abc23")}
                          </Button>
                        </div>
                      </>
                    )}
                  </>
                ) : null}
              </div>
                </div>
              </details>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
