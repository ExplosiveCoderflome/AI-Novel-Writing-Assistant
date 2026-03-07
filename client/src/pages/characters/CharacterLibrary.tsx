import { useMemo, useState } from "react";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ImageAsset } from "@ai-novel/shared/types/image";
import type { BaseCharacter } from "@ai-novel/shared/types/novel";
import { getBaseCharacterList } from "@/api/character";
import { listImageAssets, setPrimaryImageAsset } from "@/api/images";
import { queryKeys } from "@/api/queryKeys";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CharacterCard } from "./components/CharacterCard";
import { CharacterCreateDialog } from "./components/CharacterCreateDialog";
import { CharacterImageDialog } from "./components/CharacterImageDialog";

export default function CharacterLibrary() {
  const queryClient = useQueryClient();
  const [imageDialogOpen, setImageDialogOpen] = useState(false);
  const [selectedImageCharacter, setSelectedImageCharacter] = useState<BaseCharacter | null>(null);

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

  const handleTaskCompleted = async (baseCharacterId: string) => {
    await queryClient.invalidateQueries({
      queryKey: queryKeys.images.assets("character", baseCharacterId),
    });
  };

  const openImageDialog = (character: BaseCharacter) => {
    setSelectedImageCharacter(character);
    setImageDialogOpen(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm text-muted-foreground">已创建角色：{characters.length}</div>
        <CharacterCreateDialog />
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
              settingPrimary={setPrimaryMutation.isPending}
            />
          ))}
          {characters.length === 0 ? <div className="text-sm text-muted-foreground">暂无角色。</div> : null}
        </CardContent>
      </Card>
    </div>
  );
}
