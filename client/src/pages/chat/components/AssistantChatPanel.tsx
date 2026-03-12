import { useMemo } from "react";
import {
  AssistantRuntimeProvider,
  ComposerPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
  useLocalRuntime,
  type ChatModelAdapter,
  type ThreadAssistantMessagePart,
  type ThreadMessage,
} from "@assistant-ui/react";
import type { SSEFrame } from "@ai-novel/shared/types/api";
import type { ChatMessage } from "@/store/chatStore";
import MarkdownViewer from "@/components/common/MarkdownViewer";
import { API_BASE_URL } from "@/lib/constants";

type ChatMode = "standard" | "agent";
type ContextMode = "global" | "novel";
type RuntimeEvent = Extract<SSEFrame, {
  type: "tool_call" | "tool_result" | "approval_required" | "approval_resolved";
}>;
type RuntimeRunStatus = Extract<SSEFrame, { type: "run_status" }>;

interface AssistantChatPanelProps {
  initialMessages: ChatMessage[];
  ensureSession: () => Promise<string>;
  chatMode: ChatMode;
  contextMode: ContextMode;
  novelId: string;
  runId?: string;
  enableRag: boolean;
  knowledgeDocumentIds: string[] | null;
  systemPrompt: string;
  provider: string;
  model: string;
  temperature: number;
  maxTokens: number;
  onRunStart: () => void;
  onRuntimeEvent: (event: RuntimeEvent) => void;
  onRunStatus: (event: RuntimeRunStatus) => void;
  onStreamStateChange: (state: { isStreaming: boolean; error: string | null }) => void;
  onValidationError: (message: string) => void;
  onPersistConversation: (payload: { sessionId: string; messages: ChatMessage[]; runId?: string }) => Promise<void>;
}

function extractMessageText(message: ThreadMessage): string {
  return message.content
    .map((part) => {
      if (part.type === "text" || part.type === "reasoning") {
        return part.text;
      }
      if (part.type === "source") {
        return part.title ? `${part.title} (${part.url})` : part.url;
      }
      if (part.type === "tool-call") {
        return `[工具:${part.toolName}]`;
      }
      if (part.type === "data") {
        try {
          return JSON.stringify(part.data);
        } catch {
          return "[数据]";
        }
      }
      if (part.type === "image") {
        return `[图片:${part.filename ?? "未命名"}]`;
      }
      if (part.type === "file") {
        return `[文件:${part.filename ?? "未命名"}]`;
      }
      return "";
    })
    .filter(Boolean)
    .join("\n")
    .trim();
}

function toChatMessages(messages: readonly ThreadMessage[]): ChatMessage[] {
  return messages
    .map((message) => {
      const content = extractMessageText(message);
      if (!content) {
        return null;
      }
      return {
        id: message.id,
        role: message.role,
        content,
        createdAt: message.createdAt.toISOString(),
      } satisfies ChatMessage;
    })
    .filter((item): item is ChatMessage => item !== null);
}

function UserMessage() {
  return (
    <MessagePrimitive.If hasContent>
      <MessagePrimitive.Root className="ml-auto max-w-[88%] rounded-2xl bg-slate-900 px-4 py-3 text-slate-50 shadow-sm">
        <MessagePrimitive.Parts
          components={{
            Text: ({ text }: { text: string }) => (
              <div className="text-sm leading-6">
                <MarkdownViewer content={text} />
              </div>
            ),
          }}
        />
      </MessagePrimitive.Root>
    </MessagePrimitive.If>
  );
}

function AssistantMessage() {
  return (
    <MessagePrimitive.If hasContent>
      <MessagePrimitive.Root className="mr-auto max-w-[88%] rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 shadow-sm">
        <MessagePrimitive.Parts
          components={{
            Text: ({ text }: { text: string }) => (
              <div className="text-sm leading-6">
                <MarkdownViewer content={text} />
              </div>
            ),
            Reasoning: ({ text }: { text: string }) => (
              <div className="mb-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs">
                <div className="mb-1 text-[11px] text-amber-700">推理过程</div>
                <MarkdownViewer content={text} />
              </div>
            ),
          }}
        />
      </MessagePrimitive.Root>
    </MessagePrimitive.If>
  );
}

function SystemMessage() {
  return (
    <MessagePrimitive.If hasContent>
      <MessagePrimitive.Root className="mx-auto max-w-[92%] rounded-xl border border-dashed border-slate-300 bg-slate-100 px-3 py-2">
        <MessagePrimitive.Parts
          components={{
            Text: ({ text }: { text: string }) => (
              <div className="text-xs text-slate-700">
                <MarkdownViewer content={text} />
              </div>
            ),
          }}
        />
      </MessagePrimitive.Root>
    </MessagePrimitive.If>
  );
}

export default function AssistantChatPanel({
  initialMessages,
  ensureSession,
  chatMode,
  contextMode,
  novelId,
  runId,
  enableRag,
  knowledgeDocumentIds,
  systemPrompt,
  provider,
  model,
  temperature,
  maxTokens,
  onRunStart,
  onRuntimeEvent,
  onRunStatus,
  onStreamStateChange,
  onValidationError,
  onPersistConversation,
}: AssistantChatPanelProps) {
  const seedMessages = useMemo(
    () =>
      initialMessages.map((message) => ({
        id: message.id,
        role: message.role,
        content: message.content,
        createdAt: new Date(message.createdAt),
      })),
    [initialMessages],
  );

  const chatModel = useMemo<ChatModelAdapter>(
    () => ({
      run: async function* run(options) {
        onRunStart();
        onStreamStateChange({ isStreaming: true, error: null });
        let streamError: string | null = null;
        try {
          if (chatMode === "agent" && contextMode === "novel" && !novelId.trim()) {
            const message = "小说模式下必须先选择小说。";
            onValidationError(message);
            throw new Error(message);
          }

          const sessionId = await ensureSession();
          const payloadMessages = options.messages
            .map((message) => ({
              role: message.role as "user" | "assistant" | "system",
              content: extractMessageText(message),
            }))
            .filter((message) => message.content.length > 0)
            .slice(-20);
          if (payloadMessages.length === 0) {
            payloadMessages.push({ role: "user", content: "继续当前任务。" });
          }

          const response = await fetch(`${API_BASE_URL}/chat`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              messages: payloadMessages,
              systemPrompt: systemPrompt || undefined,
              agentMode: chatMode === "agent",
              chatMode,
              contextMode,
              novelId: contextMode === "novel" ? novelId || undefined : undefined,
              sessionId,
              runId: runId || undefined,
              enableRag,
              knowledgeDocumentIds: knowledgeDocumentIds ?? undefined,
              provider,
              model,
              temperature,
              maxTokens,
            }),
            signal: options.abortSignal,
          });

          if (!response.ok || !response.body) {
            throw new Error(`请求失败，状态码 ${response.status}`);
          }

          const reader = response.body.getReader();
          const decoder = new TextDecoder("utf-8");
          let buffer = "";
          let fullContent = "";
          let reasoningContent = "";
          let latestRunId = runId;

          const buildContentParts = (): ThreadAssistantMessagePart[] => {
            const parts: ThreadAssistantMessagePart[] = [];
            if (reasoningContent.trim()) {
              parts.push({ type: "reasoning", text: reasoningContent.trim() });
            }
            if (fullContent) {
              parts.push({ type: "text", text: fullContent });
            }
            return parts;
          };

          while (true) {
            const { value, done } = await reader.read();
            if (done) {
              break;
            }

            buffer += decoder.decode(value, { stream: true });
            const frames = buffer.split("\n\n");
            buffer = frames.pop() ?? "";

            for (const rawFrame of frames) {
              const payloadLine = rawFrame
                .split("\n")
                .find((line) => line.startsWith("data:"));
              if (!payloadLine) {
                continue;
              }
              const rawData = payloadLine.replace("data:", "").trim();
              if (!rawData) {
                continue;
              }
              const frame = JSON.parse(rawData) as SSEFrame;
              if (frame.type === "ping") {
                continue;
              }
              if (frame.type === "chunk") {
                fullContent += frame.content;
                const parts = buildContentParts();
                if (parts.length > 0) {
                  yield { content: parts };
                }
                continue;
              }
              if (frame.type === "reasoning") {
                reasoningContent += frame.content;
                const parts = buildContentParts();
                if (parts.length > 0) {
                  yield { content: parts };
                }
                continue;
              }
              if (frame.type === "run_status") {
                latestRunId = frame.runId;
                onRunStatus(frame);
                continue;
              }
              if (frame.type === "tool_call"
                || frame.type === "tool_result"
                || frame.type === "approval_required"
                || frame.type === "approval_resolved") {
                onRuntimeEvent(frame);
                continue;
              }
              if (frame.type === "done") {
                fullContent = frame.fullContent || fullContent;
                continue;
              }
              if (frame.type === "error") {
                throw new Error(frame.error);
              }
            }
          }

          const finalParts = buildContentParts();
          if (finalParts.length > 0) {
            yield { content: finalParts };
          }

          const finalAssistantText = fullContent.trim() || reasoningContent.trim();
          const persistedMessages = [
            ...toChatMessages(options.messages),
            {
              id: `msg_${Date.now()}`,
              role: "assistant" as const,
              content: finalAssistantText || "（空响应）",
              createdAt: new Date().toISOString(),
            },
          ];
          await onPersistConversation({
            sessionId,
            messages: persistedMessages,
            runId: latestRunId,
          });

          return;
        } catch (error) {
          streamError = error instanceof Error ? error.message : "消息发送失败。";
          onStreamStateChange({ isStreaming: false, error: streamError });
          throw error;
        } finally {
          if (!streamError) {
            onStreamStateChange({ isStreaming: false, error: null });
          }
        }
      },
    }),
    [
      chatMode,
      contextMode,
      enableRag,
      ensureSession,
      knowledgeDocumentIds,
      maxTokens,
      model,
      novelId,
      onPersistConversation,
      onRunStart,
      onRunStatus,
      onRuntimeEvent,
      onStreamStateChange,
      onValidationError,
      provider,
      runId,
      systemPrompt,
      temperature,
    ],
  );

  const runtime = useLocalRuntime(chatModel, {
    initialMessages: seedMessages,
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ThreadPrimitive.Root className="space-y-4">
        <ThreadPrimitive.Viewport className="max-h-[52vh] space-y-4 overflow-auto rounded-2xl bg-gradient-to-b from-slate-50 to-slate-100/70 p-4 ring-1 ring-slate-200">
          <ThreadPrimitive.Empty>
            <div className="mx-auto mt-8 max-w-[680px] px-2 text-center">
              <h3 className="text-4xl font-semibold tracking-tight text-slate-900">你好！</h3>
              <p className="mt-2 text-2xl text-slate-500">今天想一起完善哪段剧情？</p>
              <div className="mt-8 grid gap-3 md:grid-cols-2">
                <ThreadPrimitive.Suggestion
                  prompt="帮我梳理《遥远的救世主V2》的世界观硬约束，并指出当前大纲冲突点。"
                  send={false}
                  asChild
                >
                  <button
                    type="button"
                    className="rounded-2xl border border-slate-200 bg-white p-4 text-left transition hover:border-slate-300 hover:bg-slate-50"
                  >
                    <div className="text-sm font-medium text-slate-900">世界观一致性检查</div>
                    <div className="mt-1 text-xs text-slate-500">快速识别硬冲突并给出修复方向</div>
                  </button>
                </ThreadPrimitive.Suggestion>
                <ThreadPrimitive.Suggestion
                  prompt="重写第3章结尾，增强戏剧张力，并保持角色口吻一致。"
                  send={false}
                  asChild
                >
                  <button
                    type="button"
                    className="rounded-2xl border border-slate-200 bg-white p-4 text-left transition hover:border-slate-300 hover:bg-slate-50"
                  >
                    <div className="text-sm font-medium text-slate-900">章节重写草案</div>
                    <div className="mt-1 text-xs text-slate-500">聚焦结尾张力与角色一致性</div>
                  </button>
                </ThreadPrimitive.Suggestion>
              </div>
            </div>
          </ThreadPrimitive.Empty>
          <ThreadPrimitive.Messages
            components={{
              UserMessage,
              AssistantMessage,
              SystemMessage,
            }}
          />
        </ThreadPrimitive.Viewport>
        <ComposerPrimitive.Root className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
          <ComposerPrimitive.Input
            className="min-h-[110px] w-full resize-none rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm outline-none transition focus:border-slate-400 focus:bg-white"
            placeholder="输入消息并回车发送，Shift+Enter 换行。"
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
    </AssistantRuntimeProvider>
  );
}
