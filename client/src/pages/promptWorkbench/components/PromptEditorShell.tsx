import type { ReactNode } from "react";
import { Group, Panel, Separator } from "react-resizable-panels";
import { LockKeyhole, ShieldCheck } from "lucide-react";
import type { PromptCatalogItem, PromptSlotOverrideScope } from "@/api/promptWorkbench";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import SelectControl from "@/components/common/SelectControl";
import {
  ENTRYPOINT_OPTIONS,
  LOCKED_FIELD_LABELS,
  MANAGEMENT_STATUS_LABELS,
  OUTPUT_TYPE_LABELS,
  SLOT_KIND_LABELS,
  TASK_TYPE_LABELS,
  capabilityLabels,
} from "../promptWorkbenchLabels";

interface PromptEditorShellProps {
  prompt: PromptCatalogItem;
  entrypoint: string;
  onEntrypointChange: (entrypoint: string) => void;
  scope: PromptSlotOverrideScope;
  onScopeChange: (scope: PromptSlotOverrideScope) => void;
  selectedNovelId: string;
  onNovelChange: (novelId: string) => void;
  novels: Array<{ id: string; title?: string | null }>;
  bodyPanel: ReactNode;
  contextPanel: ReactNode;
  runBar: ReactNode;
}

export function PromptEditorShell(props: PromptEditorShellProps) {
  const {
    bodyPanel,
    contextPanel,
    entrypoint,
    novels,
    onEntrypointChange,
    onNovelChange,
    onScopeChange,
    prompt,
    runBar,
    scope,
    selectedNovelId,
  } = props;
  const capabilities = capabilityLabels(prompt);

  return (
    <section className="flex h-full min-h-0 flex-col bg-background">
      <header className="shrink-0 border-b bg-background px-5 py-4">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <h2 className="min-w-0 truncate text-xl font-semibold tracking-normal text-foreground">
                {prompt.description || prompt.id}
              </h2>
              <span className="rounded-md bg-foreground px-2 py-0.5 text-xs font-semibold text-background">
                {prompt.version}
              </span>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
              <span className="font-mono">{prompt.key}</span>
              <span>·</span>
              <span>{TASK_TYPE_LABELS[prompt.taskType] ?? prompt.taskType}</span>
              <span>·</span>
              <span>{OUTPUT_TYPE_LABELS[prompt.outputType] ?? prompt.outputType}</span>
              <span>·</span>
              <span>{MANAGEMENT_STATUS_LABELS[prompt.managementStatus]}</span>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
              <span className="rounded-md bg-muted px-2 py-1 text-muted-foreground">
                {prompt.language === "zh" ? "中文" : prompt.language}
              </span>
              <span className="rounded-md bg-muted px-2 py-1 text-muted-foreground">{prompt.family}</span>
              <span className="rounded-md bg-muted px-2 py-1 text-muted-foreground">
                {prompt.contextPolicy.maxTokensBudget} tokens
              </span>
              <span className={cn(
                "rounded-md px-2 py-1",
                prompt.slotSupported ? "bg-primary/[0.08] text-primary" : "bg-muted text-muted-foreground",
              )}>
                {prompt.slotSupported ? `${prompt.slots.length} 个槽位` : "只读提示词"}
              </span>
              {capabilities.map((label) => (
                <span key={label} className="rounded-md bg-muted/70 px-2 py-1 text-muted-foreground">
                  {label}
                </span>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-3 md:flex-row md:items-center xl:justify-end">
            <SelectControl
              value={entrypoint}
              onChange={(event) => onEntrypointChange(event.target.value)}
              className="h-10 min-w-40 rounded-md border bg-background px-3 text-sm"
            >
              {ENTRYPOINT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </SelectControl>

            <Tabs
              value={scope}
              onValueChange={(value) => onScopeChange(value as PromptSlotOverrideScope)}
            >
              <TabsList className="h-10">
                <TabsTrigger value="global" className="px-4">全局</TabsTrigger>
                <TabsTrigger value="novel" className="px-4">本书</TabsTrigger>
              </TabsList>
            </Tabs>

            {scope === "novel" ? (
              <SelectControl
                value={selectedNovelId}
                onChange={(event) => onNovelChange(event.target.value)}
                className="h-10 min-w-52 rounded-md border bg-background px-3 text-sm"
              >
                <option value="">选择小说</option>
                {novels.map((novel) => (
                  <option key={novel.id} value={novel.id}>
                    {novel.title || novel.id}
                  </option>
                ))}
              </SelectControl>
            ) : null}
          </div>
        </div>

        <div className="mt-4 grid gap-4 border-t pt-3 lg:grid-cols-2">
          <div className="min-w-0">
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-foreground">
              <ShieldCheck className="h-4 w-4 text-muted-foreground" />
              可编辑槽位
            </div>
            <div className="flex flex-wrap gap-1.5">
              {prompt.slots.length > 0 ? prompt.slots.map((slot) => (
                <span
                  key={slot.key}
                  title={slot.key}
                  className="inline-flex max-w-full items-center rounded-md bg-muted/70 px-2 py-1 text-xs text-foreground"
                >
                  {slot.label}
                  <span className="ml-1 opacity-60">·{SLOT_KIND_LABELS[slot.kind] ?? slot.kind}</span>
                </span>
              )) : (
                <span className="text-xs text-muted-foreground">该提示词未开放表达槽位。</span>
              )}
            </div>
          </div>
          <div className="min-w-0 lg:border-l lg:pl-4">
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-foreground">
              <LockKeyhole className="h-4 w-4 text-muted-foreground" />
              锁定边界
            </div>
            <div className="flex flex-wrap gap-1.5">
              {prompt.lockedFields.map((field) => (
                <span
                  key={field}
                  title={field}
                  className="inline-flex rounded-md border border-border/70 bg-background px-2 py-1 text-xs text-muted-foreground"
                >
                  {LOCKED_FIELD_LABELS[field] ?? field}
                </span>
              ))}
            </div>
          </div>
        </div>
      </header>

      <div className="min-h-0 flex-1">
        <Group orientation="horizontal" className="h-full min-h-0">
          <Panel defaultSize={66} minSize={48}>
            <div className="h-full min-h-0 overflow-y-auto px-5 py-5 pb-28">
              {bodyPanel}
            </div>
          </Panel>
          <Separator className={cn("w-1 bg-border transition-colors hover:bg-muted-foreground/30")} />
          <Panel defaultSize={34} minSize={24}>
            <div className="h-full min-h-0 border-l bg-muted/[0.08]">
              {contextPanel}
            </div>
          </Panel>
        </Group>
      </div>

      {runBar}
    </section>
  );
}
