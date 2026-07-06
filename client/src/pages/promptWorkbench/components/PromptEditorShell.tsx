import type { ReactNode } from "react";
import { Group, Panel, Separator } from "react-resizable-panels";
import { LockKeyhole, ShieldCheck } from "lucide-react";
import type { PromptCatalogItem, PromptSlotOverrideScope } from "@/api/promptWorkbench";
import { Badge } from "@/components/ui/badge";
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
  statusBadgeVariant,
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
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="min-w-0 truncate text-xl font-semibold tracking-normal text-foreground">
                {prompt.description || prompt.id}
              </h2>
              <Badge>{prompt.version}</Badge>
              <Badge variant="secondary">{TASK_TYPE_LABELS[prompt.taskType] ?? prompt.taskType}</Badge>
              <Badge variant="secondary">{OUTPUT_TYPE_LABELS[prompt.outputType] ?? prompt.outputType}</Badge>
              <Badge variant={statusBadgeVariant(prompt.managementStatus)}>
                {MANAGEMENT_STATUS_LABELS[prompt.managementStatus]}
              </Badge>
            </div>
            <div className="mt-1 font-mono text-xs text-muted-foreground">{prompt.key}</div>
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <Badge variant="outline">{prompt.language === "zh" ? "中文" : prompt.language}</Badge>
              <Badge variant="outline">{prompt.family}</Badge>
              <Badge variant="outline">{prompt.contextPolicy.maxTokensBudget} tokens</Badge>
              <Badge variant={prompt.slotSupported ? "default" : "secondary"}>
                {prompt.slotSupported ? `${prompt.slots.length} 个槽位` : "只读提示词"}
              </Badge>
              {capabilities.map((label) => (
                <Badge key={label} variant="secondary">{label}</Badge>
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

        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          <div className="rounded-md border bg-muted/20 px-3 py-2">
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-foreground">
              <ShieldCheck className="h-4 w-4 text-primary" />
              可编辑槽位
            </div>
            <div className="flex flex-wrap gap-2">
              {prompt.slots.length > 0 ? prompt.slots.map((slot) => (
                <Badge key={slot.key} variant="secondary" title={slot.key}>
                  {slot.label}
                  <span className="ml-1 opacity-60">·{SLOT_KIND_LABELS[slot.kind] ?? slot.kind}</span>
                </Badge>
              )) : (
                <span className="text-xs text-muted-foreground">该提示词未开放表达槽位。</span>
              )}
            </div>
          </div>
          <div className="rounded-md border bg-muted/20 px-3 py-2">
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-foreground">
              <LockKeyhole className="h-4 w-4 text-primary" />
              锁定边界
            </div>
            <div className="flex flex-wrap gap-2">
              {prompt.lockedFields.map((field) => (
                <Badge key={field} variant="outline" title={field}>
                  {LOCKED_FIELD_LABELS[field] ?? field}
                </Badge>
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
            <div className="h-full min-h-0 border-l bg-muted/10">
              {contextPanel}
            </div>
          </Panel>
        </Group>
      </div>

      {runBar}
    </section>
  );
}
