import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import type { TaskStatus, UnifiedTaskDetail } from "@ai-novel/shared/types/task";
import {
  DIRECTOR_CANDIDATE_SETUP_STEPS,
  extractDirectorTaskSeedPayloadFromMeta,
  mergeDirectorCandidateBatches,
  type DirectorCandidate,
  type DirectorCandidateBatch,
  type DirectorAutoExecutionPlan,
  type DirectorCorrectionPreset,
  type DirectorRunMode,
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
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import { isChapterTitleDiversitySummary } from "@/lib/directorTaskNotice";
import { useLLMStore } from "@/store/llmStore";
import {
  patchNovelBasicForm,
  type NovelBasicFormState,
} from "../novelBasicInfo.shared";
import {
  buildDirectorAutoExecutionPlanFromDraft,
  buildDirectorAutoExecutionPlanLabel,
  createDefaultDirectorAutoExecutionDraftState,
  normalizeDirectorAutoExecutionDraftState,
} from "./directorAutoExecutionPlan.shared";
import {
  buildAutoDirectorRequestPayload,
  buildInitialIdea,
  DEFAULT_VISIBLE_RUN_MODE,
  RUN_MODE_OPTIONS,
} from "./NovelAutoDirectorDialog.shared";
import NovelAutoDirectorCandidateBatches from "./NovelAutoDirectorCandidateBatches";
import NovelAutoDirectorProgressPanel from "./NovelAutoDirectorProgressPanel";
import NovelAutoDirectorSetupPanel from "./NovelAutoDirectorSetupPanel";

interface NovelAutoDirectorDialogProps {
  basicForm: NovelBasicFormState;
  genreOptions: Array<{ id: string; path: string; label: string }>;
  workflowTaskId?: string;
  restoredTask?: UnifiedTaskDetail | null;
  initialOpen?: boolean;
  onWorkflowTaskChange?: (workflowTaskId: string) => void;
  onBasicFormChange?: (patch: Partial<NovelBasicFormState>) => void;
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

export default function NovelAutoDirectorDialog({
  basicForm,
  genreOptions,
  workflowTaskId: workflowTaskIdProp,
  restoredTask,
  initialOpen = false,
  onWorkflowTaskChange,
  onBasicFormChange,
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
  const [runMode, setRunMode] = useState<DirectorRunMode>(DEFAULT_VISIBLE_RUN_MODE);
  const [autoExecutionDraft, setAutoExecutionDraft] = useState(() => createDefaultDirectorAutoExecutionDraftState());
  const [candidatePatchFeedbacks, setCandidatePatchFeedbacks] = useState<Record<string, string>>({});
  const [titlePatchFeedbacks, setTitlePatchFeedbacks] = useState<Record<string, string>>({});
  const confirmSubmitLockedRef = useRef(false);

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
    const seedPayload = extractDirectorTaskSeedPayloadFromMeta(restoredTask.meta);
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
      setRunMode(seedPayload.runMode === "stage_review" ? DEFAULT_VISIBLE_RUN_MODE : seedPayload.runMode);
    }
    if (seedPayload?.autoExecutionPlan) {
      setAutoExecutionDraft(normalizeDirectorAutoExecutionDraftState(seedPayload.autoExecutionPlan));
    }
    if (initialOpen) {
      setOpen(true);
    }
  }, [initialOpen, restoredTask, workflowTaskId]);

  const directorBasicForm = useMemo(
    () => patchNovelBasicForm(basicForm, {
      writingMode: "original",
      projectMode: "ai_led",
    }),
    [basicForm],
  );

  useEffect(() => {
    if (!open || idea.trim()) {
      return;
    }
    setIdea(buildInitialIdea(directorBasicForm));
  }, [directorBasicForm, idea, open]);

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

  const latestBatch = batches.at(-1) ?? null;
  const directorTask = useMemo(() => {
    const loadedTask = directorTaskQuery.data?.data ?? null;
    if (loadedTask) {
      return loadedTask;
    }
    return restoredTask?.id === workflowTaskId ? restoredTask : null;
  }, [directorTaskQuery.data?.data, restoredTask, workflowTaskId]);

  useEffect(() => {
    const seededBatches = extractDirectorTaskSeedPayloadFromMeta(directorTask?.meta)?.batches;
    if (!Array.isArray(seededBatches) || seededBatches.length === 0) {
      return;
    }
    setBatches((prev) => mergeDirectorCandidateBatches(prev, seededBatches));
  }, [directorTask]);

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
    const hasChapterTitleWarning = isChapterTitleDiversitySummary(
      directorTask.failureSummary ?? directorTask.lastError ?? null,
    );
    if (directorTask.checkpointType === "candidate_selection_required" && !executionRequested) {
      setDialogMode("candidate_selection");
      setExecutionError("");
      return;
    }
    if (directorTask.status === "failed" || directorTask.status === "cancelled") {
      if (hasChapterTitleWarning) {
        setDialogMode("execution_progress");
        setExecutionError("");
        return;
      }
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

    const autoExecutionPlan = runMode === "auto_to_execution"
      ? buildDirectorAutoExecutionPlanFromDraft(autoExecutionDraft)
      : undefined;
    const response = await bootstrapNovelWorkflow({
      lane: "auto_director",
      title: directorBasicForm.title.trim() || undefined,
      seedPayload: {
        basicForm: directorBasicForm,
        idea,
        batches,
        runMode,
        autoExecutionPlan,
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
      const payload = buildAutoDirectorRequestPayload(directorBasicForm, idea, llm, runMode, currentWorkflowTaskId);
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
      setBatches((prev) => mergeDirectorCandidateBatches(prev, [batch]));
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
        ...buildAutoDirectorRequestPayload(directorBasicForm, idea, llm, runMode, currentWorkflowTaskId),
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
        ...buildAutoDirectorRequestPayload(directorBasicForm, idea, llm, runMode, currentWorkflowTaskId),
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
      const autoExecutionPlan: DirectorAutoExecutionPlan | undefined = runMode === "auto_to_execution"
        ? buildDirectorAutoExecutionPlanFromDraft(autoExecutionDraft)
        : undefined;
      const response = await confirmDirectorCandidate({
        ...buildAutoDirectorRequestPayload(directorBasicForm, idea, llm, runMode, currentWorkflowTaskId),
        batchId: latestBatch?.id,
        round: latestBatch?.round,
        candidate: payload.candidate,
        autoExecutionPlan,
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
        data.directorSession?.runMode === "auto_to_execution"
          ? `已创建《${data.novel.title}》，自动导演会继续自动执行${buildDirectorAutoExecutionPlanLabel(buildDirectorAutoExecutionPlanFromDraft(autoExecutionDraft))}。`
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
    onSettled: () => {
      confirmSubmitLockedRef.current = false;
    },
  });

  const togglePreset = (preset: DirectorCorrectionPreset) => {
    setSelectedPresets((prev) => (
      prev.includes(preset)
        ? prev.filter((item) => item !== preset)
        : [...prev, preset]
    ));
  };

  const applyCandidateTitleOption = (batchId: string, candidateId: string, option: { title: string }) => {
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
          const titleOptions = Array.isArray(candidate.titleOptions) ? candidate.titleOptions : [];
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
    setRunMode(DEFAULT_VISIBLE_RUN_MODE);
    setAutoExecutionDraft(createDefaultDirectorAutoExecutionDraftState());
    setCandidatePatchFeedbacks({});
    setTitlePatchFeedbacks({});
  };

  const canGenerate = idea.trim().length > 0 && !generateMutation.isPending;

  const handleConfirmCandidate = async (candidate: DirectorCandidate) => {
    if (confirmSubmitLockedRef.current || confirmMutation.isPending) {
      return;
    }
    confirmSubmitLockedRef.current = true;
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
      confirmSubmitLockedRef.current = false;
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
          className={`flex h-[min(92vh,980px)] w-[calc(100vw-1.5rem)] flex-col overflow-hidden p-0 ${
            dialogMode === "candidate_selection" ? "max-w-6xl" : "max-w-4xl"
          }`}
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
          <DialogHeader className="shrink-0 border-b px-6 pb-4 pr-12 pt-6">
            <DialogTitle>
              {dialogMode === "candidate_selection"
                ? "AI 自动导演创建"
                : dialogMode === "execution_failed"
                  ? "AI 自动导演执行失败"
                  : "AI 自动导演执行中"}
            </DialogTitle>
            <DialogDescription>
              {dialogMode === "candidate_selection"
                ? "先补导演起始设置，再让 AI 给你 2 套整本书方向。你可以继续重生新批次，也可以只修某一套方案或它的标题组。"
                : dialogMode === "execution_failed"
                  ? "导演长流程已中断，当前会优先显示失败摘要、最近里程碑和恢复入口。"
                  : "当前会实时显示导演主流程进度、当前动作和里程碑历史。"}
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6 pt-4">
            {dialogMode === "candidate_selection" ? (
              <div className="space-y-4">
                <NovelAutoDirectorSetupPanel
                  basicForm={directorBasicForm}
                  genreOptions={genreOptions}
                  idea={idea}
                  onIdeaChange={setIdea}
                  runMode={runMode}
                  runModeOptions={RUN_MODE_OPTIONS}
                  onRunModeChange={setRunMode}
                  autoExecutionDraft={autoExecutionDraft}
                  onAutoExecutionDraftChange={(patch) => setAutoExecutionDraft((prev) => ({ ...prev, ...patch }))}
                  onBasicFormChange={onBasicFormChange}
                  canGenerate={canGenerate}
                  isGenerating={generateMutation.isPending}
                  batchCount={batches.length}
                  onGenerate={() => generateMutation.mutate()}
                />

                <NovelAutoDirectorCandidateBatches
                  batches={batches}
                  selectedPresets={selectedPresets}
                  feedback={feedback}
                  onFeedbackChange={setFeedback}
                  onTogglePreset={togglePreset}
                  candidatePatchFeedbacks={candidatePatchFeedbacks}
                  onCandidatePatchFeedbackChange={(candidateId, value) => setCandidatePatchFeedbacks((prev) => ({
                    ...prev,
                    [candidateId]: value,
                  }))}
                  titlePatchFeedbacks={titlePatchFeedbacks}
                  onTitlePatchFeedbackChange={(candidateId, value) => setTitlePatchFeedbacks((prev) => ({
                    ...prev,
                    [candidateId]: value,
                  }))}
                  isGenerating={generateMutation.isPending}
                  isPatchingCandidate={patchCandidateMutation.isPending}
                  isRefiningTitle={refineTitleMutation.isPending}
                  isConfirming={confirmMutation.isPending}
                  onApplyCandidateTitleOption={applyCandidateTitleOption}
                  onPatchCandidate={(batchId, candidate, nextFeedback) => patchCandidateMutation.mutate({
                    batchId,
                    candidate,
                    feedback: nextFeedback,
                  })}
                  onRefineTitle={(batchId, candidate, nextFeedback) => refineTitleMutation.mutate({
                    batchId,
                    candidate,
                    feedback: nextFeedback,
                  })}
                  onConfirmCandidate={handleConfirmCandidate}
                  onGenerateNext={() => generateMutation.mutate()}
                />
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
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
