import type { VisualAssetCatalogItem } from "@ai-novel/shared/types/visualAsset";
import { Check, ImageOff, Info } from "lucide-react";
import { resolveImageAssetUrl } from "@/api/images";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatVisualAssetDate, getVisualAssetKindLabel } from "./visualAssetLibrary.labels";
import type { VisualAssetSelectionMode } from "./visualAssetLibrary.types";

interface VisualAssetGridProps {
  items: VisualAssetCatalogItem[];
  selectedIds: ReadonlySet<string>;
  selectionMode: VisualAssetSelectionMode;
  onSelect: (asset: VisualAssetCatalogItem) => void;
  onOpenDetails: (asset: VisualAssetCatalogItem) => void;
}

export function VisualAssetGrid({ items, selectedIds, selectionMode, onSelect, onOpenDetails }: VisualAssetGridProps) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
      {items.map((asset) => {
        const isSelected = selectedIds.has(asset.assetId);
        const canSelect = selectionMode !== "browse" && Boolean(asset.url.trim());
        const sourceLabel = asset.source.label || getVisualAssetKindLabel(asset.kind);

        return (
          <div
            key={asset.assetId}
            className={cn(
              "group relative min-w-0 overflow-hidden rounded-md border bg-background transition-colors",
              isSelected ? "border-primary ring-1 ring-primary/35" : "border-border/70 hover:border-foreground/35",
            )}
          >
            <button
              type="button"
              aria-pressed={selectionMode === "browse" ? undefined : isSelected}
              aria-label={canSelect ? `选择${sourceLabel}` : `查看${sourceLabel}`}
              className="block w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
              onClick={() => onSelect(asset)}
            >
              <div className="relative aspect-[4/3] overflow-hidden bg-muted">
                {asset.thumbnailUrl ? (
                  <img
                    src={resolveImageAssetUrl(asset.thumbnailUrl)}
                    alt={sourceLabel}
                    className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.02]"
                    loading="lazy"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-muted-foreground">
                    <ImageOff className="h-5 w-5" aria-hidden="true" />
                  </div>
                )}
                {isSelected ? (
                  <span className="absolute left-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground">
                    <Check className="h-3.5 w-3.5" aria-hidden="true" />
                    <span className="sr-only">已选择</span>
                  </span>
                ) : null}
              </div>
              <div className="min-w-0 px-3 py-2.5">
                <div className="truncate text-sm font-medium text-foreground">{sourceLabel}</div>
                <div className="mt-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span className="truncate">{getVisualAssetKindLabel(asset.kind)}</span>
                  <span className="shrink-0">{formatVisualAssetDate(asset.createdAt)}</span>
                </div>
              </div>
            </button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute right-1.5 top-1.5 h-7 w-7 bg-background/80 opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
              aria-label={`查看${sourceLabel}详情`}
              onClick={() => onOpenDetails(asset)}
            >
              <Info className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
          </div>
        );
      })}
    </div>
  );
}
