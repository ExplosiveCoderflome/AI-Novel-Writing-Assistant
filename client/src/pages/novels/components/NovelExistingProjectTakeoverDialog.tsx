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
    value: "full_book_autopilot",
    label: "全书自动接管",
    description: "AI 会按整本书目标补齐规划、继续写作、审校和修复。",
  },
  {
    value: "auto_to_ready",
    label: "推进到可开写",
    description: "AI 会持续推进到章节执行资源准备好后再交接。",
  },
  {
    value: "auto_to_execution",
    label: "按范围执行",
    description: "按全书、章节范围或卷范围接管，并继续准备目标范围的章节执行。",
  },
];

const STRATEGY_OPTIONS: Array<{ value: DirectorTakeoverStrategy; label: string; description: string }> = [
  {
    value: "continue_existing",
    label: "继续已有进度",
    description: "优先跳过已完成资产，只补缺失部分或恢复当前批次。",
  },
  {
    value: "restart_current_step",
    label: "重新生成当前步",
    description: "先清空当前步骤产出，再按该步骤重新生成。",
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
    worldName ? `世界观：${worldName}` : "",
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
    ? readinessQuery.error instanceof Error ? readinessQuery.error.message : "读取接管状态失败。"
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
        toast.error("启动自动导演失败，未返回任务信息。");
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
          ? "自动导演接管任务已提交，可在 AI 驾驶舱查看全书执行进度。"
          : effectiveRunMode === "auto_to_execution"
          ? `自动导演接管任务已提交，可在 AI 驾驶舱查看 ${buildDirectorAutoExecutionPlanLabel(autoExecutionPlan)} 的执行进度。`
          : "自动导演接管任务已提交，可在 AI 驾驶舱查看排队和执行进度。",
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
            <DialogTitle>让 AI 从当前项目继续自动导演</DialogTitle>
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
                <div className="text-sm font-medium text-foreground">模型设置</div>
                <div className="mt-3"><LLMSelector /></div>
              </div>
              <div className="min-w-0 rounded-xl border bg-background/80 p-3 sm:p-4">
                <div className="text-sm font-medium text-foreground">自动导演运行方式</div>
                <div className="mt-3 rounded-lg border bg-muted/15 p-3">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="space-y-1">
                      <div className="text-sm font-medium text-foreground">正文后去 AI 检测与修正</div>
                      <div className={`text-xs leading-5 text-muted-foreground ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>
                        开启后，章节正文生成完成时会检测 AI 味风险，并在命中可修正问题时生成修订稿。
                      </div>
                    </div>
                    <Switch
                      aria-label="正文后去 AI 检测与修正"
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
                    <div className="text-sm font-medium text-foreground">全书自动接管</div>
                    <div className="mt-1">
                      系统会以整本书为目标接管当前项目，继续补齐规划、章节执行、审校和修复。只有模型不可用、服务异常、正文保护或不可恢复风险会停下。
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="min-w-0 rounded-xl border bg-background/80 p-3 sm:p-4">
                <div className="text-sm font-medium text-foreground">本次接管使用的写法</div>
                <div className={`mt-1 text-xs leading-5 text-muted-foreground ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>
                  绑定书级默认写法后，接管时建议沿用它。前半段导演只读取轻量摘要，避免干扰结构规划。
                </div>
                <div className="mt-3 space-y-3">
                  <select
                    className="w-full rounded-md border bg-background p-2 text-sm"
                    value={selectedStyleProfileId}
                    onChange={(event) => setSelectedStyleProfileId(event.target.value)}
                  >
                    <option value="">先只沿用文风关键词</option>
                    {styleProfiles.map((profile) => (
                      <option key={profile.id} value={profile.id}>{profile.name}</option>
                    ))}
                  </select>
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
                  <div className="text-sm font-medium text-foreground">接续位置</div>
                  {readinessQuery.isLoading ? <Badge variant="outline">读取中</Badge> : null}
                </div>
                {readinessQuery.isError ? (
                  <div className={`mt-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>
                    {readinessQuery.error instanceof Error ? readinessQuery.error.message : "读取接管状态失败。"}
                  </div>
                ) : null}

                {readiness ? (
                  <>
                    <div className="mt-3 grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      <div className="rounded-lg border bg-muted/15 p-3">
                        <div className="text-xs text-muted-foreground">书级规划</div>
                        <div className="mt-1 text-sm font-medium text-foreground">{readiness.snapshot.hasStoryMacroPlan ? "已具备" : "未具备"}</div>
                      </div>
                      <div className="rounded-lg border bg-muted/15 p-3">
                        <div className="text-xs text-muted-foreground">创作约束</div>
                        <div className="mt-1 text-sm font-medium text-foreground">{readiness.snapshot.hasBookContract ? "已具备" : "未具备"}</div>
                      </div>
                      <div className="rounded-lg border bg-muted/15 p-3">
                        <div className="text-xs text-muted-foreground">角色数量</div>
                        <div className="mt-1 text-sm font-medium text-foreground">{readiness.snapshot.characterCount}</div>
                      </div>
                      <div className="rounded-lg border bg-muted/15 p-3">
                        <div className="text-xs text-muted-foreground">卷 / 当前卷章节</div>
                        <div className="mt-1 text-sm font-medium text-foreground">{readiness.snapshot.volumeCount} / {readiness.snapshot.firstVolumeChapterCount}</div>
                      </div>
                    </div>

                    {readiness.hasActiveTask ? (
                      <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4">
                        <div className="text-sm font-medium text-foreground">当前已有自动导演任务</div>
                        <div className="mt-1 text-sm text-muted-foreground">为避免重复接管，请先处理当前自动导演任务。</div>
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
                                    {entry.recommended ? <Badge>推荐</Badge> : null}
                                    <Badge variant="outline">{entry.status}</Badge>
                                  </div>
                                </div>
                                <div className={`mt-2 text-xs leading-5 text-muted-foreground ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>{entry.description}</div>
                                <div className={`mt-3 text-xs leading-5 text-muted-foreground ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>
                                  {allowedForScope ? entry.reason : "当前范围不能从这一步开始。章节范围从节奏拆章开始，卷范围从卷战略开始。"}
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
                            <div className="text-sm font-medium text-foreground">本次接管预览</div>
                            <div className={`mt-2 text-sm text-muted-foreground ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>{selectedPreview?.summary ?? selectedEntry.reason}</div>
                            <div className={`mt-3 text-xs leading-5 text-muted-foreground ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>{selectedPreview?.effectSummary ?? selectedEntry.description}</div>
                            {selectedPreview ? (
                              <>
                                <div className="mt-3 flex min-w-0 flex-wrap gap-2">
                                  <Badge variant="secondary" className="max-w-full whitespace-normal break-words text-left [overflow-wrap:anywhere]">当前页：{selectedEntry.label}</Badge>
                                  <Badge variant="outline" className="max-w-full whitespace-normal break-words text-left [overflow-wrap:anywhere]">实际接管：{selectedPreview.effectiveStep}</Badge>
                                  <Badge variant="outline" className="max-w-full whitespace-normal break-words text-left [overflow-wrap:anywhere]">执行阶段：{selectedPreview.effectiveStage}</Badge>
                                  {selectedPreview.usesCurrentBatch ? <Badge>恢复当前批次</Badge> : null}
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
                                  <div className={`mt-3 text-xs leading-5 text-muted-foreground ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>会跳过：{selectedPreview.skipSteps.join(" / ")}</div>
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
                            {startMutation.isPending ? "启动中..." : "按高级设置启动"}
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
