import i18next from "i18next";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ScanLine } from "lucide-react";
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
    return i18next.t("dict.gen_cdd9ef03");
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
    <div className="mt-4 space-y-5">
      <ImageGenerationConfirmDialog {...flow.dialogProps} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{i18next.t("dict.gen_c9f06a16")}</span>
          <Badge variant="secondary" className="border-0 bg-muted/70 font-normal">{appearance?.coveragePercent ?? 0}%</Badge>
          <span className="text-xs text-muted-foreground">{appearance?.snapshots.length ?? 0} 个章节快照</span>
        </div>
      </div>

      <div className="rounded-xl bg-muted/30 px-4 py-3 text-sm">
        <div className="text-[11px] font-medium tracking-wide text-muted-foreground">{i18next.t("bookAnalysis.bookAnalysisCharacterAppearancePanel.cdcvmh")}</div>
        <div className="mt-1.5 whitespace-pre-wrap leading-6 text-foreground/90">{currentAppearance || "暂无外貌描述"}</div>
      </div>

      {characterImages.length > 0 ? (
        <section className="rounded-xl bg-muted/20 p-4 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="font-medium">{i18next.t("dict.gen_14c7c5cd")}</div>
              <div className="mt-1 text-xs leading-5 text-muted-foreground">{i18next.t("bookAnalysis.bookAnalysisCharacterAppearancePanel.xpl7pd")}</div>
            </div>
            <span className="text-xs text-muted-foreground">已选 {selectedReferenceAssetIds.length} 张</span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {characterImages.map((image) => (
              <label
                key={image.id}
                className={`group relative cursor-pointer overflow-hidden rounded-xl bg-background transition-all ${
                  selectedReferenceAssetIds.includes(image.id)
                    ? "ring-2 ring-primary/45 ring-offset-2 ring-offset-background"
                    : "ring-1 ring-border/35 hover:ring-border/70"
                }`}
              >
                <input
                  type="checkbox"
                  checked={selectedReferenceAssetIds.includes(image.id)}
                  onChange={(event) => toggleReferenceAsset(image.id, event.target.checked)}
                  disabled={disabled || Boolean(activeTaskId)}
                  className="sr-only"
                />
                <img
                  src={resolveImageAssetUrl(image.url)}
                  alt={`${character.name}基础形象参考`}
                  className="aspect-[4/3] w-full object-cover"
                  loading="lazy"
                />
                {selectedReferenceAssetIds.includes(image.id) ? (
                  <span className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm">
                    <Check className="h-3 w-3" aria-hidden="true" />
                  </span>
                ) : null}
                <span className="flex items-center justify-between gap-2 px-2.5 py-2 text-xs">
                  <span className="truncate font-medium">{image.isPrimary ? "主图" : `参考 ${image.sortOrder + 1}`}</span>
                  <span className="truncate text-[10px] text-muted-foreground">{image.provider}</span>
                </span>
              </label>
            ))}
          </div>
        </section>
      ) : characterImagesQuery.isLoading ? (
        <div className="text-xs text-muted-foreground">{i18next.t("dict.gen_4448dcb3")}</div>
      ) : null}

      <div className="flex flex-wrap items-end justify-between gap-3 border-t border-border/35 pt-4">
        <div>
          <div className="mb-2 text-xs font-medium text-muted-foreground">{i18next.t("bookAnalysis.bookAnalysisCharacterAppearancePanel.gi25rw")}</div>
          <div className="flex flex-wrap gap-1 rounded-full bg-muted/45 p-1">
            {COVERAGE_MARKS.map((value) => (
              <Button
                key={value}
                type="button"
                size="sm"
                variant="ghost"
                className={targetPercent === value
                  ? "h-8 rounded-full bg-background px-3 text-foreground shadow-sm hover:bg-background"
                  : "h-8 rounded-full px-3 text-muted-foreground"}
                onClick={() => setTargetPercent(value)}
                disabled={disabled || scanActive}
                aria-pressed={targetPercent === value}
              >
                {value}%
              </Button>
            ))}
          </div>
        </div>
        <Button
          size="sm"
          variant="secondary"
          className="rounded-full"
          onClick={() => scanMutation.mutate()}
          disabled={disabled || scanActive}
        >
          <ScanLine className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
          {scanActive ? "扫描中..." : `扫描至 ${targetPercent}%`}
        </Button>
      </div>

      {appearanceQuery.isLoading ? <div className="text-xs text-muted-foreground">{i18next.t("dict.gen_f041a0ef")}</div> : null}
      {scanMutation.error ? (
        <div className="text-xs text-destructive">
          {scanMutation.error instanceof Error ? scanMutation.error.message : i18next.t("dict.gen_6433648a")}
        </div>
      ) : null}
      {scanJob || lastScanJob ? (
        <div className="rounded-xl bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          形象扫描：{(scanJob ?? lastScanJob)?.status === "queued" ? "排队中" : (scanJob ?? lastScanJob)?.status === "running" ? "扫描中" : (scanJob ?? lastScanJob)?.status === "succeeded" ? "已完成" : "扫描失败"}
          {(scanJob ?? lastScanJob)?.error ? <span className="ml-2 text-destructive">{(scanJob ?? lastScanJob)?.error}</span> : null}
        </div>
      ) : null}
      {scanJobQuery.error ? (
        <div className="text-xs text-destructive">
          {scanJobQuery.error instanceof Error ? scanJobQuery.error.message : i18next.t("dict.gen_fb2e15c1")}
        </div>
      ) : null}
      {mergeTermsMutation.error ? (
        <div className="text-xs text-destructive">
          {mergeTermsMutation.error instanceof Error ? mergeTermsMutation.error.message : i18next.t("dict.gen_8c437f26")}
        </div>
      ) : null}
      {activeTask ? (
        <div className="rounded-xl bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          当前图片任务：{IMAGE_STATUS_TEXT[activeTask.status] ?? activeTask.status}
          {activeTask.error ? <span className="ml-2 text-destructive">{activeTask.error}</span> : null}
        </div>
      ) : null}

      {appearance ? (
        <>
          {pendingTerms.length > 0 || termsQuery.isLoading ? (
            <section className="rounded-xl bg-muted/20 p-4 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="font-medium">{i18next.t("dict.gen_c1240cbe")}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{i18next.t("dict.gen_b8edce0a")}</div>
                </div>
                <Button
                  type="button"
                  size="sm"
                  className="rounded-full"
                  onClick={() => mergeTermsMutation.mutate()}
                  disabled={disabled || selectedTermIds.length === 0 || mergeTermsMutation.isPending}
                >
                  {mergeTermsMutation.isPending ? "融合中..." : "融合外貌"}
                </Button>
              </div>
              {termsQuery.isLoading ? <div className="mt-3 text-xs text-muted-foreground">{i18next.t("dict.gen_374c1aac")}</div> : null}
              {pendingTerms.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {pendingTerms.map((term) => (
                    <label
                      key={term.id}
                      className={`flex max-w-full cursor-pointer items-center gap-2 rounded-full px-3 py-1.5 text-xs transition-colors ${
                        selectedTermIds.includes(term.id) ? "bg-primary/10 text-primary" : "bg-background text-foreground"
                      }`}
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
                        className="h-6 rounded-full px-1.5 text-xs"
                        onClick={(event) => {
                          event.preventDefault();
                          rejectTermMutation.mutate(term.id);
                        }}
                        disabled={disabled || rejectTermMutation.isPending}
                      >{i18next.t("dict.gen_c0d5d68f")}</Button>
                    </label>
                  ))}
                </div>
              ) : null}
            </section>
          ) : null}
          <div className="border-t border-border/35 pt-4 text-sm">
            <div className="font-medium">{i18next.t("bookAnalysis.bookAnalysisCharacterAppearancePanel.i5lmhe")}</div>
            <div className="mt-2 whitespace-pre-wrap leading-6 text-foreground/85">{formatJsonSummary(appearance.consolidatedAppearance)}</div>
          </div>
          {appearance.variantPolicy && Object.keys(appearance.variantPolicy).length > 0 ? (
            <div className="rounded-xl bg-warning/5 px-4 py-3 text-sm text-foreground">
              {formatJsonSummary(appearance.variantPolicy)}
            </div>
          ) : null}
          {appearance.snapshots.length > 0 ? (
            <section className="space-y-4 border-t border-border/35 pt-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-medium">{i18next.t("bookAnalysis.bookAnalysisCharacterAppearancePanel.2sdy2u")}</div>
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
                      >{i18next.t("autoDirectorFollowUps.autoDirectorFollowUpList.btlof")}</Button>
                      <span className="min-w-16 text-center text-xs text-muted-foreground">
                        {currentSnapshotPage + 1} / {snapshotPageCount}
                      </span>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => setSnapshotPage((current) => Math.min(snapshotPageCount - 1, current + 1))}
                        disabled={currentSnapshotPage >= snapshotPageCount - 1}
                      >{i18next.t("autoDirectorFollowUps.autoDirectorFollowUpList.btmf4")}</Button>
                    </div>
                  ) : null}
                </div>
              </div>
              <div className="space-y-0">
                {visibleSnapshots.map((snapshot) => (
                  <article key={snapshot.id} className="relative border-l border-primary/20 pb-6 pl-5 last:pb-0">
                    <span className="absolute -left-[5px] top-2 h-2.5 w-2.5 rounded-full border-2 border-background bg-primary/60" aria-hidden="true" />
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="font-medium">第 {snapshot.chapterIndex + 1} 章</div>
                        {snapshot.manuallyEdited ? <Badge variant="secondary" className="border-0 font-normal">{i18next.t("dict.gen_4bd22121")}</Badge> : null}
                        {(() => {
                          const readyCount = snapshot.images.filter((image) => image.imageAsset).length;
                          return readyCount > 0 ? <span className="text-xs text-muted-foreground">{readyCount} 张图</span> : null;
                        })()}
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        className="rounded-full"
                        onClick={() => startGenerateSnapshotImage(snapshot.id)}
                        disabled={disabled || Boolean(activeTaskId)}
                      >{i18next.t("bookAnalysis.bookAnalysisCharacterAppearancePanel.hmqfh")}</Button>
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
                              className="aspect-square w-full rounded-xl object-cover"
                              loading="lazy"
                            />
                          ))}
                      </div>
                    ) : null}
                  </article>
                ))}
              </div>
              {visibleSnapshots.length === 0 ? (
                <div className="rounded-xl bg-muted/25 p-4 text-sm text-muted-foreground">{i18next.t("bookAnalysis.bookAnalysisCharacterAppearancePanel.i7glse")}</div>
              ) : null}
            </section>
          ) : null}
        </>
      ) : (
        <div className="text-xs text-muted-foreground">{i18next.t("dict.gen_17dcc18c")}</div>
      )}
    </div>
  );
}
