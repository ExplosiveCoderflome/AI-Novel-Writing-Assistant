import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  BookAnalysisCharacter,
  BookAnalysisCharacterAppearanceScanJob,
} from "@ai-novel/shared/types/bookAnalysisCharacter";
import {
  generateBookAnalysisCharacterAppearanceImage,
  getBookAnalysisCharacterAppearance,
  getBookAnalysisCharacterAppearanceScanJob,
  listBookAnalysisCharacterImages,
  listBookAnalysisCharacterAppearanceTerms,
  mergeBookAnalysisCharacterAppearanceTerms,
  prepareBookAnalysisCharacterAppearanceImage,
  scanBookAnalysisCharacterAppearance,
  updateBookAnalysisCharacterAppearanceTerm,
} from "@/api/bookAnalysis";
import { getImageTask, resolveImageAssetUrl } from "@/api/images";
import { queryKeys } from "@/api/queryKeys";
import { ImageGenerationConfirmDialog } from "@/components/image/ImageGenerationConfirmDialog";
import { useImageGenerationFlow } from "@/components/image/useImageGenerationFlow";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface BookAnalysisCharacterAppearancePanelProps {
  analysisId: string;
  character: BookAnalysisCharacter;
  disabled: boolean;
}

const COVERAGE_MARKS = [25, 50, 75, 100];
const SNAPSHOT_PAGE_SIZE = 12;
const IMAGE_STATUS_TEXT: Record<string, string> = {
  queued: "排队中",
  running: "生成中",
  succeeded: "生成成功",
  failed: "生成失败",
  cancelled: "已取消",
};

function formatJsonSummary(value: Record<string, unknown> | null | undefined): string {
  if (!value || Object.keys(value).length === 0) {
    return "暂无稳定特征";
  }
  return Object.entries(value)
    .slice(0, 6)
    .map(([key, item]) => `${key}：${typeof item === "string" ? item : JSON.stringify(item)}`)
    .join("；");
}

export default function BookAnalysisCharacterAppearancePanel({
  analysisId,
  character,
  disabled,
}: BookAnalysisCharacterAppearancePanelProps) {
  const queryClient = useQueryClient();
  const flow = useImageGenerationFlow();
  const [targetPercent, setTargetPercent] = useState(25);
  const [activeTaskId, setActiveTaskId] = useState("");
  const [activeScanJobId, setActiveScanJobId] = useState("");
  const [lastScanJob, setLastScanJob] = useState<BookAnalysisCharacterAppearanceScanJob | null>(null);
  const [selectedTermIds, setSelectedTermIds] = useState<string[]>([]);
  const [selectedReferenceAssetIds, setSelectedReferenceAssetIds] = useState<string[]>([]);
  const [showAllSnapshots, setShowAllSnapshots] = useState(false);
  const [snapshotPage, setSnapshotPage] = useState(0);
  const referenceInitializedForCharacter = useRef("");
  const queryKey = ["book-analysis-character-appearance", analysisId, character.id];
  const termsQueryKey = ["book-analysis-character-appearance-terms", analysisId, character.id, "pending"];
  const appearanceQuery = useQuery({
    queryKey,
    queryFn: () => getBookAnalysisCharacterAppearance(analysisId, character.id),
    refetchInterval: activeScanJobId ? 2500 : false,
  });
  const appearance = appearanceQuery.data?.data ?? character.appearance ?? null;
  const meaningfulSnapshots = useMemo(
    () => (appearance?.snapshots ?? []).filter((snapshot) => (
      snapshot.manuallyEdited
      || snapshot.evidence.length > 0
      || Boolean(snapshot.summaryCaption?.trim())
      || snapshot.images.some((image) => Boolean(image.imageAsset))
    )),
    [appearance],
  );
  const snapshotPool = showAllSnapshots ? appearance?.snapshots ?? [] : meaningfulSnapshots;
  const snapshotPageCount = Math.max(1, Math.ceil(snapshotPool.length / SNAPSHOT_PAGE_SIZE));
  const currentSnapshotPage = Math.min(snapshotPage, snapshotPageCount - 1);
  const visibleSnapshots = snapshotPool.slice(
    currentSnapshotPage * SNAPSHOT_PAGE_SIZE,
    (currentSnapshotPage + 1) * SNAPSHOT_PAGE_SIZE,
  );
  const termsQuery = useQuery({
    queryKey: termsQueryKey,
    queryFn: () => listBookAnalysisCharacterAppearanceTerms(analysisId, character.id, "pending"),
  });
  const pendingTerms = termsQuery.data?.data ?? [];
  const characterImagesQuery = useQuery({
    queryKey: ["book-analysis-character-images", analysisId, character.id],
    queryFn: () => listBookAnalysisCharacterImages(analysisId, character.id),
  });
  const characterImages = characterImagesQuery.data?.data ?? [];

  const scanMutation = useMutation({
    mutationFn: () => scanBookAnalysisCharacterAppearance(analysisId, character.id, { targetPercent }),
    onSuccess: async (response) => {
      if (response.data?.jobId) {
        setLastScanJob(null);
        setActiveScanJobId(response.data.jobId);
      }
      await queryClient.invalidateQueries({ queryKey });
      await queryClient.invalidateQueries({ queryKey: termsQueryKey });
      await queryClient.invalidateQueries({ queryKey: queryKeys.bookAnalysis.characters(analysisId) });
    },
  });

  const mergeTermsMutation = useMutation({
    mutationFn: () => mergeBookAnalysisCharacterAppearanceTerms(analysisId, character.id, { termIds: selectedTermIds }),
    onSuccess: async () => {
      setSelectedTermIds([]);
      await queryClient.invalidateQueries({ queryKey });
      await queryClient.invalidateQueries({ queryKey: termsQueryKey });
      await queryClient.invalidateQueries({ queryKey: queryKeys.bookAnalysis.characters(analysisId) });
    },
  });

  const rejectTermMutation = useMutation({
    mutationFn: (termId: string) =>
      updateBookAnalysisCharacterAppearanceTerm(analysisId, character.id, termId, { status: "rejected" }),
    onSuccess: async () => {
      setSelectedTermIds((current) => current.filter((id) => pendingTerms.some((term) => term.id === id)));
      await queryClient.invalidateQueries({ queryKey: termsQueryKey });
    },
  });

  const scanJobQuery = useQuery({
    queryKey: ["book-analysis-character-appearance-scan-job", analysisId, character.id, activeScanJobId || "none"],
    queryFn: () => getBookAnalysisCharacterAppearanceScanJob(analysisId, character.id, activeScanJobId),
    enabled: Boolean(activeScanJobId),
    refetchInterval: (query) => {
      const status = query.state.data?.data?.status;
      return status === "queued" || status === "running" ? 2000 : false;
    },
    retry: 1,
  });
  const scanJob = scanJobQuery.data?.data;
  const scanActive = scanMutation.isPending
    || Boolean(activeScanJobId && (!scanJob || scanJob.status === "queued" || scanJob.status === "running"));

  useEffect(() => {
    if (!scanJob || !activeScanJobId) {
      return;
    }
    if (scanJob.status === "queued" || scanJob.status === "running") {
      return;
    }
    void queryClient.invalidateQueries({ queryKey });
    void queryClient.invalidateQueries({ queryKey: queryKeys.bookAnalysis.characters(analysisId) });
    setLastScanJob(scanJob);
    setActiveScanJobId("");
  }, [activeScanJobId, analysisId, queryClient, queryKey, scanJob]);

  useEffect(() => {
    const available = new Set(pendingTerms.map((term) => term.id));
    setSelectedTermIds((current) => current.filter((id) => available.has(id)));
  }, [pendingTerms]);

  useEffect(() => {
    const key = `${analysisId}:${character.id}`;
    if (referenceInitializedForCharacter.current === key) {
      return;
    }
    if (characterImages.length === 0) {
      setSelectedReferenceAssetIds([]);
      return;
    }
    const primary = characterImages.find((image) => image.isPrimary) ?? characterImages[0];
    setSelectedReferenceAssetIds(primary ? [primary.id] : []);
    referenceInitializedForCharacter.current = key;
  }, [analysisId, character.id, characterImages]);

  useEffect(() => {
    setSnapshotPage(0);
  }, [character.id, showAllSnapshots]);

  const taskQuery = useQuery({
    queryKey: queryKeys.images.task(activeTaskId || "none"),
    queryFn: () => getImageTask(activeTaskId),
    enabled: Boolean(activeTaskId),
    refetchInterval: (query) => {
      const status = query.state.data?.data?.status;
      return status === "queued" || status === "running" ? 1500 : false;
    },
  });
  const activeTask = taskQuery.data?.data;

  useEffect(() => {
    if (!activeTask || !activeTaskId) {
      return;
    }
    if (activeTask.status === "queued" || activeTask.status === "running") {
      return;
    }
    void queryClient.invalidateQueries({ queryKey });
    void queryClient.invalidateQueries({ queryKey: queryKeys.bookAnalysis.characters(analysisId) });
    setActiveTaskId("");
  }, [activeTask, activeTaskId, analysisId, queryClient, queryKey]);

  const startGenerateSnapshotImage = (snapshotId: string) => {
    void flow.start({
      prepare: async () => (await prepareBookAnalysisCharacterAppearanceImage(analysisId, character.id, snapshotId, {
        referenceImageAssetIds: selectedReferenceAssetIds,
      })).data!,
      generate: async (overrides) => {
        const response = await generateBookAnalysisCharacterAppearanceImage(analysisId, character.id, snapshotId, {
          count: 2,
          stylePreset: "同一角色章节形象演变图",
          referenceImageAssetIds: selectedReferenceAssetIds,
          overrides,
        });
        if (response.data?.id) {
          setActiveTaskId(response.data.id);
        }
        return response;
      },
    });
  };

  const toggleTerm = (termId: string, checked: boolean) => {
    setSelectedTermIds((current) =>
      checked ? Array.from(new Set([...current, termId])) : current.filter((id) => id !== termId),
    );
  };

  const toggleReferenceAsset = (assetId: string, checked: boolean) => {
    setSelectedReferenceAssetIds((current) =>
      checked ? Array.from(new Set([...current, assetId])) : current.filter((id) => id !== assetId),
    );
  };

  const currentAppearance = character.profile.appearance?.trim() || "";

  return (
    <div className="mt-3 space-y-3 rounded-md border bg-muted/10 p-3">
      <ImageGenerationConfirmDialog {...flow.dialogProps} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">形象演变</span>
          <Badge variant="outline">{appearance?.coveragePercent ?? 0}%</Badge>
          <Badge variant="secondary">{appearance?.snapshots.length ?? 0} 个章节快照</Badge>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => scanMutation.mutate()}
          disabled={disabled || scanActive}
        >
          {scanActive ? "扫描中..." : "增量扫描"}
        </Button>
      </div>

      <div className="rounded-md border bg-background p-2 text-sm">
        <div className="text-xs text-muted-foreground">当前外貌</div>
        <div className="mt-1 whitespace-pre-wrap">{currentAppearance || "暂无外貌描述"}</div>
      </div>

      {characterImages.length > 0 ? (
        <div className="rounded-md border bg-background p-2 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-xs text-muted-foreground">基础形象参考</div>
              <div className="mt-1 text-sm">生成章节形象图时保持同一角色的脸型、发型和标志细节。</div>
            </div>
            <Badge variant="outline">{selectedReferenceAssetIds.length} 张参考图</Badge>
          </div>
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            {characterImages.map((image) => (
              <label
                key={image.id}
                className="flex cursor-pointer items-center gap-2 rounded-md border p-2 text-xs"
              >
                <input
                  type="checkbox"
                  checked={selectedReferenceAssetIds.includes(image.id)}
                  onChange={(event) => toggleReferenceAsset(image.id, event.target.checked)}
                  disabled={disabled || Boolean(activeTaskId)}
                  className="size-3 accent-primary"
                />
                <img
                  src={resolveImageAssetUrl(image.url)}
                  alt={`${character.name}基础形象参考`}
                  className="size-12 rounded object-cover"
                  loading="lazy"
                />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{image.isPrimary ? "主图" : `参考 ${image.sortOrder + 1}`}</span>
                  <span className="block text-muted-foreground">
                    {image.width && image.height ? `${image.width}×${image.height}` : image.provider}
                  </span>
                  </span>
              </label>
            ))}
          </div>
        </div>
      ) : characterImagesQuery.isLoading ? (
        <div className="rounded-md border bg-background p-2 text-xs text-muted-foreground">正在读取基础形象图。</div>
      ) : null}

      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          {COVERAGE_MARKS.map((value) => (
            <Button
              key={value}
              type="button"
              size="sm"
              variant={targetPercent === value ? "default" : "outline"}
              onClick={() => setTargetPercent(value)}
              disabled={disabled || scanActive}
            >
              {value}%
            </Button>
          ))}
        </div>
        <input
          type="range"
          min={0}
          max={100}
          step={25}
          value={targetPercent}
          onChange={(event) => setTargetPercent(Number(event.target.value))}
          className="w-full accent-primary"
          disabled={disabled || scanActive}
          aria-label="目标覆盖率"
        />
      </div>

      {appearanceQuery.isLoading ? <div className="text-xs text-muted-foreground">正在读取形象演变。</div> : null}
      {scanMutation.error ? (
        <div className="text-xs text-destructive">
          {scanMutation.error instanceof Error ? scanMutation.error.message : "形象扫描失败。"}
        </div>
      ) : null}
      {scanJob || lastScanJob ? (
        <div className="rounded-md border bg-background p-2 text-xs text-muted-foreground">
          形象扫描：{(scanJob ?? lastScanJob)?.status === "queued" ? "排队中" : (scanJob ?? lastScanJob)?.status === "running" ? "扫描中" : (scanJob ?? lastScanJob)?.status === "succeeded" ? "已完成" : "扫描失败"}
          {(scanJob ?? lastScanJob)?.error ? <span className="ml-2 text-destructive">{(scanJob ?? lastScanJob)?.error}</span> : null}
        </div>
      ) : null}
      {scanJobQuery.error ? (
        <div className="text-xs text-destructive">
          {scanJobQuery.error instanceof Error ? scanJobQuery.error.message : "读取扫描进度失败。"}
        </div>
      ) : null}
      {mergeTermsMutation.error ? (
        <div className="text-xs text-destructive">
          {mergeTermsMutation.error instanceof Error ? mergeTermsMutation.error.message : "融合外貌失败。"}
        </div>
      ) : null}
      {activeTask ? (
        <div className="rounded-md border bg-background p-2 text-xs text-muted-foreground">
          当前图片任务：{IMAGE_STATUS_TEXT[activeTask.status] ?? activeTask.status}
          {activeTask.error ? <span className="ml-2 text-destructive">{activeTask.error}</span> : null}
        </div>
      ) : null}

      {appearance ? (
        <>
          <div className="rounded-md border bg-background p-2 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-xs text-muted-foreground">待确认外貌词条</div>
                <div className="mt-1 text-sm">{pendingTerms.length > 0 ? "勾选可信词条后添加到角色外貌。" : "暂无待确认词条"}</div>
              </div>
              <Button
                type="button"
                size="sm"
                onClick={() => mergeTermsMutation.mutate()}
                disabled={disabled || selectedTermIds.length === 0 || mergeTermsMutation.isPending}
              >
                {mergeTermsMutation.isPending ? "融合中..." : "融合外貌"}
              </Button>
            </div>
            {termsQuery.isLoading ? <div className="mt-2 text-xs text-muted-foreground">正在读取词条。</div> : null}
            {pendingTerms.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-2">
                {pendingTerms.map((term) => (
                  <label
                    key={term.id}
                    className="flex max-w-full items-center gap-2 rounded-md border px-2 py-1 text-xs"
                  >
                    <input
                      type="checkbox"
                      checked={selectedTermIds.includes(term.id)}
                      onChange={(event) => toggleTerm(term.id, event.target.checked)}
                      disabled={disabled || mergeTermsMutation.isPending}
                      className="size-3 accent-primary"
                    />
                    <span className="font-medium">{term.text}</span>
                    <span className="text-muted-foreground">第 {term.chapterIndex + 1} 章</span>
                    {term.evidence.length > 0 ? <span className="text-muted-foreground">{term.evidence.length} 证据</span> : null}
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-6 px-1 text-xs"
                      onClick={(event) => {
                        event.preventDefault();
                        rejectTermMutation.mutate(term.id);
                      }}
                      disabled={disabled || rejectTermMutation.isPending}
                    >
                      忽略词条
                    </Button>
                  </label>
                ))}
              </div>
            ) : null}
          </div>
          <div className="rounded-md border bg-background p-2 text-sm">
            <div className="text-xs text-muted-foreground">稳定特征</div>
            <div className="mt-1 whitespace-pre-wrap">{formatJsonSummary(appearance.consolidatedAppearance)}</div>
          </div>
          {appearance.variantPolicy && Object.keys(appearance.variantPolicy).length > 0 ? (
            <div className="rounded-md border border-warning/30 bg-warning/5 p-2 text-sm text-foreground">
              {formatJsonSummary(appearance.variantPolicy)}
            </div>
          ) : null}
          {appearance.snapshots.length > 0 ? (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-background p-2">
                <div>
                  <div className="text-sm font-medium">章节快照</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {showAllSnapshots
                      ? `显示全部 ${appearance.snapshots.length} 个章节快照`
                      : `优先显示 ${meaningfulSnapshots.length} 个有形象信息的关键章节`}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={showAllSnapshots ? "outline" : "secondary"}
                    onClick={() => setShowAllSnapshots((current) => !current)}
                  >
                    {showAllSnapshots ? "只看关键章节" : "查看全部章节"}
                  </Button>
                  {snapshotPageCount > 1 ? (
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => setSnapshotPage((current) => Math.max(0, current - 1))}
                        disabled={currentSnapshotPage === 0}
                      >
                        上一页
                      </Button>
                      <span className="min-w-16 text-center text-xs text-muted-foreground">
                        {currentSnapshotPage + 1} / {snapshotPageCount}
                      </span>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => setSnapshotPage((current) => Math.min(snapshotPageCount - 1, current + 1))}
                        disabled={currentSnapshotPage >= snapshotPageCount - 1}
                      >
                        下一页
                      </Button>
                    </div>
                  ) : null}
                </div>
              </div>
              {visibleSnapshots.map((snapshot) => (
                <div key={snapshot.id} className="rounded-md border bg-background p-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="font-medium">第 {snapshot.chapterIndex + 1} 章</div>
                      {snapshot.manuallyEdited ? <Badge variant="outline">手动保留</Badge> : null}
                      {(() => {
                        const readyCount = snapshot.images.filter((image) => image.imageAsset).length;
                        return readyCount > 0 ? <Badge variant="secondary">{readyCount} 张图</Badge> : null;
                      })()}
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => startGenerateSnapshotImage(snapshot.id)}
                      disabled={disabled || Boolean(activeTaskId)}
                    >
                      生成图
                    </Button>
                  </div>
                  {snapshot.chapterTitle ? (
                    <div className="mt-1 text-xs text-muted-foreground">{snapshot.chapterTitle}</div>
                  ) : null}
                  {snapshot.summaryCaption ? (
                    <div className="mt-2 text-sm">{snapshot.summaryCaption}</div>
                  ) : null}
                  <div className="mt-2 text-xs text-muted-foreground">
                    {snapshot.evidence.length > 0 ? `${snapshot.evidence.length} 条证据` : "暂无证据"}
                  </div>
                  {snapshot.images.some((image) => image.imageAsset) ? (
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      {snapshot.images
                        .filter((image) => image.imageAsset)
                        .map((image) => (
                          <img
                            key={image.id}
                            src={resolveImageAssetUrl(image.imageAsset!.url)}
                            alt={`${character.name}-第${snapshot.chapterIndex + 1}章形象图`}
                            className="aspect-square w-full rounded-md object-cover"
                            loading="lazy"
                          />
                        ))}
                    </div>
                  ) : null}
                </div>
              ))}
              {visibleSnapshots.length === 0 ? (
                <div className="rounded-md border border-dashed bg-background p-4 text-sm text-muted-foreground">
                  暂无带形象信息的章节。可以查看全部章节，或继续增量扫描。
                </div>
              ) : null}
            </div>
          ) : null}
        </>
      ) : (
        <div className="text-xs text-muted-foreground">选择覆盖率后增量扫描，系统会按章节抽取这个角色的形象变化。</div>
      )}
    </div>
  );
}
