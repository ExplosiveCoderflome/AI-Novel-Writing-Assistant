import { useEffect, useState } from "react";
import type { StoryDecomposition, StoryExpansion, StoryMacroField, StoryMacroLocks, StoryMacroState } from "@ai-novel/shared/types/storyMacro";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  buildNovelStoryConstraintEngine,
  decomposeNovelStory,
  getNovelStoryMacroPlan,
  regenerateNovelStoryMacroField,
  updateNovelStoryMacroPlan,
  updateNovelStoryMacroState,
} from "@/api/novelStoryMacro";
import { queryKeys } from "@/api/queryKeys";
import type { StoryMacroTabProps } from "../components/NovelEditView.types";

const EMPTY_DECOMPOSITION: StoryDecomposition = {
  selling_point: "",
  core_conflict: "",
  main_hook: "",
  growth_path: "",
  major_payoffs: [],
  ending_flavor: "",
};

const EMPTY_STATE: StoryMacroState = {
  currentPhase: 0,
  progress: 0,
  protagonistState: "",
};

const EMPTY_EXPANSION: StoryExpansion | null = null;

interface UseNovelStoryMacroInput {
  novelId: string;
  llm: {
    provider: "deepseek" | "siliconflow" | "openai" | "anthropic" | "grok";
    model: string;
    temperature: number;
  };
}

export function useNovelStoryMacro(input: UseNovelStoryMacroInput): {
  tab: StoryMacroTabProps;
  ready: boolean;
} {
  const { novelId, llm } = input;
  const queryClient = useQueryClient();
  const [storyInput, setStoryInput] = useState("");
  const [decomposition, setDecomposition] = useState<StoryDecomposition>(EMPTY_DECOMPOSITION);
  const [lockedFields, setLockedFields] = useState<StoryMacroLocks>({});
  const [storyState, setStoryState] = useState<StoryMacroState>(EMPTY_STATE);
  const [message, setMessage] = useState("");
  const [regeneratingField, setRegeneratingField] = useState<StoryMacroField | "">("");

  const planQuery = useQuery({
    queryKey: queryKeys.novels.storyMacro(novelId),
    queryFn: () => getNovelStoryMacroPlan(novelId),
    enabled: Boolean(novelId),
  });

  const invalidatePlan = async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.novels.storyMacro(novelId) });
    await queryClient.invalidateQueries({ queryKey: queryKeys.novels.storyMacroState(novelId) });
  };

  useEffect(() => {
    const plan = planQuery.data?.data;
    if (!plan) {
      setStoryInput("");
      setDecomposition(EMPTY_DECOMPOSITION);
      setLockedFields({});
      setStoryState(EMPTY_STATE);
      return;
    }
    setStoryInput(plan.storyInput ?? "");
    setDecomposition(plan.decomposition ?? EMPTY_DECOMPOSITION);
    setLockedFields(plan.lockedFields ?? {});
    setStoryState(plan.state ?? EMPTY_STATE);
  }, [planQuery.data?.data]);

  const decomposeMutation = useMutation({
    mutationFn: () => decomposeNovelStory(novelId, {
      storyInput,
      provider: llm.provider,
      model: llm.model,
      temperature: llm.temperature,
    }),
    onSuccess: async (response) => {
      setMessage(response.message ?? "作家视角扩展与故事拆解已完成。");
      setDecomposition(response.data?.decomposition ?? EMPTY_DECOMPOSITION);
      setLockedFields(response.data?.lockedFields ?? {});
      setStoryState(response.data?.state ?? EMPTY_STATE);
      await invalidatePlan();
    },
  });

  const buildMutation = useMutation({
    mutationFn: () => buildNovelStoryConstraintEngine(novelId, {
      provider: llm.provider,
      model: llm.model,
      temperature: llm.temperature,
    }),
    onSuccess: async (response) => {
      setMessage(response.message ?? "约束引擎已构建。");
      await invalidatePlan();
    },
  });

  const saveMutation = useMutation({
    mutationFn: () => updateNovelStoryMacroPlan(novelId, {
      storyInput: storyInput.trim() || null,
      decomposition,
      lockedFields,
    }),
    onSuccess: async (response) => {
      setMessage(response.message ?? "故事宏观规划已保存。");
      await invalidatePlan();
    },
  });

  const saveStateMutation = useMutation({
    mutationFn: () => updateNovelStoryMacroState(novelId, storyState),
    onSuccess: async () => {
      setMessage("故事宏观状态已保存。");
      await invalidatePlan();
    },
  });

  const regenerateMutation = useMutation({
    mutationFn: async (field: StoryMacroField) => {
      setRegeneratingField(field);
      return regenerateNovelStoryMacroField(novelId, field, {
        provider: llm.provider,
        model: llm.model,
        temperature: llm.temperature,
      });
    },
    onSuccess: async (response) => {
      setMessage(response.message ?? "字段已重生成。");
      await invalidatePlan();
    },
    onSettled: () => {
      setRegeneratingField("");
    },
  });

  const tab: StoryMacroTabProps = {
    storyInput,
    onStoryInputChange: setStoryInput,
    expansion: planQuery.data?.data?.expansion ?? EMPTY_EXPANSION,
    decomposition,
    issues: planQuery.data?.data?.issues ?? [],
    lockedFields,
    constraintEngine: planQuery.data?.data?.constraintEngine ?? null,
    state: storyState,
    message,
    hasPlan: Boolean(planQuery.data?.data),
    onFieldChange: (field, value) => setDecomposition((prev) => ({
      ...prev,
      [field]: value,
    } as StoryDecomposition)),
    onToggleLock: (field) => setLockedFields((prev) => ({ ...prev, [field]: !prev[field] })),
    onDecompose: () => decomposeMutation.mutate(),
    onRegenerateField: (field) => regenerateMutation.mutate(field),
    regeneratingField,
    onBuildConstraintEngine: () => buildMutation.mutate(),
    onSaveEdits: () => saveMutation.mutate(),
    onStateChange: (field, value) => setStoryState((prev) => ({
      ...prev,
      [field]: field === "protagonistState" ? String(value) : Number(value),
    })),
    onSaveState: () => saveStateMutation.mutate(),
    isDecomposing: decomposeMutation.isPending,
    isBuilding: buildMutation.isPending,
    isSaving: saveMutation.isPending,
    isSavingState: saveStateMutation.isPending,
  };

  return {
    tab,
    ready: Boolean(planQuery.data?.data?.constraintEngine),
  };
}
