import { useMemo, useRef, useState } from "react";
import type { StorylineDiff, StorylineVersion } from "@ai-novel/shared/types/novel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import LLMSelector from "@/components/common/LLMSelector";
import StreamOutput from "@/components/common/StreamOutput";
import WorldInjectionHint from "./WorldInjectionHint";
import { parseStorylineStructuredView } from "./storylineView.utils";

interface StorylineImpactResult {
  novelId: string;
  sourceVersion: number | null;
  affectedCharacters: number;
  affectedChapters: number;
  changedLines: number;
  requiresOutlineRebuild: boolean;
  recommendations: {
    shouldSyncOutline: boolean;
    shouldRecheckCharacters: boolean;
    suggestedStrategy: "rebuild_outline" | "incremental_sync";
  };
}

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
  storylineMessage: string;
  storylineVersions: StorylineVersion[];
  selectedVersionId: string;
  onSelectedVersionChange: (id: string) => void;
  onCreateDraftVersion: () => void;
  isCreatingDraftVersion: boolean;
  onLoadSelectedVersionToDraft: () => void;
  onActivateVersion: () => void;
  isActivatingVersion: boolean;
  onFreezeVersion: () => void;
  isFreezingVersion: boolean;
  onLoadVersionDiff: () => void;
  isLoadingVersionDiff: boolean;
  diffResult: StorylineDiff | null;
  onAnalyzeDraftImpact: () => void;
  isAnalyzingDraftImpact: boolean;
  onAnalyzeVersionImpact: () => void;
  isAnalyzingVersionImpact: boolean;
  impactResult: StorylineImpactResult | null;
}

function statusLabel(status: StorylineVersion["status"]): string {
  if (status === "active") {
    return "已生效";
  }
  if (status === "frozen") {
    return "已冻结";
  }
  return "草稿";
}

function statusVariant(status: StorylineVersion["status"]): "secondary" | "outline" | "default" {
  if (status === "active") {
    return "default";
  }
  if (status === "frozen") {
    return "outline";
  }
  return "secondary";
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
    storylineMessage,
    storylineVersions,
    selectedVersionId,
    onSelectedVersionChange,
    onCreateDraftVersion,
    isCreatingDraftVersion,
    onLoadSelectedVersionToDraft,
    onActivateVersion,
    isActivatingVersion,
    onFreezeVersion,
    isFreezingVersion,
    onLoadVersionDiff,
    isLoadingVersionDiff,
    diffResult,
    onAnalyzeDraftImpact,
    isAnalyzingDraftImpact,
    onAnalyzeVersionImpact,
    isAnalyzingVersionImpact,
    impactResult,
  } = props;

  const [viewMode, setViewMode] = useState<"text" | "structured">("text");
  const [selectedText, setSelectedText] = useState("");
  const draftTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const selectedVersion = useMemo(
    () => storylineVersions.find((item) => item.id === selectedVersionId),
    [selectedVersionId, storylineVersions],
  );
  const structuredView = useMemo(() => parseStorylineStructuredView(draftText), [draftText]);

  const collectSelectedText = () => {
    const element = draftTextareaRef.current;
    if (!element) {
      return "";
    }
    const segment = element.value.slice(element.selectionStart, element.selectionEnd).trim();
    setSelectedText(segment);
    return segment;
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>故事主线</CardTitle>
        <LLMSelector />
      </CardHeader>
      <CardContent className="space-y-4">
        <WorldInjectionHint worldInjectionSummary={worldInjectionSummary} />
        {!hasCharacters ? (
          <div className="flex items-center justify-between gap-2 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
            <span>建议先为本小说添加至少 1 个角色，再生成主线草稿。</span>
            <Button size="sm" variant="outline" onClick={onGoToCharacterTab}>去角色管理</Button>
          </div>
        ) : null}
        {storylineMessage ? <div className="text-xs text-muted-foreground">{storylineMessage}</div> : null}

        <div className="grid gap-4 xl:grid-cols-[1.55fr_1fr]">
          <div className="space-y-3">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">主线输出</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground">
                    生成提示词（可选）。每次点击“生成主线草稿”都会按提示重新生成，不会直接覆盖生效版。
                  </div>
                  <textarea
                    className="min-h-[72px] w-full rounded-md border bg-background p-2 text-sm"
                    placeholder="例如：偏悬疑节奏、前30章慢热成长、情感线保持克制。"
                    value={generationPrompt}
                    onChange={(event) => onGenerationPromptChange(event.target.value)}
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button onClick={onGenerate} disabled={isGenerating}>生成主线草稿</Button>
                  <Button variant="secondary" onClick={onStop} disabled={!isGenerating}>停止生成</Button>
                </div>
                <StreamOutput isStreaming={isGenerating} content={streamContent} onAbort={onAbortStream} />

                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant={viewMode === "text" ? "default" : "outline"}
                    onClick={() => setViewMode("text")}
                  >
                    文本版
                  </Button>
                  <Button
                    type="button"
                    variant={viewMode === "structured" ? "default" : "outline"}
                    onClick={() => setViewMode("structured")}
                  >
                    结构版
                  </Button>
                </div>

                {viewMode === "text" ? (
                  <textarea
                    ref={draftTextareaRef}
                    className="min-h-[420px] w-full rounded-md border bg-background p-3 text-sm"
                    placeholder="主线草稿会显示在这里，可继续编辑。"
                    value={draftText}
                    onSelect={collectSelectedText}
                    onChange={(event) => onDraftTextChange(event.target.value)}
                  />
                ) : (
                  <div className="grid gap-2 md:grid-cols-2">
                    <div className="rounded-md border p-2 text-xs">
                      <div className="text-muted-foreground">核心主题</div>
                      <div>{structuredView.coreTheme}</div>
                    </div>
                    <div className="rounded-md border p-2 text-xs">
                      <div className="text-muted-foreground">主线目标</div>
                      <div>{structuredView.mainGoal}</div>
                    </div>
                    <div className="rounded-md border p-2 text-xs">
                      <div className="text-muted-foreground">前期推进</div>
                      <div>{structuredView.earlyPhase}</div>
                    </div>
                    <div className="rounded-md border p-2 text-xs">
                      <div className="text-muted-foreground">中期推进</div>
                      <div>{structuredView.middlePhase}</div>
                    </div>
                    <div className="rounded-md border p-2 text-xs">
                      <div className="text-muted-foreground">后期推进</div>
                      <div>{structuredView.latePhase}</div>
                    </div>
                    <div className="rounded-md border p-2 text-xs">
                      <div className="text-muted-foreground">成长路径</div>
                      <div>{structuredView.growthCurve}</div>
                    </div>
                    <div className="rounded-md border p-2 text-xs">
                      <div className="text-muted-foreground">情感线趋势</div>
                      <div>{structuredView.emotionTrend}</div>
                    </div>
                    <div className="rounded-md border p-2 text-xs">
                      <div className="text-muted-foreground">核心冲突</div>
                      <div>{structuredView.coreConflicts}</div>
                    </div>
                    <div className="rounded-md border p-2 text-xs">
                      <div className="text-muted-foreground">结局方向</div>
                      <div>{structuredView.endingDirection}</div>
                    </div>
                    <div className="rounded-md border p-2 text-xs">
                      <div className="text-muted-foreground">禁止事项</div>
                      <div>{structuredView.forbiddenItems}</div>
                    </div>
                  </div>
                )}
                <Button onClick={onSave} disabled={isSaving}>{isSaving ? "保存中..." : "保存主线草稿"}</Button>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-3">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">AI修正</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <textarea
                  className="min-h-[90px] w-full rounded-md border bg-background p-2 text-sm"
                  placeholder="输入修正指令，例如：增强中期冲突并提前埋情感线伏笔。"
                  value={optimizeInstruction}
                  onChange={(event) => onOptimizeInstructionChange(event.target.value)}
                />
                <div className="flex flex-wrap gap-2">
                  <Button onClick={onOptimizeFull} disabled={isOptimizing || !draftText.trim()}>
                    {isOptimizing ? "优化中..." : "优化全文"}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      const currentSelection = collectSelectedText();
                      if (!currentSelection) {
                        return;
                      }
                      onOptimizeSelection(currentSelection);
                    }}
                    disabled={isOptimizing || !draftText.trim() || viewMode !== "text"}
                  >
                    优化选中文本
                  </Button>
                </div>
                {viewMode === "text" ? (
                  <div className="text-xs text-muted-foreground">
                    当前选中：{selectedText ? `${selectedText.slice(0, 40)}${selectedText.length > 40 ? "..." : ""}` : "未选中"}
                  </div>
                ) : null}
                {optimizePreview ? (
                  <div className="space-y-2 rounded-md border p-2">
                    <div className="text-xs text-muted-foreground">优化预览</div>
                    <div className="max-h-36 overflow-auto whitespace-pre-wrap text-xs">{optimizePreview}</div>
                    <div className="flex gap-2">
                      <Button size="sm" onClick={onApplyOptimizePreview}>应用预览</Button>
                      <Button size="sm" variant="outline" onClick={onCancelOptimizePreview}>取消</Button>
                    </div>
                  </div>
                ) : null}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">版本控制</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {storylineVersions.length > 0 ? (
                  <>
                    <select
                      className="w-full rounded-md border bg-background p-2 text-sm"
                      value={selectedVersionId}
                      onChange={(event) => onSelectedVersionChange(event.target.value)}
                    >
                      {storylineVersions.map((version) => (
                        <option key={version.id} value={version.id}>
                          V{version.version} · {statusLabel(version.status)}
                        </option>
                      ))}
                    </select>
                    {selectedVersion ? (
                      <div className="rounded-md border p-2">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">V{selectedVersion.version}</span>
                          <Badge variant={statusVariant(selectedVersion.status)}>
                            {statusLabel(selectedVersion.status)}
                          </Badge>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          创建时间：{new Date(selectedVersion.createdAt).toLocaleString()}
                        </div>
                        <div className="mt-1 line-clamp-3 text-xs text-muted-foreground">
                          {selectedVersion.diffSummary || "暂无差异摘要"}
                        </div>
                      </div>
                    ) : null}
                  </>
                ) : (
                  <div className="text-xs text-muted-foreground">还没有主线版本，请先将草稿保存为版本。</div>
                )}
                <div className="flex flex-wrap gap-2">
                  <Button onClick={onCreateDraftVersion} disabled={isCreatingDraftVersion || !draftText.trim()}>
                    {isCreatingDraftVersion ? "保存中..." : "保存为草稿版本"}
                  </Button>
                  <Button variant="outline" onClick={onLoadSelectedVersionToDraft} disabled={!selectedVersionId}>
                    覆盖当前草稿
                  </Button>
                  <Button variant="secondary" onClick={onActivateVersion} disabled={isActivatingVersion || !selectedVersionId}>
                    {isActivatingVersion ? "生效中..." : "设为生效版"}
                  </Button>
                  <Button variant="outline" onClick={onFreezeVersion} disabled={isFreezingVersion || !selectedVersionId}>
                    {isFreezingVersion ? "冻结中..." : "冻结当前版本"}
                  </Button>
                  <Button variant="outline" onClick={onLoadVersionDiff} disabled={isLoadingVersionDiff || !selectedVersionId}>
                    {isLoadingVersionDiff ? "加载中..." : "查看版本差异"}
                  </Button>
                </div>
                {diffResult ? (
                  <div className="rounded-md border p-2 text-xs">
                    <div className="font-medium">
                      差异预览 V{diffResult.version} · {statusLabel(diffResult.status)}
                    </div>
                    <div className="text-muted-foreground">
                      影响角色 {diffResult.affectedCharacters} | 影响章节 {diffResult.affectedChapters} | 变更行数 {diffResult.changedLines}
                    </div>
                    <div className="mt-1 whitespace-pre-wrap text-muted-foreground">
                      {diffResult.diffSummary || "暂无差异摘要"}
                    </div>
                  </div>
                ) : null}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">影响分析</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" onClick={onAnalyzeDraftImpact} disabled={isAnalyzingDraftImpact || !draftText.trim()}>
                    {isAnalyzingDraftImpact ? "分析中..." : "分析当前草稿"}
                  </Button>
                  <Button variant="outline" onClick={onAnalyzeVersionImpact} disabled={isAnalyzingVersionImpact || !selectedVersionId}>
                    {isAnalyzingVersionImpact ? "分析中..." : "分析当前版本"}
                  </Button>
                </div>
                {impactResult ? (
                  <div className="rounded-md border p-2 text-xs">
                    <div className="font-medium">主线影响预览</div>
                    <div className="text-muted-foreground">
                      影响角色 {impactResult.affectedCharacters} | 影响章节 {impactResult.affectedChapters} | 变更行数 {impactResult.changedLines}
                    </div>
                    <div className="text-muted-foreground">
                      建议策略：{impactResult.recommendations.suggestedStrategy === "rebuild_outline" ? "重建大纲" : "增量同步"}
                    </div>
                    <div className="text-muted-foreground">
                      同步章节大纲：{impactResult.recommendations.shouldSyncOutline ? "建议" : "可选"} | 人设复检：{impactResult.recommendations.shouldRecheckCharacters ? "建议" : "可选"}
                    </div>
                    <div className="text-muted-foreground">
                      {impactResult.requiresOutlineRebuild ? "建议先查看差异后重建大纲。" : "可优先同步受影响章节。"}
                    </div>
                  </div>
                ) : (
                  <div className="text-xs text-muted-foreground">生成主线草稿后先做影响分析，再决定是否设为生效版。</div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
