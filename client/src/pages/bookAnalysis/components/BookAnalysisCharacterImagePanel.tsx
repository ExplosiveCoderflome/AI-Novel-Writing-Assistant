import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { BookAnalysisCharacter } from "@ai-novel/shared/types/bookAnalysisCharacter";
import type { ImageAsset } from "@ai-novel/shared/types/image";
import {
  deleteBookAnalysisCharacterImage,
  generateBookAnalysisCharacterImage,
  listBookAnalysisCharacterImages,
  prepareBookAnalysisCharacterImage,
  promoteBookAnalysisCharacter,
  setPrimaryBookAnalysisCharacterImage,
} from "@/api/bookAnalysis";
import { getImageTask, resolveImageAssetUrl } from "@/api/images";
import { queryKeys } from "@/api/queryKeys";
import { ImageGenerationConfirmDialog } from "@/components/image/ImageGenerationConfirmDialog";
import { useImageGenerationFlow } from "@/components/image/useImageGenerationFlow";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AppDialogContent, Dialog } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";

const IMAGE_STATUS_TEXT: Record<string, string> = {
  queued: "排队中",
  running: "生成中",
  succeeded: "生成成功",
  failed: "生成失败",
  cancelled: "已取消",
};

interface BookAnalysisCharacterImagePanelProps {
  analysisId: string;
  character: BookAnalysisCharacter;
  disabled: boolean;
}

export default function BookAnalysisCharacterImagePanel({
  analysisId,
  character,
  disabled,
}: BookAnalysisCharacterImagePanelProps) {
  const queryClient = useQueryClient();
  const flow = useImageGenerationFlow();
  const [activeTaskId, setActiveTaskId] = useState("");
  const [promoteOpen, setPromoteOpen] = useState(false);
  const [includePrimaryImage, setIncludePrimaryImage] = useState(true);

  const assetsQuery = useQuery({
    queryKey: queryKeys.images.assets("book_analysis_character", character.id),
    queryFn: () => listBookAnalysisCharacterImages(analysisId, character.id),
  });
  const assets = assetsQuery.data?.data ?? [];
  const primaryAsset = useMemo(() => assets.find((item) => item.isPrimary) ?? assets[0] ?? null, [assets]);

  const taskQuery = useQuery({
    queryKey: queryKeys.images.task(activeTaskId || "none"),
    queryFn: () => getImageTask(activeTaskId),
    enabled: Boolean(activeTaskId),
    refetchInterval: (query) => {
      const status = query.state.data?.data?.status;
      return status === "queued" || status === "running" ? 1500 : false;
    },
  });

  useEffect(() => {
    const task = taskQuery.data?.data;
    if (!task || !activeTaskId) {
      return;
    }
    if (task.status === "queued" || task.status === "running") {
      return;
    }
    void queryClient.invalidateQueries({ queryKey: queryKeys.images.assets("book_analysis_character", character.id) });
    setActiveTaskId("");
  }, [activeTaskId, character.id, queryClient, taskQuery.data?.data]);

  const setPrimaryMutation = useMutation({
    mutationFn: (assetId: string) => setPrimaryBookAnalysisCharacterImage(analysisId, character.id, assetId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.images.assets("book_analysis_character", character.id) });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (asset: ImageAsset) => deleteBookAnalysisCharacterImage(analysisId, character.id, asset.id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.images.assets("book_analysis_character", character.id) });
    },
  });

  const promoteMutation = useMutation({
    mutationFn: () => promoteBookAnalysisCharacter(analysisId, character.id, { includePrimaryImage }),
    onSuccess: async (response) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.baseCharacters.all });
      setPromoteOpen(false);
      toast.success(response.data?.baseCharacter.name ? `已加入角色库：${response.data.baseCharacter.name}` : "已加入角色库。");
    },
  });

  const startGenerate = () => {
    void flow.start({
      prepare: async () => (await prepareBookAnalysisCharacterImage(analysisId, character.id)).data!,
      generate: async (overrides) => {
        const response = await generateBookAnalysisCharacterImage(analysisId, character.id, {
          count: 2,
          stylePreset: "写实角色设定图",
          overrides,
        });
        if (response.data?.id) {
          setActiveTaskId(response.data.id);
        }
        return response;
      },
    });
  };

  const activeTask = taskQuery.data?.data;

  return (
    <div className="mt-3 space-y-3 rounded-md border bg-muted/10 p-3">
      <ImageGenerationConfirmDialog {...flow.dialogProps} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">形象图</span>
          <Badge variant="outline">{assets.length} 张</Badge>
          {primaryAsset ? <Badge variant="secondary">已设主图</Badge> : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={startGenerate} disabled={disabled || Boolean(activeTaskId)}>
            生成形象图
          </Button>
          <Button size="sm" variant="outline" onClick={() => setPromoteOpen(true)} disabled={disabled || promoteMutation.isPending}>
            加入角色库
          </Button>
        </div>
      </div>

      {activeTask ? (
        <div className="rounded-md border bg-background p-2 text-xs text-muted-foreground">
          当前任务：{IMAGE_STATUS_TEXT[activeTask.status] ?? activeTask.status}
          {activeTask.error ? <span className="ml-2 text-destructive">{activeTask.error}</span> : null}
        </div>
      ) : null}

      {assetsQuery.isLoading ? <div className="text-xs text-muted-foreground">正在读取形象图。</div> : null}
      {!assetsQuery.isLoading && assets.length === 0 ? (
        <div className="text-xs text-muted-foreground">可生成一张角色形象图，再决定是否加入角色库。</div>
      ) : null}
      {assets.length > 0 ? (
        <div className="grid gap-2 sm:grid-cols-2">
          {assets.map((asset) => (
            <div key={asset.id} className="space-y-2 rounded-md border bg-background p-2">
              <img
                src={resolveImageAssetUrl(asset.url)}
                alt={`${character.name}-形象图`}
                className="aspect-square w-full rounded-md object-cover"
                loading="lazy"
              />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground">{asset.isPrimary ? "主图" : "候选图"}</span>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setPrimaryMutation.mutate(asset.id)}
                    disabled={asset.isPrimary || setPrimaryMutation.isPending}
                  >
                    设主图
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      if (window.confirm("确认删除这张形象图？")) {
                        deleteMutation.mutate(asset);
                      }
                    }}
                    disabled={deleteMutation.isPending && deleteMutation.variables?.id === asset.id}
                  >
                    删除
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      <Dialog open={promoteOpen} onOpenChange={setPromoteOpen}>
        <AppDialogContent
          title={`加入角色库：${character.name}`}
          bodyClassName="space-y-3"
          footer={(
            <>
              <Button type="button" variant="outline" onClick={() => setPromoteOpen(false)} disabled={promoteMutation.isPending}>
                取消
              </Button>
              <Button type="button" onClick={() => promoteMutation.mutate()} disabled={promoteMutation.isPending}>
                {promoteMutation.isPending ? "加入中..." : "确认加入"}
              </Button>
            </>
          )}
        >
          <div className="text-sm text-muted-foreground">
            会把该角色的人物字段复制到角色库；拆书证据和场景记录仍保留在拆书档案中。
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={includePrimaryImage}
              onChange={(event) => setIncludePrimaryImage(event.target.checked)}
            />
            <span>同时把主图加入角色库</span>
          </label>
          {promoteMutation.error ? (
            <div className="text-sm text-destructive">
              {promoteMutation.error instanceof Error ? promoteMutation.error.message : "加入角色库失败。"}
            </div>
          ) : null}
        </AppDialogContent>
      </Dialog>
    </div>
  );
}
