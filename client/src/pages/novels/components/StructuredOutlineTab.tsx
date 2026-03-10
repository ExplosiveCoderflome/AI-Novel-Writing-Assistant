import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import StreamOutput from "@/components/common/StreamOutput";
import AiRevisionWorkspace from "@/components/common/AiRevisionWorkspace";
import {
  applyStructuredChapterBatch,
  buildStructuredOutlineSyncPreview,
  serializeStructuredVolumes,
  type OutlineSyncChapter,
  type StructuredSyncOptions,
  type StructuredVolume,
} from "../novelEdit.utils";
import WorldInjectionHint from "./WorldInjectionHint";

interface StructuredOutlineTabProps {
  worldInjectionSummary: string | null;
  hasCharacters: boolean;
  isGenerating: boolean;
  streamContent: string;
  onGenerate: () => void;
  onStop: () => void;
  onAbortStream: () => void;
  onGoToCharacterTab: () => void;
  onApplySync: (options: StructuredSyncOptions) => void;
  isApplyingSync: boolean;
  syncMessage: string;
  draftText: string;
  onDraftTextChange: (next: string) => void;
  onSave: () => void;
  isSaving: boolean;
  optimizeInstruction: string;
  onOptimizeInstructionChange: (next: string) => void;
  onOptimizeFull: () => void;
  onOptimizeSelection: (selectedText: string) => void;
  isOptimizing: boolean;
  optimizePreview: string;
  onApplyOptimizePreview: () => void;
  onCancelOptimizePreview: () => void;
  structuredVolumes: StructuredVolume[];
  chapters: OutlineSyncChapter[];
}

function flattenVolumes(volumes: StructuredVolume[]) {
  return volumes
    .flatMap((volume) => volume.chapters.map((chapter) => ({ ...chapter, volumeTitle: volume.volumeTitle })))
    .sort((a, b) => a.order - b.order);
}

function actionLabel(action: "create" | "update" | "keep" | "delete" | "delete_candidate"): string {
  if (action === "create") return "新增";
  if (action === "update") return "变更";
  if (action === "delete") return "删除";
  if (action === "delete_candidate") return "待删候选";
  return "保留";
}

function actionVariant(action: "create" | "update" | "keep" | "delete" | "delete_candidate"): "default" | "secondary" | "outline" {
  if (action === "create") return "default";
  if (action === "update") return "secondary";
  if (action === "keep") return "outline";
  if (action === "delete") return "secondary";
  return "outline";
}

export default function StructuredOutlineTab(props: StructuredOutlineTabProps) {
  const {
    worldInjectionSummary,
    hasCharacters,
    isGenerating,
    streamContent,
    onGenerate,
    onStop,
    onAbortStream,
    onGoToCharacterTab,
    onApplySync,
    isApplyingSync,
    syncMessage,
    draftText,
    onDraftTextChange,
    onSave,
    isSaving,
    optimizeInstruction,
    onOptimizeInstructionChange,
    onOptimizeFull,
    onOptimizeSelection,
    isOptimizing,
    optimizePreview,
    onApplyOptimizePreview,
    onCancelOptimizePreview,
    structuredVolumes,
    chapters,
  } = props;

  const [viewMode, setViewMode] = useState<"cards" | "table" | "json">("cards");
  const [showSyncPreview, setShowSyncPreview] = useState(false);
  const [batchConflictLevel, setBatchConflictLevel] = useState(60);
  const [batchWordCount, setBatchWordCount] = useState(2500);
  const [syncOptions, setSyncOptions] = useState<StructuredSyncOptions>({
    preserveContent: true,
    applyDeletes: false,
  });

  const chapterRows = useMemo(() => flattenVolumes(structuredVolumes), [structuredVolumes]);
  const syncPreview = useMemo(
    () => buildStructuredOutlineSyncPreview(structuredVolumes, chapters, syncOptions),
    [chapters, structuredVolumes, syncOptions],
  );

  const patchDraft = (nextVolumes: StructuredVolume[]) => {
    onDraftTextChange(serializeStructuredVolumes(nextVolumes));
  };

  const handleGenerateTaskSheet = () => {
    patchDraft(applyStructuredChapterBatch(structuredVolumes, { generateTaskSheet: true }));
  };

  const handleBatchConflict = () => {
    patchDraft(applyStructuredChapterBatch(structuredVolumes, { conflictLevel: batchConflictLevel }));
  };

  const handleBatchWordCount = () => {
    patchDraft(applyStructuredChapterBatch(structuredVolumes, { targetWordCount: batchWordCount }));
  };

  const handleApplySync = () => {
    if (syncOptions.applyDeletes && syncPreview.deleteCount > 0) {
      const confirmed = window.confirm(`将删除 ${syncPreview.deleteCount} 个章节，是否继续？`);
      if (!confirmed) {
        return;
      }
    }
    if (!syncOptions.preserveContent && syncPreview.clearContentCount > 0) {
      const confirmed = window.confirm(`将清空 ${syncPreview.clearContentCount} 个已有正文章节内容，是否继续？`);
      if (!confirmed) {
        return;
      }
    }
    onApplySync(syncOptions);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>生成规划（结构化章节大纲）</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <WorldInjectionHint worldInjectionSummary={worldInjectionSummary} />
        {!hasCharacters ? (
          <div className="flex items-center justify-between gap-2 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
            <span>请先添加至少 1 个角色，再生成结构化章节大纲。</span>
            <Button size="sm" variant="outline" onClick={onGoToCharacterTab}>去角色管理</Button>
          </div>
        ) : null}
        {syncMessage ? <div className="text-xs text-muted-foreground">{syncMessage}</div> : null}

        <div className="flex flex-wrap gap-2">
          <Button onClick={onGenerate} disabled={isGenerating || !hasCharacters}>
            生成结构化大纲
          </Button>
          <Button variant="secondary" onClick={onStop} disabled={!isGenerating}>停止生成</Button>
          <Button variant="outline" onClick={onSave} disabled={isSaving}>
            {isSaving ? "保存中..." : "保存结构化大纲"}
          </Button>
        </div>
        <StreamOutput isStreaming={isGenerating} content={streamContent} onAbort={onAbortStream} />

        <Card>
          <CardHeader>
            <CardTitle className="text-base">大纲工具</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="secondary" onClick={handleGenerateTaskSheet} disabled={structuredVolumes.length === 0}>
                AI生成任务单字段
              </Button>
              <div className="flex items-center gap-1 rounded-md border px-2 py-1 text-xs">
                <span>冲突等级</span>
                <input
                  className="w-16 rounded border px-1 py-0.5 text-xs"
                  type="number"
                  min={0}
                  max={100}
                  value={batchConflictLevel}
                  onChange={(event) => setBatchConflictLevel(Number(event.target.value || 0))}
                />
                <Button size="sm" variant="outline" onClick={handleBatchConflict} disabled={structuredVolumes.length === 0}>
                  批量设置
                </Button>
              </div>
              <div className="flex items-center gap-1 rounded-md border px-2 py-1 text-xs">
                <span>目标字数</span>
                <input
                  className="w-20 rounded border px-1 py-0.5 text-xs"
                  type="number"
                  min={200}
                  step={100}
                  value={batchWordCount}
                  onChange={(event) => setBatchWordCount(Number(event.target.value || 200))}
                />
                <Button size="sm" variant="outline" onClick={handleBatchWordCount} disabled={structuredVolumes.length === 0}>
                  批量设置
                </Button>
              </div>
              <Button variant="outline" onClick={() => setShowSyncPreview((value) => !value)}>
                {showSyncPreview ? "隐藏同步差异" : "查看同步差异"}
              </Button>
              <Button
                onClick={handleApplySync}
                disabled={isApplyingSync || structuredVolumes.length === 0 || (syncPreview.createCount + syncPreview.updateCount + syncPreview.deleteCount === 0)}
              >
                {isApplyingSync ? "应用中..." : "应用到章节执行"}
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
              <label className="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={syncOptions.preserveContent}
                  onChange={(event) => setSyncOptions((prev) => ({ ...prev, preserveContent: event.target.checked }))}
                />
                保留已有正文
              </label>
              <label className="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={syncOptions.applyDeletes}
                  onChange={(event) => setSyncOptions((prev) => ({ ...prev, applyDeletes: event.target.checked }))}
                />
                同步时删除大纲外章节
              </label>
            </div>
            {showSyncPreview ? (
              <div className="space-y-2 rounded-md border p-2 text-xs">
                <div className="font-medium">
                  新增 {syncPreview.createCount} | 变更 {syncPreview.updateCount} | 保留 {syncPreview.keepCount} | 删除 {syncPreview.deleteCount}
                </div>
                <div className="text-muted-foreground">
                  待删除候选 {syncPreview.deleteCandidateCount} | 受影响正文章节 {syncPreview.affectedGeneratedCount} | 将清空正文 {syncPreview.clearContentCount}
                </div>
                <div className="max-h-40 space-y-1 overflow-auto">
                  {syncPreview.items.map((item) => (
                    <div key={`${item.action}-${item.order}-${item.nextTitle}`} className="flex items-start justify-between gap-2 rounded border p-1.5">
                      <div>
                        <div>第{item.order}章：{item.previousTitle && item.previousTitle !== item.nextTitle ? `${item.previousTitle} -> ${item.nextTitle}` : item.nextTitle}</div>
                        {item.changedFields.length > 0 ? (
                          <div className="text-muted-foreground">字段：{item.changedFields.join("、")}</div>
                        ) : null}
                      </div>
                      <div className="flex items-center gap-1">
                        {item.hasContent ? <Badge variant="outline">有正文</Badge> : null}
                        <Badge variant={actionVariant(item.action)}>{actionLabel(item.action)}</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <div className="flex gap-2">
          <Button variant={viewMode === "cards" ? "default" : "outline"} onClick={() => setViewMode("cards")}>卡片视图</Button>
          <Button variant={viewMode === "table" ? "default" : "outline"} onClick={() => setViewMode("table")}>表格视图</Button>
          <Button variant={viewMode === "json" ? "default" : "outline"} onClick={() => setViewMode("json")}>JSON高级</Button>
        </div>

        {viewMode === "cards" ? (
          <div className="space-y-2">
            {chapterRows.length === 0 ? (
              <div className="text-sm text-muted-foreground">当前内容无法解析为结构化大纲 JSON。</div>
            ) : chapterRows.map((chapter) => (
              <div key={`${chapter.order}-${chapter.title}`} className="rounded-md border p-3 text-sm">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <div className="font-medium">第{chapter.order}章 · {chapter.title}</div>
                  <Badge variant="outline">{chapter.volumeTitle}</Badge>
                </div>
                <div className="text-muted-foreground">摘要：{chapter.summary || "暂无"}</div>
                <div className="text-muted-foreground">目标：{chapter.purpose || "暂无"}</div>
                <div className="text-muted-foreground">冲突/揭露：{chapter.conflictLevel ?? "-"} / {chapter.revealLevel ?? "-"}</div>
                <div className="text-muted-foreground">角色：{chapter.involvedRoles?.join("、") || "暂无"}</div>
                <div className="text-muted-foreground">目标字数：{chapter.targetWordCount ?? "未设置"}</div>
                <div className="text-muted-foreground">禁止事项：{chapter.mustAvoid || "无"}</div>
              </div>
            ))}
          </div>
        ) : null}

        {viewMode === "table" ? (
          <div className="overflow-auto rounded-md border">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="px-2 py-2">章</th>
                  <th className="px-2 py-2">标题</th>
                  <th className="px-2 py-2">目标</th>
                  <th className="px-2 py-2">冲突</th>
                  <th className="px-2 py-2">揭露</th>
                  <th className="px-2 py-2">角色</th>
                  <th className="px-2 py-2">字数</th>
                </tr>
              </thead>
              <tbody>
                {chapterRows.map((chapter) => (
                  <tr key={`${chapter.order}-${chapter.title}`} className="border-b">
                    <td className="px-2 py-2">{chapter.order}</td>
                    <td className="px-2 py-2">{chapter.title}</td>
                    <td className="px-2 py-2">{chapter.purpose || chapter.summary || "-"}</td>
                    <td className="px-2 py-2">{chapter.conflictLevel ?? "-"}</td>
                    <td className="px-2 py-2">{chapter.revealLevel ?? "-"}</td>
                    <td className="px-2 py-2">{chapter.involvedRoles?.join("、") || "-"}</td>
                    <td className="px-2 py-2">{chapter.targetWordCount ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {viewMode === "json" ? (
          <AiRevisionWorkspace
            value={draftText}
            onChange={onDraftTextChange}
            instruction={optimizeInstruction}
            onInstructionChange={onOptimizeInstructionChange}
            onOptimizeFull={onOptimizeFull}
            onOptimizeSelection={onOptimizeSelection}
            isOptimizing={isOptimizing}
            preview={optimizePreview}
            onApplyPreview={onApplyOptimizePreview}
            onCancelPreview={onCancelOptimizePreview}
            leftLabel="结构化大纲草稿（JSON，可编辑）"
            minHeightClassName="min-h-[360px]"
          />
        ) : null}
      </CardContent>
    </Card>
  );
}
