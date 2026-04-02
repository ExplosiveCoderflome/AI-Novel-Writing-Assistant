import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import type { TaskStatus, UnifiedTaskDetail } from "@ai-novel/shared/types/task";
import type { TitleFactorySuggestion } from "@ai-novel/shared/types/title";
import { normalizeCommercialTags } from "@ai-novel/shared/types/novelFraming";
import {
  DIRECTOR_CANDIDATE_SETUP_STEPS,
  DIRECTOR_CORRECTION_PRESETS,
  type DirectorCandidate,
  type DirectorCandidateBatch,
  type DirectorRunMode,
  type DirectorCorrectionPreset,
} from "@ai-novel/shared/types/novelDirector";
import { bootstrapNovelWorkflow } from "@/api/novelWorkflow";
import {
  confirmDirectorCandidate,
  generateDirectorCandidates,
  patchDirectorCandidate,
  refineDirectorCandidateTitles,
  refineDirectorCandidates,
} from "@/api/novelDirector";
import { queryKeys } from "@/api/queryKeys";
import { getTaskDetail } from "@/api/tasks";
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
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { useLLMStore } from "@/store/llmStore";
import type { NovelBasicFormState } from "../novelBasicInfo.shared";
import NovelAutoDirectorProgressPanel from "./NovelAutoDirectorProgressPanel";

interface NovelAutoDirectorDialogProps {
  basicForm: NovelBasicFormState;
  workflowTaskId?: string;
  restoredTask?: UnifiedTaskDetail | null;
  initialOpen?: boolean;
  onWorkflowTaskChange?: (workflowTaskId: string) => void;
  onConfirmed: (input: {
    novelId: string;
    workflowTaskId?: string;
    resumeTarget?: {
      stage?: "basic" | "story_macro" | "character" | "outline" | "structured" | "chapter" | "pipeline";
      chapterId?: string | null;
      volumeId?: string | null;
    } | null;
  }) => void;
}

type DirectorDialogMode = "candidate_selection" | "execution_progress" | "execution_failed";

const ACTIVE_TASK_STATUSES = new Set<TaskStatus>(["queued", "running", "waiting_approval"]);
const DIRECTOR_CANDIDATE_SETUP_STEP_KEYS = new Set<string>(DIRECTOR_CANDIDATE_SETUP_STEPS.map((step) => step.key));

const RUN_MODE_OPTIONS: Array<{
  value: DirectorRunMode;
  label: string;
  description: string;
}> = [
  {
    value: "stage_review",
    label: "按重要阶段审核",
    description: "推荐。AI 每到关键产物就停下，等你确认后再继续推进。",
  },
  {
    value: "auto_to_ready",
    label: "自动推进到可开写",
    description: "AI 会持续推进，直到第 1 卷前 10 章细化完成后再交接。",
  },
  {
    value: "auto_to_execution",
    label: "继续自动执行前 10 章",
    description: "AI 会推进到第 1 卷前 10 章细化，并继续自动写作、审校和修复这一批章节。",
  },
];

function buildInitialIdea(basicForm: NovelBasicFormState): string {
  const lines = [
    basicForm.description.trim(),
    basicForm.title.trim() ? `我想写一本暂名为《${basicForm.title.trim()}》的小说。` : "",
    basicForm.styleTone.trim() ? `文风希望偏 ${basicForm.styleTone.trim()}。` : "",
  ].filter(Boolean);
  return lines.join("\n");
}

function buildRequestPayload(
  basicForm: NovelBasicFormState,
  idea: string,
  llm: ReturnType<typeof useLLMStore.getState>,
  runMode: DirectorRunMode,
  workflowTaskId?: string,
) {
  const commercialTags = normalizeCommercialTags(basicForm.commercialTagsText);
  return {
    idea: idea.trim(),
    workflowTaskId: workflowTaskId || undefined,
    title: basicForm.title.trim() || undefined,
    description: basicForm.description.trim() || undefined,
    targetAudience: basicForm.targetAudience.trim() || undefined,
    bookSellingPoint: basicForm.bookSellingPoint.trim() || undefined,
    competingFeel: basicForm.competingFeel.trim() || undefined,
    first30ChapterPromise: basicForm.first30ChapterPromise.trim() || undefined,
    commercialTags: commercialTags.length > 0 ? commercialTags : undefined,
    genreId: basicForm.genreId || undefined,
    worldId: basicForm.worldId || undefined,
    writingMode: basicForm.writingMode,
    projectMode: basicForm.projectMode,
    narrativePov: basicForm.narrativePov,
    pacePreference: basicForm.pacePreference,
    styleTone: basicForm.styleTone.trim() || undefined,
    emotionIntensity: basicForm.emotionIntensity,
    aiFreedom: basicForm.aiFreedom,
    defaultChapterLength: basicForm.defaultChapterLength,
    estimatedChapterCount: basicForm.estimatedChapterCount,
    projectStatus: basicForm.projectStatus,
    storylineStatus: basicForm.storylineStatus,
    outlineStatus: basicForm.outlineStatus,
    resourceReadyScore: basicForm.resourceReadyScore,
    sourceNovelId: basicForm.sourceNovelId || undefined,
    sourceKnowledgeDocumentId: basicForm.sourceKnowledgeDocumentId || undefined,
    continuationBookAnalysisId: basicForm.continuationBookAnalysisId || undefined,
    continuationBookAnalysisSections: basicForm.continuationBookAnalysisSections.length > 0
      ? basicForm.continuationBookAnalysisSections
      : undefined,
    provider: llm.provider,
    model: llm.model,
    temperature: llm.temperature,
    runMode,
  };
}

function summarizeCurrentContext(basicForm: NovelBasicFormState): string[] {
  const commercialTags = normalizeCommercialTags(basicForm.commercialTagsText);
  return [
    basicForm.targetAudience.trim() ? `目标读者：${basicForm.targetAudience.trim()}` : "",
    basicForm.bookSellingPoint.trim() ? `书级卖点：${basicForm.bookSellingPoint.trim()}` : "",
    basicForm.competingFeel.trim() ? `对标气质：${basicForm.competingFeel.trim()}` : "",
    basicForm.first30ChapterPromise.trim() ? `前30章承诺：${basicForm.first30ChapterPromise.trim()}` : "",
    commercialTags.length > 0 ? `商业标签：${commercialTags.join(" / ")}` : "",
    basicForm.genreId ? `已选题材基底：${basicForm.genreId}` : "",
    basicForm.worldId ? `已绑定世界观：${basicForm.worldId}` : "",
    `创作模式：${basicForm.writingMode}`,
    `项目模式：${basicForm.projectMode}`,
    `视角：${basicForm.narrativePov}`,
    `节奏：${basicForm.pacePreference}`,
    `情绪：${basicForm.emotionIntensity}`,
    basicForm.styleTone.trim() ? `文风：${basicForm.styleTone.trim()}` : "",
    `预计章节：${basicForm.estimatedChapterCount}`,
  ].filter(Boolean);
}

function renderCandidateDetails(candidate: DirectorCandidate) {
  return [
    { label: "作品定位", value: candidate.positioning },
    { label: "核心卖点", value: candidate.sellingPoint },
    { label: "主线冲突", value: candidate.coreConflict },
    { label: "主角路径", value: candidate.protagonistPath },
    { label: "主钩子", value: candidate.hookStrategy },
    { label: "推进循环", value: candidate.progressionLoop },
    { label: "结局方向", value: candidate.endingDirection },
    { label: "章节规模", value: `约 ${candidate.targetChapterCount} 章` },
  ];
}

function resolveCandidateTitleOptions(candidate: DirectorCandidate): TitleFactorySuggestion[] {
  if (Array.isArray(candidate.titleOptions) && candidate.titleOptions.length > 0) {
    return candidate.titleOptions;
  }
  return [{
    title: candidate.workingTitle,
    clickRate: 60,
    style: "high_concept",
    angle: "当前方案书名",
    reason: "当前沿用导演候选书名。",
  }];
}

export default function NovelAutoDirectorDialog({
  basicForm,
  workflowTaskId: workflowTaskIdProp,
  restoredTask,
  initialOpen = false,
  onWorkflowTaskChange,
  onConfirmed,
}: NovelAutoDirectorDialogProps) {
  const navigate = useNavigate();
  const llm = useLLMStore();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [idea, setIdea] = useState("");
  const [feedback, setFeedback] = useState("");
  const [selectedPresets, setSelectedPresets] = useState<DirectorCorrectionPreset[]>([]);
  const [batches, setBatches] = useState<DirectorCandidateBatch[]>([]);
  const [workflowTaskId, setWorkflowTaskId] = useState(workflowTaskIdProp ?? "");
  const [dialogMode, setDialogMode] = useState<DirectorDialogMode>("candidate_selection");
  const [executionRequested, setExecutionRequested] = useState(false);
  const [pendingTitleHint, setPendingTitleHint] = useState("");
  const [executionError, setExecutionError] = useState("");
  const [runMode, setRunMode] = useState<DirectorRunMode>("stage_review");
  const [candidatePatchFeedbacks, setCandidatePatchFeedbacks] = useState<Record<string, string>>({});
  const [titlePatchFeedbacks, setTitlePatchFeedbacks] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!workflowTaskIdProp || workflowTaskIdProp === workflowTaskId) {
      return;
    }
    setWorkflowTaskId(workflowTaskIdProp);
  }, [workflowTaskId, workflowTaskIdProp]);

  useEffect(() => {
    if (!initialOpen) {
      return;
    }
    setOpen(true);
  }, [initialOpen]);

  useEffect(() => {
    if (!restoredTask) {
      return;
    }
    const seedPayload = (restoredTask.meta.seedPayload ?? null) as {
      idea?: string;
      batches?: DirectorCandidateBatch[];
      runMode?: DirectorRunMode;
    } | null;
    if (restoredTask.id && restoredTask.id !== workflowTaskId) {
      setWorkflowTaskId(restoredTask.id);
    }
    if (seedPayload?.idea?.trim()) {
      setIdea(seedPayload.idea);
    }
    if (Array.isArray(seedPayload?.batches) && seedPayload.batches.length > 0) {
      setBatches(seedPayload.batches);
    }
    if (
      seedPayload?.runMode === "auto_to_ready"
      || seedPayload?.runMode === "auto_to_execution"
      || seedPayload?.runMode === "stage_review"
    ) {
      setRunMode(seedPayload.runMode);
    }
    if (initialOpen) {
      setOpen(true);
    }
  }, [initialOpen, restoredTask, workflowTaskId]);

  useEffect(() => {
    if (!open || idea.trim()) {
      return;
    }
    setIdea(buildInitialIdea(basicForm));
  }, [basicForm, idea, open]);

  const directorTaskQuery = useQuery({
    queryKey: queryKeys.tasks.detail("novel_workflow", workflowTaskId || "none"),
    queryFn: () => getTaskDetail("novel_workflow", workflowTaskId),
    enabled: Boolean(workflowTaskId),
    retry: false,
    refetchInterval: (query) => {
      const task = query.state.data?.data;
      return open && task && ACTIVE_TASK_STATUSES.has(task.status) ? 2000 : false;
    },
  });

  const currentContextLines = useMemo(() => summarizeCurrentContext(basicForm), [basicForm]);
  const latestBatch = batches.at(-1) ?? null;
  const directorTask = useMemo(() => {
    const loadedTask = directorTaskQuery.data?.data ?? null;
    if (loadedTask) {
      return loadedTask;
    }
    return restoredTask?.id === workflowTaskId ? restoredTask : null;
  }, [directorTaskQuery.data?.data, restoredTask, workflowTaskId]);
  const candidateSetupInProgress = Boolean(
    directorTask
    && ACTIVE_TASK_STATUSES.has(directorTask.status)
    && DIRECTOR_CANDIDATE_SETUP_STEP_KEYS.has(directorTask.currentItemKey ?? ""),
  );
  const hasActiveDirectorTask = Boolean(directorTask && ACTIVE_TASK_STATUSES.has(directorTask.status));
  const triggerLabel = hasActiveDirectorTask ? "查看导演进度" : "AI 自动导演创建";
  const isBlockingExecutionView = dialogMode === "execution_progress" && hasActiveDirectorTask && !candidateSetupInProgress;

  useEffect(() => {
    if (!directorTask) {
      return;
    }
    if (directorTask.checkpointType === "candidate_selection_required" && !executionRequested) {
      setDialogMode("candidate_selection");
      setExecutionError("");
      return;
    }
    if (directorTask.status === "failed" || directorTask.status === "cancelled") {
      setDialogMode("execution_failed");
      setExecutionError(directorTask.lastError ?? "");
      return;
    }
    if (ACTIVE_TASK_STATUSES.has(directorTask.status)) {
      setDialogMode("execution_progress");
      if (directorTask.checkpointType !== "candidate_selection_required") {
        setExecutionRequested(false);
      }
    }
  }, [directorTask, executionRequested]);

  const ensureWorkflowTask = async () => {
    if (workflowTaskId) {
      return workflowTaskId;
    }
      const response = await bootstrapNovelWorkflow({
        lane: "auto_director",
        title: basicForm.title.trim() || undefined,
        seedPayload: {
          basicForm,
          idea,
          batches,
          runMode,
        },
      });
    const taskId = response.data?.id ?? "";
    if (taskId) {
      setWorkflowTaskId(taskId);
      onWorkflowTaskChange?.(taskId);
    }
    return taskId;
  };

  const applyUpdatedBatch = (batch: DirectorCandidateBatch, nextWorkflowTaskId?: string) => {
    setBatches((prev) => (
      prev.some((item) => item.id === batch.id)
        ? prev.map((item) => (item.id === batch.id ? batch : item))
        : [...prev, batch]
    ));
    if (nextWorkflowTaskId && nextWorkflowTaskId !== workflowTaskId) {
      setWorkflowTaskId(nextWorkflowTaskId);
      onWorkflowTaskChange?.(nextWorkflowTaskId);
    }
  };

  const generateMutation = useMutation({
    onMutate: () => {
      setDialogMode("execution_progress");
      setExecutionError("");
    },
    mutationFn: async () => {
      const currentWorkflowTaskId = await ensureWorkflowTask();
      const payload = buildRequestPayload(basicForm, idea, llm, runMode, currentWorkflowTaskId);
      const response = batches.length === 0
        ? await generateDirectorCandidates(payload)
        : await refineDirectorCandidates({
          ...payload,
          previousBatches: batches,
          presets: selectedPresets,
          feedback: feedback.trim() || undefined,
        });
      return {
        batch: response.data?.batch ?? null,
        workflowTaskId: response.data?.workflowTaskId ?? currentWorkflowTaskId,
      };
    },
    onSuccess: ({ batch, workflowTaskId: nextWorkflowTaskId }) => {
      if (!batch) {
        toast.error("自动导演没有返回可用方案。");
        return;
      }
      if (nextWorkflowTaskId && nextWorkflowTaskId !== workflowTaskId) {
        setWorkflowTaskId(nextWorkflowTaskId);
        onWorkflowTaskChange?.(nextWorkflowTaskId);
      }
      setBatches((prev) => [...prev, batch]);
      setFeedback("");
      setSelectedPresets([]);
      setDialogMode("candidate_selection");
      setExecutionRequested(false);
      setExecutionError("");
      toast.success(`${batch.roundLabel} 已生成 ${batch.candidates.length} 套方案。`);
    },
    onError: (error) => {
      setDialogMode("execution_failed");
      setExecutionError(error instanceof Error ? error.message : "导演候选方案生成失败。");
    },
  });

  const patchCandidateMutation = useMutation({
    onMutate: () => {
      setDialogMode("execution_progress");
      setExecutionError("");
    },
    mutationFn: async (payload: { batchId: string; candidate: DirectorCandidate; feedback: string }) => {
      const currentWorkflowTaskId = await ensureWorkflowTask();
      const response = await patchDirectorCandidate({
        ...buildRequestPayload(basicForm, idea, llm, runMode, currentWorkflowTaskId),
        previousBatches: batches,
        batchId: payload.batchId,
        candidateId: payload.candidate.id,
        feedback: payload.feedback.trim(),
      });
      return {
        batch: response.data?.batch ?? null,
        workflowTaskId: response.data?.workflowTaskId ?? currentWorkflowTaskId,
        candidateId: payload.candidate.id,
      };
    },
    onSuccess: ({ batch, workflowTaskId: nextWorkflowTaskId, candidateId }) => {
      if (!batch) {
        toast.error("定向修正失败，未返回更新后的方案。");
        return;
      }
      applyUpdatedBatch(batch, nextWorkflowTaskId);
      setCandidatePatchFeedbacks((prev) => ({ ...prev, [candidateId]: "" }));
      setDialogMode("candidate_selection");
      toast.success("已按你的意见修正这套方案。");
    },
    onError: (error) => {
      setDialogMode("execution_failed");
      setExecutionError(error instanceof Error ? error.message : "定向修正方案失败。");
    },
  });

  const refineTitleMutation = useMutation({
    onMutate: () => {
      setDialogMode("execution_progress");
      setExecutionError("");
    },
    mutationFn: async (payload: { batchId: string; candidate: DirectorCandidate; feedback: string }) => {
      const currentWorkflowTaskId = await ensureWorkflowTask();
      const response = await refineDirectorCandidateTitles({
        ...buildRequestPayload(basicForm, idea, llm, runMode, currentWorkflowTaskId),
        previousBatches: batches,
        batchId: payload.batchId,
        candidateId: payload.candidate.id,
        feedback: payload.feedback.trim(),
      });
      return {
        batch: response.data?.batch ?? null,
        workflowTaskId: response.data?.workflowTaskId ?? currentWorkflowTaskId,
        candidateId: payload.candidate.id,
      };
    },
    onSuccess: ({ batch, workflowTaskId: nextWorkflowTaskId, candidateId }) => {
      if (!batch) {
        toast.error("标题组修正失败，未返回更新后的书名组。");
        return;
      }
      applyUpdatedBatch(batch, nextWorkflowTaskId);
      setTitlePatchFeedbacks((prev) => ({ ...prev, [candidateId]: "" }));
      setDialogMode("candidate_selection");
      toast.success("已重做这套方案的标题组。");
    },
    onError: (error) => {
      setDialogMode("execution_failed");
      setExecutionError(error instanceof Error ? error.message : "标题组修正失败。");
    },
  });

  const confirmMutation = useMutation({
    mutationFn: async (payload: { candidate: DirectorCandidate; workflowTaskId?: string }) => {
      const currentWorkflowTaskId = payload.workflowTaskId || await ensureWorkflowTask();
      const response = await confirmDirectorCandidate({
        ...buildRequestPayload(basicForm, idea, llm, runMode, currentWorkflowTaskId),
        batchId: latestBatch?.id,
        round: latestBatch?.round,
        candidate: payload.candidate,
      });
      return {
        data: response.data ?? null,
        workflowTaskId: response.data?.workflowTaskId ?? currentWorkflowTaskId,
      };
    },
    onSuccess: async ({ data, workflowTaskId: nextWorkflowTaskId }) => {
      const novelId = data?.novel?.id;
      if (!novelId) {
        setDialogMode("execution_failed");
        setExecutionError("确认方案失败，未返回小说项目。");
        toast.error("确认方案失败，未返回小说项目。");
        return;
      }
      if (nextWorkflowTaskId) {
        setWorkflowTaskId(nextWorkflowTaskId);
        onWorkflowTaskChange?.(nextWorkflowTaskId);
      }
      await queryClient.invalidateQueries({ queryKey: queryKeys.novels.all });
      await queryClient.invalidateQueries({ queryKey: ["tasks"] });
      toast.success(
        data.directorSession?.runMode === "stage_review"
          ? `已创建《${data.novel.title}》，自动导演会在关键阶段停下等你审核。`
          : data.directorSession?.runMode === "auto_to_execution"
            ? `已创建《${data.novel.title}》，自动导演会继续自动执行前 10 章。`
            : `已创建《${data.novel.title}》，自动导演会继续在后台推进到可开写。`,
      );
      resetDialogState();
      onConfirmed({
        novelId,
        workflowTaskId: data.workflowTaskId ?? workflowTaskId,
        resumeTarget: data.resumeTarget ?? null,
      });
    },
    onError: async (error, payload) => {
      setDialogMode("execution_failed");
      setExecutionError(error instanceof Error ? error.message : "导演任务执行失败。");
      setExecutionRequested(false);
      if (payload.workflowTaskId) {
        await queryClient.invalidateQueries({
          queryKey: queryKeys.tasks.detail("novel_workflow", payload.workflowTaskId),
        });
      }
    },
  });

  const togglePreset = (preset: DirectorCorrectionPreset) => {
    setSelectedPresets((prev) => (
      prev.includes(preset)
        ? prev.filter((item) => item !== preset)
        : [...prev, preset]
    ));
  };

  const applyCandidateTitleOption = (batchId: string, candidateId: string, option: TitleFactorySuggestion) => {
    setBatches((prev) => prev.map((batch) => {
      if (batch.id !== batchId) {
        return batch;
      }
      return {
        ...batch,
        candidates: batch.candidates.map((candidate) => {
          if (candidate.id !== candidateId) {
            return candidate;
          }
          const titleOptions = resolveCandidateTitleOptions(candidate);
          const selectedIndex = titleOptions.findIndex((item) => item.title === option.title);
          const reorderedTitleOptions = selectedIndex <= 0
            ? titleOptions
            : [titleOptions[selectedIndex], ...titleOptions.filter((_, index) => index !== selectedIndex)];
          return {
            ...candidate,
            workingTitle: option.title,
            titleOptions: reorderedTitleOptions,
          };
        }),
      };
    }));
  };

  const resetDialogState = () => {
    setOpen(false);
    setIdea("");
    setFeedback("");
    setSelectedPresets([]);
    setBatches([]);
    setWorkflowTaskId("");
    setDialogMode("candidate_selection");
    setExecutionRequested(false);
    setPendingTitleHint("");
    setExecutionError("");
    setRunMode("stage_review");
    setCandidatePatchFeedbacks({});
    setTitlePatchFeedbacks({});
  };

  const canGenerate = idea.trim().length > 0 && !generateMutation.isPending;
  const handleConfirmCandidate = async (candidate: DirectorCandidate) => {
    try {
      const currentWorkflowTaskId = await ensureWorkflowTask();
      setPendingTitleHint(candidate.workingTitle);
      setDialogMode("execution_progress");
      setExecutionRequested(true);
      setExecutionError("");
      setOpen(true);
      if (currentWorkflowTaskId) {
        await queryClient.invalidateQueries({
          queryKey: queryKeys.tasks.detail("novel_workflow", currentWorkflowTaskId),
        });
      }
      confirmMutation.mutate({
        candidate,
        workflowTaskId: currentWorkflowTaskId,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "创建导演主任务失败。";
      setDialogMode("candidate_selection");
      setExecutionRequested(false);
      setExecutionError(message);
      toast.error(message);
    }
  };
  const handleBackgroundContinue = () => {
    setOpen(false);
    toast.success("导演任务会继续在后台运行，可在任务中心恢复查看。");
  };
  const handleOpenTaskCenter = () => {
    setOpen(false);
    if (workflowTaskId) {
      navigate(`/tasks?kind=novel_workflow&id=${workflowTaskId}`);
      return;
    }
    navigate("/tasks");
  };
  const handleDialogOpenChange = (next: boolean) => {
    if (next) {
      if (workflowTaskId) {
        void queryClient.invalidateQueries({
          queryKey: queryKeys.tasks.detail("novel_workflow", workflowTaskId),
        });
      }
      setOpen(true);
      return;
    }
    if (isBlockingExecutionView) {
      return;
    }
    setOpen(false);
  };

  return (
    <>
      <div className="flex items-center justify-end">
        <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
          {triggerLabel}
        </Button>
      </div>

      <Dialog open={open} onOpenChange={handleDialogOpenChange}>
        <DialogContent
          className={`max-h-[90vh] overflow-y-auto ${dialogMode === "candidate_selection" ? "max-w-6xl" : "max-w-4xl"}`}
          onEscapeKeyDown={(event) => {
            if (isBlockingExecutionView) {
              event.preventDefault();
            }
          }}
          onPointerDownOutside={(event) => {
            if (isBlockingExecutionView) {
              event.preventDefault();
            }
          }}
          onInteractOutside={(event) => {
            if (isBlockingExecutionView) {
              event.preventDefault();
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>
              {dialogMode === "candidate_selection"
                ? "AI 自动导演创建"
                : dialogMode === "execution_failed"
                  ? "AI 自动导演执行失败"
                  : "AI 自动导演执行中"}
            </DialogTitle>
            <DialogDescription>
              {dialogMode === "candidate_selection"
                ? "先让 AI 给你 2 套整本方向，再由你做书级确认；如果都不满意，可以继续生新一轮；如果你已经偏向某一套，也可以只修这套方案，或者只重做这套的标题组。"
                : dialogMode === "execution_failed"
                  ? "导演长流程已中断，当前会优先展示失败摘要、最近里程碑和恢复入口。"
                  : "当前会实时显示导演主流程进度、当前动作和里程碑历史。"}
            </DialogDescription>
          </DialogHeader>

          {dialogMode === "candidate_selection" ? (
            <div className="space-y-4">
              <div className="rounded-lg border bg-background/80 p-4">
                <div className="text-sm font-medium text-foreground">你的起始想法</div>
                <textarea
                  className="mt-2 min-h-[128px] w-full rounded-md border bg-background px-3 py-2 text-sm outline-none transition focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  value={idea}
                  onChange={(event) => setIdea(event.target.value)}
                  placeholder="例如：普通女大学生误入异能组织，一边上学打工，一边调查父亲失踪真相。"
                />
                <div className="mt-3">
                  <LLMSelector />
                </div>
                <div className="mt-3 rounded-md border bg-muted/20 p-3">
                  <div className="text-xs font-medium text-foreground">自动导演运行方式</div>
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
                <div className="mt-3 rounded-md border bg-muted/20 p-3">
                  <div className="text-xs font-medium text-foreground">当前会一起参与判断的创建页信息</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {currentContextLines.length > 0 ? currentContextLines.map((line) => (
                      <Badge key={line} variant="secondary">{line}</Badge>
                    )) : (
                      <span className="text-xs text-muted-foreground">
                        目前主要依赖你的灵感描述，也可以回创建页先补类型、文风或章节规模。
                      </span>
                    )}
                  </div>
                </div>
                <div className="mt-4 flex justify-end">
                  <Button type="button" onClick={() => generateMutation.mutate()} disabled={!canGenerate}>
                    {generateMutation.isPending
                      ? "生成中..."
                      : batches.length === 0
                        ? "生成第一批方案"
                        : "按修正建议继续生成"}
                  </Button>
                </div>
              </div>

              {batches.length > 0 ? (
                <div className="space-y-4">
                  {batches.map((batch) => (
                    <section key={batch.id} className="rounded-xl border p-4">
                      <div className="flex flex-col gap-2 border-b pb-3 md:flex-row md:items-center md:justify-between">
                        <div>
                          <div className="text-base font-semibold text-foreground">{batch.roundLabel}</div>
                          <div className="text-sm text-muted-foreground">
                            {batch.refinementSummary?.trim() || "初始方案"}
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {batch.presets.map((preset) => {
                            const meta = DIRECTOR_CORRECTION_PRESETS.find((item) => item.value === preset);
                            return meta ? <Badge key={preset} variant="outline">{meta.label}</Badge> : null;
                          })}
                        </div>
                      </div>

                      <div className="mt-4 grid gap-4 xl:grid-cols-2">
                        {batch.candidates.map((candidate) => {
                          const titleOptions = resolveCandidateTitleOptions(candidate);
                          return (
                            <article key={candidate.id} className="rounded-xl border bg-background p-4 shadow-sm">
                              <div className="space-y-2">
                                <div className="text-lg font-semibold text-foreground">{candidate.workingTitle}</div>
                                <div className="text-sm leading-6 text-muted-foreground">{candidate.logline}</div>
                                <div className="rounded-md border bg-muted/20 p-3">
                                  <div className="text-sm font-medium text-foreground">书名候选</div>
                                  <div className="mt-2 flex flex-wrap gap-2">
                                    {titleOptions.map((option) => {
                                      const active = option.title === candidate.workingTitle;
                                      return (
                                        <button
                                          key={`${candidate.id}-${option.title}`}
                                          type="button"
                                          className={`rounded-full border px-3 py-1.5 text-left text-xs transition ${
                                            active
                                              ? "border-primary bg-primary/10 text-primary"
                                              : "border-border bg-background text-foreground hover:border-primary/40"
                                          }`}
                                          onClick={() => applyCandidateTitleOption(batch.id, candidate.id, option)}
                                        >
                                          <span className="font-medium">{option.title}</span>
                                          <span className="ml-2 text-muted-foreground">预估 {option.clickRate}</span>
                                        </button>
                                      );
                                    })}
                                  </div>
                                  <div className="mt-2 text-xs leading-5 text-muted-foreground">
                                    {titleOptions[0]?.reason?.trim() || "书名由标题工坊增强生成，可在这里切换当前方案名。"}
                                  </div>
                                  <div className="mt-3 border-t pt-3">
                                    <div className="text-xs font-medium text-foreground">AI 修正这组书名</div>
                                    <div className="mt-1 text-xs leading-5 text-muted-foreground">
                                      适合“这组标题太土 / 太老派 / 不够都市 / 不够悬疑”这种定向修正。
                                    </div>
                                    <Input
                                      className="mt-2"
                                      value={titlePatchFeedbacks[candidate.id] ?? ""}
                                      onChange={(event) => setTitlePatchFeedbacks((prev) => ({
                                        ...prev,
                                        [candidate.id]: event.target.value,
                                      }))}
                                      placeholder="例如：当前这组太土气了，想更偏都市冷感一点，别像旧式升级文。"
                                    />
                                    <div className="mt-2 flex justify-end">
                                      <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        disabled={
                                          refineTitleMutation.isPending
                                          || !titlePatchFeedbacks[candidate.id]?.trim()
                                        }
                                        onClick={() => refineTitleMutation.mutate({
                                          batchId: batch.id,
                                          candidate,
                                          feedback: titlePatchFeedbacks[candidate.id] ?? "",
                                        })}
                                      >
                                        {refineTitleMutation.isPending ? "重做中..." : "AI 重做标题组"}
                                      </Button>
                                    </div>
                                  </div>
                                </div>
                                <div className="rounded-md bg-muted/30 p-3 text-sm leading-6 text-foreground">
                                  <div className="font-medium">为什么推荐这套</div>
                                  <div className="mt-1 text-muted-foreground">{candidate.whyItFits}</div>
                                </div>
                                <div className="grid gap-2 text-sm">
                                  {renderCandidateDetails(candidate).map((item) => (
                                    <div key={item.label}>
                                      <span className="font-medium text-foreground">{item.label}：</span>
                                      <span className="text-muted-foreground">{item.value}</span>
                                    </div>
                                  ))}
                                </div>
                                <div className="flex flex-wrap gap-2">
                                  {candidate.toneKeywords.map((keyword) => (
                                    <Badge key={keyword} variant="secondary">{keyword}</Badge>
                                  ))}
                                </div>
                                <div className="rounded-md border border-dashed p-3">
                                  <div className="text-sm font-medium text-foreground">AI 微调这套方案</div>
                                  <div className="mt-1 text-xs leading-5 text-muted-foreground">
                                    适合“我就偏向这套，但还有点偏差”的情况。AI 会保留这套主方向，只定向修正不对味的部分。
                                  </div>
                                  <Input
                                    className="mt-3"
                                    value={candidatePatchFeedbacks[candidate.id] ?? ""}
                                    onChange={(event) => setCandidatePatchFeedbacks((prev) => ({
                                      ...prev,
                                      [candidate.id]: event.target.value,
                                    }))}
                                    placeholder="例如：保留这套，但更偏都市异能，主角更主动一点，别太像传统热血升级。"
                                  />
                                  <div className="mt-2 flex justify-end">
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      disabled={
                                        patchCandidateMutation.isPending
                                        || !candidatePatchFeedbacks[candidate.id]?.trim()
                                      }
                                      onClick={() => patchCandidateMutation.mutate({
                                        batchId: batch.id,
                                        candidate,
                                        feedback: candidatePatchFeedbacks[candidate.id] ?? "",
                                      })}
                                    >
                                      {patchCandidateMutation.isPending ? "修正中..." : "AI 修这套方案"}
                                    </Button>
                                  </div>
                                </div>
                              </div>

                              <div className="mt-4 flex justify-end">
                                <Button
                                  type="button"
                                  onClick={() => void handleConfirmCandidate(candidate)}
                                  disabled={confirmMutation.isPending}
                                >
                                  {confirmMutation.isPending
                                    ? "正在进入导演流程..."
                                    : "选用这套并创建项目"}
                                </Button>
                              </div>
                            </article>
                          );
                        })}
                      </div>
                    </section>
                  ))}

                  <section className="rounded-xl border border-dashed p-4">
                    <div className="text-base font-semibold text-foreground">继续修正并生成下一轮</div>
                    <div className="mt-1 text-sm text-muted-foreground">
                      如果这几套还不够对味，可以点几个方向，再补一句你真正想要的感觉。系统会保留上一轮，
                      再给你一轮新的方案。
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      {DIRECTOR_CORRECTION_PRESETS.map((preset) => {
                        const active = selectedPresets.includes(preset.value);
                        return (
                          <button
                            key={preset.value}
                            type="button"
                            className={`rounded-full border px-3 py-1.5 text-sm transition ${
                              active
                                ? "border-primary bg-primary text-primary-foreground"
                                : "border-border bg-background text-foreground hover:border-primary/40"
                            }`}
                            onClick={() => togglePreset(preset.value)}
                          >
                            {preset.label}
                          </button>
                        );
                      })}
                    </div>

                    <div className="mt-4 space-y-2">
                      <label htmlFor="director-refine-feedback" className="text-sm font-medium text-foreground">
                        再补一句修正建议
                      </label>
                      <Input
                        id="director-refine-feedback"
                        value={feedback}
                        onChange={(event) => setFeedback(event.target.value)}
                        placeholder="例如：我想要女频成长感更强一点，别太像纯爽文，也不要太黑。"
                      />
                    </div>

                    <div className="mt-4 flex justify-end">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => generateMutation.mutate()}
                        disabled={generateMutation.isPending || !idea.trim()}
                      >
                        {generateMutation.isPending ? "生成中..." : "带修正建议继续生成"}
                      </Button>
                    </div>
                  </section>
                </div>
              ) : (
                <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
                  先给 AI 一句灵感，它会先产出第一批整本方向候选。
                </div>
              )}
            </div>
          ) : (
            <NovelAutoDirectorProgressPanel
              mode={dialogMode}
              task={directorTask}
              taskId={workflowTaskId}
              titleHint={pendingTitleHint}
              fallbackError={executionError}
              onBackgroundContinue={handleBackgroundContinue}
              onOpenTaskCenter={handleOpenTaskCenter}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
