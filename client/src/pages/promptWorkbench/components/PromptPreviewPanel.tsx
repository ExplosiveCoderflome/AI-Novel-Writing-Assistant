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
      <div className="rounded-md border border-dashed border-[#cbdad6] bg-white/70 p-5 text-sm text-muted-foreground">
        点击底部“生成预览”后，可查看最终 messages、上下文选择和诊断结果。
      </div>
    );
  }

  const defaultTab = preview.messages[0]
    ? `${preview.messages[0].role}-0`
    : "diagnostics";

  return (
    <div className="space-y-4">
      <div className="grid overflow-hidden rounded-md border border-[#d8e2de] bg-white md:grid-cols-4 md:divide-x md:divide-[#d8e2de]">
        <div className="bg-[#f8fbfa] p-3">
          <div className="text-xs text-muted-foreground">入口</div>
          <div className="mt-1 truncate text-sm font-semibold text-[#25443f]">{preview.diagnostics.entrypoint}</div>
        </div>
        <div className="bg-[#fbfdfb] p-3">
          <div className="text-xs text-muted-foreground">估算 Token</div>
          <div className="mt-1 text-sm font-semibold text-[#0f766e]">{preview.context.estimatedInputTokens}</div>
        </div>
        <div className="bg-[#f4f7ff] p-3">
          <div className="text-xs text-muted-foreground">已注入</div>
          <div className="mt-1 text-sm font-semibold text-[#344d7a]">{preview.context.selectedBlockIds.length}</div>
        </div>
        <div className="bg-[#fff7e8] p-3">
          <div className="text-xs text-muted-foreground">缺失项</div>
          <div className="mt-1 text-sm font-semibold text-[#7a5620]">{preview.diagnostics.missingRequiredGroups.length}</div>
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
            <div className="overflow-hidden rounded-md border border-[#d8e2de] bg-white shadow-[0_8px_24px_rgba(20,54,48,0.06)]">
              <div className="flex items-center justify-between gap-3 border-b border-[#dce8e4] bg-[#f8fbfa] px-3 py-2">
                <div className="flex items-center gap-2 text-xs font-semibold text-[#52606d]">
                  <LockKeyhole className="h-3.5 w-3.5" />
                  {MESSAGE_ROLE_LABELS[message.role] ?? message.role}
                </div>
                <Badge variant="outline" className="border-[#cbdad6] bg-white text-[#52606d]">只读</Badge>
              </div>
              <pre className="max-h-[520px] overflow-auto whitespace-pre-wrap p-4 text-xs leading-relaxed text-[#1f2937]">
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
