import { useMemo, useState } from "react";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ImageAsset } from "@ai-novel/shared/types/image";
import type { BaseCharacter } from "@ai-novel/shared/types/novel";
import { deleteBaseCharacter, getBaseCharacterList, updateBaseCharacter } from "@/api/character";
import { deleteImageAsset, listImageAssets, setPrimaryImageAsset } from "@/api/images";
import { queryKeys } from "@/api/queryKeys";
import OpenInCreativeHubButton from "@/components/creativeHub/OpenInCreativeHubButton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CharacterCard } from "./components/CharacterCard";
import { CharacterCreateDialog } from "./components/CharacterCreateDialog";
import { CharacterEditDialog } from "./components/CharacterEditDialog";
import { CharacterImageDialog } from "./components/CharacterImageDialog";

type EditableBaseCharacter = Omit<BaseCharacter, "id" | "createdAt" | "updatedAt">;

export default function CharacterLibrary() {
  const queryClient = useQueryClient();
  const [imageDialogOpen, setImageDialogOpen] = useState(false);
  const [selectedImageCharacter, setSelectedImageCharacter] = useState<BaseCharacter | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingCharacter, setEditingCharacter] = useState<BaseCharacter | null>(null);
  const [deletingAssetIds, setDeletingAssetIds] = useState<string[]>([]);

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
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm text-muted-foreground">已创建角色：{characters.length}</div>
        <div className="flex flex-wrap gap-2">
          <OpenInCreativeHubButton bindings={{}} label="角色库发往创作中枢" />
          <CharacterCreateDialog />
        </div>
      </div>

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

      <Card>
        <CardHeader>
          <CardTitle>角色列表</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {characters.map((character, index) => (
            <CharacterCard
              key={character.id}
              character={character}
              assets={assetsByCharacter.get(character.id) ?? []}
              assetsLoading={imageAssetQueries[index]?.isLoading}
              onGenerateImage={() => openImageDialog(character)}
              onSetPrimary={(assetId) => setPrimaryMutation.mutate(assetId)}
              onDeleteAsset={async (asset) => {
                setDeletingAssetIds((current) => current.includes(asset.id) ? current : [...current, asset.id]);
                try {
                  await deleteAssetMutation.mutateAsync(asset.id);
                } finally {
                  setDeletingAssetIds((current) => current.filter((id) => id !== asset.id));
                }
              }}
              onEdit={() => openEditDialog(character)}
              onDelete={() => handleDeleteCharacter(character)}
              settingPrimary={setPrimaryMutation.isPending}
              deletingAssetIds={deletingAssetIds}
              deleting={deleteMutation.isPending && deleteMutation.variables === character.id}
              extraActions={(
                <OpenInCreativeHubButton
                  bindings={{ baseCharacterId: character.id }}
                  label="带着角色继续"
                />
              )}
            />
          ))}
          {characters.length === 0 ? <div className="text-sm text-muted-foreground">暂无角色。</div> : null}
        </CardContent>
      </Card>
    </div>
  );
}
