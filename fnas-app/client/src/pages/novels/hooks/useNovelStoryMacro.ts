import { useEffect, useState } from "react";
import type {
  StoryConflictLayers,
  StoryDecomposition,
  StoryExpansion,
  StoryMacroField,
  StoryMacroFieldValue,
  StoryMacroLocks,
  StoryMacroState,
} from "@ai-novel/shared/types/storyMacro";
import type { LLMProvider } from "@ai-novel/shared/types/llm";
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
import { syncNovelWorkflowStageSilently } from "../novelWorkflow.client";

const EMPTY_CONFLICT_LAYERS: StoryConflictLayers = {
  external: "",
  internal: "",
  relational: "",
};

const EMPTY_EXPANSION: StoryExpansion | null = null;

const EMPTY_EXPANSION_VALUE: StoryExpansion = {
  expanded_premise: "",
  protagonist_core: "",
  conflict_engine: "",
  conflict_layers: EMPTY_CONFLICT_LAYERS,
  mystery_box: "",
  emotional_line: "",
  setpiece_seeds: [],
  tone_reference: "",
};

const EMPTY_DECOMPOSITION: StoryDecomposition = {
  selling_point: "",
  core_conflict: "",
  main_hook: "",
  progression_loop: "",
  growth_path: "",
  major_payoffs: [],
  ending_flavor: "",
};

const EMPTY_STATE: StoryMacroState = {
  currentPhase: 0,
  progress: 0,
  protagonistState: "",
};

interface UseNovelStoryMacroInput {
  novelId: string;
  llm: {
    provider: LLMProvider;
    model: string;
    temperature: number;
  };
}

function normalizeExpansion(value: StoryExpansion | null | undefined): StoryExpansion | null {
  if (!value) {
    return null;
  }
  return {
    ...EMPTY_EXPANSION_VALUE,
    ...value,
    conflict_layers: {
      ...EMPTY_CONFLICT_LAYERS,
      ...(value.conflict_layers ?? {}),
    },
    setpiece_seeds: value.setpiece_seeds ?? [],
  };
}

export function useNovelStoryMacro(input: UseNovelStoryMacroInput): {
  tab: StoryMacroTabProps;
  ready: boolean;
} {
  const { novelId, llm } = input;
  const queryClient = useQueryClient();
  const [storyInput, setStoryInput] = useState("");
  const [expansion, setExpansion] = useState<StoryExpansion | null>(EMPTY_EXPANSION);
  const [decomposition, setDecomposition] = useState<StoryDecomposition>(EMPTY_DECOMPOSITION);
  const [constraints, setConstraints] = useState<string[]>([]);
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
      setExpansion(EMPTY_EXPANSION);
      setDecomposition(EMPTY_DECOMPOSITION);
      setConstraints([]);
      setLockedFields({});
      setStoryState(EMPTY_STATE);
      return;
    }
    setStoryInput(plan.storyInput ?? "");
    setExpansion(normalizeExpansion(plan.expansion));
    setDecomposition(plan.decomposition ?? EMPTY_DECOMPOSITION);
    setConstraints(plan.constraints ?? []);
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
      setMessage(response.message ?? "故事引擎原型已生成。");
      setExpansion(normalizeExpansion(response.data?.expansion));
      setDecomposition(response.data?.decomposition ?? EMPTY_DECOMPOSITION);
      setConstraints(response.data?.constraints ?? []);
      setLockedFields(response.data?.lockedFields ?? {});
      setStoryState(response.data?.state ?? EMPTY_STATE);
      await syncNovelWorkflowStageSilently({
        novelId,
        stage: "story_macro",
        itemLabel: "故事引擎原型已生成",
        status: "waiting_approval",
      });
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
      await syncNovelWorkflowStageSilently({
        novelId,
        stage: "story_macro",
        itemLabel: "约束引擎已构建",
        checkpointType: "book_contract_ready",
        checkpointSummary: "故事宏观规划与约束引擎已具备进入下一步的条件。",
        status: "waiting_approval",
      });
      await invalidatePlan();
    },
  });

  const saveMutation = useMutation({
    mutationFn: () => updateNovelStoryMacroPlan(novelId, {
      storyInput: storyInput.trim() || null,
      expansion: expansion ?? EMPTY_EXPANSION_VALUE,
      decomposition,
      constraints,
      lockedFields,
    }),
    onSuccess: async (response) => {
      setMessage(response.message ?? "故事宏观规划已保存。");
      await syncNovelWorkflowStageSilently({
        novelId,
        stage: "story_macro",
        itemLabel: "故事宏观规划已保存",
        status: "waiting_approval",
      });
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

  const onFieldChange = (field: StoryMacroField, value: StoryMacroFieldValue) => {
    switch (field) {
      case "expanded_premise":
      case "protagonist_core":
      case "conflict_engine":
      case "mystery_box":
      case "emotional_line":
      case "tone_reference":
        setExpansion((prev) => ({
          ...(prev ?? EMPTY_EXPANSION_VALUE),
          [field]: typeof value === "string" ? value : "",
        }));
        return;
      case "conflict_layers":
        setExpansion((prev) => ({
          ...(prev ?? EMPTY_EXPANSION_VALUE),
          conflict_layers: {
            ...EMPTY_CONFLICT_LAYERS,
            ...((value && typeof value === "object" && !Array.isArray(value)) ? value : {}),
          },
        }));
        return;
      case "setpiece_seeds":
        setExpansion((prev) => ({
          ...(prev ?? EMPTY_EXPANSION_VALUE),
          setpiece_seeds: Array.isArray(value) ? value : [],
        }));
        return;
      case "selling_point":
      case "core_conflict":
      case "main_hook":
      case "progression_loop":
      case "growth_path":
      case "ending_flavor":
        setDecomposition((prev) => ({
          ...prev,
          [field]: typeof value === "string" ? value : "",
        }));
        return;
      case "major_payoffs":
        setDecomposition((prev) => ({
          ...prev,
          major_payoffs: Array.isArray(value) ? value : [],
        }));
        return;
      case "constraints":
        setConstraints(Array.isArray(value) ? value : []);
    }
  };

  const tab: StoryMacroTabProps = {
    storyInput,
    onStoryInputChange: setStoryInput,
    expansion,
    decomposition,
    constraints,
    issues: planQuery.data?.data?.issues ?? [],
    lockedFields,
    constraintEngine: planQuery.data?.data?.constraintEngine ?? null,
    state: storyState,
    message,
    hasPlan: Boolean(planQuery.data?.data),
    onFieldChange,
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
