import type { ReactNode } from "react";
import { Group, Panel, Separator } from "react-resizable-panels";
import { LockKeyhole, Maximize2, Minimize2, ShieldCheck } from "lucide-react";
import type { PromptCatalogItem, PromptSlotOverrideScope } from "@/api/promptWorkbench";
import { Button } from "@/components/ui/button";
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
  immersive?: boolean;
  onImmersiveChange?: (next: boolean) => void;
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
    immersive = false,
    novels,
    onEntrypointChange,
    onImmersiveChange,
    onNovelChange,
    onScopeChange,
    prompt,
    runBar,
    scope,
    selectedNovelId,
  } = props;
  const capabilities = capabilityLabels(prompt);

  return (
    <section
      className={cn(
        "flex h-full min-h-0 flex-col bg-[#f7f9fb]",
        immersive && "bg-[#f3f7f5]",
      )}
    >
      <header
        className={cn(
          "shrink-0 border-b border-[#dbe5e2] bg-[#fbfcff] px-5 py-4",
          immersive && "border-[#cbdcd5] bg-[#f6faf8] px-6 py-3",
        )}
      >
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <h2 className="min-w-0 truncate text-xl font-semibold tracking-normal text-foreground">
                {prompt.description || prompt.id}
              </h2>
              <span className="rounded-md bg-[#173c4f] px-2 py-0.5 text-xs font-semibold text-white">
                {prompt.version}
              </span>
              {immersive ? (
                <span className="rounded-md border border-[#b8d9d0] bg-[#eaf7f2] px-2 py-0.5 text-xs font-medium text-[#0f766e]">
                  沉浸编辑
                </span>
              ) : null}
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
              <span className="rounded-md bg-[#eef6f4] px-2 py-1 text-[#315f58]">
                {prompt.language === "zh" ? "中文" : prompt.language}
              </span>
              <span className="rounded-md bg-[#eef3fb] px-2 py-1 text-[#385273]">{prompt.family}</span>
              <span className="rounded-md bg-[#fff3dc] px-2 py-1 text-[#7a5620]">
                {prompt.contextPolicy.maxTokensBudget} tokens
              </span>
              <span className={cn(
                "rounded-md px-2 py-1",
                prompt.slotSupported ? "bg-[#e8f7f2] text-[#0f766e]" : "bg-muted text-muted-foreground",
              )}>
                {prompt.slotSupported ? `${prompt.slots.length} 个槽位` : "只读提示词"}
              </span>
              {capabilities.map((label) => (
                <span key={label} className="rounded-md bg-white/80 px-2 py-1 text-[#52606d] ring-1 ring-[#dfe7ee]">
                  {label}
                </span>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-3 md:flex-row md:items-center xl:justify-end">
            <SelectControl
              value={entrypoint}
              onChange={(event) => onEntrypointChange(event.target.value)}
              className="h-10 min-w-40 rounded-md border border-[#cfdad7] bg-white px-3 text-sm shadow-sm"
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
                className="h-10 min-w-52 rounded-md border border-[#cfdad7] bg-white px-3 text-sm shadow-sm"
              >
                <option value="">选择小说</option>
                {novels.map((novel) => (
                  <option key={novel.id} value={novel.id}>
                    {novel.title || novel.id}
                  </option>
                ))}
              </SelectControl>
            ) : null}

            {onImmersiveChange ? (
              <Button
                type="button"
                variant={immersive ? "outline" : "secondary"}
                onClick={() => onImmersiveChange(!immersive)}
                className={cn(
                  "h-10 gap-2 border-[#b8d9d0]",
                  immersive
                    ? "bg-white text-[#0f5f59] hover:bg-[#eef8f5]"
                    : "bg-[#0f766e] text-white hover:bg-[#0b5f59]",
                )}
                title={immersive ? "退出沉浸编辑" : "进入沉浸编辑"}
              >
                {immersive ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                {immersive ? "退出沉浸" : "沉浸编辑"}
              </Button>
            ) : null}
          </div>
        </div>

        <div className={cn(
          "mt-4 grid gap-4 border-t border-[#dbe5e2] pt-3 lg:grid-cols-2",
          immersive && "mt-3",
        )}>
          <div className="min-w-0">
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-[#25443f]">
              <ShieldCheck className="h-4 w-4 text-[#0f766e]" />
              可编辑槽位
            </div>
            <div className="flex flex-wrap gap-1.5">
              {prompt.slots.length > 0 ? prompt.slots.map((slot) => (
                <span
                  key={slot.key}
                  title={slot.key}
                  className="inline-flex max-w-full items-center rounded-md bg-[#eaf7f2] px-2 py-1 text-xs text-[#25443f]"
                >
                  {slot.label}
                  <span className="ml-1 opacity-60">·{SLOT_KIND_LABELS[slot.kind] ?? slot.kind}</span>
                </span>
              )) : (
                <span className="text-xs text-muted-foreground">该提示词未开放表达槽位。</span>
              )}
            </div>
          </div>
          <div className="min-w-0 lg:border-l lg:border-[#dbe5e2] lg:pl-4">
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-[#3c4a63]">
              <LockKeyhole className="h-4 w-4 text-[#5a6f95]" />
              锁定边界
            </div>
            <div className="flex flex-wrap gap-1.5">
              {prompt.lockedFields.map((field) => (
                <span
                  key={field}
                  title={field}
                  className="inline-flex rounded-md border border-[#d7e0ec] bg-[#f5f8fc] px-2 py-1 text-xs text-[#52606d]"
                >
                  {LOCKED_FIELD_LABELS[field] ?? field}
                </span>
              ))}
            </div>
          </div>
        </div>
      </header>

      <div className={cn("min-h-0 flex-1", immersive && "px-4 py-4")}>
        <Group
          orientation="horizontal"
          className={cn(
            "h-full min-h-0",
            immersive && "overflow-hidden rounded-lg border border-[#cbdcd5] bg-white shadow-[0_18px_60px_rgba(15,55,48,0.14)]",
          )}
        >
          <Panel defaultSize={immersive ? 74 : 66} minSize={immersive ? 58 : 48}>
            <div
              className={cn(
                "h-full min-h-0 overflow-y-auto px-5 py-5 pb-28",
                immersive && "bg-[#fffdf8] px-8 py-7 pb-32",
              )}
            >
              {bodyPanel}
            </div>
          </Panel>
          <Separator className={cn("w-1 bg-[#cbdcd5] transition-colors hover:bg-[#7eb6aa]")} />
          <Panel defaultSize={immersive ? 26 : 34} minSize={immersive ? 20 : 24}>
            <div className={cn("h-full min-h-0 border-l border-[#cbdcd5] bg-[#f6faf8]", !immersive && "bg-muted/[0.08]")}>
              {contextPanel}
            </div>
          </Panel>
        </Group>
      </div>

      {runBar}
    </section>
  );
}
