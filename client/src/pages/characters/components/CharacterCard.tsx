import { useState, type ReactNode } from "react";
import type { ImageAsset } from "@ai-novel/shared/types/image";
import { resolveImageAssetUrl } from "@/api/images";
import type { BaseCharacter } from "@ai-novel/shared/types/novel";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface CharacterCardProps {
  character: BaseCharacter;
  assets: ImageAsset[];
  assetsLoading?: boolean;
  onGenerateImage: () => void;
  onSetPrimary: (assetId: string) => void;
  onEdit: () => void;
  onDelete: () => void;
  settingPrimary?: boolean;
  deleting?: boolean;
  extraActions?: ReactNode;
}

export function CharacterCard({
  character,
  assets,
  assetsLoading,
  onGenerateImage,
  onSetPrimary,
  onEdit,
  onDelete,
  settingPrimary,
  deleting,
  extraActions,
}: CharacterCardProps) {
  const [previewAsset, setPreviewAsset] = useState<ImageAsset | null>(null);

  return (
    <div className="space-y-3 rounded-md border p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-medium">{character.name}</div>
          <div className="text-sm text-muted-foreground">{character.role}</div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {extraActions}
          <Button size="sm" variant="outline" onClick={onGenerateImage}>
            生成形象图
          </Button>
          <Button size="sm" variant="outline" onClick={onEdit}>
            编辑
          </Button>
          <Button size="sm" variant="destructive" onClick={onDelete} disabled={deleting}>
            {deleting ? "删除中..." : "删除"}
          </Button>
        </div>
      </div>

      <div className="space-y-1 text-sm">
        <div><span className="text-muted-foreground">性格：</span>{character.personality || "暂无"}</div>
        <div><span className="text-muted-foreground">外貌/体态：</span>{character.appearance || "暂无"}</div>
        <div><span className="text-muted-foreground">弱点与代价：</span>{character.weaknesses || "暂无"}</div>
        <div><span className="text-muted-foreground">习惯与特长：</span>{character.interests || "暂无"}</div>
        <div><span className="text-muted-foreground">关键事件：</span>{character.keyEvents || "暂无"}</div>
      </div>

      <div className="space-y-2">
        <div className="text-sm font-medium">形象图库</div>
        {assetsLoading ? <div className="text-xs text-muted-foreground">加载中...</div> : null}
        {!assetsLoading && assets.length === 0 ? (
          <div className="text-xs text-muted-foreground">暂无图片，点击“生成形象图”创建。</div>
        ) : null}
        {assets.length > 0 ? (
          <div className="grid justify-items-start gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {assets.map((asset) => (
              <div key={asset.id} className="w-full max-w-[300px] space-y-2 rounded-md border p-2">
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
                <div className="text-[11px] leading-4 text-muted-foreground break-all">
                  存储方式：{asset.url.startsWith("/api/images/assets/") ? "已托管" : "远程链接"}
                </div>
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs text-muted-foreground">{asset.isPrimary ? "主图" : "候选图"}</div>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={asset.isPrimary || settingPrimary}
                    onClick={() => onSetPrimary(asset.id)}
                  >
                    设为主图
                  </Button>
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
        <DialogContent className="w-[96vw] max-w-[1000px]">
          <DialogHeader>
            <DialogTitle>{previewAsset ? `${character.name} - 图片预览` : "图片预览"}</DialogTitle>
          </DialogHeader>
          {previewAsset ? (
            <>
            <div className="flex max-h-[78vh] items-center justify-center overflow-auto rounded-md bg-muted/30 p-2">
              <img
                src={resolveImageAssetUrl(previewAsset.url)}
                alt={`${character.name}-预览图`}
                className="max-h-[72vh] w-auto max-w-full rounded-md object-contain"
              />
            </div>
              <div className="text-xs text-muted-foreground break-all">
                存储方式：{previewAsset.url.startsWith("/api/images/assets/") ? "已托管" : "远程链接"}
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
