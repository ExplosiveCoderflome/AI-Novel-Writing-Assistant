import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { normalizeCommercialTags } from "@ai-novel/shared/types/novelFraming";
import type {
  DirectorAutoExecutionPlan,
  DirectorRunMode,
  DirectorTakeoverEntryStep,
  DirectorTakeoverStrategy,
} from "@ai-novel/shared/types/novelDirector";
import { getDirectorTakeoverReadiness, startDirectorTakeover } from "@/api/novelDirector";
import { queryKeys } from "@/api/queryKeys";
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
import { useLLMStore } from "@/store/llmStore";
import type { NovelBasicFormState } from "../novelBasicInfo.shared";
import {
  DirectorAutoExecutionPlanFields,
  buildDirectorAutoExecutionPlanFromDraft,
  buildDirectorAutoExecutionPlanLabel,
  createDefaultDirectorAutoExecutionDraftState,
} from "./directorAutoExecutionPlan.shared";

interface NovelExistingProjectTakeoverDialogProps {
  novelId: string;
  basicForm: NovelBasicFormState;
  genreOptions: Array<{ id: string; path: string; label: string }>;
  storyModeOptions: Array<{ id: string; path: string; name: string }>;
  worldOptions: Array<{ id: string; name: string }>;
  triggerVariant?: "default" | "outline" | "secondary";
  defaultEntryStep?: DirectorTakeoverEntryStep;
}

const RUN_MODE_OPTIONS: Array<{ value: DirectorRunMode; label: string; description: string }> = [
  {
    value: "auto_to_ready",
    label: "推进到可开写",
    description: "AI 会持续推进到章节执行资源准备好后再交接。",
  },
  {
    value: "auto_to_execution",
    label: "继续自动执行章节批次",
    description: "默认执行前 10 章，也可以改成指定范围或按卷执行。",
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
  search.set("taskId", input.workflowTaskId);
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
}: NovelExistingProjectTakeoverDialogProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const llm = useLLMStore();
  const [open, setOpen] = useState(false);
  const [runMode, setRunMode] = useState<DirectorRunMode>("auto_to_ready");
  const [selectedEntryStep, setSelectedEntryStep] = useState<DirectorTakeoverEntryStep>(defaultEntryStep);
  const [selectedStrategy, setSelectedStrategy] = useState<DirectorTakeoverStrategy>("continue_existing");
  const [autoExecutionDraft, setAutoExecutionDraft] = useState(() => createDefaultDirectorAutoExecutionDraftState());

  const readinessQuery = useQuery({
    queryKey: queryKeys.novels.autoDirectorTakeoverReadiness(novelId),
    queryFn: () => getDirectorTakeoverReadiness(novelId),
    enabled: open && Boolean(novelId),
    retry: false,
  });

  const readiness = readinessQuery.data?.data ?? null;
  const contextLines = useMemo(
    () => summarizeCurrentContext(basicForm, genreOptions, storyModeOptions, worldOptions),
    [basicForm, genreOptions, storyModeOptions, worldOptions],
  );
  const selectedEntry = readiness?.entrySteps.find((item) => item.step === selectedEntryStep) ?? null;
  const selectedPreview = selectedEntry?.previews.find((item) => item.strategy === selectedStrategy) ?? null;
  const autoExecutionPlan: DirectorAutoExecutionPlan | undefined = runMode === "auto_to_execution"
    ? buildDirectorAutoExecutionPlanFromDraft(autoExecutionDraft)
    : undefined;

  useEffect(() => {
    if (!open) {
      setSelectedEntryStep(defaultEntryStep);
      setSelectedStrategy("continue_existing");
    }
  }, [defaultEntryStep, open]);

  useEffect(() => {
    if (!readiness) {
      return;
    }
    const recommended = readiness.entrySteps.find((item) => item.recommended && item.available)
      ?? readiness.entrySteps.find((item) => item.available)
      ?? null;
    if (recommended) {
      setSelectedEntryStep((current) => {
        const currentStep = readiness.entrySteps.find((item) => item.step === current);
        return currentStep?.available ? current : recommended.step;
      });
    }
  }, [readiness]);

  const startMutation = useMutation({
    mutationFn: async () => startDirectorTakeover({
      novelId,
      entryStep: selectedEntryStep,
      strategy: selectedStrategy,
      provider: llm.provider,
      model: llm.model,
      temperature: llm.temperature,
      runMode,
      autoExecutionPlan,
    }),
    onSuccess: async (response) => {
      const data = response.data;
      if (!data?.workflowTaskId) {
        toast.error("启动自动导演失败，未返回任务信息。");
        return;
      }
      await queryClient.invalidateQueries({ queryKey: queryKeys.novels.autoDirectorTask(novelId) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.novels.autoDirectorTakeoverReadiness(novelId) });
      await queryClient.invalidateQueries({ queryKey: ["tasks"] });
      setOpen(false);
      toast.success(
        runMode === "auto_to_execution"
          ? `自动导演已接管当前项目，会继续自动执行 ${buildDirectorAutoExecutionPlanLabel(autoExecutionPlan)}。`
          : "自动导演已接管当前项目，会继续推进到下一可交付阶段。",
      );
      navigate(buildEditRoute({
        novelId,
        workflowTaskId: data.workflowTaskId,
        stage: data.resumeTarget?.stage ?? "story_macro",
        chapterId: data.resumeTarget?.chapterId ?? null,
        volumeId: data.resumeTarget?.volumeId ?? null,
      }));
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : "启动自动导演接管失败。";
      toast.error(message);
    },
  });

  return (
    <>
      <Button type="button" variant={triggerVariant} size="sm" onClick={() => setOpen(true)}>
        AI 自动导演接管
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex h-[min(90vh,860px)] w-[calc(100vw-1.5rem)] max-w-5xl flex-col overflow-hidden p-0">
          <DialogHeader className="shrink-0 border-b px-6 pb-4 pr-12 pt-6">
            <DialogTitle>让 AI 从当前项目继续自动导演</DialogTitle>
            <DialogDescription>
              先读取当前项目真实进度，再明确告诉你这次会跳过、继续还是重跑哪些步骤。
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6 pt-4">
            <div className="space-y-4">
              <div className="rounded-xl border bg-muted/15 p-4">
                <div className="text-sm font-medium text-foreground">当前项目信息会作为自动导演输入</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {contextLines.length > 0 ? contextLines.map((line) => <Badge key={line} variant="secondary">{line}</Badge>) : (
                    <span className="text-sm text-muted-foreground">当前信息较少，建议至少补一句故事概述或书级卖点后再接管。</span>
                  )}
                </div>
              </div>
              <div className="rounded-xl border bg-background/80 p-4">
                <div className="text-sm font-medium text-foreground">模型设置</div>
                <div className="mt-3"><LLMSelector /></div>
              </div>
              <div className="rounded-xl border bg-background/80 p-4">
                <div className="text-sm font-medium text-foreground">自动导演运行方式</div>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
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
                        <div className="mt-1 text-xs leading-5 text-muted-foreground">{option.description}</div>
                      </button>
                    );
                  })}
                </div>
                {runMode === "auto_to_execution" ? (
                  <DirectorAutoExecutionPlanFields
                    draft={autoExecutionDraft}
                    onChange={(patch) => setAutoExecutionDraft((prev) => ({ ...prev, ...patch }))}
                  />
                ) : null}
              </div>

              <div className="rounded-xl border bg-background/80 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-medium text-foreground">从哪一步开始接管</div>
                  {readinessQuery.isLoading ? <Badge variant="outline">读取中</Badge> : null}
                </div>
                {readinessQuery.isError ? (
                  <div className="mt-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                    {readinessQuery.error instanceof Error ? readinessQuery.error.message : "读取接管状态失败。"}
                  </div>
                ) : null}

                {readiness ? (
                  <>
                    <div className="mt-3 grid gap-3 md:grid-cols-4">
                      <div className="rounded-lg border bg-muted/15 p-3">
                        <div className="text-xs text-muted-foreground">Story Macro</div>
                        <div className="mt-1 text-sm font-medium text-foreground">{readiness.snapshot.hasStoryMacroPlan ? "已具备" : "未具备"}</div>
                      </div>
                      <div className="rounded-lg border bg-muted/15 p-3">
                        <div className="text-xs text-muted-foreground">Book Contract</div>
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
                        <div className="mt-1 text-sm text-muted-foreground">为避免重复接管，请先去任务中心继续或取消当前自动导演任务。</div>
                        <div className="mt-3 flex justify-end">
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => {
                              setOpen(false);
                              navigate(readiness.activeTaskId ? `/tasks?kind=novel_workflow&id=${readiness.activeTaskId}` : "/tasks");
                            }}
                          >
                            去任务中心
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                          {readiness.entrySteps.map((entry) => {
                            const active = entry.step === selectedEntryStep;
                            return (
                              <button
                                key={entry.step}
                                type="button"
                                disabled={!entry.available || startMutation.isPending}
                                className={`rounded-xl border px-4 py-4 text-left transition ${
                                  active ? "border-primary bg-primary/10 shadow-sm" : entry.available ? "border-border bg-background hover:border-primary/40" : "border-border/60 bg-muted/20 opacity-70"
                                }`}
                                onClick={() => setSelectedEntryStep(entry.step)}
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <div className="text-sm font-medium text-foreground">{entry.label}</div>
                                  <div className="flex items-center gap-2">
                                    {entry.recommended ? <Badge>推荐</Badge> : null}
                                    <Badge variant="outline">{entry.status}</Badge>
                                  </div>
                                </div>
                                <div className="mt-2 text-xs leading-5 text-muted-foreground">{entry.description}</div>
                                <div className="mt-3 text-xs leading-5 text-muted-foreground">{entry.reason}</div>
                              </button>
                            );
                          })}
                        </div>

                        <div className="mt-4 grid gap-3 md:grid-cols-2">
                          {STRATEGY_OPTIONS.map((option) => {
                            const active = option.value === selectedStrategy;
                            return (
                              <button
                                key={option.value}
                                type="button"
                                className={`rounded-xl border px-4 py-4 text-left transition ${
                                  active ? "border-primary bg-primary/10 shadow-sm" : "border-border bg-background hover:border-primary/40"
                                }`}
                                onClick={() => setSelectedStrategy(option.value)}
                              >
                                <div className="text-sm font-medium text-foreground">{option.label}</div>
                                <div className="mt-2 text-xs leading-5 text-muted-foreground">{option.description}</div>
                              </button>
                            );
                          })}
                        </div>

                        {selectedEntry ? (
                          <div className="mt-4 rounded-xl border bg-muted/15 p-4">
                            <div className="text-sm font-medium text-foreground">本次接管预览</div>
                            <div className="mt-2 text-sm text-muted-foreground">{selectedPreview?.summary ?? selectedEntry.reason}</div>
                            <div className="mt-3 text-xs leading-5 text-muted-foreground">{selectedPreview?.effectSummary ?? selectedEntry.description}</div>
                            {selectedPreview ? (
                              <>
                                <div className="mt-3 flex flex-wrap gap-2">
                                  <Badge variant="secondary">当前页：{selectedEntry.label}</Badge>
                                  <Badge variant="outline">实际接管：{selectedPreview.effectiveStep}</Badge>
                                  <Badge variant="outline">执行阶段：{selectedPreview.effectiveStage}</Badge>
                                  {selectedPreview.usesCurrentBatch ? <Badge>恢复当前批次</Badge> : null}
                                </div>
                                {readiness.activePipelineJob ? (
                                  <div className="mt-3 text-xs leading-5 text-muted-foreground">
                                    当前活动批次：{readiness.activePipelineJob.currentItemLabel || `范围 ${readiness.activePipelineJob.startOrder}-${readiness.activePipelineJob.endOrder}`}
                                  </div>
                                ) : null}
                                {readiness.latestCheckpoint?.checkpointType ? (
                                  <div className="mt-2 text-xs leading-5 text-muted-foreground">
                                    最近检查点：{readiness.latestCheckpoint.checkpointType}
                                    {readiness.latestCheckpoint.chapterOrder ? ` · 第${readiness.latestCheckpoint.chapterOrder}章` : ""}
                                  </div>
                                ) : null}
                                {readiness.executableRange ? (
                                  <div className="mt-2 text-xs leading-5 text-muted-foreground">
                                    当前可执行范围：第 {readiness.executableRange.startOrder}-{readiness.executableRange.endOrder} 章
                                    {readiness.executableRange.nextChapterOrder ? ` · 下一章第 ${readiness.executableRange.nextChapterOrder} 章` : ""}
                                  </div>
                                ) : null}
                                {selectedPreview.skipSteps.length > 0 ? (
                                  <div className="mt-3 text-xs leading-5 text-muted-foreground">会跳过：{selectedPreview.skipSteps.join(" / ")}</div>
                                ) : null}
                                <div className="mt-3 space-y-1 text-xs leading-5 text-muted-foreground">
                                  {selectedPreview.impactNotes.map((note) => <div key={note}>• {note}</div>)}
                                </div>
                              </>
                            ) : null}
                          </div>
                        ) : null}

                        <div className="mt-4 flex justify-end">
                          <Button
                            type="button"
                            disabled={startMutation.isPending || !selectedEntry || !selectedEntry.available}
                            onClick={() => startMutation.mutate()}
                          >
                            {startMutation.isPending ? "启动中..." : "从这一阶段开始接管"}
                          </Button>
                        </div>
                      </>
                    )}
                  </>
                ) : null}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
