import { useMemo, useState } from "react";
import { ArrowDownUp, LockKeyhole, Search } from "lucide-react";
import type { PromptPreviewResult } from "@/api/promptWorkbench";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import SelectControl from "@/components/common/SelectControl";
import {
  CONTEXT_GROUP_LABELS,
  CONTEXT_STATUS_LABELS,
  LOCKED_CONTEXT_GROUPS,
} from "../promptWorkbenchLabels";
import type { ContextBlockStatus, ContextBlockViewModel } from "../promptWorkbenchTypes";

type SortMode = "status" | "priority" | "tokens" | "group";

function getBlockStatus(input: {
  id: string;
  selectedIds: Set<string>;
  droppedIds: Set<string>;
  summarizedIds: Set<string>;
}): ContextBlockStatus {
  if (input.summarizedIds.has(input.id)) {
    return "summarized";
  }
  if (input.droppedIds.has(input.id)) {
    return "dropped";
  }
  if (input.selectedIds.has(input.id)) {
    return "selected";
  }
  return "available";
}

function statusRank(status: ContextBlockStatus): number {
  return {
    selected: 0,
    summarized: 1,
    available: 2,
    dropped: 3,
  }[status];
}

function statusClassName(status: ContextBlockStatus): string {
  return {
    selected: "border-primary/20 bg-primary/[0.08] text-primary",
    dropped: "border-border/70 bg-muted/[0.55] text-muted-foreground",
    summarized: "border-border/70 bg-muted/[0.45] text-foreground",
    available: "border-transparent bg-muted/[0.35] text-muted-foreground",
  }[status];
}

function buildContextBlockViewModels(
  preview: PromptPreviewResult | null,
  query: string,
): ContextBlockViewModel[] {
  if (!preview) {
    return [];
  }
  const normalizedQuery = query.trim().toLowerCase();
  const selectedIds = new Set(preview.context.selectedBlockIds);
  const droppedIds = new Set(preview.context.droppedBlockIds);
  const summarizedIds = new Set(preview.context.summarizedBlockIds);

  return preview.context.blocks.map((block) => {
    const haystack = [
      block.id,
      block.group,
      CONTEXT_GROUP_LABELS[block.group] ?? "",
      block.source ?? "",
      block.content,
    ].join("\n").toLowerCase();
    return {
      id: block.id,
      group: block.group,
      groupLabel: CONTEXT_GROUP_LABELS[block.group] ?? block.group,
      priority: block.priority,
      required: Boolean(block.required),
      estimatedTokens: block.estimatedTokens ?? 0,
      source: block.source,
      content: block.content,
      status: getBlockStatus({
        id: block.id,
        selectedIds,
        droppedIds,
        summarizedIds,
      }),
      locked: Boolean(block.required) || LOCKED_CONTEXT_GROUPS.has(block.group),
      matchesSearch: !normalizedQuery || haystack.includes(normalizedQuery),
    } satisfies ContextBlockViewModel;
  });
}

function sortBlocks(blocks: ContextBlockViewModel[], sortMode: SortMode): ContextBlockViewModel[] {
  return [...blocks].sort((left, right) => {
    if (sortMode === "priority") {
      return right.priority - left.priority || left.group.localeCompare(right.group);
    }
    if (sortMode === "tokens") {
      return right.estimatedTokens - left.estimatedTokens || right.priority - left.priority;
    }
    if (sortMode === "group") {
      return left.group.localeCompare(right.group) || right.priority - left.priority;
    }
    return statusRank(left.status) - statusRank(right.status) || right.priority - left.priority;
  });
}

export function ContextInjectionPanel(props: {
  preview: PromptPreviewResult | null;
  selectedBlockId: string | null;
  onSelectBlock: (blockId: string) => void;
}) {
  const { onSelectBlock, preview, selectedBlockId } = props;
  const [query, setQuery] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("status");
  const blocks = useMemo(() => buildContextBlockViewModels(preview, query), [preview, query]);
  const visibleBlocks = useMemo(
    () => sortBlocks(blocks.filter((block) => block.matchesSearch), sortMode),
    [blocks, sortMode],
  );
  const activeBlock = visibleBlocks.find((block) => block.id === selectedBlockId)
    ?? visibleBlocks.find((block) => block.status === "selected")
    ?? visibleBlocks[0]
    ?? null;

  return (
    <aside className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b bg-background px-4 py-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-foreground">上下文注入</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              查看本次预览使用的资料块、裁剪和摘要状态
            </p>
          </div>
          <span className="rounded-md bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">
            {visibleBlocks.length} 块
          </span>
        </div>

        <div className="mt-4 grid gap-2 md:grid-cols-[minmax(0,1fr)_136px]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索 group、来源或内容"
              className="h-9 bg-background pl-9"
            />
          </div>
          <div className="relative">
            <ArrowDownUp className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <SelectControl
              value={sortMode}
              onChange={(event) => setSortMode(event.target.value as SortMode)}
              className="h-9 w-full rounded-md border bg-background pl-9 pr-3 text-sm"
            >
              <option value="status">按状态</option>
              <option value="priority">按优先级</option>
              <option value="tokens">按 Token</option>
              <option value="group">按分组</option>
            </SelectControl>
          </div>
        </div>
      </div>

      {!preview ? (
        <div className="m-4 rounded-md border border-dashed bg-background p-4 text-sm text-muted-foreground">
          生成预览后，这里会显示已注入、被裁剪和被摘要的上下文块。
        </div>
      ) : (
        <>
          <div className="min-h-0 flex-1 space-y-1 overflow-y-auto p-3">
            {visibleBlocks.length === 0 ? (
              <div className="rounded-md border border-dashed bg-background p-4 text-sm text-muted-foreground">
                没有匹配的上下文块。
              </div>
            ) : (
              visibleBlocks.map((block) => (
                <button
                  key={block.id}
                  type="button"
                  onClick={() => onSelectBlock(block.id)}
                  className={cn(
                    "w-full rounded-md border border-transparent px-3 py-3 text-left transition-colors",
                    selectedBlockId === block.id ? "border-primary/30 bg-background" : "hover:bg-muted/[0.45]",
                    block.status === "dropped" && "opacity-70",
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        {block.locked ? <LockKeyhole className="h-3.5 w-3.5 text-primary" /> : null}
                        <div className="truncate text-sm font-semibold text-foreground" title={block.group}>
                          {block.groupLabel}
                        </div>
                      </div>
                      <div className="mt-1 truncate font-mono text-[11px] text-muted-foreground" title={block.id}>
                        {block.id}
                      </div>
                      {block.source ? (
                        <div className="mt-1 truncate text-xs text-muted-foreground" title={block.source}>
                          {block.source}
                        </div>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <Badge variant="outline" className={cn("px-1.5 py-0 text-[11px]", statusClassName(block.status))}>
                        {CONTEXT_STATUS_LABELS[block.status]}
                      </Badge>
                      <span className="text-[11px] text-muted-foreground">{block.estimatedTokens} tokens</span>
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
                    <span>{block.required ? "必需" : "可选"}</span>
                    <span>·</span>
                    <span>P{block.priority}</span>
                    {block.locked ? (
                      <>
                        <span>·</span>
                        <span>锁定</span>
                      </>
                    ) : null}
                  </div>
                </button>
              ))
            )}
          </div>

          <div className="shrink-0 border-t bg-background p-3">
            {activeBlock ? (
              <div className="rounded-md border border-border/80 bg-background">
                <div className="flex items-center justify-between gap-3 border-b border-border/70 bg-muted/[0.25] px-3 py-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold">{activeBlock.groupLabel}</div>
                    <div className="truncate font-mono text-[11px] text-muted-foreground">{activeBlock.id}</div>
                  </div>
                  <Badge variant="outline" className={cn("px-1.5 py-0 text-[11px]", statusClassName(activeBlock.status))}>
                    {CONTEXT_STATUS_LABELS[activeBlock.status]}
                  </Badge>
                </div>
                <pre className="max-h-64 overflow-auto whitespace-pre-wrap p-3 text-xs leading-relaxed">
                  {activeBlock.content}
                </pre>
              </div>
            ) : null}
          </div>
        </>
      )}
    </aside>
  );
}
