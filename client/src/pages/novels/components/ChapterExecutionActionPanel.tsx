import type { Chapter } from "@ai-novel/shared/types/novel";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

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

  return (
    <Card className="self-start lg:sticky lg:top-4">
      <CardHeader className="pb-3">
        <div>
          <CardTitle className="text-base">AI 快捷操作</CardTitle>
          <div className="text-sm text-muted-foreground">右侧只保留操作，不再和正文抢首屏，让用户能一边看结果一边做决定。</div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-2">
          <div className="text-xs text-muted-foreground">快速推进</div>
          <div className="grid gap-2">
            <Button variant="outline" onClick={onGenerateChapterPlan} disabled={!selectedChapter || isGeneratingChapterPlan}>
              {isGeneratingChapterPlan ? "规划中..." : "生成本章计划"}
            </Button>
            <Button variant="secondary" onClick={onGenerateSelectedChapter} disabled={!hasCharacters || !selectedChapter}>
              写本章
            </Button>
            <Button variant="outline" onClick={onRunFullAudit} disabled={!selectedChapter || isRunningFullAudit}>
              {isRunningFullAudit ? "审计中..." : "运行完整审计"}
            </Button>
            <Button variant="secondary" onClick={onAutoRepair} disabled={!selectedChapter || isRepairingChapter}>
              {isRepairingChapter ? "修复中..." : "自动修复问题"}
            </Button>
            {selectedChapter ? (
              <Button asChild variant="outline">
                <Link to={`/novels/${novelId}/chapters/${selectedChapter.id}`}>打开编辑器</Link>
              </Button>
            ) : (
              <Button variant="outline" disabled>打开编辑器</Button>
            )}
          </div>
        </div>

        <details className="rounded-xl border border-border/70 p-3">
          <summary className="cursor-pointer list-none text-sm font-medium text-foreground">补充资产与专项检查</summary>
          <div className="mt-3 grid gap-2">
            <Button size="sm" variant="outline" onClick={onGenerateTaskSheet} disabled={!selectedChapter}>生成任务单</Button>
            <Button size="sm" variant="outline" onClick={onGenerateSceneCards} disabled={!selectedChapter}>生成场景拆解</Button>
            <Button size="sm" variant="outline" onClick={onSummarizeChapter} disabled={!selectedChapter}>生成摘要</Button>
            <Button size="sm" variant="outline" onClick={onReplanChapter} disabled={!selectedChapter || isReplanningChapter}>
              {isReplanningChapter ? "调整中..." : "调整后续章节计划"}
            </Button>
            <Button size="sm" variant="outline" onClick={onCheckContinuity} disabled={!selectedChapter || isReviewingChapter}>
              {isReviewingChapter ? "检查中..." : "检查连续性"}
            </Button>
            <Button size="sm" variant="outline" onClick={onCheckCharacterConsistency} disabled={!selectedChapter || isReviewingChapter}>
              人设一致性
            </Button>
            <Button size="sm" variant="outline" onClick={onCheckPacing} disabled={!selectedChapter || isReviewingChapter}>
              检查节奏
            </Button>
          </div>
        </details>

        <details className="rounded-xl border border-border/70 p-3">
          <summary className="cursor-pointer list-none text-sm font-medium text-foreground">润色增强</summary>
          <div className="mt-3 grid gap-2">
            <Button size="sm" variant="outline" onClick={onRewriteChapter} disabled={!hasCharacters || !selectedChapter}>重写本章</Button>
            <Button size="sm" variant="outline" onClick={onExpandChapter} disabled={!selectedChapter}>扩写本章</Button>
            <Button size="sm" variant="outline" onClick={onCompressChapter} disabled={!selectedChapter}>压缩本章</Button>
            <Button size="sm" variant="outline" onClick={onStrengthenConflict} disabled={!selectedChapter}>强化冲突</Button>
            <Button size="sm" variant="outline" onClick={onEnhanceEmotion} disabled={!selectedChapter}>增强情绪</Button>
            <Button size="sm" variant="outline" onClick={onUnifyStyle} disabled={!selectedChapter}>文风统一</Button>
            <Button size="sm" variant="outline" onClick={onAddDialogue} disabled={!selectedChapter}>增加对白</Button>
            <Button size="sm" variant="outline" onClick={onAddDescription} disabled={!selectedChapter}>增加描写</Button>
          </div>
        </details>

        <details className="rounded-xl border border-border/70 p-3">
          <summary className="cursor-pointer list-none text-sm font-medium text-foreground">高级写作策略</summary>
          <div className="mt-2 text-xs text-muted-foreground">
            不确定时先用默认值；只有在你明确知道这章需要更快节奏、更强冲突或更高自由度时再手调。
          </div>
          <div className="mt-3 grid gap-2">
            <div className="grid gap-2">
              <label htmlFor="chapter-strategy-run-mode" className="space-y-1 text-xs text-muted-foreground">
                <span>运行模式</span>
                <select
                  id="chapter-strategy-run-mode"
                  className="w-full rounded-md border bg-background p-2 text-sm text-foreground"
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
                  className="w-full rounded-md border bg-background p-2 text-sm text-foreground"
                  value={strategy.wordSize}
                  onChange={(event) => onStrategyChange("wordSize", event.target.value)}
                >
                  <option value="short">短</option>
                  <option value="medium">中</option>
                  <option value="long">长</option>
                </select>
              </label>
            </div>
            <div className="grid gap-2">
              <label htmlFor="chapter-strategy-conflict" className="space-y-1 text-xs text-muted-foreground">
                <span>冲突强度</span>
                <input
                  id="chapter-strategy-conflict"
                  className="w-full rounded-md border bg-background p-2 text-sm text-foreground"
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
                  className="w-full rounded-md border bg-background p-2 text-sm text-foreground"
                  value={strategy.pace}
                  onChange={(event) => onStrategyChange("pace", event.target.value)}
                >
                  <option value="slow">慢</option>
                  <option value="balanced">中</option>
                  <option value="fast">快</option>
                </select>
              </label>
              <label htmlFor="chapter-strategy-ai-freedom" className="space-y-1 text-xs text-muted-foreground">
                <span>AI 自由度</span>
                <select
                  id="chapter-strategy-ai-freedom"
                  className="w-full rounded-md border bg-background p-2 text-sm text-foreground"
                  value={strategy.aiFreedom}
                  onChange={(event) => onStrategyChange("aiFreedom", event.target.value)}
                >
                  <option value="low">低</option>
                  <option value="medium">中</option>
                  <option value="high">高</option>
                </select>
              </label>
            </div>
            <Button className="w-full" size="sm" onClick={onApplyStrategy} disabled={isApplyingStrategy || !selectedChapter}>
              {isApplyingStrategy ? "应用中..." : "应用策略到当前章"}
            </Button>
          </div>
        </details>
      </CardContent>
    </Card>
  );
}
