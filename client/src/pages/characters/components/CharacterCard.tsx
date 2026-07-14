import { useState, type ReactNode } from "react";
import type { ImageAsset } from "@ai-novel/shared/types/image";
import { resolveImageAssetUrl } from "@/api/images";
import type { BaseCharacter } from "@ai-novel/shared/types/novel";
import { MessageCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AppDialogContent, Dialog } from "@/components/ui/dialog";

interface CharacterCardProps {
  character: BaseCharacter;
  assets: ImageAsset[];
  assetsLoading?: boolean;
  onGenerateImage: () => void;
  onSetPrimary: (assetId: string) => void;
  onDeleteAsset: (asset: ImageAsset) => Promise<void>;
  onEdit: () => void;
  onDelete: () => void;
  onConversation: () => void;
  settingPrimary?: boolean;
  deletingAssetId?: string | null;
  deleting?: boolean;
  extraActions?: ReactNode;
}

export function CharacterCard({
  character,
  assets,
  assetsLoading,
  onGenerateImage,
  onSetPrimary,
  onDeleteAsset,
  onEdit,
  onDelete,
  onConversation,
  settingPrimary,
  deletingAssetId,
  deleting,
  extraActions,
}: CharacterCardProps) {
  const [previewAsset, setPreviewAsset] = useState<ImageAsset | null>(null);

  const handleDeleteAsset = async (asset: ImageAsset) => {
    const confirmed = window.confirm("确认删除这张形象图？此操作不可恢复。");
    if (!confirmed) {
      return;
    }
    try {
      await onDeleteAsset(asset);
      setPreviewAsset((current) => (current?.id === asset.id ? null : current));
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "删除图片失败，请稍后重试。");
    }
  };

  return (
    <article className="overflow-hidden rounded-md border border-border/80 bg-background">
      <div className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold text-foreground">{character.name}</h3>
            <Badge variant="secondary">{character.role || "未设置定位"}</Badge>
            {character.category && character.category !== character.role ? (
              <Badge variant="outline">{character.category}</Badge>
            ) : null}
          </div>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
            {character.personality || "还没有性格说明，可以先补充角色面对压力时会如何选择。"}
          </p>
        </div>
        <div className="mobile-full-actions flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
          {extraActions}
          <Button size="sm" variant="outline" onClick={onConversation}>
            <MessageCircle className="mr-1.5 h-3.5 w-3.5" />与角色交谈
          </Button>
          <Button size="sm" variant="outline" onClick={onGenerateImage}>
            生成形象图
          </Button>
          <Button size="sm" variant="outline" onClick={onEdit}>
            编辑
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive hover:text-destructive"
            onClick={onDelete}
            disabled={deleting}
          >
            {deleting ? "删除中..." : "删除"}
          </Button>
        </div>
      </div>

      <div className="grid gap-px border-y border-border/70 bg-border/70 sm:grid-cols-2 xl:grid-cols-3">
        <CharacterFact label="背景与来处" value={character.background} />
        <CharacterFact label="成长方向" value={character.development} />
        <CharacterFact label="弱点与代价" value={character.weaknesses} />
        <CharacterFact label="外貌与体态" value={character.appearance} />
        <CharacterFact label="习惯与特长" value={character.interests} />
        <CharacterFact label="关键经历" value={character.keyEvents} />
      </div>

      <div className="space-y-3 px-4 py-4">
        <div>
          <div className="text-sm font-semibold text-foreground">角色形象</div>
          <div className="mt-1 text-xs text-muted-foreground">保存主形象后，可在后续视觉生成中保持角色识别度。</div>
        </div>
        {assetsLoading ? <div className="text-xs text-muted-foreground">加载中...</div> : null}
        {!assetsLoading && assets.length === 0 ? (
          <div className="text-xs text-muted-foreground">暂无图片，点击“生成形象图”创建。</div>
        ) : null}
        {assets.length > 0 ? (
          <div className="grid justify-items-start gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {assets.map((asset) => (
              <div key={asset.id} className="w-full max-w-[300px] space-y-2 rounded-md border border-border/80 p-2">
                <button
                  type="button"
                  className="block aspect-square w-full overflow-hidden rounded-md bg-muted"
                  onClick={() => setPreviewAsset(asset)}
                  title="点击预览"
                >
                  <img
                    src={resolveImageAssetUrl(asset.url)}
                    alt={`${character.name}-形象图`}
                    className="h-full w-full object-cover transition-transform duration-200 hover:scale-[1.02]"
                    loading="lazy"
                  />
                </button>
                <details className="text-[11px] leading-4 text-muted-foreground">
                  <summary className="cursor-pointer select-none">文件详情</summary>
                  <div className="mt-1 break-all">本地路径：{asset.localPath ?? "未落地本地文件"}</div>
                </details>
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs text-muted-foreground">{asset.isPrimary ? "主图" : "候选图"}</div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={asset.isPrimary || settingPrimary || deletingAssetId === asset.id}
                      onClick={() => onSetPrimary(asset.id)}
                    >
                      设为主图
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      disabled={deletingAssetId === asset.id}
                      onClick={() => void handleDeleteAsset(asset)}
                    >
                      {deletingAssetId === asset.id ? "删除中..." : "删除"}
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <Dialog
        open={Boolean(previewAsset)}
        onOpenChange={(open) => {
          if (!open) {
            setPreviewAsset(null);
          }
        }}
      >
        <AppDialogContent
          className="max-w-[1000px]"
          title={previewAsset ? `${character.name} - 图片预览` : "图片预览"}
          bodyClassName="space-y-3"
          footer={previewAsset ? (
            <>
              <Button
                type="button"
                variant="outline"
                disabled={previewAsset.isPrimary || settingPrimary || deletingAssetId === previewAsset.id}
                onClick={() => onSetPrimary(previewAsset.id)}
              >
                设为主图
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={deletingAssetId === previewAsset.id}
                onClick={() => void handleDeleteAsset(previewAsset)}
              >
                {deletingAssetId === previewAsset.id ? "删除中..." : "删除图片"}
              </Button>
            </>
          ) : null}
          footerClassName="gap-2"
        >
          {previewAsset ? (
            <>
              <div className="flex max-h-[70vh] items-center justify-center overflow-auto rounded-md bg-muted/30 p-2">
                <img
                  src={resolveImageAssetUrl(previewAsset.url)}
                  alt={`${character.name}-预览图`}
                  className="max-h-[66vh] w-auto max-w-full rounded-md object-contain"
                />
              </div>
              {previewAsset.localPath ? (
                <div className="text-xs text-muted-foreground break-all">
                  本地路径：{previewAsset.localPath}
                </div>
              ) : null}
            </>
          ) : null}
        </AppDialogContent>
      </Dialog>
    </article>
  );
}

function CharacterFact(props: { label: string; value?: string | null }) {
  return (
    <div className="min-w-0 bg-background px-4 py-3">
      <div className="text-xs font-medium text-muted-foreground">{props.label}</div>
      <div className="mt-1 line-clamp-3 text-sm leading-6 text-foreground">
        {props.value?.trim() || "待补充"}
      </div>
    </div>
  );
}
