import {
  AssistantRuntimeProvider,
  ComposerPrimitive,
  ThreadPrimitive,
  type AssistantRuntime,
} from "@assistant-ui/react";
import type { FailureDiagnostic } from "@ai-novel/shared/types/agent";
import type { CreativeHubInterrupt } from "@ai-novel/shared/types/creativeHub";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CreativeHubInlineControlsProvider } from "./CreativeHubInlineControlsContext";
import {
  CreativeHubAssistantMessage,
  CreativeHubEditComposer,
  CreativeHubUserMessage,
} from "./CreativeHubMessagePrimitives";

interface CreativeHubConversationProps {
  runtime: AssistantRuntime;
  onQuickAction?: (prompt: string) => void;
  interrupt?: CreativeHubInterrupt;
  approvalNote?: string;
  onApprovalNoteChange?: (value: string) => void;
  onResolveInterrupt?: (action: "approve" | "reject") => void;
  diagnostics?: FailureDiagnostic;
}

export default function CreativeHubConversation({
  runtime,
  onQuickAction,
  interrupt,
  approvalNote,
  onApprovalNoteChange,
  onResolveInterrupt,
  diagnostics,
}: CreativeHubConversationProps) {
  return (
    <CreativeHubInlineControlsProvider
      value={{
        interrupt,
        approvalNote: approvalNote ?? "",
        diagnostics,
        onApprovalNoteChange,
        onResolveInterrupt,
        onQuickAction,
      }}
    >
      <AssistantRuntimeProvider runtime={runtime}>
        <Card className="flex h-full min-h-0 flex-col">
          <CardHeader>
            <CardTitle className="text-base">创作中枢</CardTitle>
          </CardHeader>
          <CardContent className="flex min-h-0 flex-1 flex-col">
            <ThreadPrimitive.Root className="flex min-h-0 flex-1 flex-col space-y-4">
              <ThreadPrimitive.Viewport className="min-h-0 flex-1 space-y-4 overflow-y-auto rounded-2xl bg-gradient-to-b from-slate-50 to-slate-100/70 p-4 ring-1 ring-slate-200">
                <ThreadPrimitive.Empty>
                  <div className="mx-auto mt-8 max-w-[680px] px-2 text-center">
                    <h3 className="text-4xl font-semibold tracking-tight text-slate-900">创作中枢</h3>
                    <p className="mt-2 text-lg text-slate-500">先把你卡住的创作问题抛进来，我会先帮你判断、拆解，再决定是否进入执行。</p>
                    {onQuickAction ? (
                      <div className="mt-5 flex flex-wrap justify-center gap-2">
                        <Button type="button" variant="outline" onClick={() => onQuickAction("基于当前信息，给我 3 套这本书的一句话设定方向。")}>
                          给我设定方向
                        </Button>
                        <Button type="button" variant="outline" onClick={() => onQuickAction("帮我判断当前设定最大的短板是什么，并告诉我先补哪一块。")}>
                          先做诊断
                        </Button>
                        <Button type="button" variant="outline" onClick={() => onQuickAction("给我 3 套更有吸引力的故事承诺，要求气质差异明显。")}>
                          要故事承诺
                        </Button>
                        <Button type="button" variant="outline" onClick={() => onQuickAction("别急着执行，先根据当前信息帮我收敛成一个可生产的初始化方案。")}>
                          收敛初始化
                        </Button>
                      </div>
                    ) : null}
                  </div>
                </ThreadPrimitive.Empty>
                <ThreadPrimitive.Messages
                  components={{
                    UserMessage: CreativeHubUserMessage,
                    AssistantMessage: CreativeHubAssistantMessage,
                    EditComposer: CreativeHubEditComposer,
                  }}
                />
              </ThreadPrimitive.Viewport>
              <ComposerPrimitive.Root className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
                <ComposerPrimitive.Input
                  className="min-h-[110px] w-full resize-none rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm outline-none transition focus:border-slate-400 focus:bg-white"
                  placeholder="描述你现在的作品问题、犹豫点或想推进的一轮创作；Enter 发送，Shift+Enter 换行。"
                  submitMode="enter"
                />
                <div className="mt-3 flex gap-2">
                  <ComposerPrimitive.Send asChild>
                    <button
                      type="button"
                      className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
                    >
                      发送
                    </button>
                  </ComposerPrimitive.Send>
                  <ComposerPrimitive.Cancel asChild>
                    <button
                      type="button"
                      className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                    >
                      停止
                    </button>
                  </ComposerPrimitive.Cancel>
                </div>
              </ComposerPrimitive.Root>
            </ThreadPrimitive.Root>
          </CardContent>
        </Card>
      </AssistantRuntimeProvider>
    </CreativeHubInlineControlsProvider>
  );
}
