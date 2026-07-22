import i18next from "i18next";
const t = (key: string, options?: any) => i18next.t(key, options) as string;
import { Braces, PenLine, RefreshCw, Search } from "lucide-react";
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
}

function PromptListItem(props: {
  prompt: PromptCatalogItem;
  active: boolean;
  onSelect: () => void;
}) {
  const { active, onSelect, prompt } = props;
  const isChapterWriterPrompt = prompt.id === "novel.chapter.writer";

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "group relative w-full shrink-0 overflow-hidden rounded-md border px-3 py-2.5 text-left transition-colors",
        isChapterWriterPrompt && active
          ? "border-[#0f766e]/45 bg-[#eaf7f2] shadow-[0_8px_22px_rgba(15,118,110,0.14)]"
          : isChapterWriterPrompt
            ? "border-[#b8d9d0] bg-[#f2fbf7] hover:bg-[#eaf7f2]"
            : active
              ? "border-[#b6c6e6] bg-[#f4f7ff] shadow-[0_6px_18px_rgba(49,73,121,0.08)]"
              : "border-transparent hover:border-[#dce7ef] hover:bg-white",
      )}
    >
      {isChapterWriterPrompt ? (
        <span className={cn(
          "absolute inset-y-2 left-0 w-0.5 rounded-r-full",
          active ? "bg-[#0f766e]" : "bg-[#62a99b]",
        )} />
      ) : null}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {isChapterWriterPrompt ? (
            <div className="mb-1 inline-flex max-w-full items-center gap-1 rounded-md bg-[#0f766e] px-1.5 py-0.5 text-[11px] font-medium leading-4 text-white">
              <PenLine className="h-3 w-3 shrink-0" />
              <span className="truncate">{t("gen.pages.promptWorkbench.components.PromptCatalogSidebar.gen_00baeb42")}</span>
            </div>
          ) : null}
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
        <span className={cn(
          "mt-0.5 inline-flex max-w-[112px] shrink-0 items-center gap-1 truncate rounded-md px-1.5 py-0.5 text-[11px] leading-4",
          prompt.slotSupported
            ? "bg-[#e7f4ef] text-[#0f766e]"
            : "bg-[#edf1f5] text-[#64748b]",
        )}>
          <span className={cn(
            "h-1.5 w-1.5 shrink-0 rounded-full",
            prompt.slotSupported ? "bg-[#0f766e]" : "bg-[#94a3b8]",
          )} />
          <span className="truncate">
            {prompt.slotSupported ? t("gen.pages.promptWorkbench.components.PromptCatalogSidebar.gen_82b22215") : MANAGEMENT_STATUS_LABELS[prompt.managementStatus]}
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
  } = props;

  return (
    <aside className="flex h-full min-h-0 flex-1 flex-col overflow-hidden border-r border-[#d8e2e6] bg-[#f5f8fa]">
      <div className="shrink-0 border-b border-[#d8e2e6] bg-[#fbfcff] px-3 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <Braces className="h-4 w-4 shrink-0 text-[#0f766e]" />
            <div className="min-w-0">
              <h1 className="truncate text-base font-semibold tracking-normal text-foreground">
                Prompt Workbench
              </h1>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {prompts.length > 0 ? `${prompts.length} 个提示词` : t("gen.pages.promptWorkbench.components.PromptCatalogSidebar.gen_2043e5c6")}
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onRefresh}
            disabled={isFetching}
            title={t("gen.pages.promptWorkbench.components.PromptCatalogSidebar.gen_90b5a467")}
            className="h-8 w-8 p-0 text-[#5f7381] hover:bg-[#eef6f4] hover:text-[#0f766e]"
          >
            <RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin")} />
          </Button>
        </div>

        <div className="relative mt-3">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={keyword}
            onChange={(event) => onKeywordChange(event.target.value)}
            placeholder={t("gen.pages.promptWorkbench.components.PromptCatalogSidebar.gen_1e819138")}
            className="h-9 border-[#ccd9df] bg-white pl-9 shadow-sm"
          />
        </div>
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
