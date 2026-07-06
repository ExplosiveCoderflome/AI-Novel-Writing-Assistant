import { LockKeyhole } from "lucide-react";
import type { PromptPreviewResult } from "@/api/promptWorkbench";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MESSAGE_ROLE_LABELS } from "../promptWorkbenchLabels";

function JsonBlock({ value }: { value: unknown }) {
  return (
    <pre className="max-h-52 overflow-auto rounded-md bg-slate-950 p-3 text-xs leading-relaxed text-slate-100">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

export function PromptPreviewPanel({ preview }: { preview: PromptPreviewResult | null }) {
  if (!preview) {
    return (
      <div className="rounded-md border border-dashed bg-background p-5 text-sm text-muted-foreground">
        点击底部“生成预览”后，可查看最终 messages、上下文选择和诊断结果。
      </div>
    );
  }

  const defaultTab = preview.messages[0]
    ? `${preview.messages[0].role}-0`
    : "diagnostics";

  return (
    <div className="space-y-4">
      <div className="grid overflow-hidden rounded-md border border-border/80 bg-background md:grid-cols-4 md:divide-x">
        <div className="p-3">
          <div className="text-xs text-muted-foreground">入口</div>
          <div className="mt-1 truncate text-sm font-semibold">{preview.diagnostics.entrypoint}</div>
        </div>
        <div className="p-3">
          <div className="text-xs text-muted-foreground">估算 Token</div>
          <div className="mt-1 text-sm font-semibold">{preview.context.estimatedInputTokens}</div>
        </div>
        <div className="p-3">
          <div className="text-xs text-muted-foreground">已注入</div>
          <div className="mt-1 text-sm font-semibold">{preview.context.selectedBlockIds.length}</div>
        </div>
        <div className="p-3">
          <div className="text-xs text-muted-foreground">缺失项</div>
          <div className="mt-1 text-sm font-semibold">{preview.diagnostics.missingRequiredGroups.length}</div>
        </div>
      </div>

      {preview.diagnostics.notes.length > 0 ? (
        <div className="rounded-md border border-amber-200/80 bg-amber-50/70 px-3 py-2 text-sm text-amber-900">
          {preview.diagnostics.notes.join(" ")}
        </div>
      ) : null}

      <Tabs key={`${preview.prompt.key}:${preview.context.estimatedInputTokens}`} defaultValue={defaultTab}>
        <TabsList className="max-w-full overflow-x-auto">
          {preview.messages.map((message, index) => (
            <TabsTrigger key={`${message.role}-${index}`} value={`${message.role}-${index}`}>
              {MESSAGE_ROLE_LABELS[message.role] ?? message.role}
            </TabsTrigger>
          ))}
          <TabsTrigger value="diagnostics">诊断</TabsTrigger>
        </TabsList>

        {preview.messages.map((message, index) => (
          <TabsContent key={`${message.role}-${index}`} value={`${message.role}-${index}`}>
            <div className="rounded-md border border-border/80 bg-background">
              <div className="flex items-center justify-between gap-3 border-b border-border/70 bg-muted/[0.25] px-3 py-2">
                <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                  <LockKeyhole className="h-3.5 w-3.5" />
                  {MESSAGE_ROLE_LABELS[message.role] ?? message.role}
                </div>
                <Badge variant="outline">只读</Badge>
              </div>
              <pre className="max-h-[520px] overflow-auto whitespace-pre-wrap p-4 text-xs leading-relaxed">
                {message.content}
              </pre>
            </div>
          </TabsContent>
        ))}

        <TabsContent value="diagnostics">
          <JsonBlock
            value={{
              selectedBlockIds: preview.context.selectedBlockIds,
              droppedBlockIds: preview.context.droppedBlockIds,
              summarizedBlockIds: preview.context.summarizedBlockIds,
              missingRequiredGroups: preview.diagnostics.missingRequiredGroups,
              resolverErrors: preview.diagnostics.resolverErrors,
              tracePreview: preview.diagnostics.tracePreview,
            }}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
