import i18next from "i18next";
import { useMutation, useQuery, type QueryClient } from "@tanstack/react-query";
import type { LLMProvider } from "@ai-novel/shared/types/llm";
import {
  applyBatchCharacterVisibleProfiles,
  applyCharacterVisibleProfile,
  applySupplementalCharacter,
  checkCharacterAgainstWorld,
  createNovelCharacter,
  deleteNovelCharacter,
  evolveNovelCharacter,
  generateBatchCharacterVisibleProfiles,
  generateCharacterVisibleProfile,
  generateSupplementalCharacters,
  getCharacterTimeline,
  syncAllCharacterTimeline,
  syncCharacterTimeline,
  updateNovelCharacter,
} from "@/api/novel";
import { queryKeys } from "@/api/queryKeys";
import { buildCharacterProfileFromWizard, type QuickCharacterCreatePayload } from "../components/characterPanel.utils";
import type {
  SupplementalCharacterCandidate,
  SupplementalCharacterGenerateInput,
} from "@ai-novel/shared/types/novel";

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
  gender: "male" | "female" | "other" | "unknown";
  personality: string;
  background: string;
  development: string;
  appearance: string;
  physique: string;
  attireStyle: string;
  signatureDetail: string;
  voiceTexture: string;
  presenceImpression: string;
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

async function invalidateCharacterViews(queryClient: QueryClient, novelId: string, selectedCharacterId?: string) {
  await queryClient.invalidateQueries({ queryKey: queryKeys.novels.detail(novelId) });
  await queryClient.invalidateQueries({ queryKey: queryKeys.novels.characterRelations(novelId) });
  await queryClient.invalidateQueries({ queryKey: queryKeys.novels.characterDynamicsOverview(novelId) });
  await queryClient.invalidateQueries({ queryKey: queryKeys.novels.characterCandidates(novelId) });
  if (selectedCharacterId) {
    await queryClient.invalidateQueries({
      queryKey: queryKeys.novels.characterTimeline(novelId, selectedCharacterId),
    });
  }
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
      await invalidateCharacterViews(queryClient, id, selectedCharacterId || "none");
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
      await invalidateCharacterViews(queryClient, id, selectedCharacterId || "none");
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
      setCharacterMessage(i18next.t("gen.pages.novels.hooks.useNovelCharacterMutations.gen_8854c069"));
      await invalidateCharacterViews(queryClient, id, selectedCharacterId || "none");
    },
  });

  const generateVisibleProfileMutation = useMutation({
    mutationFn: (userGuidance?: string) =>
      generateCharacterVisibleProfile(id, selectedCharacterId, {
        provider: llm.provider,
        model: llm.model,
        temperature: 0.45,
        userGuidance: userGuidance?.trim() || undefined,
      }),
    onSuccess: (response) => {
      const count = Object.keys(response.data?.fields ?? {}).length;
      setCharacterMessage(count > 0 ? `已生成 ${count} 项外显资料建议，请确认后写入。` : i18next.t("gen.pages.novels.hooks.useNovelCharacterMutations.gen_7adea5b7"));
    },
    onError: (error) => {
      setCharacterMessage(error instanceof Error ? error.message : i18next.t("gen.pages.novels.hooks.useNovelCharacterMutations.gen_5465a1ee"));
    },
  });

  const applyVisibleProfileMutation = useMutation({
    mutationFn: () => {
      const suggestion = generateVisibleProfileMutation.data?.data;
      const fields = suggestion?.fields ?? {};
      return applyCharacterVisibleProfile(id, selectedCharacterId, fields, {
        overwriteExisting: suggestion?.allowsOverwriteExisting,
      });
    },
    onSuccess: async (response) => {
      const count = response.data?.appliedFields.length ?? 0;
      setCharacterMessage(count > 0 ? `已写入 ${count} 项外显资料。` : i18next.t("gen.pages.novels.hooks.useNovelCharacterMutations.gen_1df73f4d"));
      await invalidateCharacterViews(queryClient, id, selectedCharacterId || "none");
    },
    onError: (error) => {
      setCharacterMessage(error instanceof Error ? error.message : i18next.t("gen.pages.novels.hooks.useNovelCharacterMutations.gen_0589d2f6"));
    },
  });

  const generateBatchVisibleProfilesMutation = useMutation({
    mutationFn: (userGuidance?: string) =>
      generateBatchCharacterVisibleProfiles(id, {
        provider: llm.provider,
        model: llm.model,
        temperature: 0.45,
        userGuidance: userGuidance?.trim() || undefined,
      }),
    onSuccess: (response) => {
      const count = response.data?.results.filter((item) => item.hasApplicableChanges).length ?? 0;
      setCharacterMessage(count > 0 ? `已生成 ${count} 个角色的外显资料建议，请确认后写入。` : i18next.t("gen.pages.novels.hooks.useNovelCharacterMutations.gen_29423d7e"));
    },
    onError: (error) => {
      setCharacterMessage(error instanceof Error ? error.message : i18next.t("gen.pages.novels.hooks.useNovelCharacterMutations.gen_43843e60"));
    },
  });

  const applyBatchVisibleProfilesMutation = useMutation({
    mutationFn: () => {
      const items = (generateBatchVisibleProfilesMutation.data?.data?.results ?? [])
        .filter((item) => item.hasApplicableChanges)
        .map((item) => ({
          characterId: item.characterId,
          fields: item.fields,
          overwriteExisting: item.allowsOverwriteExisting,
        }));
      return applyBatchCharacterVisibleProfiles(id, items);
    },
    onSuccess: async (response) => {
      const count = response.data?.results.reduce((sum, item) => sum + item.appliedFields.length, 0) ?? 0;
      setCharacterMessage(count > 0 ? `已批量写入 ${count} 项外显资料。` : i18next.t("gen.pages.novels.hooks.useNovelCharacterMutations.gen_0aedf9d4"));
      await invalidateCharacterViews(queryClient, id, selectedCharacterId || "none");
    },
    onError: (error) => {
      setCharacterMessage(error instanceof Error ? error.message : i18next.t("gen.pages.novels.hooks.useNovelCharacterMutations.gen_36d36323"));
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
      setCharacterMessage(error instanceof Error ? error.message : i18next.t("gen.pages.novels.hooks.useNovelCharacterMutations.worldRuleCheckFailed"));
    },
  });

  const saveCharacterMutation = useMutation({
    mutationFn: () =>
      updateNovelCharacter(id, selectedCharacterId, {
        name: characterForm.name,
        role: characterForm.role,
        gender: characterForm.gender,
        personality: characterForm.personality,
        background: characterForm.background,
        development: characterForm.development,
        appearance: characterForm.appearance,
        physique: characterForm.physique,
        attireStyle: characterForm.attireStyle,
        signatureDetail: characterForm.signatureDetail,
        voiceTexture: characterForm.voiceTexture,
        presenceImpression: characterForm.presenceImpression,
        currentState: characterForm.currentState,
        currentGoal: characterForm.currentGoal,
      }),
    onSuccess: async () => {
      setCharacterMessage(i18next.t("gen.pages.novels.hooks.useNovelCharacterMutations.gen_7144414b"));
      await invalidateCharacterViews(queryClient, id, selectedCharacterId || "none");
    },
  });

  const importBaseCharacterMutation = useMutation({
    mutationFn: async () => {
      if (!selectedBaseCharacter) {
        throw new Error(i18next.t("gen.pages.novels.hooks.useNovelCharacterMutations.gen_d0bda959"));
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
      setCharacterMessage(response.message ?? i18next.t("gen.pages.novels.hooks.useNovelCharacterMutations.gen_5ad831a8"));
      if (response.data?.id) {
        setSelectedCharacterId(response.data.id);
      }
      await invalidateCharacterViews(queryClient, id, response.data?.id ?? selectedCharacterId ?? "none");
    },
    onError: (error) => {
      setCharacterMessage(error instanceof Error ? error.message : i18next.t("gen.pages.novels.hooks.useNovelCharacterMutations.gen_9a51c3e4"));
    },
  });

  const quickCreateCharacterMutation = useMutation({
    mutationFn: async (payload?: QuickCharacterCreatePayload) => {
      const nextName = payload?.name?.trim() || quickCharacterForm.name.trim();
      const nextRole = payload?.role?.trim() || quickCharacterForm.role.trim() || i18next.t("gen.pages.novels.hooks.useNovelCharacterMutations.mainCharacter");
      const generatedProfile = payload ? buildCharacterProfileFromWizard(payload) : {};
      return createNovelCharacter(id, {
        name: nextName,
        role: nextRole,
        relationToProtagonist: payload?.relationToProtagonist?.trim() || undefined,
        storyFunction: payload?.storyFunction?.trim() || undefined,
        ...generatedProfile,
      });
    },
    onSuccess: async (response) => {
      setCharacterMessage(response.message ?? i18next.t("gen.pages.novels.hooks.useNovelCharacterMutations.gen_88869184"));
      setQuickCharacterForm((prev) => ({ ...prev, name: "" }));
      if (response.data?.id) {
        setSelectedCharacterId(response.data.id);
      }
      await invalidateCharacterViews(queryClient, id, response.data?.id ?? selectedCharacterId ?? "none");
    },
    onError: (error) => {
      setCharacterMessage(error instanceof Error ? error.message : i18next.t("gen.pages.novels.hooks.useNovelCharacterMutations.gen_84f0819f"));
    },
  });

  const deleteCharacterMutation = useMutation({
    mutationFn: (characterId: string) => deleteNovelCharacter(id, characterId),
    onSuccess: async (_response, deletedCharacterId) => {
      setCharacterMessage(i18next.t("gen.pages.novels.hooks.useNovelCharacterMutations.gen_98b00c5e"));
      if (selectedCharacterId === deletedCharacterId) {
        const fallback = characters.find((item) => item.id !== deletedCharacterId);
        setSelectedCharacterId(fallback?.id ?? "");
      }
      await invalidateCharacterViews(queryClient, id, deletedCharacterId);
    },
    onError: (error) => {
      setCharacterMessage(error instanceof Error ? error.message : i18next.t("gen.pages.novels.hooks.useNovelCharacterMutations.gen_556815c0"));
    },
  });

  const generateSupplementalCharacterMutation = useMutation({
    mutationFn: (payload: SupplementalCharacterGenerateInput) =>
      generateSupplementalCharacters(id, {
        ...payload,
        provider: payload.provider ?? llm.provider,
        model: payload.model ?? llm.model,
        temperature: payload.temperature ?? 0.55,
      }),
    onError: (error) => {
      setCharacterMessage(error instanceof Error ? error.message : i18next.t("gen.pages.novels.hooks.useNovelCharacterMutations.gen_c7b0928b"));
    },
  });

  const applySupplementalCharacterMutation = useMutation({
    mutationFn: (candidate: SupplementalCharacterCandidate) => applySupplementalCharacter(id, candidate),
    onSuccess: async (response) => {
      const createdCharacterId = response.data?.character?.id ?? "";
      const relationCount = response.data?.relationCount ?? 0;
      setCharacterMessage(
        response.message
        ?? `补充角色已创建${relationCount > 0 ? `，并同步 ${relationCount} 条结构化关系` : ""}。`,
      );
      if (createdCharacterId) {
        setSelectedCharacterId(createdCharacterId);
      }
      await invalidateCharacterViews(queryClient, id, createdCharacterId || selectedCharacterId || "none");
    },
    onError: (error) => {
      setCharacterMessage(error instanceof Error ? error.message : i18next.t("gen.pages.novels.hooks.useNovelCharacterMutations.gen_e113be50"));
    },
  });

  return {
    characterTimelineQuery,
    syncTimelineMutation,
    syncAllTimelineMutation,
    evolveCharacterMutation,
    generateVisibleProfileMutation,
    applyVisibleProfileMutation,
    generateBatchVisibleProfilesMutation,
    applyBatchVisibleProfilesMutation,
    worldCheckMutation,
    saveCharacterMutation,
    importBaseCharacterMutation,
    quickCreateCharacterMutation,
    deleteCharacterMutation,
    generateSupplementalCharacterMutation,
    applySupplementalCharacterMutation,
  };
}
