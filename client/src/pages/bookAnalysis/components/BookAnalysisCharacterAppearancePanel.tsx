import i18next from "i18next";
const t = (key: string, options?: any) => i18next.t(key, options) as string;
import { useEffect, useRef, useState } from "react";
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
const IMAGE_STATUS_TEXT: Record<string, string> = {
  queued: t("gen.pages.bookAnalysis.components.BookAnalysisCharacterAppearancePanel.gen_e5ac1d20"),
  running: t("gen.pages.bookAnalysis.components.BookAnalysisCharacterAppearancePanel.gen_1ae3a984"),
  succeeded: t("gen.pages.bookAnalysis.components.BookAnalysisCharacterAppearancePanel.gen_b6c4a445"),
  failed: t("gen.pages.bookAnalysis.components.BookAnalysisCharacterAppearancePanel.gen_7f7de8a2"),
  cancelled: t("gen.pages.bookAnalysis.components.BookAnalysisCharacterAppearancePanel.gen_2111ccbb"),
};

function formatJsonSummary(value: Record<string, unknown> | null | undefined): string {
  if (!value || Object.keys(value).length === 0) {
    return t("gen.pages.bookAnalysis.components.BookAnalysisCharacterAppearancePanel.gen_cdd9ef03");
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
  const referenceInitializedForCharacter = useRef("");
  const queryKey = ["book-analysis-character-appearance", analysisId, character.id];
  const termsQueryKey = ["book-analysis-character-appearance-terms", analysisId, character.id, "pending"];
  const appearanceQuery = useQuery({
    queryKey,
    queryFn: () => getBookAnalysisCharacterAppearance(analysisId, character.id),
    refetchInterval: activeScanJobId ? 2500 : false,
  });
  const appearance = appearanceQuery.data?.data ?? character.appearance ?? null;
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
          stylePreset: t("gen.pages.bookAnalysis.components.BookAnalysisCharacterAppearancePanel.gen_3b02846a"),
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
          <span className="font-medium">{t("gen.pages.bookAnalysis.components.BookAnalysisCharacterAppearancePanel.gen_c9f06a16")}</span>
          <Badge variant="outline">{appearance?.coveragePercent ?? 0}%</Badge>
          <Badge variant="secondary">{t("gen.pages.bookAnalysis.components.BookAnalysisCharacterAppearancePanel.gen_2d3445a5")}</Badge>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => scanMutation.mutate()}
          disabled={disabled || scanActive}
        >
          {scanActive ? t("gen.pages.bookAnalysis.components.BookAnalysisCharacterAppearancePanel.gen_e6c2d5d3") : t("gen.pages.bookAnalysis.components.BookAnalysisCharacterAppearancePanel.gen_8beee664")}
        </Button>
      </div>

      <div className="rounded-md border bg-background p-2 text-sm">
        <div className="text-xs text-muted-foreground">{t("gen.pages.bookAnalysis.components.BookAnalysisCharacterAppearancePanel.gen_b5572402")}</div>
        <div className="mt-1 whitespace-pre-wrap">{t("gen.pages.bookAnalysis.components.BookAnalysisCharacterAppearancePanel.gen_c1bc7cbe")}</div>
      </div>

      {characterImages.length > 0 ? (
        <div className="rounded-md border bg-background p-2 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-xs text-muted-foreground">{t("gen.pages.bookAnalysis.components.BookAnalysisCharacterAppearancePanel.gen_14c7c5cd")}</div>
              <div className="mt-1 text-sm">{t("gen.pages.bookAnalysis.components.BookAnalysisCharacterAppearancePanel.gen_0c87a821")}</div>
            </div>
            <Badge variant="outline">{t("gen.pages.bookAnalysis.components.BookAnalysisCharacterAppearancePanel.gen_e1fa77a5")}</Badge>
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
                    <span className="block truncate font-medium">{image.isPrimary ? t("gen.pages.bookAnalysis.components.BookAnalysisCharacterAppearancePanel.gen_bf1456e7") : `参考 ${image.sortOrder + 1}`}</span>
                  <span className="block text-muted-foreground">
                    {image.width && image.height ? `${image.width}×${image.height}` : image.provider}
                  </span>
                  </span>
              </label>
            ))}
          </div>
        </div>
      ) : characterImagesQuery.isLoading ? (
        <div className="rounded-md border bg-background p-2 text-xs text-muted-foreground">{t("gen.pages.bookAnalysis.components.BookAnalysisCharacterAppearancePanel.gen_4448dcb3")}</div>
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
          aria-label={t("gen.pages.bookAnalysis.components.BookAnalysisCharacterAppearancePanel.gen_09d465e9")}
        />
      </div>

      {appearanceQuery.isLoading ? <div className="text-xs text-muted-foreground">{t("gen.pages.bookAnalysis.components.BookAnalysisCharacterAppearancePanel.gen_f041a0ef")}</div> : null}
      {scanMutation.error ? (
        <div className="text-xs text-destructive">
          {scanMutation.error instanceof Error ? scanMutation.error.message : t("gen.pages.bookAnalysis.components.BookAnalysisCharacterAppearancePanel.gen_6433648a")}
        </div>
      ) : null}
      {scanJob || lastScanJob ? (
        <div className="rounded-md border bg-background p-2 text-xs text-muted-foreground">
          形象扫描：{(scanJob ?? lastScanJob)?.status === "queued" ? t("gen.pages.bookAnalysis.components.BookAnalysisCharacterAppearancePanel.gen_e5ac1d20") : (scanJob ?? lastScanJob)?.status === "running" ? t("gen.pages.bookAnalysis.components.BookAnalysisCharacterAppearancePanel.gen_06155bfc") : (scanJob ?? lastScanJob)?.status === "succeeded" ? t("gen.pages.bookAnalysis.components.BookAnalysisCharacterAppearancePanel.gen_fad5222c") : t("gen.pages.bookAnalysis.components.BookAnalysisCharacterAppearancePanel.gen_5ec14542")}
          {(scanJob ?? lastScanJob)?.error ? <span className="ml-2 text-destructive">{(scanJob ?? lastScanJob)?.error}</span> : null}
        </div>
      ) : null}
      {scanJobQuery.error ? (
        <div className="text-xs text-destructive">
          {scanJobQuery.error instanceof Error ? scanJobQuery.error.message : t("gen.pages.bookAnalysis.components.BookAnalysisCharacterAppearancePanel.gen_fb2e15c1")}
        </div>
      ) : null}
      {mergeTermsMutation.error ? (
        <div className="text-xs text-destructive">
          {mergeTermsMutation.error instanceof Error ? mergeTermsMutation.error.message : t("gen.pages.bookAnalysis.components.BookAnalysisCharacterAppearancePanel.gen_8c437f26")}
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
                <div className="text-xs text-muted-foreground">{t("gen.pages.bookAnalysis.components.BookAnalysisCharacterAppearancePanel.gen_c1240cbe")}</div>
                <div className="mt-1 text-sm">{t("gen.pages.bookAnalysis.components.BookAnalysisCharacterAppearancePanel.gen_942cedba")}</div>
              </div>
              <Button
                type="button"
                size="sm"
                onClick={() => mergeTermsMutation.mutate()}
                disabled={disabled || selectedTermIds.length === 0 || mergeTermsMutation.isPending}
              >
                {mergeTermsMutation.isPending ? t("gen.pages.bookAnalysis.components.BookAnalysisCharacterAppearancePanel.gen_553d776f") : t("gen.pages.bookAnalysis.components.BookAnalysisCharacterAppearancePanel.gen_4743012d")}
              </Button>
            </div>
            {termsQuery.isLoading ? <div className="mt-2 text-xs text-muted-foreground">{t("gen.pages.bookAnalysis.components.BookAnalysisCharacterAppearancePanel.gen_374c1aac")}</div> : null}
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
                    <span className="text-muted-foreground">{t("gen.pages.bookAnalysis.components.BookAnalysisCharacterAppearancePanel.gen_4b295fc8")}</span>
                    {term.evidence.length > 0 ? <span className="text-muted-foreground">{t("gen.pages.bookAnalysis.components.BookAnalysisCharacterAppearancePanel.gen_8d862979")}</span> : null}
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
            <div className="text-xs text-muted-foreground">{t("gen.pages.bookAnalysis.components.BookAnalysisCharacterAppearancePanel.gen_6122b2f7")}</div>
            <div className="mt-1 whitespace-pre-wrap">{formatJsonSummary(appearance.consolidatedAppearance)}</div>
          </div>
          {appearance.variantPolicy && Object.keys(appearance.variantPolicy).length > 0 ? (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-2 text-sm text-amber-700 dark:text-amber-300">
              {formatJsonSummary(appearance.variantPolicy)}
            </div>
          ) : null}
          {appearance.snapshots.length > 0 ? (
            <div className="space-y-2">
              {appearance.snapshots.map((snapshot) => (
                <div key={snapshot.id} className="rounded-md border bg-background p-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="font-medium">{t("gen.pages.bookAnalysis.components.BookAnalysisCharacterAppearancePanel.gen_0f106303")}</div>
                      {snapshot.manuallyEdited ? <Badge variant="outline">{t("gen.pages.bookAnalysis.components.BookAnalysisCharacterAppearancePanel.gen_4bd22121")}</Badge> : null}
                      {(() => {
                        const readyCount = snapshot.images.filter((image) => image.imageAsset).length;
                        return readyCount > 0 ? <Badge variant="secondary">{t("gen.pages.bookAnalysis.components.BookAnalysisCharacterAppearancePanel.gen_fe4787aa")}</Badge> : null;
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
                    {snapshot.evidence.length > 0 ? `${snapshot.evidence.length} 条证据` : t("gen.pages.bookAnalysis.components.BookAnalysisCharacterAppearancePanel.gen_6f7cbad1")}
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
            </div>
          ) : null}
        </>
      ) : (
        <div className="text-xs text-muted-foreground">{t("gen.pages.bookAnalysis.components.BookAnalysisCharacterAppearancePanel.gen_17dcc18c")}</div>
      )}
    </div>
  );
}
