import { Braces, Layers3, PenLine, RefreshCw, Search } from "lucide-react";
import type { PromptCatalogItem } from "@/api/promptWorkbench";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  MANAGEMENT_STATUS_LABELS,
  OUTPUT_TYPE_LABELS,
  TASK_TYPE_LABELS,
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
  onManagePlatforms: () => void;
}

function PromptListItem(props: {
  prompt: PromptCatalogItem;
  active: boolean;
  onSelect: () => void;
}) {
  const { active, onSelect, prompt } = props;
  const isChapterWriterPrompt = prompt.capabilities.isProseGeneration;

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "group relative w-full shrink-0 overflow-hidden rounded-md border px-3 py-2.5 text-left transition-colors",
        isChapterWriterPrompt && active
          ? "border-success/45 bg-success/15 shadow-[0_8px_22px_hsl(var(--success)/0.16)]"
          : isChapterWriterPrompt
            ? "border-success/35 bg-success/10 hover:bg-success/15"
            : active
              ? "border-info/35 bg-info/10 shadow-[0_6px_18px_hsl(var(--info)/0.12)]"
              : "border-transparent hover:border-border hover:bg-card",
      )}
    >
      {isChapterWriterPrompt ? (
        <span className={cn(
          "absolute inset-y-2 left-0 w-0.5 rounded-r-full",
          active ? "bg-success" : "bg-success/65",
        )} />
      ) : null}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {isChapterWriterPrompt ? (
            <div className="mb-1 inline-flex max-w-full items-center gap-1 rounded-md bg-success px-1.5 py-0.5 text-[11px] font-medium leading-4 text-success-foreground">
              <PenLine className="h-3 w-3 shrink-0" />
              <span className="truncate">小说正文生成</span>
            </div>
          ) : null}
          <div className="truncate text-[13px] font-semibold leading-5 text-foreground" title={prompt.description || prompt.shortDescription || prompt.id}>
            {prompt.shortDescription || prompt.description || prompt.id}
          </div>
          <div className="mt-0.5 truncate font-mono text-[11px] leading-4 text-muted-foreground/75" title={prompt.id}>
            {prompt.id}
          </div>
          <div className="mt-0.5 truncate text-[11px] leading-4 text-muted-foreground">
            {prompt.version} · {TASK_TYPE_LABELS[prompt.taskType] ?? prompt.taskType} ·{" "}
            {OUTPUT_TYPE_LABELS[prompt.mode] ?? prompt.mode}
          </div>
        </div>
        <span className={cn(
          "mt-0.5 inline-flex max-w-[112px] shrink-0 items-center gap-1 truncate rounded-md px-1.5 py-0.5 text-[11px] leading-4",
          prompt.slotSupported
            ? "bg-success/15 text-success"
            : "bg-muted text-muted-foreground",
        )}>
          <span className={cn(
            "h-1.5 w-1.5 shrink-0 rounded-full",
            prompt.slotSupported ? "bg-success" : "bg-muted-foreground",
          )} />
          <span className="truncate">
            {prompt.slotSupported ? "可定制" : MANAGEMENT_STATUS_LABELS[prompt.managementStatus]}
          </span>
        </span>
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
    onManagePlatforms,
  } = props;

  return (
    <aside className="flex h-full min-h-0 flex-1 flex-col overflow-hidden border-r border-border bg-muted/30">
      <div className="shrink-0 border-b border-border bg-card px-3 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <Braces className="h-4 w-4 shrink-0 text-success" />
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
            className="h-8 w-8 p-0 text-muted-foreground hover:bg-success/10 hover:text-success"
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
            className="h-9 border-border bg-card pl-9 shadow-sm"
          />
        </div>
        <Button type="button" variant="outline" className="mt-2 h-9 w-full justify-start bg-card" onClick={onManagePlatforms}>
          <Layers3 className="mr-2 h-4 w-4 text-success" />平台写法
        </Button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto overscroll-contain px-2.5 py-3 [scrollbar-gutter:stable]">
        {isLoading ? (
          <div className="rounded-md border border-dashed bg-background/70 p-4 text-sm text-muted-foreground">
            正在读取提示词目录...
          </div>
        ) : prompts.length === 0 ? (
          <div className="rounded-md border border-dashed bg-background/70 p-4 text-sm text-muted-foreground">
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
