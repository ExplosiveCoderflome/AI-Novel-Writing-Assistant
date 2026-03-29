import type { Chapter } from "@ai-novel/shared/types/novel";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { chapterStatusLabel, chapterSuggestedActionLabel } from "./chapterExecution.shared";

interface ChapterExecutionActionPanelProps {
  novelId: string;
  selectedChapter: Chapter | undefined;
  hasCharacters: boolean;
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
  onGenerateChapterPlan: () => void;
  onReplanChapter: () => void;
  onRunFullAudit: () => void;
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
  isGeneratingChapterPlan: boolean;
  isReplanningChapter: boolean;
  isRunningFullAudit: boolean;
}

export default function ChapterExecutionActionPanel(props: ChapterExecutionActionPanelProps) {
  const {
    novelId,
    selectedChapter,
    hasCharacters,
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
    onGenerateChapterPlan,
    onReplanChapter,
    onRunFullAudit,
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
    isGeneratingChapterPlan,
    isReplanningChapter,
    isRunningFullAudit,
  } = props;

  const selectedChapterLabel = selectedChapter
    ? `第${selectedChapter.order}章 ${selectedChapter.title || "未命名章节"}`
    : "请选择一个章节";

  return (
    <Card className="self-start overflow-hidden border-border/70 lg:sticky lg:top-4">
      <CardHeader className="gap-3 border-b bg-gradient-to-b from-muted/30 to-background pb-4">
        <div className="space-y-1">
          <CardTitle className="text-base">AI 执行台</CardTitle>
          <p className="text-sm leading-6 text-muted-foreground">
            右侧保留动作和策略，让你一边看正文，一边决定下一步是继续写、审校还是修复。
          </p>
        </div>
        <div className="rounded-2xl border border-border/70 bg-background/90 p-3">
          <div className="text-xs text-muted-foreground">当前操作对象</div>
          <div className="mt-1 text-sm font-semibold text-foreground">{selectedChapterLabel}</div>
          {selectedChapter ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Badge variant="secondary">{chapterStatusLabel(selectedChapter.chapterStatus)}</Badge>
              <Badge variant="outline">{chapterSuggestedActionLabel(selectedChapter)}</Badge>
            </div>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-4 pt-4">
        <div className="rounded-2xl border border-primary/15 bg-primary/5 p-4">
          <div className="text-xs text-muted-foreground">主推进动作</div>
          <div className="mt-3 grid gap-2">
            <Button variant="outline" onClick={onGenerateChapterPlan} disabled={!selectedChapter || isGeneratingChapterPlan}>
              {isGeneratingChapterPlan ? "正在生成章节计划..." : "生成本章计划"}
            </Button>
            <Button variant="default" onClick={onGenerateSelectedChapter} disabled={!hasCharacters || !selectedChapter}>
              写本章
            </Button>
            <Button variant="outline" onClick={onRunFullAudit} disabled={!selectedChapter || isRunningFullAudit}>
              {isRunningFullAudit ? "正在运行完整审校..." : "运行完整审校"}
            </Button>
            <Button variant="secondary" onClick={onAutoRepair} disabled={!selectedChapter || isRepairingChapter}>
              {isRepairingChapter ? "正在修复中..." : "自动修复问题"}
            </Button>
            {selectedChapter ? (
              <Button asChild variant="outline">
                <Link to={`/novels/${novelId}/chapters/${selectedChapter.id}`}>打开章节编辑器</Link>
              </Button>
            ) : (
              <Button variant="outline" disabled>打开章节编辑器</Button>
            )}
          </div>
        </div>

        <details className="rounded-2xl border border-border/70 p-4">
          <summary className="cursor-pointer list-none text-sm font-semibold text-foreground">
            资产补全与专项检查
          </summary>
          <div className="mt-3 grid gap-2">
            <Button size="sm" variant="outline" onClick={onGenerateTaskSheet} disabled={!selectedChapter}>生成任务单</Button>
            <Button size="sm" variant="outline" onClick={onGenerateSceneCards} disabled={!selectedChapter}>生成场景拆解</Button>
            <Button size="sm" variant="outline" onClick={onSummarizeChapter} disabled={!selectedChapter}>生成摘要</Button>
            <Button size="sm" variant="outline" onClick={onReplanChapter} disabled={!selectedChapter || isReplanningChapter}>
              {isReplanningChapter ? "正在调整后续计划..." : "调整后续章节计划"}
            </Button>
            <Button size="sm" variant="outline" onClick={onCheckContinuity} disabled={!selectedChapter || isReviewingChapter}>
              {isReviewingChapter ? "正在检查中..." : "检查连续性"}
            </Button>
            <Button size="sm" variant="outline" onClick={onCheckCharacterConsistency} disabled={!selectedChapter || isReviewingChapter}>
              检查人设一致性
            </Button>
            <Button size="sm" variant="outline" onClick={onCheckPacing} disabled={!selectedChapter || isReviewingChapter}>
              检查节奏
            </Button>
          </div>
        </details>

        <details className="rounded-2xl border border-border/70 p-4">
          <summary className="cursor-pointer list-none text-sm font-semibold text-foreground">
            润色增强
          </summary>
          <div className="mt-3 grid gap-2">
            <Button size="sm" variant="outline" onClick={onRewriteChapter} disabled={!hasCharacters || !selectedChapter}>重写本章</Button>
            <Button size="sm" variant="outline" onClick={onExpandChapter} disabled={!selectedChapter}>扩写本章</Button>
            <Button size="sm" variant="outline" onClick={onCompressChapter} disabled={!selectedChapter}>压缩本章</Button>
            <Button size="sm" variant="outline" onClick={onStrengthenConflict} disabled={!selectedChapter}>强化冲突</Button>
            <Button size="sm" variant="outline" onClick={onEnhanceEmotion} disabled={!selectedChapter}>增强情绪</Button>
            <Button size="sm" variant="outline" onClick={onUnifyStyle} disabled={!selectedChapter}>统一文风</Button>
            <Button size="sm" variant="outline" onClick={onAddDialogue} disabled={!selectedChapter}>增加对话</Button>
            <Button size="sm" variant="outline" onClick={onAddDescription} disabled={!selectedChapter}>增加描写</Button>
          </div>
        </details>

        <details className="rounded-2xl border border-border/70 p-4">
          <summary className="cursor-pointer list-none text-sm font-semibold text-foreground">
            高级写作策略
          </summary>
          <div className="mt-2 text-xs leading-6 text-muted-foreground">
            不确定时先保持默认值。只有你明确知道这一章需要更快节奏、更强冲突或更高自由度时，再手动调整。
          </div>
          <div className="mt-3 grid gap-3">
            <label htmlFor="chapter-strategy-run-mode" className="space-y-1 text-xs text-muted-foreground">
              <span>运行模式</span>
              <select
                id="chapter-strategy-run-mode"
                className="w-full rounded-xl border bg-background p-2 text-sm text-foreground"
                value={strategy.runMode}
                onChange={(event) => onStrategyChange("runMode", event.target.value)}
              >
                <option value="fast">快速</option>
                <option value="polish">精修</option>
              </select>
            </label>
            <label htmlFor="chapter-strategy-word-size" className="space-y-1 text-xs text-muted-foreground">
              <span>篇幅</span>
              <select
                id="chapter-strategy-word-size"
                className="w-full rounded-xl border bg-background p-2 text-sm text-foreground"
                value={strategy.wordSize}
                onChange={(event) => onStrategyChange("wordSize", event.target.value)}
              >
                <option value="short">短</option>
                <option value="medium">中</option>
                <option value="long">长</option>
              </select>
            </label>
            <label htmlFor="chapter-strategy-conflict" className="space-y-1 text-xs text-muted-foreground">
              <span>冲突强度</span>
              <input
                id="chapter-strategy-conflict"
                className="w-full rounded-xl border bg-background p-2 text-sm text-foreground"
                type="number"
                min={0}
                max={100}
                value={strategy.conflictLevel}
                onChange={(event) => onStrategyChange("conflictLevel", Number(event.target.value || 0))}
              />
            </label>
            <label htmlFor="chapter-strategy-pace" className="space-y-1 text-xs text-muted-foreground">
              <span>节奏</span>
              <select
                id="chapter-strategy-pace"
                className="w-full rounded-xl border bg-background p-2 text-sm text-foreground"
                value={strategy.pace}
                onChange={(event) => onStrategyChange("pace", event.target.value)}
              >
                <option value="slow">慢</option>
                <option value="balanced">均衡</option>
                <option value="fast">快</option>
              </select>
            </label>
            <label htmlFor="chapter-strategy-ai-freedom" className="space-y-1 text-xs text-muted-foreground">
              <span>AI 自由度</span>
              <select
                id="chapter-strategy-ai-freedom"
                className="w-full rounded-xl border bg-background p-2 text-sm text-foreground"
                value={strategy.aiFreedom}
                onChange={(event) => onStrategyChange("aiFreedom", event.target.value)}
              >
                <option value="low">低</option>
                <option value="medium">中</option>
                <option value="high">高</option>
              </select>
            </label>
            <Button className="w-full" size="sm" onClick={onApplyStrategy} disabled={isApplyingStrategy || !selectedChapter}>
              {isApplyingStrategy ? "正在应用策略..." : "应用策略到当前章"}
            </Button>
          </div>
        </details>
      </CardContent>
    </Card>
  );
}
