import { Braces, RefreshCw, Search } from "lucide-react";
import type { PromptCatalogItem } from "@/api/promptWorkbench";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  MANAGEMENT_STATUS_LABELS,
  OUTPUT_TYPE_LABELS,
  TASK_TYPE_LABELS,
  statusBadgeVariant,
} from "../promptWorkbenchLabels";

interface PromptCatalogSidebarProps {
  keyword: string;
  onKeywordChange: (keyword: string) => void;
  prompts: PromptCatalogItem[];
  selectedKey: string | null;
  isLoading: boolean;
  isFetching: boolean;
  onSelect: (prompt: PromptCatalogItem) => void;
  onRefresh: () => void;
}

function PromptListItem(props: {
  prompt: PromptCatalogItem;
  active: boolean;
  onSelect: () => void;
}) {
  const { active, onSelect, prompt } = props;
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "group w-full rounded-md border px-3 py-2.5 text-left transition-colors",
        active ? "border-primary bg-primary/5 shadow-sm" : "border-border bg-background hover:bg-muted/60",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-[13px] font-semibold leading-5 text-foreground" title={prompt.description || prompt.id}>
            {prompt.description || prompt.id}
          </div>
          <div className="mt-0.5 truncate font-mono text-[11px] leading-4 text-muted-foreground/75" title={prompt.id}>
            {prompt.id}
          </div>
          <div className="mt-0.5 truncate text-[11px] leading-4 text-muted-foreground">
            {prompt.version} · {TASK_TYPE_LABELS[prompt.taskType] ?? prompt.taskType} ·{" "}
            {OUTPUT_TYPE_LABELS[prompt.mode] ?? prompt.mode}
          </div>
        </div>
        <Badge
          variant={prompt.slotSupported ? "default" : statusBadgeVariant(prompt.managementStatus)}
          className="max-w-[112px] shrink-0 truncate px-2 py-0.5 text-[11px]"
        >
          {prompt.slotSupported ? "可定制" : MANAGEMENT_STATUS_LABELS[prompt.managementStatus]}
        </Badge>
      </div>
    </button>
  );
}

export function PromptCatalogSidebar(props: PromptCatalogSidebarProps) {
  const {
    isFetching,
    isLoading,
    keyword,
    onKeywordChange,
    onRefresh,
    onSelect,
    prompts,
    selectedKey,
  } = props;

  return (
    <aside className="flex h-full min-h-0 flex-1 flex-col overflow-hidden border-r bg-muted/15">
      <div className="shrink-0 border-b bg-background/95 px-3 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <Braces className="h-4 w-4 shrink-0 text-primary" />
            <div className="min-w-0">
              <h1 className="truncate text-base font-semibold tracking-normal text-foreground">
                Prompt Workbench
              </h1>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {prompts.length > 0 ? `${prompts.length} 个提示词` : "选择提示词并查看可编辑槽位"}
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onRefresh}
            disabled={isFetching}
            title="刷新目录"
            className="h-8 w-8 p-0"
          >
            <RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin")} />
          </Button>
        </div>

        <div className="relative mt-3">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={keyword}
            onChange={(event) => onKeywordChange(event.target.value)}
            placeholder="搜索 id、任务、上下文或槽位"
            className="h-10 pl-9"
          />
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overscroll-contain px-2.5 py-3 [scrollbar-gutter:stable]">
        {isLoading ? (
          <div className="rounded-md border border-dashed bg-background p-4 text-sm text-muted-foreground">
            正在读取提示词目录...
          </div>
        ) : prompts.length === 0 ? (
          <div className="rounded-md border border-dashed bg-background p-4 text-sm text-muted-foreground">
            没有匹配的提示词。
          </div>
        ) : (
          prompts.map((prompt) => (
            <PromptListItem
              key={prompt.key}
              prompt={prompt}
              active={prompt.key === selectedKey}
              onSelect={() => onSelect(prompt)}
            />
          ))
        )}
      </div>
    </aside>
  );
}
