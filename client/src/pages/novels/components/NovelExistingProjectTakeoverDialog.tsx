import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { normalizeCommercialTags } from "@ai-novel/shared/types/novelFraming";
import type {
  DirectorRunMode,
  DirectorTakeoverStartPhase,
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

interface NovelExistingProjectTakeoverDialogProps {
  novelId: string;
  basicForm: NovelBasicFormState;
}

const RUN_MODE_OPTIONS: Array<{
  value: DirectorRunMode;
  label: string;
  description: string;
}> = [
  {
    value: "stage_review",
    label: "按重要阶段审核",
    description: "推荐。AI 到关键产物就停下，等你确认后再继续。",
  },
  {
    value: "auto_to_ready",
    label: "直接推进到可开写",
    description: "AI 会持续推进到第 1 卷前 10 章细化完成后再交接。",
  },
  {
    value: "auto_to_execution",
    label: "继续自动执行前 10 章",
    description: "AI 会推进到第 1 卷前 10 章细化，并继续自动写作、审校和修复这一批章节。",
  },
];

function summarizeCurrentContext(basicForm: NovelBasicFormState): string[] {
  const commercialTags = normalizeCommercialTags(basicForm.commercialTagsText);
  return [
    basicForm.description.trim() ? `概述：${basicForm.description.trim()}` : "",
    basicForm.targetAudience.trim() ? `目标读者：${basicForm.targetAudience.trim()}` : "",
    basicForm.bookSellingPoint.trim() ? `书级卖点：${basicForm.bookSellingPoint.trim()}` : "",
    basicForm.competingFeel.trim() ? `对标气质：${basicForm.competingFeel.trim()}` : "",
    basicForm.first30ChapterPromise.trim() ? `前30章承诺：${basicForm.first30ChapterPromise.trim()}` : "",
    commercialTags.length > 0 ? `商业标签：${commercialTags.join(" / ")}` : "",
    basicForm.genreId ? `题材基底：${basicForm.genreId}` : "",
    basicForm.worldId ? `世界观：${basicForm.worldId}` : "",
    `预计章节：${basicForm.estimatedChapterCount}`,
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
  if (input.stage) {
    search.set("stage", input.stage);
  }
  if (input.chapterId) {
    search.set("chapterId", input.chapterId);
  }
  if (input.volumeId) {
    search.set("volumeId", input.volumeId);
  }
  return `/novels/${input.novelId}/edit?${search.toString()}`;
}

export default function NovelExistingProjectTakeoverDialog({
  novelId,
  basicForm,
}: NovelExistingProjectTakeoverDialogProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const llm = useLLMStore();
  const [open, setOpen] = useState(false);
  const [runMode, setRunMode] = useState<DirectorRunMode>("stage_review");
  const [selectedPhase, setSelectedPhase] = useState<DirectorTakeoverStartPhase>("story_macro");

  const readinessQuery = useQuery({
    queryKey: queryKeys.novels.autoDirectorTakeoverReadiness(novelId),
    queryFn: () => getDirectorTakeoverReadiness(novelId),
    enabled: open && Boolean(novelId),
    retry: false,
  });

  const readiness = readinessQuery.data?.data ?? null;
  const contextLines = useMemo(() => summarizeCurrentContext(basicForm), [basicForm]);
  const selectedStage = readiness?.stages.find((item) => item.phase === selectedPhase) ?? null;

  useEffect(() => {
    if (!readiness) {
      return;
    }
    const recommended = readiness.stages.find((item) => item.recommended && item.available);
    if (recommended) {
      setSelectedPhase((current) => {
        const currentStage = readiness.stages.find((item) => item.phase === current);
        return currentStage?.available ? current : recommended.phase;
      });
      return;
    }
    const firstAvailable = readiness.stages.find((item) => item.available);
    if (firstAvailable) {
      setSelectedPhase(firstAvailable.phase);
    }
  }, [readiness]);

  const startMutation = useMutation({
    mutationFn: async () => startDirectorTakeover({
      novelId,
      startPhase: selectedPhase,
      provider: llm.provider,
      model: llm.model,
      temperature: llm.temperature,
      runMode,
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
        runMode === "stage_review"
          ? "自动导演已接管当前项目，会在关键阶段停下等你审核。"
          : runMode === "auto_to_execution"
            ? "自动导演已接管当前项目，会继续自动执行前 10 章。"
            : "自动导演已接管当前项目，会持续推进到可开写阶段。",
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
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        AI 自动导演接管
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>让 AI 从现有项目继续自动导演</DialogTitle>
            <DialogDescription>
              适合你已经手动填完基本信息，后续想让 AI 接手书级规划、角色、卷战略或第 1 卷拆章。
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-xl border bg-muted/15 p-4">
              <div className="text-sm font-medium text-foreground">当前项目信息会作为自动导演输入</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {contextLines.length > 0 ? contextLines.map((line) => (
                  <Badge key={line} variant="secondary">{line}</Badge>
                )) : (
                  <span className="text-sm text-muted-foreground">
                    当前信息比较少，建议先补一句故事概述或书级卖点，再启动自动导演。
                  </span>
                )}
              </div>
            </div>

            <div className="rounded-xl border bg-background/80 p-4">
              <div className="text-sm font-medium text-foreground">模型设置</div>
              <div className="mt-3">
                <LLMSelector />
              </div>
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
                        active
                          ? "border-primary bg-primary/10 shadow-sm"
                          : "border-border bg-background hover:border-primary/40"
                      }`}
                      onClick={() => setRunMode(option.value)}
                    >
                      <div className="text-sm font-medium text-foreground">{option.label}</div>
                      <div className="mt-1 text-xs leading-5 text-muted-foreground">{option.description}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="rounded-xl border bg-background/80 p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-medium text-foreground">从哪一步开始接管</div>
                {readinessQuery.isLoading ? <Badge variant="outline">读取中</Badge> : null}
              </div>

              {readinessQuery.isLoading ? (
                <div className="mt-3 text-sm text-muted-foreground">正在读取当前项目资产和可接管阶段。</div>
              ) : null}

              {readinessQuery.isError ? (
                <div className="mt-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                  {readinessQuery.error instanceof Error ? readinessQuery.error.message : "读取接管阶段失败。"}
                </div>
              ) : null}

              {readiness ? (
                <>
                  <div className="mt-3 grid gap-3 md:grid-cols-4">
                    <div className="rounded-lg border bg-muted/15 p-3">
                      <div className="text-xs text-muted-foreground">Story Macro</div>
                      <div className="mt-1 text-sm font-medium text-foreground">
                        {readiness.snapshot.hasStoryMacroPlan ? "已具备" : "未具备"}
                      </div>
                    </div>
                    <div className="rounded-lg border bg-muted/15 p-3">
                      <div className="text-xs text-muted-foreground">Book Contract</div>
                      <div className="mt-1 text-sm font-medium text-foreground">
                        {readiness.snapshot.hasBookContract ? "已具备" : "未具备"}
                      </div>
                    </div>
                    <div className="rounded-lg border bg-muted/15 p-3">
                      <div className="text-xs text-muted-foreground">角色数量</div>
                      <div className="mt-1 text-sm font-medium text-foreground">{readiness.snapshot.characterCount}</div>
                    </div>
                    <div className="rounded-lg border bg-muted/15 p-3">
                      <div className="text-xs text-muted-foreground">卷 / 第1卷章节</div>
                      <div className="mt-1 text-sm font-medium text-foreground">
                        {readiness.snapshot.volumeCount} / {readiness.snapshot.firstVolumeChapterCount}
                      </div>
                    </div>
                  </div>

                  {readiness.hasActiveTask ? (
                    <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4">
                      <div className="text-sm font-medium text-foreground">当前已有自动导演任务</div>
                      <div className="mt-1 text-sm text-muted-foreground">
                        为避免重复接管，请先去任务中心继续或取消当前自动导演任务。
                      </div>
                      <div className="mt-3 flex justify-end">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => {
                            setOpen(false);
                            navigate(readiness.activeTaskId
                              ? `/tasks?kind=novel_workflow&id=${readiness.activeTaskId}`
                              : "/tasks");
                          }}
                        >
                          去任务中心
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="mt-4 grid gap-3 md:grid-cols-2">
                        {readiness.stages.map((stage) => {
                          const active = stage.phase === selectedPhase;
                          return (
                            <button
                              key={stage.phase}
                              type="button"
                              disabled={!stage.available || startMutation.isPending}
                              className={`rounded-xl border px-4 py-4 text-left transition ${
                                active
                                  ? "border-primary bg-primary/10 shadow-sm"
                                  : stage.available
                                    ? "border-border bg-background hover:border-primary/40"
                                    : "border-border/60 bg-muted/20 opacity-70"
                              }`}
                              onClick={() => setSelectedPhase(stage.phase)}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <div className="text-sm font-medium text-foreground">{stage.label}</div>
                                <div className="flex items-center gap-2">
                                  {stage.recommended ? <Badge>推荐</Badge> : null}
                                  {!stage.available ? <Badge variant="outline">暂不可用</Badge> : null}
                                </div>
                              </div>
                              <div className="mt-2 text-xs leading-5 text-muted-foreground">{stage.description}</div>
                              <div className="mt-3 text-xs leading-5 text-muted-foreground">{stage.reason}</div>
                            </button>
                          );
                        })}
                      </div>

                      {selectedStage ? (
                        <div className="mt-4 rounded-lg border bg-muted/15 p-3 text-sm text-muted-foreground">
                          当前选择：{selectedStage.label}。{selectedStage.reason}
                        </div>
                      ) : null}

                      <div className="mt-4 flex justify-end">
                        <Button
                          type="button"
                          disabled={
                            startMutation.isPending
                            || !selectedStage
                            || !selectedStage.available
                          }
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
        </DialogContent>
      </Dialog>
    </>
  );
}
