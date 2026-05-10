import type { Dispatch, SetStateAction } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  type DirectorCandidate,
  type DirectorCandidateBatch,
  type DirectorCorrectionPreset,
  mergeDirectorCandidateBatches,
} from "@ai-novel/shared/types/novelDirector";
import {
  generateDirectorCandidates,
  getDirectorCommandResult,
  patchDirectorCandidate,
  refineDirectorCandidateTitles,
  refineDirectorCandidates,
} from "@/api/novelDirector";
import { toast } from "@/components/ui/toast";
import type { buildAutoDirectorRequestPayload } from "./NovelAutoDirectorDialog.shared";
import type { DirectorDialogMode } from "./NovelAutoDirectorDialogHeader";

type DirectorRequestPayload = ReturnType<typeof buildAutoDirectorRequestPayload>;

interface UseNovelAutoDirectorCandidateMutationsInput {
  batches: DirectorCandidateBatch[];
  selectedPresets: DirectorCorrectionPreset[];
  feedback: string;
  workflowTaskId: string;
  ensureWorkflowTask: () => Promise<string>;
  buildRequestPayload: (workflowTaskId: string) => DirectorRequestPayload;
  applyUpdatedBatch: (batch: DirectorCandidateBatch, nextWorkflowTaskId?: string) => void;
  onWorkflowTaskChange?: (workflowTaskId: string) => void;
  setWorkflowTaskId: Dispatch<SetStateAction<string>>;
  setBatches: Dispatch<SetStateAction<DirectorCandidateBatch[]>>;
  setFeedback: Dispatch<SetStateAction<string>>;
  setSelectedPresets: Dispatch<SetStateAction<DirectorCorrectionPreset[]>>;
  setCandidatePatchFeedbacks: Dispatch<SetStateAction<Record<string, string>>>;
  setTitlePatchFeedbacks: Dispatch<SetStateAction<Record<string, string>>>;
  setDialogMode: Dispatch<SetStateAction<DirectorDialogMode>>;
  setCandidateDialogOpen: Dispatch<SetStateAction<boolean>>;
  setExecutionRequested: Dispatch<SetStateAction<boolean>>;
  setExecutionError: Dispatch<SetStateAction<string>>;
}

async function waitForCandidateCommandResult<T extends { batch: DirectorCandidateBatch; workflowTaskId?: string }>(
  commandId: string,
): Promise<T> {
  for (let attempt = 0; attempt < 90; attempt += 1) {
    const response = await getDirectorCommandResult<T>(commandId);
    const result = response.data?.result;
    if (result?.batch) {
      return result;
    }
    const status = response.data?.status;
    if (status === "failed" || status === "cancelled" || status === "stale") {
      throw new Error(response.data?.errorMessage || "Director candidate command failed.");
    }
    await new Promise((resolve) => window.setTimeout(resolve, 2000));
  }
  throw new Error("Director candidate command timed out. Check Task Center for progress.");
}

export function useNovelAutoDirectorCandidateMutations({
  batches,
  selectedPresets,
  feedback,
  workflowTaskId,
  ensureWorkflowTask,
  buildRequestPayload,
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
}: UseNovelAutoDirectorCandidateMutationsInput) {
  const onCandidateCommandStart = () => {
    setCandidateDialogOpen(false);
    setDialogMode("execution_progress");
    setExecutionError("");
  };

  const generateMutation = useMutation({
    onMutate: onCandidateCommandStart,
    mutationFn: async () => {
      const currentWorkflowTaskId = await ensureWorkflowTask();
      const payload = buildRequestPayload(currentWorkflowTaskId);
      const response = batches.length === 0
        ? await generateDirectorCandidates(payload)
        : await refineDirectorCandidates({
          ...payload,
          previousBatches: batches,
          presets: selectedPresets,
          feedback: feedback.trim() || undefined,
        });
      const command = response.data;
      if (!command?.commandId) {
        throw new Error("Director candidate command was not accepted.");
      }
      if (command.taskId && command.taskId !== currentWorkflowTaskId) {
        setWorkflowTaskId(command.taskId);
        onWorkflowTaskChange?.(command.taskId);
      }
      const result = await waitForCandidateCommandResult<{ batch: DirectorCandidateBatch; workflowTaskId?: string }>(
        command.commandId,
      );
      return {
        batch: result.batch ?? null,
        workflowTaskId: result.workflowTaskId ?? command.taskId ?? currentWorkflowTaskId,
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
      setCandidateDialogOpen(true);
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
    onMutate: onCandidateCommandStart,
    mutationFn: async (payload: { batchId: string; candidate: DirectorCandidate; feedback: string }) => {
      const currentWorkflowTaskId = await ensureWorkflowTask();
      const response = await patchDirectorCandidate({
        ...buildRequestPayload(currentWorkflowTaskId),
        previousBatches: batches,
        batchId: payload.batchId,
        candidateId: payload.candidate.id,
        feedback: payload.feedback.trim(),
      });
      const command = response.data;
      if (!command?.commandId) {
        throw new Error("Director candidate patch command was not accepted.");
      }
      const result = await waitForCandidateCommandResult<{ batch: DirectorCandidateBatch; candidate: DirectorCandidate; workflowTaskId?: string }>(
        command.commandId,
      );
      return {
        batch: result.batch ?? null,
        workflowTaskId: result.workflowTaskId ?? command.taskId ?? currentWorkflowTaskId,
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
      setCandidateDialogOpen(true);
      toast.success("已按你的意见修正这套方案。");
    },
    onError: (error) => {
      setDialogMode("execution_failed");
      setExecutionError(error instanceof Error ? error.message : "定向修正方案失败。");
    },
  });

  const refineTitleMutation = useMutation({
    onMutate: onCandidateCommandStart,
    mutationFn: async (payload: { batchId: string; candidate: DirectorCandidate; feedback: string }) => {
      const currentWorkflowTaskId = await ensureWorkflowTask();
      const response = await refineDirectorCandidateTitles({
        ...buildRequestPayload(currentWorkflowTaskId),
        previousBatches: batches,
        batchId: payload.batchId,
        candidateId: payload.candidate.id,
        feedback: payload.feedback.trim(),
      });
      const command = response.data;
      if (!command?.commandId) {
        throw new Error("Director title refinement command was not accepted.");
      }
      const result = await waitForCandidateCommandResult<{ batch: DirectorCandidateBatch; candidate: DirectorCandidate; workflowTaskId?: string }>(
        command.commandId,
      );
      return {
        batch: result.batch ?? null,
        workflowTaskId: result.workflowTaskId ?? command.taskId ?? currentWorkflowTaskId,
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
      setCandidateDialogOpen(true);
      toast.success("已重做这套方案的标题组。");
    },
    onError: (error) => {
      setDialogMode("execution_failed");
      setExecutionError(error instanceof Error ? error.message : "标题组修正失败。");
    },
  });

  return {
    generateMutation,
    patchCandidateMutation,
    refineTitleMutation,
  };
}
