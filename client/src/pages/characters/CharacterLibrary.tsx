import i18next from "i18next";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ImageAsset } from "@ai-novel/shared/types/image";
import type { BaseCharacter } from "@ai-novel/shared/types/novel";
import { CircleAlert, ImageIcon, LibraryBig, Sparkles, UsersRound } from "lucide-react";
import { deleteBaseCharacter, getBaseCharacterList, updateBaseCharacter } from "@/api/character";
import { deleteImageAsset, listImageAssets, setPrimaryImageAsset } from "@/api/images";
import { queryKeys } from "@/api/queryKeys";
import OpenInCreativeHubButton from "@/components/creativeHub/OpenInCreativeHubButton";
import CharacterConversationWorkbench from "@/components/characterConversation/CharacterConversationWorkbench";
import {
  AssetLibraryEmptyState,
  AssetLibraryHeader,
  AssetLibraryRecommendation,
  AssetLibrarySection,
  AssetLibraryStatusGrid,
} from "@/components/assetLibrary";
import { Button } from "@/components/ui/button";
import { CharacterCard } from "./components/CharacterCard";
import { CharacterCreateDialog } from "./components/CharacterCreateDialog";
import { CharacterEditDialog } from "./components/CharacterEditDialog";
import { CharacterImageDialog } from "./components/CharacterImageDialog";

type EditableBaseCharacter = Omit<BaseCharacter, "id" | "createdAt" | "updatedAt">;

export default function CharacterLibrary() {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const [imageDialogOpen, setImageDialogOpen] = useState(false);
  const [selectedImageCharacter, setSelectedImageCharacter] = useState<BaseCharacter | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingCharacter, setEditingCharacter] = useState<BaseCharacter | null>(null);
  const [conversationCharacter, setConversationCharacter] = useState<BaseCharacter | null>(null);

  const characterListQuery = useQuery({
    queryKey: queryKeys.baseCharacters.all,
    queryFn: () => getBaseCharacterList(),
  });

  const characters = characterListQuery.data?.data ?? [];

  const imageAssetQueries = useQueries({
    queries: characters.map((character) => ({
      queryKey: queryKeys.images.assets("character", character.id),
      queryFn: () => listImageAssets({ sceneType: "character", sceneId: character.id }),
      staleTime: 30_000,
    })),
  });

  const assetsByCharacter = useMemo(() => {
    const map = new Map<string, ImageAsset[]>();
    characters.forEach((character, index) => {
      map.set(character.id, imageAssetQueries[index]?.data?.data ?? []);
    });
    return map;
  }, [characters, imageAssetQueries]);
  const categoryCount = useMemo(
    () => new Set(characters.map((character) => character.category.trim()).filter(Boolean)).size,
    [characters],
  );
  const characterWithImageCount = useMemo(
    () => characters.filter((character) => (assetsByCharacter.get(character.id) ?? []).length > 0).length,
    [assetsByCharacter, characters],
  );
  const incompleteCharacterCount = useMemo(
    () => characters.filter((character) => (
      !character.personality.trim()
      || !character.background.trim()
      || !character.development.trim()
    )).length,
    [characters],
  );

  const setPrimaryMutation = useMutation({
    mutationFn: (assetId: string) => setPrimaryImageAsset(assetId),
    onSuccess: async (response) => {
      const baseCharacterId = response.data?.baseCharacterId;
      if (!baseCharacterId) {
        return;
      }
      await queryClient.invalidateQueries({
        queryKey: queryKeys.images.assets("character", baseCharacterId),
      });
    },
  });

  const deleteAssetMutation = useMutation({
    mutationFn: (assetId: string) => deleteImageAsset(assetId),
    onSuccess: async (response) => {
      const baseCharacterId = response.data?.baseCharacterId;
      if (!baseCharacterId) {
        return;
      }
      await queryClient.invalidateQueries({
        queryKey: queryKeys.images.assets("character", baseCharacterId),
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({
      characterId,
      payload,
    }: {
      characterId: string;
      payload: EditableBaseCharacter;
    }) => updateBaseCharacter(characterId, payload),
    onSuccess: async (_, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.baseCharacters.all }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.baseCharacters.detail(variables.characterId),
        }),
      ]);
      setEditDialogOpen(false);
      setEditingCharacter(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (characterId: string) => deleteBaseCharacter(characterId),
    onSuccess: async (_, characterId) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.baseCharacters.all }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.images.assets("character", characterId),
        }),
      ]);
      if (selectedImageCharacter?.id === characterId) {
        setImageDialogOpen(false);
        setSelectedImageCharacter(null);
      }
      if (editingCharacter?.id === characterId) {
        setEditDialogOpen(false);
        setEditingCharacter(null);
      }
    },
  });

  const handleTaskCompleted = async (baseCharacterId: string) => {
    await queryClient.invalidateQueries({
      queryKey: queryKeys.images.assets("character", baseCharacterId),
    });
  };

  const openImageDialog = (character: BaseCharacter) => {
    setSelectedImageCharacter(character);
    setImageDialogOpen(true);
  };

  const openEditDialog = (character: BaseCharacter) => {
    setEditingCharacter(character);
    setEditDialogOpen(true);
  };

  const handleDeleteCharacter = (character: BaseCharacter) => {
    const confirmed = window.confirm(`确认删除角色「${character.name}」？此操作不可恢复。`);
    if (!confirmed) {
      return;
    }
    deleteMutation.mutate(character.id);
  };

  return (
    <div className="space-y-5">
      <AssetLibraryHeader
        icon={UsersRound}
        context="跨小说复用资产"
        title={i18next.t("sidebar.baseCharacters")}
        description={i18next.t("characters.characterLibrary.6dywbi")}
        actions={(
          <>
            <OpenInCreativeHubButton bindings={{}} label={i18next.t("characters.characterLibrary.tjo2sg")} />
            <CharacterCreateDialog />
          </>
        )}
      />

      <AssetLibraryStatusGrid
        items={[
          {
            key: "characters",
            label: i18next.t("characters.characterLibrary.f8yn5i"),
            value: characterListQuery.isPending || characterListQuery.isError ? "—" : characters.length,
            detail: characterListQuery.isPending
              ? "正在读取角色资产"
              : characterListQuery.isError
                ? "重新加载后查看"
                : characters.length > 0
                  ? "可在小说筹备和角色补充时继续使用"
                  : "创建后即可用于新小说",
            icon: LibraryBig,
            tone: characterListQuery.isPending || characterListQuery.isError
              ? "neutral"
              : characters.length > 0 ? "success" : "neutral",
          },
          {
            key: "categories",
            label: i18next.t("characters.characterLibrary.hxhwsw"),
            value: characterListQuery.isPending || characterListQuery.isError ? "—" : categoryCount,
            detail: "按主角、配角等角色定位整理",
            icon: UsersRound,
          },
          {
            key: "images",
            label: i18next.t("characters.characterLibrary.bef0h7"),
            value: characterListQuery.isPending || characterListQuery.isError ? "—" : characterWithImageCount,
            detail: "至少保存一张角色形象图",
            icon: ImageIcon,
            tone: characterListQuery.isPending || characterListQuery.isError
              ? "neutral"
              : characterWithImageCount > 0 ? "info" : "neutral",
          },
          {
            key: "incomplete",
            label: i18next.t("characters.characterLibrary.lkrie8"),
            value: characterListQuery.isPending || characterListQuery.isError ? "—" : incompleteCharacterCount,
            detail: "缺少性格、背景或成长轨迹",
            icon: CircleAlert,
            tone: characterListQuery.isPending || characterListQuery.isError
              ? "neutral"
              : characters.length === 0
                ? "neutral"
                : incompleteCharacterCount > 0 ? "warning" : "success",
          },
        ]}
      />

      <AssetLibraryRecommendation
        icon={Sparkles}
        title={characterListQuery.isPending
          ? "正在整理角色资产"
          : characterListQuery.isError
            ? "先重新加载角色库"
            : characters.length === 0
              ? "先建立第一个可复用角色"
              : incompleteCharacterCount > 0
                ? "优先补齐角色为什么行动、会付出什么代价"
                : "角色基础可用于小说筹备"}
        description={characterListQuery.isPending
          ? "读取完成后会根据角色完整度推荐下一步。"
          : characterListQuery.isError
            ? "现有角色不会受到影响，重新加载后即可继续管理。"
            : characters.length === 0
              ? "从一个主角开始即可。先写清目标、弱点和成长方向，AI 会更容易生成有推动力的人物。"
              : incompleteCharacterCount > 0
                ? `有 ${incompleteCharacterCount} 个角色缺少核心资料。补齐后，章节规划和人物对话会获得更稳定的依据。`
                : "你可以带着整个角色库进入创作中枢，或为单个角色继续完善形象和对话。"}
        tone={characterListQuery.isError
          ? "danger"
          : characterListQuery.isPending || characters.length === 0
            ? "info"
            : incompleteCharacterCount > 0
              ? "warning"
              : "success"}
        action={characterListQuery.isError ? (
          <Button type="button" size="sm" variant="outline" onClick={() => void characterListQuery.refetch()}>{i18next.t("common.retry")}</Button>
        ) : undefined}
      />

      <CharacterImageDialog
        open={imageDialogOpen}
        character={selectedImageCharacter}
        onOpenChange={(open) => {
          setImageDialogOpen(open);
          if (!open) {
            setSelectedImageCharacter(null);
          }
        }}
        onTaskCompleted={handleTaskCompleted}
      />

      <CharacterEditDialog
        open={editDialogOpen}
        character={editingCharacter}
        saving={updateMutation.isPending}
        onOpenChange={(open) => {
          setEditDialogOpen(open);
          if (!open) {
            setEditingCharacter(null);
          }
        }}
        onSubmit={(payload) => {
          if (!editingCharacter) {
            return;
          }
          updateMutation.mutate({
            characterId: editingCharacter.id,
            payload,
          });
        }}
      />

      {conversationCharacter ? (
        <CharacterConversationWorkbench
          subject={{ kind: "base_character", id: conversationCharacter.id, scopeKind: "base_library", scopeId: null }}
          characterName={conversationCharacter.name}
          defaultFullscreen
          closeOnExitFullscreen
          onClose={() => setConversationCharacter(null)}
        />
      ) : null}

      <AssetLibrarySection
        title={i18next.t("dict.gen_88afed0d")}
        description={i18next.t("characters.characterLibrary.iq0ve6")}
      >
        <div className="space-y-3">
          {characterListQuery.isLoading ? (
            <AssetLibraryEmptyState
              icon={UsersRound}
              title={i18next.t("characters.characterLibrary.vd2hmu")}
              description={i18next.t("characters.characterLibrary.pxbein")}
            />
          ) : null}

          {characterListQuery.isError ? (
            <AssetLibraryEmptyState
              icon={CircleAlert}
              title={i18next.t("characters.characterLibrary.yt9qyh")}
              description={i18next.t("characters.characterLibrary.k1xmbo")}
              action={(
                <Button type="button" variant="outline" onClick={() => void characterListQuery.refetch()}>{i18next.t("common.retry")}</Button>
              )}
            />
          ) : null}

          {!characterListQuery.isLoading && !characterListQuery.isError ? (
            <>
              {characters.map((character, index) => (
                <CharacterCard
                  key={character.id}
                  character={character}
                  assets={assetsByCharacter.get(character.id) ?? []}
                  assetsLoading={imageAssetQueries[index]?.isLoading}
                  onGenerateImage={() => openImageDialog(character)}
                  onSetPrimary={(assetId) => setPrimaryMutation.mutate(assetId)}
                  onDeleteAsset={(asset) => deleteAssetMutation.mutateAsync(asset.id).then(() => undefined)}
                  onEdit={() => openEditDialog(character)}
                  onDelete={() => handleDeleteCharacter(character)}
                  onConversation={() => setConversationCharacter(character)}
                  settingPrimary={setPrimaryMutation.isPending}
                  deletingAssetId={deleteAssetMutation.variables ?? null}
                  deleting={deleteMutation.isPending && deleteMutation.variables === character.id}
                  extraActions={(
                    <OpenInCreativeHubButton
                      bindings={{ baseCharacterId: character.id }}
                      label={i18next.t("dict.gen_fd38c170")}
                    />
                  )}
                />
              ))}
              {characters.length === 0 ? (
                <AssetLibraryEmptyState
                  icon={UsersRound}
                  title={i18next.t("characters.characterLibrary.vf993a")}
                  description={i18next.t("characters.characterLibrary.i1qmve")}
                />
              ) : null}
            </>
          ) : null}
        </div>
      </AssetLibrarySection>
    </div>
  );
}
