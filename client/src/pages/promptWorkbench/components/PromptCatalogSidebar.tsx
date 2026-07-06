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
        "w-full rounded-md border px-3 py-3 text-left transition-colors",
        active ? "border-primary bg-primary/5" : "border-border bg-background hover:bg-muted/60",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-foreground">
            {prompt.description || prompt.id}
          </div>
          <div className="mt-1 truncate font-mono text-xs text-muted-foreground/75">{prompt.id}</div>
          <div className="mt-1 text-xs text-muted-foreground">
            {prompt.version} · {TASK_TYPE_LABELS[prompt.taskType] ?? prompt.taskType} ·{" "}
            {OUTPUT_TYPE_LABELS[prompt.mode] ?? prompt.mode}
          </div>
        </div>
        <Badge
          variant={prompt.slotSupported ? "default" : statusBadgeVariant(prompt.managementStatus)}
          className="shrink-0"
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
    <aside className="flex min-h-0 flex-col border-r bg-muted/15">
      <div className="shrink-0 border-b px-4 py-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <Braces className="h-4 w-4 shrink-0 text-primary" />
            <div className="min-w-0">
              <h1 className="truncate text-base font-semibold tracking-normal text-foreground">
                Prompt Workbench
              </h1>
              <p className="mt-0.5 text-xs text-muted-foreground">选择提示词并查看可编辑槽位</p>
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

        <div className="relative mt-4">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={keyword}
            onChange={(event) => onKeywordChange(event.target.value)}
            placeholder="搜索 id、任务、上下文或槽位"
            className="h-10 pl-9"
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
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
