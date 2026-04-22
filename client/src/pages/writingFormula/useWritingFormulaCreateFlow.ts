import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { StyleProfile } from "@ai-novel/shared/types/styleEngine";
import type { UnifiedTaskDetail } from "@ai-novel/shared/types/task";
import { getTaskDetail } from "@/api/tasks";
import {
  createManualStyleProfile,
  createStyleExtractionTaskFromText,
  createStyleProfileFromBrief,
  createStyleProfileFromTemplate,
} from "@/api/styleEngine";
import { queryKeys } from "@/api/queryKeys";

export interface WritingFormulaCreateFormState {
  manualName: string;
  briefName: string;
  briefCategory: string;
  briefPrompt: string;
  extractName: string;
  extractCategory: string;
  extractSourceText: string;
}

export const INITIAL_WRITING_FORMULA_CREATE_FORM: WritingFormulaCreateFormState = {
  manualName: "",
  briefName: "",
  briefCategory: "",
  briefPrompt: "",
  extractName: "",
  extractCategory: "",
  extractSourceText: "",
};

interface UseWritingFormulaCreateFlowOptions {
  llm: {
    provider?: string;
    model?: string;
    temperature?: number;
  };
  refreshStyleData: () => Promise<void>;
  onImmediateProfileCreated: (profile: StyleProfile, successMessage: string) => void;
  onAutoSavedProfileReady: (profileId: string, successMessage: string) => void;
  onExtractionTaskQueued: (task: UnifiedTaskDetail) => void;
  onFlowMessage: (message: string) => void;
}

function isActiveTask(task: UnifiedTaskDetail | null | undefined): boolean {
  return task?.status === "queued" || task?.status === "running";
}

function readCreatedProfileId(task: UnifiedTaskDetail | null | undefined): string {
  const value = task?.meta?.createdStyleProfileId;
  return typeof value === "string" ? value : "";
}

function readCreatedProfileName(task: UnifiedTaskDetail | null | undefined): string {
  const metaName = task?.meta?.createdStyleProfileName;
  if (typeof metaName === "string" && metaName.trim()) {
    return metaName.trim();
  }
  return task?.currentItemLabel?.trim() ?? "";
}

export function useWritingFormulaCreateFlow({
  llm,
  refreshStyleData,
  onImmediateProfileCreated,
  onAutoSavedProfileReady,
  onExtractionTaskQueued,
  onFlowMessage,
}: UseWritingFormulaCreateFlowOptions) {
  const [form, setForm] = useState<WritingFormulaCreateFormState>(INITIAL_WRITING_FORMULA_CREATE_FORM);
  const [selectedPresetKey, setSelectedPresetKey] = useState<"imitate" | "balanced" | "transfer">("balanced");
  const [pendingExtractionTaskId, setPendingExtractionTaskId] = useState("");
  const handledTerminalTaskIdRef = useRef("");

  const resetCreateFlow = () => {
    setForm(INITIAL_WRITING_FORMULA_CREATE_FORM);
    setSelectedPresetKey("balanced");
  };

  const handleFormChange = (patch: Partial<WritingFormulaCreateFormState>) => {
    setForm((prev) => ({ ...prev, ...patch }));
  };

  const extractionTaskQuery = useQuery({
    queryKey: queryKeys.tasks.detail("style_extraction", pendingExtractionTaskId || "none"),
    queryFn: () => getTaskDetail("style_extraction", pendingExtractionTaskId),
    enabled: Boolean(pendingExtractionTaskId),
    refetchInterval: (query) => {
      const task = query.state.data?.data ?? null;
      return isActiveTask(task) ? 3000 : false;
    },
    retry: false,
  });

  const activeExtractionTask = extractionTaskQuery.data?.data ?? null;

  useEffect(() => {
    if (!pendingExtractionTaskId) {
      handledTerminalTaskIdRef.current = "";
      return;
    }

    if (extractionTaskQuery.status !== "success") {
      return;
    }

    const task = extractionTaskQuery.data?.data ?? null;
    if (!task) {
      if (handledTerminalTaskIdRef.current === pendingExtractionTaskId) {
        return;
      }
      handledTerminalTaskIdRef.current = pendingExtractionTaskId;
      setPendingExtractionTaskId("");
      onFlowMessage("写法提取任务不存在或已被清理，请重新提交。");
      return;
    }

    if (task.status === "queued" || task.status === "running") {
      return;
    }

    if (handledTerminalTaskIdRef.current === task.id) {
      return;
    }
    handledTerminalTaskIdRef.current = task.id;
    setPendingExtractionTaskId("");

    if (task.status === "succeeded") {
      const profileId = readCreatedProfileId(task);
      const profileName = readCreatedProfileName(task) || form.extractName.trim() || "新写法";
      if (!profileId) {
        onFlowMessage("写法提取任务已完成，但没有拿到自动保存结果。");
        return;
      }
      resetCreateFlow();
      void refreshStyleData().then(() => {
        onAutoSavedProfileReady(profileId, `写法“${profileName}”已自动保存，已经为你打开当前写法编辑。`);
      });
      return;
    }

    const failureMessage = task.failureSummary
      ?? task.lastError
      ?? (task.status === "cancelled"
        ? "写法提取任务已取消。"
        : "写法提取任务失败，请稍后重试。");
    onFlowMessage(failureMessage);
  }, [
    extractionTaskQuery.data,
    extractionTaskQuery.status,
    form.extractName,
    onAutoSavedProfileReady,
    onFlowMessage,
    pendingExtractionTaskId,
    refreshStyleData,
  ]);

  const createManualMutation = useMutation({
    mutationFn: () => createManualStyleProfile({ name: form.manualName }),
    onSuccess: async (response) => {
      const profile = response.data;
      if (!profile) {
        return;
      }
      resetCreateFlow();
      await refreshStyleData();
      onImmediateProfileCreated(profile, `写法“${profile.name}”已经创建，可以继续补规则、试写或绑定到目标。`);
    },
  });

  const createFromBriefMutation = useMutation({
    mutationFn: () => createStyleProfileFromBrief({
      brief: form.briefPrompt,
      name: form.briefName || undefined,
      category: form.briefCategory || undefined,
      provider: llm.provider,
      model: llm.model,
      temperature: llm.temperature,
    }),
    onSuccess: async (response) => {
      const profile = response.data;
      if (!profile) {
        return;
      }
      resetCreateFlow();
      await refreshStyleData();
      onImmediateProfileCreated(profile, `写法“${profile.name}”已经生成，可以继续补规则、试写或绑定到目标。`);
    },
  });

  const createFromTemplateMutation = useMutation({
    mutationFn: (templateId: string) => createStyleProfileFromTemplate({ templateId }),
    onSuccess: async (response) => {
      const profile = response.data;
      if (!profile) {
        return;
      }
      resetCreateFlow();
      await refreshStyleData();
      onImmediateProfileCreated(profile, `模板写法“${profile.name}”已经创建，可以继续补规则、试写或绑定到目标。`);
    },
  });

  const createExtractionTaskMutation = useMutation({
    mutationFn: () => createStyleExtractionTaskFromText({
      name: form.extractName,
      category: form.extractCategory || undefined,
      sourceText: form.extractSourceText,
      provider: llm.provider,
      model: llm.model,
      temperature: llm.temperature,
      presetKey: selectedPresetKey,
    }),
    onSuccess: (response) => {
      const task = response.data;
      if (!task) {
        onFlowMessage("写法提取任务提交成功，但没有拿到任务详情。");
        return;
      }
      handledTerminalTaskIdRef.current = "";
      setPendingExtractionTaskId(task.id);
      onExtractionTaskQueued(task);
    },
  });

  return {
    form,
    selectedPresetKey,
    activeExtractionTask,
    createManualPending: createManualMutation.isPending,
    createFromBriefPending: createFromBriefMutation.isPending,
    createFromTemplatePending: createFromTemplateMutation.isPending,
    extractTaskSubmitting: createExtractionTaskMutation.isPending,
    hasActiveExtractionTask: isActiveTask(activeExtractionTask),
    resetCreateFlow,
    onFormChange: handleFormChange,
    onPresetChange: setSelectedPresetKey,
    onCreateManual: () => createManualMutation.mutate(),
    onCreateFromBrief: () => createFromBriefMutation.mutate(),
    onCreateFromTemplate: (templateId: string) => createFromTemplateMutation.mutate(templateId),
    onSubmitExtractionTask: () => createExtractionTaskMutation.mutate(),
  };
}
