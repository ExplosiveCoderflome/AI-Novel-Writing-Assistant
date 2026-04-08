import type { Chapter } from "@ai-novel/shared/types/novel";
import { Link } from "react-router-dom";
import AiButton from "@/components/common/AiButton";
import AiActionLabel from "@/components/common/AiActionLabel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export type AssetTabKey = "content" | "taskSheet" | "sceneCards" | "quality" | "repair";
export type QueueFilterKey = "all" | "setup" | "draft" | "review" | "completed";

export type PrimaryAction = {
  label: string;
  reason: string;
  variant: "default" | "secondary" | "outline";
  ai?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  href?: string;
};

export type QueueFilterOption = {
  key: QueueFilterKey;
  label: string;
  count: number;
};

export function chapterStatusLabel(status?: Chapter["chapterStatus"] | null): string {
  switch (status) {
    case "unplanned":
      return "待准备";
    case "pending_generation":
      return "待写作";
    case "generating":
      return "写作中";
    case "pending_review":
      return "待确认";
    case "needs_repair":
      return "待修复";
    case "completed":
      return "已完成";
    default:
      return "未设置";
  }
}

export function chapterStatusDescription(status?: Chapter["chapterStatus"] | null): string {
  switch (status) {
    case "unplanned":
      return "待准备：这章还缺少执行素材，通常要先补章节目标、任务单或场景卡。";
    case "pending_generation":
      return "待写作：章节计划已基本齐备，可以开始生成正文。";
    case "generating":
      return "写作中：AI 正在生成本章正文，或正在做生成后的收尾处理。";
    case "pending_review":
      return "待确认：正文已经进入确认阶段，建议查看审校结果并决定是否继续修复或确认通过。";
    case "needs_repair":
      return "待修复：审校发现了问题，建议先修复再继续推进。";
    case "completed":
      return "已完成：本章已通过当前流程，可以继续润色或进入下一章。";
    default:
      return "未设置：当前章节还没有明确的流程状态。";
  }
}

export function generationStateLabel(state?: Chapter["generationState"] | null): string {
  switch (state) {
    case "planned":
      return "已入目录";
    case "drafted":
      return "已成稿";
    case "reviewed":
      return "已审校";
    case "repaired":
      return "已修复";
    case "approved":
      return "已确认";
    case "published":
      return "已发布";
    default:
      return "";
  }
}

export function generationStateDescription(state?: Chapter["generationState"] | null): string {
  switch (state) {
    case "planned":
      return "已入目录：章节已进入目录或拆章结果，但还没有正文草稿。";
    case "drafted":
      return "已成稿：已经生成过正文草稿，但还没完成审校确认。";
    case "reviewed":
      return "已审校：已经完成一轮审校，后续可能继续修复或确认。";
    case "repaired":
      return "已修复：已经根据问题修过一轮，通常下一步是再次审校或确认。";
    case "approved":
      return "已确认：本章已通过当前质量门槛，自动执行时会视为已完成并跳过。";
    case "published":
      return "已发布：本章已进入发布状态，自动执行不会再重复生成。";
    default:
      return "";
  }
}

export function shouldShowGenerationStateBadge(state?: Chapter["generationState"] | null): boolean {
  return Boolean(state && state !== "planned");
}

export function parseRiskFlags(input: string | null | undefined): string[] {
  if (!input?.trim()) {
    return [];
  }
  return input
    .split(/[\n,，;；|]/g)
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
    .slice(0, 4);
}

export function hasText(input: string | null | undefined): boolean {
  return Boolean(input?.trim());
}

export function chapterHasPreparationAssets(chapter: Chapter): boolean {
  return hasText(chapter.expectation) || hasText(chapter.taskSheet) || hasText(chapter.sceneCards);
}

export function chapterSuggestedActionLabel(chapter: Chapter): string {
  if (chapter.chapterStatus === "generating") return "等待生成";
  if (chapter.chapterStatus === "needs_repair") return "修复问题";
  if (chapter.chapterStatus === "pending_review") {
    return chapter.generationState === "reviewed" || chapter.generationState === "approved"
      ? "确认结果"
      : "运行审校";
  }
  if (chapter.chapterStatus === "completed") return "继续润色";
  if (chapter.chapterStatus === "unplanned" || !chapterHasPreparationAssets(chapter)) return "补章节计划";
  if (!hasText(chapter.content) || chapter.chapterStatus === "pending_generation") return "写本章";
  if (chapter.generationState === "drafted") return "运行审校";
  return "打开编辑器";
}

export function chapterMatchesQueueFilter(chapter: Chapter, filter: QueueFilterKey): boolean {
  if (filter === "all") return true;
  if (filter === "completed") {
    return chapter.chapterStatus === "completed"
      || chapter.generationState === "approved"
      || chapter.generationState === "published";
  }
  if (filter === "review") {
    return chapter.chapterStatus === "pending_review"
      || chapter.chapterStatus === "needs_repair"
      || chapter.generationState === "drafted"
      || chapter.generationState === "reviewed";
  }
  if (filter === "setup") {
    return chapter.chapterStatus === "unplanned" || (!chapterHasPreparationAssets(chapter) && !hasText(chapter.content));
  }
  if (filter === "draft") {
    return chapter.chapterStatus === "pending_generation"
      || chapter.chapterStatus === "generating"
      || (!hasText(chapter.content) && chapter.chapterStatus !== "unplanned");
  }
  return true;
}

export function MetricBadge(props: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-border/70 bg-background px-3 py-2">
      <div className="text-[11px] text-muted-foreground">{props.label}</div>
      <div className="mt-1 text-sm font-medium text-foreground">{props.value}</div>
      {props.hint ? <div className="mt-1 text-[11px] text-muted-foreground">{props.hint}</div> : null}
    </div>
  );
}

export function RiskBadgeList(props: { risks: string[] }) {
  if (props.risks.length === 0) {
    return null;
  }
  return (
    <div className="flex flex-wrap gap-1">
      {props.risks.map((risk) => <Badge key={risk} variant="secondary">{risk}</Badge>)}
    </div>
  );
}

export function PrimaryActionButton(props: { action: PrimaryAction | null; className?: string }) {
  const { action, className } = props;
  if (!action) {
    return null;
  }
  if (action.href) {
    return (
      <Button asChild size="sm" variant={action.variant} className={className}>
        <Link to={action.href}>
          {action.ai ? <AiActionLabel>{action.label}</AiActionLabel> : action.label}
        </Link>
      </Button>
    );
  }
  return (
    action.ai ? (
      <AiButton size="sm" variant={action.variant} className={className} onClick={action.onClick} disabled={action.disabled}>
        {action.label}
      </AiButton>
    ) : (
      <Button size="sm" variant={action.variant} className={className} onClick={action.onClick} disabled={action.disabled}>
        {action.label}
      </Button>
    )
  );
}
