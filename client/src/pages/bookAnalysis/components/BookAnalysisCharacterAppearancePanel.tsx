import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { BookAnalysisCharacter } from "@ai-novel/shared/types/bookAnalysisCharacter";
import {
  generateBookAnalysisCharacterAppearanceImage,
  getBookAnalysisCharacterAppearance,
  prepareBookAnalysisCharacterAppearanceImage,
  scanBookAnalysisCharacterAppearance,
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
  const queryKey = ["book-analysis-character-appearance", analysisId, character.id];
  const appearanceQuery = useQuery({
    queryKey,
    queryFn: () => getBookAnalysisCharacterAppearance(analysisId, character.id),
  });
  const appearance = appearanceQuery.data?.data ?? character.appearance ?? null;

  const scanMutation = useMutation({
    mutationFn: () => scanBookAnalysisCharacterAppearance(analysisId, character.id, { targetPercent }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey });
      await queryClient.invalidateQueries({ queryKey: queryKeys.bookAnalysis.characters(analysisId) });
    },
  });

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
      prepare: async () => (await prepareBookAnalysisCharacterAppearanceImage(analysisId, character.id, snapshotId)).data!,
      generate: async (overrides) => {
        const response = await generateBookAnalysisCharacterAppearanceImage(analysisId, character.id, snapshotId, {
          count: 2,
          stylePreset: "同一角色章节形象演变图",
          overrides,
        });
        if (response.data?.id) {
          setActiveTaskId(response.data.id);
        }
        return response;
      },
    });
  };

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
          disabled={disabled || scanMutation.isPending}
        >
          {scanMutation.isPending ? "扫描中..." : "增量扫描"}
        </Button>
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          {COVERAGE_MARKS.map((value) => (
            <Button
              key={value}
              type="button"
              size="sm"
              variant={targetPercent === value ? "default" : "outline"}
              onClick={() => setTargetPercent(value)}
              disabled={disabled || scanMutation.isPending}
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
          disabled={disabled || scanMutation.isPending}
          aria-label="目标覆盖率"
        />
      </div>

      {appearanceQuery.isLoading ? <div className="text-xs text-muted-foreground">正在读取形象演变。</div> : null}
      {scanMutation.error ? (
        <div className="text-xs text-destructive">
          {scanMutation.error instanceof Error ? scanMutation.error.message : "形象扫描失败。"}
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
            <div className="text-xs text-muted-foreground">稳定特征</div>
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
                      <div className="font-medium">第 {snapshot.chapterIndex + 1} 章</div>
                      {snapshot.manuallyEdited ? <Badge variant="outline">手动保留</Badge> : null}
                      {snapshot.images.length > 0 ? <Badge variant="secondary">{snapshot.images.length} 张图</Badge> : null}
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
            </div>
          ) : null}
        </>
      ) : (
        <div className="text-xs text-muted-foreground">选择覆盖率后增量扫描，系统会按章节抽取这个角色的形象变化。</div>
      )}
    </div>
  );
}
