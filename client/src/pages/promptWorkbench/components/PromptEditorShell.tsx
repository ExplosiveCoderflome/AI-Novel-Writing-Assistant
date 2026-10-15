import type { ReactNode } from "react";
import { Group, Panel, Separator } from "react-resizable-panels";
import { Maximize2, Minimize2 } from "lucide-react";
import type { PromptCatalogItem, PromptSlotOverrideScope } from "@/api/promptWorkbench";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import SelectControl from "@/components/common/SelectControl";
import { ENTRYPOINT_OPTIONS, OUTPUT_TYPE_LABELS } from "../promptWorkbenchLabels";

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
  selectedChapterId: string;
  onChapterChange: (chapterId: string) => void;
  chapters: Array<{ id: string; title?: string | null; order?: number | null; hasContent?: boolean }>;
  bodyPanel: ReactNode;
  contextPanel?: ReactNode;
  runBar: ReactNode;
  simplified?: boolean;
  heading?: string;
  advanced?: boolean;
}

export function PromptEditorShell(props: PromptEditorShellProps) {
  const { prompt, immersive = false, simplified = false, scope, advanced = false } = props;
  return (
    <section className="flex h-full min-h-0 flex-col bg-background">
      <header className="shrink-0 border-b border-border bg-card px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-xl font-semibold">{props.heading || prompt.shortDescription || prompt.description || prompt.id}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{simplified
              ? "调整正文模板，用示例或本书章节比较试写效果。"
              : prompt.description}</p>
          </div>
          {props.onImmersiveChange ? (
            <Button variant="ghost" size="sm" onClick={() => props.onImmersiveChange?.(!immersive)}>
              {immersive ? <Minimize2 className="mr-2 h-4 w-4" /> : <Maximize2 className="mr-2 h-4 w-4" />}
              {immersive ? "退出专注" : "专注编辑"}
            </Button>
          ) : null}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          {!simplified ? (
            <Tabs value={scope} onValueChange={(value) => props.onScopeChange(value as PromptSlotOverrideScope)}>
              <TabsList>
                <TabsTrigger value="global">{advanced ? "模板草稿" : "所有小说"}</TabsTrigger>
                <TabsTrigger value="novel">{advanced ? "本书模板" : "指定小说"}</TabsTrigger>
              </TabsList>
            </Tabs>
          ) : null}
          {scope === "novel" ? (
            <SelectControl value={props.selectedNovelId} onChange={(event) => props.onNovelChange(event.target.value)}
              aria-label="应用范围：小说" className="h-9 max-w-72 rounded-md border border-input bg-background px-3 text-sm">
              <option value="">{advanced ? "选择小说（可稍后选择）" : "选择要调整的小说"}</option>
              {props.novels.map((novel) => <option key={novel.id} value={novel.id}>{novel.title || novel.id}</option>)}
            </SelectControl>
          ) : null}
          <span className="text-xs text-muted-foreground">{advanced
            ? (scope === "novel" && props.selectedNovelId ? "保存后仅用于这本小说" : "可直接编辑，保存应用时再选择小说")
            : scope === "global" ? "作为所有小说的默认要求，本书单独设置的内容优先" : "仅影响所选小说"}</span>
        </div>
        <details className="mt-3 text-xs text-muted-foreground">
          <summary className="w-fit cursor-pointer">预览设置与提示词信息</summary>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2">模拟使用场景
              <SelectControl value={props.entrypoint} onChange={(event) => props.onEntrypointChange(event.target.value)}
                className="h-8 rounded-md border border-input bg-background px-2">
                {ENTRYPOINT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </SelectControl>
            </label>
            {scope === "novel" && props.selectedNovelId ? (
              <label className="flex items-center gap-2">预览章节
                <SelectControl value={props.selectedChapterId} onChange={(event) => props.onChapterChange(event.target.value)}
                  className="h-8 max-w-72 rounded-md border border-input bg-background px-2">
                  <option value="">选择章节</option>
                  {props.chapters.map((chapter) => <option key={chapter.id} value={chapter.id}>
                    第 {chapter.order ?? "?"} 章 {chapter.title || "未命名章节"}{chapter.hasContent ? "" : "（无正文）"}
                  </option>)}
                </SelectControl>
              </label>
            ) : <span>使用示例内容预览，不改动小说正文</span>}
            <span className="break-all">{prompt.key} · {OUTPUT_TYPE_LABELS[prompt.outputType] ?? prompt.outputType} · 上下文预算 {prompt.contextPolicy.maxTokensBudget} tokens</span>
          </div>
        </details>
      </header>
      <div className={cn("min-h-0 flex-1", immersive && "px-4 py-4")}>
        {props.contextPanel ? (
          <Group orientation="horizontal" className="h-full min-h-0">
            <Panel defaultSize={70} minSize={48}>
              <div className={cn("h-full min-h-0 overflow-y-auto px-5 py-5 pb-12", immersive && "bg-card px-8 py-7 pb-32")}>
                {props.bodyPanel}
              </div>
            </Panel>
            <Separator className="w-1 bg-border transition-colors hover:bg-primary/40" />
            <Panel defaultSize={30} minSize={24}>
              <div className="h-full min-h-0 bg-muted/20">{props.contextPanel}</div>
            </Panel>
          </Group>
        ) : (
          <div className={cn("h-full min-h-0 overflow-y-auto px-5 py-5 pb-12", immersive && "bg-card px-8 py-7 pb-32")}>
            {props.bodyPanel}
          </div>
        )}
      </div>
      {props.runBar}
    </section>
  );
}
