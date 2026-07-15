import { useEffect, useMemo, useState } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import type { VisualAssetCatalogItem, VisualAssetSelection, VisualAssetSourceDomain } from "@ai-novel/shared/types/visualAsset";
import { Check, LoaderCircle, Search, SlidersHorizontal, X } from "lucide-react";
import { getVisualAsset, getVisualAssetFacets, listVisualAssets, visualAssetQueryKeys } from "@/api/visualAssets";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { VisualAssetDetails } from "./VisualAssetDetails";
import { VisualAssetGrid } from "./VisualAssetGrid";
import { getVisualAssetKindLabel, getVisualAssetSourceLabel } from "./visualAssetLibrary.labels";
import type { VisualAssetLibraryProps } from "./visualAssetLibrary.types";

const PAGE_SIZE = 30;

function useDebouncedValue(value: string, delay = 300) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => setDebouncedValue(value), delay);
    return () => window.clearTimeout(timeoutId);
  }, [delay, value]);

  return debouncedValue;
}

function asSelection(asset: VisualAssetCatalogItem): VisualAssetSelection | null {
  return asset.url.trim() ? asset : null;
}

function createSelectionMap(selection: readonly VisualAssetSelection[] | undefined) {
  return new Map((selection ?? []).filter((asset) => asset.url.trim()).map((asset) => [asset.assetId, asset]));
}

export function VisualAssetLibrary({
  scope,
  allowedKinds,
  selectionMode = "browse",
  initialSelection,
  onSelect,
  className,
}: VisualAssetLibraryProps) {
  const [searchInput, setSearchInput] = useState("");
  const [selectedKind, setSelectedKind] = useState<VisualAssetCatalogItem["kind"] | undefined>();
  const [selectedSource, setSelectedSource] = useState<VisualAssetSourceDomain | undefined>();
  const [selectedById, setSelectedById] = useState(() => createSelectionMap(initialSelection));
  const [detailAssetId, setDetailAssetId] = useState<string | null>(null);
  const debouncedQuery = useDebouncedValue(searchInput);
  const initialSelectionKey = initialSelection?.map((asset) => `${asset.assetId}:${asset.url}`).join("|") ?? "";
  const scopeKey = `${scope?.kind ?? "all"}:${scope?.id ?? "all"}`;
  const normalizedAllowedKinds = useMemo(
    () => Array.from(new Set(allowedKinds ?? [])).sort(),
    [allowedKinds],
  );

  useEffect(() => {
    setSelectedById(createSelectionMap(initialSelection));
    setDetailAssetId(null);
  }, [initialSelectionKey, scopeKey]);

  useEffect(() => {
    if (selectedKind && normalizedAllowedKinds.length && !normalizedAllowedKinds.includes(selectedKind)) {
      setSelectedKind(undefined);
    }
  }, [normalizedAllowedKinds, selectedKind]);

  const catalogRequest = useMemo(
    () => ({
      scope,
      allowedKinds: normalizedAllowedKinds.length ? normalizedAllowedKinds : undefined,
      kind: selectedKind,
      source: selectedSource,
      query: debouncedQuery,
      limit: PAGE_SIZE,
    }),
    [debouncedQuery, normalizedAllowedKinds, scope, selectedKind, selectedSource],
  );
  const facetRequest = useMemo(
    () => ({
      scope,
      allowedKinds: normalizedAllowedKinds.length ? normalizedAllowedKinds : undefined,
      query: debouncedQuery,
    }),
    [debouncedQuery, normalizedAllowedKinds, scope],
  );
  const catalogQuery = useInfiniteQuery({
    queryKey: visualAssetQueryKeys.catalog(catalogRequest),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => listVisualAssets({ ...catalogRequest, cursor: pageParam ?? undefined }),
    getNextPageParam: (lastPage) => lastPage.data?.nextCursor ?? undefined,
  });
  const facetsQuery = useQuery({
    queryKey: visualAssetQueryKeys.facets(facetRequest),
    queryFn: () => getVisualAssetFacets(facetRequest),
  });
  const detailQuery = useQuery({
    queryKey: visualAssetQueryKeys.detail(detailAssetId ?? ""),
    queryFn: () => getVisualAsset(detailAssetId!),
    enabled: Boolean(detailAssetId),
  });

  const items = useMemo(
    () => catalogQuery.data?.pages.flatMap((page) => page.data?.items ?? []) ?? [],
    [catalogQuery.data?.pages],
  );
  const itemsById = useMemo(() => new Map(items.map((asset) => [asset.assetId, asset])), [items]);
  const selectedIds = useMemo(() => new Set(selectedById.keys()), [selectedById]);
  const selectedItems = useMemo(() => Array.from(selectedById.values()), [selectedById]);
  const detailFallback = detailAssetId ? (itemsById.get(detailAssetId) ?? selectedById.get(detailAssetId) ?? null) : null;
  const detailAsset = detailQuery.data?.data ?? detailFallback;
  const kindFacets = facetsQuery.data?.data?.kinds ?? [];
  const sourceFacets = facetsQuery.data?.data?.sources ?? [];
  const total = catalogQuery.data?.pages[0]?.data?.total;
  const hasActiveFilters = Boolean(searchInput.trim() || selectedKind || selectedSource);

  const updateSelection = (asset: VisualAssetCatalogItem) => {
    setDetailAssetId(asset.assetId);
    if (selectionMode === "browse") {
      return;
    }

    const selection = asSelection(asset);
    if (!selection) {
      return;
    }
    setSelectedById((current) => {
      const next = new Map(current);
      if (selectionMode === "single") {
        if (next.has(asset.assetId)) {
          next.clear();
        } else {
          next.clear();
          next.set(asset.assetId, selection);
        }
      } else if (next.has(asset.assetId)) {
        next.delete(asset.assetId);
      } else {
        next.set(asset.assetId, selection);
      }
      return next;
    });
  };

  const openDetails = (asset: VisualAssetCatalogItem) => setDetailAssetId(asset.assetId);
  const clearFilters = () => {
    setSearchInput("");
    setSelectedKind(undefined);
    setSelectedSource(undefined);
  };

  return (
    <section className={cn("flex h-full min-h-0 flex-col bg-background", className)} aria-label="视觉资源库">
      <div className="shrink-0 border-b px-5 py-3.5">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
          <label className="relative block min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="搜索素材名称、描述或提示词"
              className="h-10 bg-background pl-9"
              aria-label="搜索视觉素材"
            />
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <FilterGroup label="类型" icon={<SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />}>
              <FilterButton active={!selectedKind} onClick={() => setSelectedKind(undefined)}>全部</FilterButton>
              {kindFacets.map((facet) => (
                <FilterButton key={facet.value} active={selectedKind === facet.value} onClick={() => setSelectedKind(facet.value)}>
                  {getVisualAssetKindLabel(facet.value)} <span className="text-muted-foreground">{facet.count}</span>
                </FilterButton>
              ))}
            </FilterGroup>
            <FilterGroup label="来源">
              <FilterButton active={!selectedSource} onClick={() => setSelectedSource(undefined)}>全部</FilterButton>
              {sourceFacets.map((facet) => (
                <FilterButton key={facet.value} active={selectedSource === facet.value} onClick={() => setSelectedSource(facet.value)}>
                  {getVisualAssetSourceLabel(facet.value)} <span className="text-muted-foreground">{facet.count}</span>
                </FilterButton>
              ))}
            </FilterGroup>
          </div>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1 overflow-y-auto">
          <div className="flex items-center justify-between gap-3 px-5 py-3 text-sm text-muted-foreground">
            <span>{typeof total === "number" ? `找到 ${total} 项素材` : "正在准备素材"}</span>
            {hasActiveFilters ? (
              <Button type="button" variant="ghost" size="sm" className="h-8 px-2" onClick={clearFilters}>
                <X className="h-3.5 w-3.5" aria-hidden="true" />
                清除筛选
              </Button>
            ) : null}
          </div>
          <div className="px-5 pb-5">
            {catalogQuery.isLoading ? <VisualAssetGridLoading /> : null}
            {catalogQuery.isError ? (
              <InlineState
                title="暂时无法加载视觉素材"
                description="请检查连接后重新加载。"
                actionLabel="重新加载"
                onAction={() => void catalogQuery.refetch()}
              />
            ) : null}
            {!catalogQuery.isLoading && !catalogQuery.isError && items.length === 0 ? (
              <InlineState
                title="没有找到匹配的视觉素材"
                description={hasActiveFilters ? "调整搜索或筛选条件后继续查看。" : "完成图片创作后，素材会显示在这里。"}
                actionLabel={hasActiveFilters ? "清除筛选" : undefined}
                onAction={hasActiveFilters ? clearFilters : undefined}
              />
            ) : null}
            {items.length ? (
              <>
                <VisualAssetGrid
                  items={items}
                  selectedIds={selectedIds}
                  selectionMode={selectionMode}
                  onSelect={updateSelection}
                  onOpenDetails={openDetails}
                />
                {catalogQuery.hasNextPage ? (
                  <div className="flex justify-center pt-5">
                    <Button type="button" variant="outline" disabled={catalogQuery.isFetchingNextPage} onClick={() => void catalogQuery.fetchNextPage()}>
                      {catalogQuery.isFetchingNextPage ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
                      {catalogQuery.isFetchingNextPage ? "正在加载" : "加载更多"}
                    </Button>
                  </div>
                ) : null}
              </>
            ) : null}
          </div>
        </div>
        {detailAssetId ? (
          <VisualAssetDetails
            asset={detailAsset}
            isLoading={detailQuery.isLoading}
            isError={detailQuery.isError}
            onClose={() => setDetailAssetId(null)}
            onRetry={() => void detailQuery.refetch()}
          />
        ) : null}
      </div>

      {selectionMode !== "browse" ? (
        <div className="flex shrink-0 flex-col gap-3 border-t bg-background px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-muted-foreground">
            已选择 <span className="font-medium text-foreground">{selectedItems.length}</span> 项素材
          </div>
          <div className="flex items-center justify-end gap-2">
            {selectedItems.length ? (
              <Button type="button" variant="ghost" size="sm" onClick={() => setSelectedById(new Map())}>清空选择</Button>
            ) : null}
            <Button type="button" disabled={!selectedItems.length || !onSelect} onClick={() => onSelect?.(selectedItems)}>
              <Check className="h-4 w-4" aria-hidden="true" />
              使用已选素材
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function FilterGroup({ label, icon, children }: { label: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex max-w-full items-center gap-1 overflow-x-auto rounded-md border bg-muted/[0.18] p-1" aria-label={`${label}筛选`}>
      <span className="inline-flex shrink-0 items-center gap-1 px-2 text-xs text-muted-foreground">{icon}{label}</span>
      {children}
    </div>
  );
}

function FilterButton({ active, children, onClick }: { active: boolean; children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      className={cn("shrink-0 rounded px-2 py-1 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
      onClick={onClick}
      aria-pressed={active}
    >
      {children}
    </button>
  );
}

function VisualAssetGridLoading() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5" aria-label="正在加载视觉素材">
      {Array.from({ length: 10 }, (_, index) => (
        <div key={index} className="overflow-hidden rounded-md border">
          <div className="aspect-[4/3] animate-pulse bg-muted" />
          <div className="space-y-2 p-3"><div className="h-4 w-3/4 animate-pulse rounded bg-muted" /><div className="h-3 w-1/2 animate-pulse rounded bg-muted" /></div>
        </div>
      ))}
    </div>
  );
}

function InlineState({ title, description, actionLabel, onAction }: { title: string; description: string; actionLabel?: string; onAction?: () => void }) {
  return (
    <div className="py-20 text-center">
      <div className="text-sm font-medium text-foreground">{title}</div>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      {actionLabel && onAction ? <Button type="button" size="sm" variant="outline" className="mt-4" onClick={onAction}>{actionLabel}</Button> : null}
    </div>
  );
}
