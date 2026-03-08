import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import LLMSelector from "@/components/common/LLMSelector";
import StreamOutput from "@/components/common/StreamOutput";
import AiRevisionWorkspace from "@/components/common/AiRevisionWorkspace";
import WorldInjectionHint from "./WorldInjectionHint";

interface OutlineTabProps {
  worldInjectionSummary: string | null;
  hasCharacters: boolean;
  isGenerating: boolean;
  streamContent: string;
  onGenerate: () => void;
  onStop: () => void;
  onAbortStream: () => void;
  onGoToCharacterTab: () => void;
  generationPrompt: string;
  onGenerationPromptChange: (next: string) => void;
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
}

export default function OutlineTab(props: OutlineTabProps) {
  const {
    worldInjectionSummary,
    hasCharacters,
    isGenerating,
    streamContent,
    onGenerate,
    onStop,
    onAbortStream,
    onGoToCharacterTab,
    generationPrompt,
    onGenerationPromptChange,
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
  } = props;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>小说发展走向</CardTitle>
        <LLMSelector />
      </CardHeader>
      <CardContent className="space-y-3">
        <WorldInjectionHint worldInjectionSummary={worldInjectionSummary} />
        {!hasCharacters ? (
          <div className="flex items-center justify-between gap-2 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
            <span>建议先为本小说添加至少 1 个角色，再生成发展走向。</span>
            <Button size="sm" variant="outline" onClick={onGoToCharacterTab}>去角色管理</Button>
          </div>
        ) : null}

        <div className="space-y-1">
          <div className="text-xs text-muted-foreground">
            生成提示词（可选）。每次点击“生成发展走向”都会按此提示词重新生成，不会携带旧发展走向文本。
          </div>
          <textarea
            className="min-h-[72px] w-full rounded-md border bg-background p-2 text-sm"
            placeholder="例如：偏悬疑节奏、前30章慢热成长、情感线不要喧宾夺主。"
            value={generationPrompt}
            onChange={(event) => onGenerationPromptChange(event.target.value)}
          />
        </div>

        <div className="flex gap-2">
          <Button onClick={onGenerate} disabled={isGenerating}>生成发展走向</Button>
          <Button variant="secondary" onClick={onStop} disabled={!isGenerating}>停止生成</Button>
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
          leftLabel="发展走向草稿（可编辑）"
        />
        <Button onClick={onSave} disabled={isSaving}>{isSaving ? "保存中..." : "保存发展走向"}</Button>
      </CardContent>
    </Card>
  );
}
