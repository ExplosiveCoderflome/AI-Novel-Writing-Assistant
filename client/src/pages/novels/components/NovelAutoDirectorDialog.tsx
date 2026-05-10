import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { buildStyleIntentSummary } from "@ai-novel/shared/types/styleEngine";
import type { UnifiedTaskDetail } from "@ai-novel/shared/types/task";
import {
  extractDirectorTaskSeedPayloadFromMeta,
  DIRECTOR_RUN_MODES,
  buildFullBookAutopilotExecutionPlan,
  mergeDirectorCandidateBatches,
  type DirectorCandidate,
  type DirectorCandidateBatch,
  type DirectorAutoExecutionPlan,
  type DirectorCorrectionPreset,
  type DirectorRunMode,
} from "@ai-novel/shared/types/novelDirector";
import { bootstrapNovelWorkflow, continueNovelWorkflow } from "@/api/novelWorkflow";
import {
  confirmDirectorCandidate,
} from "@/api/novelDirector";
import { queryKeys } from "@/api/queryKeys";
import { getStyleProfiles } from "@/api/styleEngine";
import { getTaskDetail } from "@/api/tasks";
import { Button } from "@/components/ui/button";
import {
  AppDialogContent,
  Dialog,
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
  createDefaultDirectorAutoExecutionDraftState,
  normalizeDirectorAutoExecutionDraftState,
} from "./directorAutoExecutionPlan.shared";
import {
  buildAutoDirectorRequestPayload,
  buildInitialIdea,
  DEFAULT_VISIBLE_RUN_MODE,
  RUN_MODE_OPTIONS,
} from "./NovelAutoDirectorDialog.shared";
import NovelAutoDirectorCandidateSelectionContent from "./NovelAutoDirectorCandidateSelectionContent";
import NovelAutoDirectorCandidateDialog from "./NovelAutoDirectorCandidateDialog";
import {
  NovelAutoDirectorDialogDescription,
  NovelAutoDirectorDialogTitle,
  type DirectorDialogMode,
} from "./NovelAutoDirectorDialogHeader";
import NovelAutoDirectorProgressPanel from "./NovelAutoDirectorProgressPanel";
import { useDirectorAutoApprovalDraft } from "./useDirectorAutoApprovalDraft";
import {
  ACTIVE_DIRECTOR_TASK_STATUSES,
  DIRECTOR_CANDIDATE_SETUP_STEP_KEYS,
} from "./NovelAutoDirectorDialog.constants";
import {
  applyDirectorCandidateTitleOption,
  toggleDirectorCorrectionPreset,
} from "./directorCandidateSelectionHandlers";
import { AUTO_DIRECTOR_MOBILE_CLASSES } from "@/mobile/autoDirector";
import { useNovelAutoDirectorCandidateMutations } from "./useNovelAutoDirectorCandidateMutations";

interface NovelAutoDirectorDialogProps {
  basicForm: NovelBasicFormState;
  genreOptions: Array<{ id: string; path: string; label: string }>;
  worldOptions: Array<{ id: string; name: string }>;
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

export default function NovelAutoDirectorDialog({
  basicForm,
  genreOptions,
  worldOptions,
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
  const [candidateDialogOpen, setCandidateDialogOpen] = useState(false);
  const [executionRequested, setExecutionRequested] = useState(false);
  const [pendingTitleHint, setPendingTitleHint] = useState("");
  const [executionError, setExecutionError] = useState("");
  const [runMode, setRunMode] = useState<DirectorRunMode>(DEFAULT_VISIBLE_RUN_MODE);
  const [autoExecutionDraft, setAutoExecutionDraft] = useState(() => createDefaultDirectorAutoExecutionDraftState());
  const [selectedStyleProfileId, setSelectedStyleProfileId] = useState("");
  const [candidatePatchFeedbacks, setCandidatePatchFeedbacks] = useState<Record<string, string>>({});
  const [titlePatchFeedbacks, setTitlePatchFeedbacks] = useState<Record<string, string>>({});
  const confirmSubmitLockedRef = useRef(false);
  const confirmedTaskHandledRef = useRef<string | null>(null);
  const autoApprovalDraft = useDirectorAutoApprovalDraft(open);
  const { applySnapshot: applyAutoApprovalSnapshot } = autoApprovalDraft;

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
    if (typeof seedPayload?.runMode === "string" && (DIRECTOR_RUN_MODES as readonly string[]).includes(seedPayload.runMode)) {
      setRunMode(seedPayload.runMode === "stage_review" ? DEFAULT_VISIBLE_RUN_MODE : seedPayload.runMode);
    }
    if (seedPayload?.autoExecutionPlan) {
      setAutoExecutionDraft(normalizeDirectorAutoExecutionDraftState(seedPayload.autoExecutionPlan));
    }
    if (seedPayload?.autoApproval) {
      applyAutoApprovalSnapshot(seedPayload.autoApproval);
    }
    if (typeof seedPayload?.styleProfileId === "string") {
      setSelectedStyleProfileId(seedPayload.styleProfileId);
    }
    if (initialOpen) {
      setOpen(true);
    }
  }, [applyAutoApprovalSnapshot, initialOpen, restoredTask, workflowTaskId]);

  const directorBasicForm = useMemo(
    () => patchNovelBasicForm(basicForm, {
      writingMode: "original",
      projectMode: "ai_led",
    }),
    [basicForm],
  );

  const buildAutoExecutionPlanForRunMode = (): DirectorAutoExecutionPlan | undefined => {
    if (runMode === "full_book_autopilot") {
      return buildFullBookAutopilotExecutionPlan();
    }
    if (runMode === "auto_to_execution") {
      return buildDirectorAutoExecutionPlanFromDraft(autoExecutionDraft, {
        usage: "new_book",
        maxChapterCount: directorBasicForm.estimatedChapterCount,
      });
    }
    return undefined;
  };

  useEffect(() => {
    if (!open || idea.trim()) {
      return;
    }
    setIdea(buildInitialIdea(directorBasicForm));
  }, [directorBasicForm, idea, open]);

  const styleProfilesQuery = useQuery({
    queryKey: queryKeys.styleEngine.profiles,
    queryFn: getStyleProfiles,
    enabled: open,
  });
  const styleProfiles = styleProfilesQuery.data?.data ?? [];
  const selectedStyleProfile = useMemo(
    () => styleProfiles.find((item) => item.id === selectedStyleProfileId) ?? null,
    [selectedStyleProfileId, styleProfiles],
  );
  const selectedStyleSummary = useMemo(
    () => buildStyleIntentSummary({
      styleProfile: selectedStyleProfile,
      styleTone: directorBasicForm.styleTone,
    }),
    [directorBasicForm.styleTone, selectedStyleProfile],
  );
  const directorTaskQuery = useQuery({
    queryKey: queryKeys.tasks.detail("novel_workflow", workflowTaskId || "none"),
    queryFn: () => getTaskDetail("novel_workflow", workflowTaskId),
    enabled: Boolean(workflowTaskId),
    retry: false,
    refetchInterval: (query) => {
      const task = query.state.data?.data;
      return open && task && ACTIVE_DIRECTOR_TASK_STATUSES.has(task.status) ? 2000 : false;
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
    && ACTIVE_DIRECTOR_TASK_STATUSES.has(directorTask.status)
    && DIRECTOR_CANDIDATE_SETUP_STEP_KEYS.has(directorTask.currentItemKey ?? ""),
  );
  const hasActiveDirectorTask = Boolean(directorTask && ACTIVE_DIRECTOR_TASK_STATUSES.has(directorTask.status));
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
    if (ACTIVE_DIRECTOR_TASK_STATUSES.has(directorTask.status)) {
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

    const autoExecutionPlan = buildAutoExecutionPlanForRunMode();
    const response = await bootstrapNovelWorkflow({
      lane: "auto_director",
      title: directorBasicForm.title.trim() || undefined,
      seedPayload: {
        basicForm: directorBasicForm,
        idea,
        batches,
        runMode,
        autoExecutionPlan,
        autoApproval: {
          ...autoApprovalDraft.buildPayload(runMode),
        },
        styleProfileId: selectedStyleProfileId || null,
        styleIntentSummary: selectedStyleSummary ?? null,
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

  const buildCandidateRequestPayload = (currentWorkflowTaskId: string) => buildAutoDirectorRequestPayload(
    directorBasicForm,
    idea,
    llm,
    runMode,
    currentWorkflowTaskId,
    { styleProfileId: selectedStyleProfileId },
  );

  const {
    generateMutation,
    patchCandidateMutation,
    refineTitleMutation,
  } = useNovelAutoDirectorCandidateMutations({
    batches,
    selectedPresets,
    feedback,
    workflowTaskId,
    ensureWorkflowTask,
    buildRequestPayload: buildCandidateRequestPayload,
    applyUpdatedBatch,
    onWorkflowTaskChange,
    setWorkflowTaskId,
    setBatches,
    setFeedback,
    setSelectedPresets,
    setCandidatePatchFeedbacks,
    setTitlePatchFeedbacks,
    setDialogMode,
    setCandidateDialogOpen,
    setExecutionRequested,
    setExecutionError,
  });

  const confirmMutation = useMutation({
    mutationFn: async (payload: { candidate: DirectorCandidate; workflowTaskId?: string }) => {
      const currentWorkflowTaskId = payload.workflowTaskId || await ensureWorkflowTask();
      const autoExecutionPlan = buildAutoExecutionPlanForRunMode();
      const response = await confirmDirectorCandidate({
        ...buildAutoDirectorRequestPayload(directorBasicForm, idea, llm, runMode, currentWorkflowTaskId, {
          styleProfileId: selectedStyleProfileId,
        }),
        batchId: latestBatch?.id,
        round: latestBatch?.round,
        candidate: payload.candidate,
        autoExecutionPlan,
        autoApproval: {
          ...autoApprovalDraft.buildPayload(runMode),
        },
      });
      return {
        command: response.data ?? null,
        workflowTaskId: response.data?.taskId ?? currentWorkflowTaskId,
      };
    },
    onSuccess: async ({ command, workflowTaskId: nextWorkflowTaskId }) => {
      if (!command) {
        setDialogMode("execution_failed");
        setExecutionError("确认方案失败，未返回导演命令。");
        toast.error("确认方案失败，未返回导演命令。");
        return;
      }
      if (nextWorkflowTaskId) {
        setWorkflowTaskId(nextWorkflowTaskId);
        onWorkflowTaskChange?.(nextWorkflowTaskId);
      }
      setDialogMode("execution_progress");
      setExecutionRequested(true);
      setExecutionError("");
      await queryClient.invalidateQueries({ queryKey: ["tasks"] });
      if (nextWorkflowTaskId) {
        await queryClient.invalidateQueries({
          queryKey: queryKeys.tasks.detail("novel_workflow", nextWorkflowTaskId),
        });
      }
      toast.success("系统收到书级方向，会创建小说项目并继续推进规划。");
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

  const continueMutation = useMutation({
    mutationFn: async () => {
      const taskId = directorTask?.id || workflowTaskId;
      if (!taskId) {
        throw new Error("当前没有可继续的自动导演任务。");
      }
      return continueNovelWorkflow(taskId, { continuationMode: "resume" });
    },
    onSuccess: async (response) => {
      const nextWorkflowTaskId = response.data?.taskId ?? directorTask?.id ?? workflowTaskId;
      if (nextWorkflowTaskId && nextWorkflowTaskId !== workflowTaskId) {
        setWorkflowTaskId(nextWorkflowTaskId);
        onWorkflowTaskChange?.(nextWorkflowTaskId);
      }
      const invalidations = [
        queryClient.invalidateQueries({ queryKey: ["tasks"] }),
      ];
      if (nextWorkflowTaskId) {
        invalidations.push(
          queryClient.invalidateQueries({
            queryKey: queryKeys.tasks.detail("novel_workflow", nextWorkflowTaskId),
          }),
          queryClient.invalidateQueries({
            queryKey: queryKeys.tasks.directorRuntime(nextWorkflowTaskId),
          }),
        );
      }
      await Promise.allSettled(invalidations);
      setDialogMode("execution_progress");
      setExecutionError("");
      toast.success("已确认，AI 会继续推进。");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "继续自动导演失败。");
    },
  });

  const togglePreset = (preset: DirectorCorrectionPreset) => {
    setSelectedPresets((prev) => toggleDirectorCorrectionPreset(prev, preset));
  };

  const applyCandidateTitleOption = (batchId: string, candidateId: string, option: { title: string }) => {
    setBatches((prev) => applyDirectorCandidateTitleOption(prev, batchId, candidateId, option));
  };

  const resetDialogState = () => {
    setOpen(false);
    setIdea("");
    setFeedback("");
    setSelectedPresets([]);
    setBatches([]);
    setWorkflowTaskId("");
    setDialogMode("candidate_selection");
    setCandidateDialogOpen(false);
    setExecutionRequested(false);
    setPendingTitleHint("");
    setExecutionError("");
    setRunMode(DEFAULT_VISIBLE_RUN_MODE);
    setAutoExecutionDraft(createDefaultDirectorAutoExecutionDraftState());
    autoApprovalDraft.reset();
    setSelectedStyleProfileId("");
    setCandidatePatchFeedbacks({});
    setTitlePatchFeedbacks({});
  };

  useEffect(() => {
    const resumeTarget = directorTask?.resumeTarget ?? null;
    const confirmedNovelId = resumeTarget?.novelId?.trim() || "";
    if (!executionRequested || !directorTask || !confirmedNovelId) {
      return;
    }
    if (workflowTaskId && directorTask.id !== workflowTaskId) {
      return;
    }
    if (confirmedTaskHandledRef.current === directorTask.id) {
      return;
    }
    confirmedTaskHandledRef.current = directorTask.id;
    setExecutionRequested(false);
    void Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.novels.all }),
      queryClient.invalidateQueries({ queryKey: ["tasks"] }),
    ]);
    toast.success("自动导演创建小说项目，并继续推进规划。");
    resetDialogState();
    onConfirmed({
      novelId: confirmedNovelId,
      workflowTaskId: directorTask.id,
      resumeTarget,
    });
  }, [directorTask, executionRequested, onConfirmed, queryClient, resetDialogState, workflowTaskId]);

  const canGenerate = idea.trim().length > 0 && !generateMutation.isPending;

  const handleConfirmCandidate = async (candidate: DirectorCandidate) => {
    if (confirmSubmitLockedRef.current || confirmMutation.isPending) {
      return;
    }
    confirmSubmitLockedRef.current = true;
    try {
      const currentWorkflowTaskId = await ensureWorkflowTask();
      setPendingTitleHint(candidate.workingTitle);
      setCandidateDialogOpen(false);
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
    toast.success("导演任务会继续在后台运行，可在 AI 驾驶舱查看进度。");
  };

  const handleOpenTaskCenter = () => {
    setOpen(false);
    navigate(workflowTaskId ? `/tasks?kind=novel_workflow&id=${workflowTaskId}` : "/tasks");
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
    if (!isBlockingExecutionView) setOpen(false);
  };

  const preventCloseWhileBlocking = (event: Event) => {
    if (isBlockingExecutionView) event.preventDefault();
  };

  return (
    <>
      <div className="flex items-center justify-end">
        <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
          {triggerLabel}
        </Button>
      </div>

      <Dialog open={open} onOpenChange={handleDialogOpenChange}>
        <AppDialogContent
          className={`${AUTO_DIRECTOR_MOBILE_CLASSES.dialogContent} ${dialogMode === "candidate_selection" ? "lg:max-w-6xl" : "lg:max-w-4xl"}`}
          title={NovelAutoDirectorDialogTitle({ mode: dialogMode })}
          description={NovelAutoDirectorDialogDescription({ mode: dialogMode })}
          bodyClassName={AUTO_DIRECTOR_MOBILE_CLASSES.dialogBody}
          onEscapeKeyDown={preventCloseWhileBlocking}
          onPointerDownOutside={preventCloseWhileBlocking}
          onInteractOutside={preventCloseWhileBlocking}
        >
            {dialogMode === "candidate_selection" ? (
              <NovelAutoDirectorCandidateSelectionContent
                basicForm={directorBasicForm}
                genreOptions={genreOptions}
                worldOptions={worldOptions}
                idea={idea}
                onIdeaChange={setIdea}
                runMode={runMode}
                runModeOptions={RUN_MODE_OPTIONS}
                onRunModeChange={setRunMode}
                autoExecutionDraft={autoExecutionDraft}
                maxChapterCount={directorBasicForm.estimatedChapterCount}
                onAutoExecutionDraftChange={(patch) => setAutoExecutionDraft((prev) => ({ ...prev, ...patch }))}
                autoApprovalEnabled={autoApprovalDraft.enabled}
                autoApprovalCodes={autoApprovalDraft.codes}
                autoApprovalGroups={autoApprovalDraft.groups}
                autoApprovalPoints={autoApprovalDraft.points}
                onAutoApprovalEnabledChange={autoApprovalDraft.setEnabled}
                onAutoApprovalCodesChange={autoApprovalDraft.setCodes}
                styleProfileOptions={styleProfiles.map((profile) => ({ id: profile.id, name: profile.name }))}
                selectedStyleProfileId={selectedStyleProfileId}
                selectedStyleSummary={selectedStyleSummary}
                onStyleProfileChange={setSelectedStyleProfileId}
                onBasicFormChange={onBasicFormChange}
                canGenerate={canGenerate}
                isGenerating={generateMutation.isPending}
                batchCount={batches.length}
                onGenerate={() => generateMutation.mutate()}
                onReviewCandidates={() => setCandidateDialogOpen(true)}
              />
            ) : (
              <NovelAutoDirectorProgressPanel
                mode={dialogMode}
                task={directorTask}
                taskId={workflowTaskId}
                titleHint={pendingTitleHint}
                fallbackError={executionError}
                onBackgroundContinue={handleBackgroundContinue}
                onConfirmAndContinue={() => continueMutation.mutate()}
                isConfirmingAndContinuing={continueMutation.isPending}
                onOpenTaskCenter={handleOpenTaskCenter}
              />
          )}
        </AppDialogContent>
      </Dialog>
      <NovelAutoDirectorCandidateDialog
        open={open && dialogMode === "candidate_selection" && candidateDialogOpen}
        onOpenChange={setCandidateDialogOpen}
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
    </>
  );
}
