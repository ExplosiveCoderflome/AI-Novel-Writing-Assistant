import type { Chapter } from "@ai-novel/shared/types/novel";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export type AssetTabKey = "content" | "taskSheet" | "sceneCards" | "quality" | "repair";
export type QueueFilterKey = "all" | "setup" | "draft" | "review" | "completed";

export type PrimaryAction = {
  label: string;
  reason: string;
  variant: "default" | "secondary" | "outline";
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
      return "待审校";
    case "needs_repair":
      return "待修复";
    case "completed":
      return "已完成";
    default:
      return "未设置";
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
  if (chapter.chapterStatus === "pending_review") return "运行审校";
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

export function PrimaryActionButton(props: { action: PrimaryAction | null }) {
  const { action } = props;
  if (!action) {
    return null;
  }
  if (action.href) {
    return (
      <Button asChild size="sm" variant={action.variant}>
        <Link to={action.href}>{action.label}</Link>
      </Button>
    );
  }
  return (
    <Button size="sm" variant={action.variant} onClick={action.onClick} disabled={action.disabled}>
      {action.label}
    </Button>
  );
}
