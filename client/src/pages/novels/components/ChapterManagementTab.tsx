import { useMemo, useState } from "react";
import type { Chapter, QualityScore, ReviewIssue } from "@ai-novel/shared/types/novel";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import StreamOutput from "@/components/common/StreamOutput";
import WorldInjectionHint from "./WorldInjectionHint";

type AssetTabKey = "content" | "taskSheet" | "sceneCards" | "quality" | "repair";

interface ChapterManagementTabProps {
  novelId: string;
  worldInjectionSummary: string | null;
  hasCharacters: boolean;
  chapters: Chapter[];
  selectedChapterId: string;
  selectedChapter?: Chapter;
  onSelectChapter: (chapterId: string) => void;
  onGoToCharacterTab: () => void;
  onCreateChapter: () => void;
  isCreatingChapter: boolean;
  chapterOperationMessage: string;
  strategy: {
    runMode: "fast" | "polish";
    wordSize: "short" | "medium" | "long";
    conflictLevel: number;
    pace: "slow" | "balanced" | "fast";
    aiFreedom: "low" | "medium" | "high";
  };
  onStrategyChange: (
    field: "runMode" | "wordSize" | "conflictLevel" | "pace" | "aiFreedom",
    value: string | number,
  ) => void;
  onApplyStrategy: () => void;
  isApplyingStrategy: boolean;
  onGenerateSelectedChapter: () => void;
  onRewriteChapter: () => void;
  onExpandChapter: () => void;
  onCompressChapter: () => void;
  onSummarizeChapter: () => void;
  onGenerateTaskSheet: () => void;
  onGenerateSceneCards: () => void;
  onCheckContinuity: () => void;
  onCheckCharacterConsistency: () => void;
  onCheckPacing: () => void;
  onAutoRepair: () => void;
  onStrengthenConflict: () => void;
  onEnhanceEmotion: () => void;
  onUnifyStyle: () => void;
  onAddDialogue: () => void;
  onAddDescription: () => void;
  isReviewingChapter: boolean;
  isRepairingChapter: boolean;
  reviewResult: {
    score: QualityScore;
    issues: ReviewIssue[];
  } | null;
  chapterQualityReport?: {
    coherence: number;
    repetition: number;
    pacing: number;
    voice: number;
    engagement: number;
    overall: number;
    issues?: string | null;
  };
  repairStreamContent: string;
  isRepairStreaming: boolean;
  onAbortRepair: () => void;
  streamContent: string;
  isStreaming: boolean;
  onAbortStream: () => void;
}

function chapterStatusLabel(status?: Chapter["chapterStatus"] | null): string {
  switch (status) {
    case "unplanned":
      return "未规划";
    case "pending_generation":
      return "待生成";
    case "generating":
      return "生成中";
    case "pending_review":
      return "待审校";
    case "needs_repair":
      return "需修复";
    case "completed":
      return "已完成";
    default:
      return "未设置";
  }
}

function parseRiskFlags(input: string | null | undefined): string[] {
  if (!input?.trim()) {
    return [];
  }
  return input
    .split(/[\n,，;；|]/g)
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
    .slice(0, 4);
}

export default function ChapterManagementTab(props: ChapterManagementTabProps) {
  const {
    novelId,
    worldInjectionSummary,
    hasCharacters,
    chapters,
    selectedChapterId,
    selectedChapter,
    onSelectChapter,
    onGoToCharacterTab,
    onCreateChapter,
    isCreatingChapter,
    chapterOperationMessage,
    strategy,
    onStrategyChange,
    onApplyStrategy,
    isApplyingStrategy,
    onGenerateSelectedChapter,
    onRewriteChapter,
    onExpandChapter,
    onCompressChapter,
    onSummarizeChapter,
    onGenerateTaskSheet,
    onGenerateSceneCards,
    onCheckContinuity,
    onCheckCharacterConsistency,
    onCheckPacing,
    onAutoRepair,
    onStrengthenConflict,
    onEnhanceEmotion,
    onUnifyStyle,
    onAddDialogue,
    onAddDescription,
    isReviewingChapter,
    isRepairingChapter,
    reviewResult,
    chapterQualityReport,
    repairStreamContent,
    isRepairStreaming,
    onAbortRepair,
    streamContent,
    isStreaming,
    onAbortStream,
  } = props;

  const [assetTab, setAssetTab] = useState<AssetTabKey>("content");
  const riskFlags = useMemo(() => parseRiskFlags(selectedChapter?.riskFlags), [selectedChapter?.riskFlags]);

  return (
    <Card>
      <CardHeader className="space-y-2">
        <div className="flex flex-row items-center justify-between">
          <CardTitle>章节执行</CardTitle>
          <Button onClick={onCreateChapter} disabled={isCreatingChapter}>
            {isCreatingChapter ? "创建中..." : "新建章节"}
          </Button>
        </div>
        <div className="rounded-md border p-2 text-xs">
          <div className="mb-2 font-medium text-muted-foreground">生成策略条</div>
          <div className="grid gap-2 md:grid-cols-6">
            <select
              className="rounded-md border bg-background p-1"
              value={strategy.runMode}
              onChange={(event) => onStrategyChange("runMode", event.target.value)}
            >
              <option value="fast">快速</option>
              <option value="polish">精修</option>
            </select>
            <select
              className="rounded-md border bg-background p-1"
              value={strategy.wordSize}
              onChange={(event) => onStrategyChange("wordSize", event.target.value)}
            >
              <option value="short">短</option>
              <option value="medium">中</option>
              <option value="long">长</option>
            </select>
            <input
              className="rounded-md border bg-background p-1"
              type="number"
              min={0}
              max={100}
              value={strategy.conflictLevel}
              onChange={(event) => onStrategyChange("conflictLevel", Number(event.target.value || 0))}
            />
            <select
              className="rounded-md border bg-background p-1"
              value={strategy.pace}
              onChange={(event) => onStrategyChange("pace", event.target.value)}
            >
              <option value="slow">慢</option>
              <option value="balanced">中</option>
              <option value="fast">快</option>
            </select>
            <select
              className="rounded-md border bg-background p-1"
              value={strategy.aiFreedom}
              onChange={(event) => onStrategyChange("aiFreedom", event.target.value)}
            >
              <option value="low">低</option>
              <option value="medium">中</option>
              <option value="high">高</option>
            </select>
            <Button size="sm" onClick={onApplyStrategy} disabled={isApplyingStrategy || !selectedChapter}>
              {isApplyingStrategy ? "应用中..." : "应用策略"}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <WorldInjectionHint worldInjectionSummary={worldInjectionSummary} />
        {chapterOperationMessage ? <div className="text-xs text-muted-foreground">{chapterOperationMessage}</div> : null}
        {!hasCharacters ? (
          <div className="flex items-center justify-between gap-2 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
            <span>请先添加至少 1 个角色，再生成章节内容。</span>
            <Button size="sm" variant="outline" onClick={onGoToCharacterTab}>去角色管理</Button>
          </div>
        ) : null}
        <div className="grid gap-3 xl:grid-cols-[300px_minmax(0,1fr)_340px]">
          <div className="rounded-md border">
            <div className="border-b px-3 py-2 text-xs font-medium text-muted-foreground">
              状态列表：{chapters.length}
            </div>
            <div className="max-h-[640px] space-y-2 overflow-y-auto p-2">
              {chapters.length === 0 ? (
                <div className="rounded-md border border-dashed p-4 text-xs text-muted-foreground">暂无章节。</div>
              ) : (
                chapters.map((chapter) => {
                  const chapterRisks = parseRiskFlags(chapter.riskFlags);
                  return (
                    <button
                      key={chapter.id}
                      type="button"
                      onClick={() => onSelectChapter(chapter.id)}
                      className={`w-full rounded-md border p-2 text-left transition ${
                        selectedChapterId === chapter.id ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"
                      }`}
                    >
                      <div className="text-sm font-medium">第{chapter.order}章：{chapter.title}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span>字数：{chapter.content?.length ?? 0}</span>
                        <Badge variant="outline">{chapterStatusLabel(chapter.chapterStatus)}</Badge>
                        {chapter.generationState ? <Badge variant="secondary">{chapter.generationState}</Badge> : null}
                      </div>
                      {chapterRisks.length > 0 ? (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {chapterRisks.map((risk) => (
                            <Badge key={`${chapter.id}-${risk}`} variant="secondary">{risk}</Badge>
                          ))}
                        </div>
                      ) : null}
                    </button>
                  );
                })
              )}
            </div>
          </div>

          <div className="space-y-3">
            {selectedChapter ? (
              <div className="rounded-md border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-medium">第{selectedChapter.order}章：{selectedChapter.title}</div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>状态：{chapterStatusLabel(selectedChapter.chapterStatus)}</span>
                    <span>字数：{selectedChapter.content?.length ?? 0}</span>
                    <span>目标：{selectedChapter.targetWordCount ?? "-"}</span>
                  </div>
                </div>

                <div className="mt-2 grid gap-2 md:grid-cols-2">
                  <div className="rounded-md border p-2 text-xs text-muted-foreground">大纲版本：当前草稿</div>
                  <div className="rounded-md border p-2 text-xs text-muted-foreground">
                    上次生成：{selectedChapter.updatedAt ? new Date(selectedChapter.updatedAt).toLocaleString() : "暂无"}
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" variant={assetTab === "content" ? "default" : "outline"} onClick={() => setAssetTab("content")}>正文</Button>
                  <Button size="sm" variant={assetTab === "taskSheet" ? "default" : "outline"} onClick={() => setAssetTab("taskSheet")}>任务单</Button>
                  <Button size="sm" variant={assetTab === "sceneCards" ? "default" : "outline"} onClick={() => setAssetTab("sceneCards")}>场景拆解</Button>
                  <Button size="sm" variant={assetTab === "quality" ? "default" : "outline"} onClick={() => setAssetTab("quality")}>质量报告</Button>
                  <Button size="sm" variant={assetTab === "repair" ? "default" : "outline"} onClick={() => setAssetTab("repair")}>修复记录</Button>
                </div>

                <div className="mt-3 rounded-md border bg-muted/20 p-2 text-sm">
                  {assetTab === "content" ? (
                    <div className="max-h-[330px] overflow-y-auto whitespace-pre-wrap">
                      {selectedChapter.content?.trim() || "当前章节尚未生成正文"}
                    </div>
                  ) : null}
                  {assetTab === "taskSheet" ? (
                    <div className="max-h-[330px] overflow-y-auto whitespace-pre-wrap">
                      {selectedChapter.taskSheet?.trim() || selectedChapter.expectation?.trim() || "暂无任务单"}
                    </div>
                  ) : null}
                  {assetTab === "sceneCards" ? (
                    <div className="max-h-[330px] overflow-y-auto whitespace-pre-wrap">
                      {selectedChapter.sceneCards?.trim() || "暂无场景拆解"}
                    </div>
                  ) : null}
                  {assetTab === "quality" ? (
                    <div className="space-y-1 text-xs">
                      <div>overall: {chapterQualityReport?.overall ?? selectedChapter.qualityScore ?? "-"}</div>
                      <div>coherence: {chapterQualityReport?.coherence ?? "-"}</div>
                      <div>repetition: {chapterQualityReport?.repetition ?? "-"}</div>
                      <div>pacing: {chapterQualityReport?.pacing ?? selectedChapter.pacingScore ?? "-"}</div>
                      <div>voice: {chapterQualityReport?.voice ?? "-"}</div>
                      <div>engagement: {chapterQualityReport?.engagement ?? "-"}</div>
                      {reviewResult?.issues?.length ? (
                        <div className="pt-1">
                          <div className="font-medium">最近审校问题</div>
                          {reviewResult.issues.slice(0, 5).map((item, index) => (
                            <div key={`${item.category}-${index}`}>{item.category}: {item.fixSuggestion}</div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  {assetTab === "repair" ? (
                    <div className="max-h-[330px] overflow-y-auto whitespace-pre-wrap">
                      {selectedChapter.repairHistory?.trim() || repairStreamContent || "暂无修复记录"}
                    </div>
                  ) : null}
                </div>
                {riskFlags.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {riskFlags.map((risk) => <Badge key={risk} variant="secondary">{risk}</Badge>)}
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
                请先在左侧选择一个章节查看资产。
              </div>
            )}
          </div>

          <div className="space-y-3">
            <div className="rounded-md border p-3">
              <div className="text-sm font-medium">AI 操作面板</div>
              <div className="mt-2 space-y-2">
                <div className="text-xs text-muted-foreground">生成类</div>
                <div className="grid grid-cols-2 gap-2">
                  <Button size="sm" variant="secondary" onClick={onGenerateSelectedChapter} disabled={!hasCharacters || !selectedChapter}>生成本章</Button>
                  <Button size="sm" variant="secondary" onClick={onRewriteChapter} disabled={!hasCharacters || !selectedChapter}>重写本章</Button>
                  <Button size="sm" variant="outline" onClick={onExpandChapter} disabled={!selectedChapter}>扩写本章</Button>
                  <Button size="sm" variant="outline" onClick={onCompressChapter} disabled={!selectedChapter}>压缩本章</Button>
                  <Button size="sm" variant="outline" onClick={onSummarizeChapter} disabled={!selectedChapter}>生成摘要</Button>
                  <Button asChild size="sm" variant="outline" disabled={!selectedChapter}>
                    <Link to={selectedChapter ? `/novels/${novelId}/chapters/${selectedChapter.id}` : "#"}>打开编辑器</Link>
                  </Button>
                </div>

                <div className="pt-1 text-xs text-muted-foreground">资产类</div>
                <div className="grid grid-cols-2 gap-2">
                  <Button size="sm" variant="outline" onClick={onGenerateTaskSheet} disabled={!selectedChapter}>生成任务单</Button>
                  <Button size="sm" variant="outline" onClick={onGenerateSceneCards} disabled={!selectedChapter}>生成场景拆解</Button>
                </div>

                <div className="pt-1 text-xs text-muted-foreground">质量类</div>
                <div className="grid grid-cols-2 gap-2">
                  <Button size="sm" variant="outline" onClick={onCheckContinuity} disabled={!selectedChapter || isReviewingChapter}>
                    {isReviewingChapter ? "检查中..." : "检查连续性"}
                  </Button>
                  <Button size="sm" variant="outline" onClick={onCheckCharacterConsistency} disabled={!selectedChapter || isReviewingChapter}>
                    人设一致性
                  </Button>
                  <Button size="sm" variant="outline" onClick={onCheckPacing} disabled={!selectedChapter || isReviewingChapter}>检查节奏</Button>
                  <Button size="sm" variant="secondary" onClick={onAutoRepair} disabled={!selectedChapter || isRepairingChapter}>
                    {isRepairingChapter ? "修复中..." : "自动修复问题"}
                  </Button>
                </div>

                <div className="pt-1 text-xs text-muted-foreground">风格类</div>
                <div className="grid grid-cols-2 gap-2">
                  <Button size="sm" variant="outline" onClick={onStrengthenConflict} disabled={!selectedChapter}>强化冲突</Button>
                  <Button size="sm" variant="outline" onClick={onEnhanceEmotion} disabled={!selectedChapter}>增强情绪</Button>
                  <Button size="sm" variant="outline" onClick={onUnifyStyle} disabled={!selectedChapter}>文风统一</Button>
                  <Button size="sm" variant="outline" onClick={onAddDialogue} disabled={!selectedChapter}>增加对白</Button>
                  <Button size="sm" variant="outline" onClick={onAddDescription} disabled={!selectedChapter}>增加描写</Button>
                </div>
              </div>
            </div>

            <StreamOutput content={streamContent} isStreaming={isStreaming} onAbort={onAbortStream} />
            <StreamOutput content={repairStreamContent} isStreaming={isRepairStreaming} onAbort={onAbortRepair} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
