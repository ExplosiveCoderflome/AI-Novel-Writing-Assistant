import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { buildStyleIntentSummary } from "@ai-novel/shared/types/styleEngine";
import type { UnifiedTaskDetail } from "@ai-novel/shared/types/task";
import type { DirectorIssuePolicy } from "@ai-novel/shared/types/directorIssue";
import {
  DIRECTOR_RUN_MODES,
  buildFullBookAutopilotExecutionPlan,
  extractDirectorTaskSeedPayloadFromMeta,
  mergeDirectorCandidateBatches,
  type DirectorCandidate,
  type DirectorCandidateBatch,
  type DirectorAutoExecutionPlan,
  type DirectorCorrectionPreset,
  type DirectorIdeaConstellationOption,
  type DirectorIdeaConstellationSelection,
  type DirectorIdeaInspiration,
  type DirectorRunMode,
  type DirectorWorldSetupMode,
} from "@ai-novel/shared/types/novelDirector";
import { bootstrapNovelWorkflow, continueNovelWorkflow } from "@/api/novelWorkflow";
import {
  composeDirectorIdeaConstellation,
  confirmDirectorCandidate,
  generateDirectorIdeaInspirations,
  generateDirectorIdeaConstellationOptions,
} from "@/api/novelDirector";
import { queryKeys } from "@/api/queryKeys";
import { getStyleProfiles } from "@/api/styleEngine";
import { getAutoDirectorIssuePolicy } from "@/api/settings";
import { getTaskDetail } from "@/api/tasks";
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
} from "../components/directorAutoExecutionPlan.shared";
import {
  buildAutoDirectorRequestPayload,
  buildInitialIdea,
  DEFAULT_VISIBLE_RUN_MODE,
  RUN_MODE_OPTIONS,
} from "../components/NovelAutoDirectorDialog.shared";
import { useDirectorAutoApprovalDraft } from "../components/useDirectorAutoApprovalDraft";
import {
  ACTIVE_DIRECTOR_TASK_STATUSES,
  DIRECTOR_CANDIDATE_SETUP_STEP_KEYS,
} from "../components/NovelAutoDirectorDialog.constants";
import type { DirectorExecutionViewMode } from "../components/NovelAutoDirector.types";
import {
  applyDirectorCandidateTitleOption,
  toggleDirectorCorrectionPreset,
} from "../components/directorCandidateSelectionHandlers";
import { useNovelAutoDirectorCandidateMutations } from "../components/useNovelAutoDirectorCandidateMutations";
import { hasCreationFoundationChanged } from "./creationFoundationPickerState";
import type { AutoDirectorCreateDraft } from "./draft/autoDirectorCreateDraft";

interface UseAutoDirectorCreateControllerInput {
  marketBriefId?: string;
  initialStyleProfileId?: string;
  basicForm: NovelBasicFormState;
  genreOptions: Array<{
    id: string;
    path: string;
    label: string;
    description?: string | null;
  }>;
  storyModeOptions: Array<{
    id: string;
    path: string;
    label: string;
    description?: string | null;
  }>;
  worldOptions: Array<{ id: string; name: string }>;
  initialDraft?: AutoDirectorCreateDraft | null;
  workflowTaskId?: string;
  restoredTask?: UnifiedTaskDetail | null;
  onWorkflowTaskChange?: (workflowTaskId: string) => void;
  onBasicFormChange: (patch: Partial<NovelBasicFormState>) => void;
}

function resolveIdeaFromCandidateBatches(batches: DirectorCandidateBatch[] | null | undefined): string {
  if (!Array.isArray(batches)) {
    return "";
  }
  for (let index = batches.length - 1; index >= 0; index -= 1) {
    const batchIdea = batches[index]?.idea?.trim();
    if (batchIdea) {
      return batchIdea;
    }
  }
  return "";
}

export function useAutoDirectorCreateController(input: UseAutoDirectorCreateControllerInput) {
  const {
    basicForm,
    genreOptions,
    storyModeOptions,
    worldOptions,
    initialDraft,
    workflowTaskId: workflowTaskIdProp,
    restoredTask,
    onWorkflowTaskChange,
    onBasicFormChange,
    marketBriefId,
    initialStyleProfileId,
  } = input;
  const llm = useLLMStore();
  const queryClient = useQueryClient();
  const [idea, setIdea] = useState(initialDraft?.idea ?? "");
  const [feedback, setFeedback] = useState("");
  const [selectedPresets, setSelectedPresets] = useState<DirectorCorrectionPreset[]>([]);
  const [batches, setBatches] = useState<DirectorCandidateBatch[]>([]);
  const [workflowTaskId, setWorkflowTaskId] = useState(workflowTaskIdProp ?? "");
  const [dialogMode, setDialogMode] = useState<DirectorExecutionViewMode>("candidate_selection");
  const [candidateDialogOpen, setCandidateDialogOpen] = useState(false);
  const [executionRequested, setExecutionRequested] = useState(false);
  const [pendingTitleHint, setPendingTitleHint] = useState("");
  const [executionError, setExecutionError] = useState("");
  const [runMode, setRunMode] = useState<DirectorRunMode>(initialDraft?.runMode ?? DEFAULT_VISIBLE_RUN_MODE);
  const [worldSetupMode, setWorldSetupMode] = useState<DirectorWorldSetupMode>("auto_generate");
  const [autoExecutionDraft, setAutoExecutionDraft] = useState(() => createDefaultDirectorAutoExecutionDraftState());
  const [selectedStyleProfileId, setSelectedStyleProfileId] = useState(
    initialStyleProfileId || initialDraft?.selectedStyleProfileId || "",
  );
  const [ideaInspirations, setIdeaInspirations] = useState<DirectorIdeaInspiration[]>([]);
  const [ideaConstellationOptions, setIdeaConstellationOptions] = useState<DirectorIdeaConstellationOption[]>([]);
  const [candidatePatchFeedbacks, setCandidatePatchFeedbacks] = useState<Record<string, string>>({});
  const [titlePatchFeedbacks, setTitlePatchFeedbacks] = useState<Record<string, string>>({});
  const [isUpdatingFoundation, setIsUpdatingFoundation] = useState(false);
  const issuePolicyQuery = useQuery({
    queryKey: ["settings", "auto-director-issue-policy"],
    queryFn: getAutoDirectorIssuePolicy,
    retry: false,
  });
  const [issuePolicy, setIssuePolicy] = useState<DirectorIssuePolicy | null>(null);
  const confirmSubmitLockedRef = useRef(false);
  const autoApprovalDraft = useDirectorAutoApprovalDraft(true);
  const { applySnapshot: applyAutoApprovalSnapshot } = autoApprovalDraft;

  useEffect(() => {
    if (issuePolicyQuery.data?.data) setIssuePolicy(issuePolicyQuery.data.data);
  }, [issuePolicyQuery.data?.data]);

  useEffect(() => {
    if (!workflowTaskIdProp || workflowTaskIdProp === workflowTaskId) {
      return;
    }
    setWorkflowTaskId(workflowTaskIdProp);
  }, [workflowTaskId, workflowTaskIdProp]);

  useEffect(() => {
    if (initialStyleProfileId) {
      setSelectedStyleProfileId((current) => current || initialStyleProfileId);
    }
  }, [initialStyleProfileId]);

  useEffect(() => {
    if (!restoredTask) {
      return;
    }
    const seedPayload = extractDirectorTaskSeedPayloadFromMeta(restoredTask.meta);
    if (restoredTask.id && restoredTask.id !== workflowTaskId) {
      setWorkflowTaskId(restoredTask.id);
    }
    const restoredIdea = seedPayload?.idea?.trim() || resolveIdeaFromCandidateBatches(seedPayload?.batches);
    if (restoredIdea) {
      setIdea(restoredIdea);
    }
    if (Array.isArray(seedPayload?.batches) && seedPayload.batches.length > 0) {
      setBatches(seedPayload.batches);
    }
    if (typeof seedPayload?.runMode === "string" && (DIRECTOR_RUN_MODES as readonly string[]).includes(seedPayload.runMode)) {
      setRunMode(seedPayload.runMode);
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
    setWorldSetupMode("auto_generate");
  }, [applyAutoApprovalSnapshot, restoredTask, workflowTaskId]);

  const directorBasicForm = useMemo(
    () => patchNovelBasicForm(basicForm, {
      projectMode: "ai_led",
    }),
    [basicForm],
  );

  useEffect(() => {
    if (idea.trim()) {
      return;
    }
    setIdea(buildInitialIdea(directorBasicForm));
  }, [directorBasicForm, idea]);

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

  const styleProfilesQuery = useQuery({
    queryKey: queryKeys.styleEngine.profiles,
    queryFn: getStyleProfiles,
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

  const buildIdeaContextPayload = () => {
    const genre = genreOptions.find((item) => item.id === directorBasicForm.genreId);
    const primaryStoryMode = storyModeOptions.find(
      (item) => item.id === directorBasicForm.primaryStoryModeId,
    );
    const secondaryStoryMode = storyModeOptions.find(
      (item) => item.id === directorBasicForm.secondaryStoryModeId,
    );
    const world = worldOptions.find((item) => item.id === directorBasicForm.worldId);
    return {
      ...buildAutoDirectorRequestPayload(directorBasicForm, idea || directorBasicForm.description, llm, runMode, undefined, {
        styleProfileId: selectedStyleProfileId,
        worldSetupMode,
        marketBriefId,
      }),
      currentIdea: idea.trim() || undefined,
      genreLabel: genre?.path || genre?.label,
      genreDescription: genre?.description || undefined,
      primaryStoryModeLabel: primaryStoryMode?.path || primaryStoryMode?.label,
      primaryStoryModeDescription: primaryStoryMode?.description || undefined,
      secondaryStoryModeLabel: secondaryStoryMode?.path || secondaryStoryMode?.label,
      secondaryStoryModeDescription: secondaryStoryMode?.description || undefined,
      worldName: world?.name,
    };
  };

  const ideaInspirationMutation = useMutation({
    mutationFn: () => generateDirectorIdeaInspirations(buildIdeaContextPayload()),
    onSuccess: (response) => {
      setIdeaInspirations(response.data?.ideas ?? []);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "生成起始想法失败，请稍后重试。");
    },
  });

  const ideaConstellationOptionsMutation = useMutation({
    mutationFn: () => generateDirectorIdeaConstellationOptions(buildIdeaContextPayload()),
    onSuccess: (response) => {
      setIdeaConstellationOptions(response.data?.options ?? []);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "生成开书素材失败，请稍后重试。");
    },
  });

  const ideaConstellationComposeMutation = useMutation({
    mutationFn: (selectedOptions: DirectorIdeaConstellationSelection[]) => composeDirectorIdeaConstellation({
      ...buildIdeaContextPayload(),
      selectedOptions,
    }),
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "整理故事想法失败，请稍后重试。");
    },
  });

  const directorTaskQuery = useQuery({
    queryKey: queryKeys.tasks.detail("novel_workflow", workflowTaskId || "none"),
    queryFn: () => getTaskDetail("novel_workflow", workflowTaskId),
    enabled: Boolean(workflowTaskId),
    retry: false,
    refetchInterval: (query) => {
      const task = query.state.data?.data;
      return task && ACTIVE_DIRECTOR_TASK_STATUSES.has(task.status) ? 2000 : false;
    },
  });

  const latestBatch = batches.at(-1) ?? null;
  const requestIdea = idea.trim() || resolveIdeaFromCandidateBatches(batches);
  const directorTask = useMemo(() => {
    const loadedTask = directorTaskQuery.data?.data ?? null;
    if (loadedTask) {
      return loadedTask;
    }
    return restoredTask?.id === workflowTaskId ? restoredTask : null;
  }, [directorTaskQuery.data?.data, restoredTask, workflowTaskId]);

  useEffect(() => {
    const seedPayload = extractDirectorTaskSeedPayloadFromMeta(directorTask?.meta);
    const seededBatches = seedPayload?.batches;
    const seededIdea = seedPayload?.idea?.trim() || resolveIdeaFromCandidateBatches(seededBatches);
    if (!idea.trim() && seededIdea) {
      setIdea(seededIdea);
    }
    if (!Array.isArray(seededBatches) || seededBatches.length === 0) {
      return;
    }
    setBatches((prev) => mergeDirectorCandidateBatches(prev, seededBatches));
  }, [directorTask, idea]);

  const candidateSetupInProgress = Boolean(
    directorTask
    && ACTIVE_DIRECTOR_TASK_STATUSES.has(directorTask.status)
    && DIRECTOR_CANDIDATE_SETUP_STEP_KEYS.has(directorTask.currentItemKey ?? ""),
  );
  const hasActiveDirectorTask = Boolean(directorTask && ACTIVE_DIRECTOR_TASK_STATUSES.has(directorTask.status));

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
    const nextIdea = requestIdea;
    if (!nextIdea) {
      throw new Error("请先补充起始想法，再继续生成或确认书级方向。");
    }
    if (workflowTaskId) {
      return workflowTaskId;
    }

    const autoExecutionPlan = buildAutoExecutionPlanForRunMode();
    const response = await bootstrapNovelWorkflow({
      lane: "auto_director",
      title: directorBasicForm.title.trim() || undefined,
      seedPayload: {
        basicForm: directorBasicForm,
        idea: nextIdea,
        batches,
        runMode,
        worldSetupMode: directorBasicForm.worldId ? undefined : worldSetupMode,
        autoExecutionPlan,
        autoApproval: {
          ...autoApprovalDraft.buildPayload(runMode),
        },
        styleProfileId: selectedStyleProfileId || null,
        styleIntentSummary: selectedStyleSummary ?? null,
        marketBriefId: marketBriefId || null,
        issueGovernanceVersion: issuePolicy ? 1 : undefined,
        issuePolicy: issuePolicy ?? undefined,
        issuePolicySource: "global",
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

  const buildCandidateRequestPayload = (currentWorkflowTaskId: string) => {
    if (!requestIdea) {
      throw new Error("请先补充起始想法，再继续生成或确认书级方向。");
    }
    return buildAutoDirectorRequestPayload(
      directorBasicForm,
      requestIdea,
      llm,
      runMode,
      currentWorkflowTaskId,
      { styleProfileId: selectedStyleProfileId, worldSetupMode, marketBriefId },
    );
  };

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
      if (!requestIdea) {
        throw new Error("请先补充起始想法，再继续生成或确认书级方向。");
      }
      const autoExecutionPlan = buildAutoExecutionPlanForRunMode();
      const response = await confirmDirectorCandidate({
        ...buildAutoDirectorRequestPayload(directorBasicForm, requestIdea, llm, runMode, currentWorkflowTaskId, {
          styleProfileId: selectedStyleProfileId,
          worldSetupMode,
          marketBriefId,
        }),
        batchId: latestBatch?.id,
        round: latestBatch?.round,
        candidate: payload.candidate,
        autoExecutionPlan,
        autoApproval: {
          ...autoApprovalDraft.buildPayload(runMode),
        },
        issueGovernanceVersion: issuePolicy ? 1 : undefined,
        issuePolicy: issuePolicy ?? undefined,
        issuePolicySource: "novel",
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
            queryKey: queryKeys.tasks.directorTaskSnapshot(nextWorkflowTaskId),
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

  const canGenerate = idea.trim().length > 0 && !generateMutation.isPending;

  const updateProductionFoundation = async (patch: Partial<{
    genreId: string;
    primaryStoryModeId: string;
  }>): Promise<boolean> => {
    if (!hasCreationFoundationChanged(directorBasicForm, patch)) {
      return true;
    }

    const shouldInvalidateCandidates = batches.length > 0;
    if (
      shouldInvalidateCandidates
      && !window.confirm("修改故事类型或推进方式后，旧方向需要重新适配并重新生成。确认修改吗？")
    ) {
      return false;
    }

    const nextPatch: Partial<NovelBasicFormState> = {
      ...patch,
      secondaryStoryModeId: "",
    };
    const nextForm = patchNovelBasicForm(directorBasicForm, nextPatch);

    setIsUpdatingFoundation(true);
    try {
      if (shouldInvalidateCandidates && workflowTaskId) {
        await bootstrapNovelWorkflow({
          workflowTaskId,
          lane: "auto_director",
          title: nextForm.title.trim() || undefined,
          seedPayload: {
            basicForm: nextForm,
            genreId: nextForm.genreId || null,
            primaryStoryModeId: nextForm.primaryStoryModeId || null,
            secondaryStoryModeId: null,
            productionFoundation: null,
            batches: [],
            candidateStage: null,
          },
        });
        await queryClient.invalidateQueries({
          queryKey: queryKeys.tasks.detail("novel_workflow", workflowTaskId),
        });
      }

      onBasicFormChange(nextPatch);
      if (shouldInvalidateCandidates) {
        setBatches([]);
        setFeedback("");
        setSelectedPresets([]);
        setCandidatePatchFeedbacks({});
        setTitlePatchFeedbacks({});
        setCandidateDialogOpen(false);
        setDialogMode("candidate_selection");
        setExecutionRequested(false);
        setExecutionError("");
        toast.success("创作偏好已更新，请按新选择重新生成方向。");
      }
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "更新创作偏好失败，请稍后重试。");
      return false;
    } finally {
      setIsUpdatingFoundation(false);
    }
  };

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

  return {
    directorBasicForm,
    idea,
    setIdea,
    ideaInspirations,
    isGeneratingIdeaInspirations: ideaInspirationMutation.isPending,
    generateIdeaInspirations: () => ideaInspirationMutation.mutate(),
    ideaConstellationOptions,
    isGeneratingIdeaConstellationOptions: ideaConstellationOptionsMutation.isPending,
    generateIdeaConstellationOptions: () => ideaConstellationOptionsMutation.mutate(),
    isComposingIdeaConstellation: ideaConstellationComposeMutation.isPending,
    composeIdeaConstellation: async (selectedOptions: DirectorIdeaConstellationSelection[]) => {
      const response = await ideaConstellationComposeMutation.mutateAsync(selectedOptions);
      return response.data?.idea ?? "";
    },
    runMode,
    runModeOptions: RUN_MODE_OPTIONS,
    setRunMode,
    worldSetupMode,
    setWorldSetupMode,
    autoExecutionDraft,
    setAutoExecutionDraft,
    autoApprovalDraft,
    styleProfiles,
    selectedStyleProfileId,
    setSelectedStyleProfileId,
    selectedStyleSummary,
    workflowTaskId,
    directorTask,
    hasActiveDirectorTask,
    candidateSetupInProgress,
    dialogMode,
    pendingTitleHint,
    executionError,
    batches,
    feedback,
    setFeedback,
    selectedPresets,
    togglePreset,
    candidatePatchFeedbacks,
    setCandidatePatchFeedbacks,
    titlePatchFeedbacks,
    setTitlePatchFeedbacks,
    isUpdatingFoundation,
    issuePolicy,
    issuePolicyLoading: issuePolicyQuery.isLoading,
    setIssuePolicy,
    updateProductionFoundation,
    canGenerate,
    generateMutation,
    patchCandidateMutation,
    refineTitleMutation,
    confirmMutation,
    continueMutation,
    onBasicFormChange,
    applyCandidateTitleOption,
    handleConfirmCandidate,
  };
}
