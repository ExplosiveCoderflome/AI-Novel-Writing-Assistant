import { useMutation, useQuery, type QueryClient } from "@tanstack/react-query";
import type { LLMProvider } from "@ai-novel/shared/types/llm";
import {
  checkCharacterAgainstWorld,
  createNovelCharacter,
  deleteNovelCharacter,
  evolveNovelCharacter,
  getCharacterTimeline,
  syncAllCharacterTimeline,
  syncCharacterTimeline,
  updateNovelCharacter,
} from "@/api/novel";
import { queryKeys } from "@/api/queryKeys";

interface LLMState {
  provider?: LLMProvider;
  model?: string;
  temperature?: number;
}

interface PipelineFormState {
  startOrder: number;
  endOrder: number;
}

interface CharacterFormState {
  name: string;
  role: string;
  personality: string;
  background: string;
  development: string;
  currentState: string;
  currentGoal: string;
}

interface QuickCharacterFormState {
  name: string;
  role: string;
}

interface BaseCharacterOption {
  id: string;
  name: string;
  role: string;
  personality?: string | null;
  background?: string | null;
  development?: string | null;
}

interface UseNovelCharacterMutationsInput {
  id: string;
  selectedCharacterId: string;
  selectedBaseCharacter?: BaseCharacterOption;
  characters: Array<{ id: string }>;
  pipelineForm: PipelineFormState;
  llm: LLMState;
  characterForm: CharacterFormState;
  quickCharacterForm: QuickCharacterFormState;
  queryClient: QueryClient;
  setCharacterMessage: (message: string) => void;
  setSelectedCharacterId: (id: string) => void;
  setQuickCharacterForm: (updater: (prev: QuickCharacterFormState) => QuickCharacterFormState) => void;
}

export function useNovelCharacterMutations(input: UseNovelCharacterMutationsInput) {
  const {
    id,
    selectedCharacterId,
    selectedBaseCharacter,
    characters,
    pipelineForm,
    llm,
    characterForm,
    quickCharacterForm,
    queryClient,
    setCharacterMessage,
    setSelectedCharacterId,
    setQuickCharacterForm,
  } = input;

  const characterTimelineQuery = useQuery({
    queryKey: queryKeys.novels.characterTimeline(id, selectedCharacterId || "none"),
    queryFn: () => getCharacterTimeline(id, selectedCharacterId),
    enabled: Boolean(id && selectedCharacterId),
  });

  const syncTimelineMutation = useMutation({
    mutationFn: () =>
      syncCharacterTimeline(id, selectedCharacterId, {
        startOrder: pipelineForm.startOrder,
        endOrder: pipelineForm.endOrder,
      }),
    onSuccess: async (response) => {
      setCharacterMessage(response.message ?? `角色时间线同步完成，本次新增 ${response.data?.syncedCount ?? 0} 条。`);
      await queryClient.invalidateQueries({
        queryKey: queryKeys.novels.characterTimeline(id, selectedCharacterId || "none"),
      });
    },
  });

  const syncAllTimelineMutation = useMutation({
    mutationFn: () =>
      syncAllCharacterTimeline(id, {
        startOrder: pipelineForm.startOrder,
        endOrder: pipelineForm.endOrder,
      }),
    onSuccess: async (response) => {
      setCharacterMessage(response.message ?? `全角色时间线同步完成，共新增 ${response.data?.syncedCount ?? 0} 条事件。`);
      await queryClient.invalidateQueries({ queryKey: queryKeys.novels.detail(id) });
      await queryClient.invalidateQueries({
        queryKey: queryKeys.novels.characterTimeline(id, selectedCharacterId || "none"),
      });
    },
  });

  const evolveCharacterMutation = useMutation({
    mutationFn: () =>
      evolveNovelCharacter(id, selectedCharacterId, {
        provider: llm.provider,
        model: llm.model,
        temperature: 0.4,
      }),
    onSuccess: async () => {
      setCharacterMessage("角色信息已按时间线完成演进更新。");
      await queryClient.invalidateQueries({ queryKey: queryKeys.novels.detail(id) });
      await queryClient.invalidateQueries({
        queryKey: queryKeys.novels.characterTimeline(id, selectedCharacterId || "none"),
      });
    },
  });

  const worldCheckMutation = useMutation({
    mutationFn: () =>
      checkCharacterAgainstWorld(id, selectedCharacterId, {
        provider: llm.provider,
        model: llm.model,
        temperature: 0.2,
      }),
    onSuccess: (response) => {
      const status = response.data?.status ?? "pass";
      const warningText = response.data?.warnings?.join(" | ") ?? "";
      const issueText = (response.data?.issues ?? [])
        .map((item) => `${item.severity.toUpperCase()}: ${item.message}`)
        .join(" | ");
      setCharacterMessage(`世界规则检查(${status}) ${warningText} ${issueText}`.trim());
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : "世界规则检查失败。";
      setCharacterMessage(message);
    },
  });

  const saveCharacterMutation = useMutation({
    mutationFn: () =>
      updateNovelCharacter(id, selectedCharacterId, {
        name: characterForm.name,
        role: characterForm.role,
        personality: characterForm.personality,
        background: characterForm.background,
        development: characterForm.development,
        currentState: characterForm.currentState,
        currentGoal: characterForm.currentGoal,
      }),
    onSuccess: async () => {
      setCharacterMessage("角色信息已保存。");
      await queryClient.invalidateQueries({ queryKey: queryKeys.novels.detail(id) });
    },
  });

  const importBaseCharacterMutation = useMutation({
    mutationFn: async () => {
      if (!selectedBaseCharacter) {
        throw new Error("请先选择要导入的基础角色。");
      }
      return createNovelCharacter(id, {
        name: selectedBaseCharacter.name,
        role: selectedBaseCharacter.role,
        personality: selectedBaseCharacter.personality ?? undefined,
        background: selectedBaseCharacter.background ?? undefined,
        development: selectedBaseCharacter.development ?? undefined,
        baseCharacterId: selectedBaseCharacter.id,
      });
    },
    onSuccess: async (response) => {
      setCharacterMessage(response.message ?? "基础角色已导入到当前小说。");
      if (response.data?.id) {
        setSelectedCharacterId(response.data.id);
      }
      await queryClient.invalidateQueries({ queryKey: queryKeys.novels.detail(id) });
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : "导入基础角色失败。";
      setCharacterMessage(message);
    },
  });

  const quickCreateCharacterMutation = useMutation({
    mutationFn: async () =>
      createNovelCharacter(id, {
        name: quickCharacterForm.name.trim(),
        role: quickCharacterForm.role.trim() || "主角",
      }),
    onSuccess: async (response) => {
      setCharacterMessage(response.message ?? "角色创建成功。");
      setQuickCharacterForm((prev) => ({ ...prev, name: "" }));
      if (response.data?.id) {
        setSelectedCharacterId(response.data.id);
      }
      await queryClient.invalidateQueries({ queryKey: queryKeys.novels.detail(id) });
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : "角色创建失败。";
      setCharacterMessage(message);
    },
  });

  const deleteCharacterMutation = useMutation({
    mutationFn: (characterId: string) => deleteNovelCharacter(id, characterId),
    onSuccess: async (_response, deletedCharacterId) => {
      setCharacterMessage("角色已删除。");
      if (selectedCharacterId === deletedCharacterId) {
        const fallback = characters.find((item) => item.id !== deletedCharacterId);
        setSelectedCharacterId(fallback?.id ?? "");
      }
      await queryClient.invalidateQueries({ queryKey: queryKeys.novels.detail(id) });
      await queryClient.invalidateQueries({
        queryKey: queryKeys.novels.characterTimeline(id, deletedCharacterId),
      });
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : "删除角色失败。";
      setCharacterMessage(message);
    },
  });

  return {
    characterTimelineQuery,
    syncTimelineMutation,
    syncAllTimelineMutation,
    evolveCharacterMutation,
    worldCheckMutation,
    saveCharacterMutation,
    importBaseCharacterMutation,
    quickCreateCharacterMutation,
    deleteCharacterMutation,
  };
}
