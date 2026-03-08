import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import StreamOutput from "@/components/common/StreamOutput";
import AiRevisionWorkspace from "@/components/common/AiRevisionWorkspace";
import type { StructuredVolume } from "../novelEdit.utils";
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
  onResyncChapters: () => void;
  isResyncing: boolean;
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
    onResyncChapters,
    isResyncing,
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
  } = props;

  return (
    <Card>
      <CardHeader><CardTitle>结构化章节大纲</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <WorldInjectionHint worldInjectionSummary={worldInjectionSummary} />
        {!hasCharacters ? (
          <div className="flex items-center justify-between gap-2 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
            <span>请先添加至少 1 个角色，再生成结构化章节大纲。</span>
            <Button size="sm" variant="outline" onClick={onGoToCharacterTab}>去角色管理</Button>
          </div>
        ) : null}
        <div className="flex gap-2">
          <Button onClick={onGenerate} disabled={isGenerating || !hasCharacters}>
            生成结构化大纲
          </Button>
          <Button variant="secondary" onClick={onStop} disabled={!isGenerating}>停止生成</Button>
          <Button
            variant="outline"
            onClick={onResyncChapters}
            disabled={isResyncing || !hasCharacters || structuredVolumes.length === 0}
          >
            {isResyncing ? "同步中..." : "重新同步章节"}
          </Button>
        </div>
        <StreamOutput isStreaming={isGenerating} content={streamContent} onAbort={onAbortStream} />
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
        <Button onClick={onSave} disabled={isSaving}>{isSaving ? "保存中..." : "保存结构化大纲"}</Button>
        <div className="space-y-2">
          <div className="text-sm font-medium">解析预览</div>
          {structuredVolumes.length === 0 ? (
            <div className="text-sm text-muted-foreground">当前内容无法解析为结构化大纲 JSON。</div>
          ) : structuredVolumes.map((volume, volumeIndex) => (
            <div key={`${volume.volumeTitle}-${volumeIndex}`} className="rounded-md border p-3">
              <div className="mb-2 font-semibold">{volume.volumeTitle}</div>
              <div className="space-y-1 text-sm">
                {(volume.chapters ?? []).map((chapter, chapterIndex) => (
                  <div key={`${volume.volumeTitle}-${chapter.order}-${chapterIndex}`}>
                    第{chapter.order}章：{chapter.title} - {chapter.summary}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
