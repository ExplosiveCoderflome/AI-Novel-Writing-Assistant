import { useEffect, useMemo, useState } from "react";
import { useSSE } from "@/hooks/useSSE";
import { useChatStore } from "@/store/chatStore";
import { useLLMStore } from "@/store/llmStore";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import MarkdownViewer from "@/components/common/MarkdownViewer";

export default function ChatPage() {
  const llm = useLLMStore();
  const chatStore = useChatStore();
  const [input, setInput] = useState("");
  const [agentMode, setAgentMode] = useState(false);
  const [systemPrompt, setSystemPrompt] = useState("");

  useEffect(() => {
    if (!chatStore.hydrated) {
      void chatStore.hydrate();
    }
  }, [chatStore]);

  const currentSession = useMemo(
    () => chatStore.sessions.find((session) => session.id === chatStore.currentSessionId),
    [chatStore.currentSessionId, chatStore.sessions],
  );

  const sse = useSSE({
    onDone: async (fullContent) => {
      if (!chatStore.currentSessionId) {
        return;
      }
      await chatStore.appendMessage(chatStore.currentSessionId, {
        id: `msg_${Date.now()}`,
        role: "assistant",
        content: fullContent,
        createdAt: new Date().toISOString(),
      });
    },
  });

  const ensureSession = async () => {
    if (chatStore.currentSessionId) {
      return chatStore.currentSessionId;
    }
    return chatStore.createSession("新对话");
  };

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || sse.isStreaming) {
      return;
    }
    const sessionId = await ensureSession();
    await chatStore.appendMessage(sessionId, {
      id: `msg_${Date.now()}`,
      role: "user",
      content: text,
      createdAt: new Date().toISOString(),
    });
    setInput("");

    const session = chatStore.sessions.find((item) => item.id === sessionId);
    const messages = [...(session?.messages ?? []), { role: "user", content: text }]
      .slice(-20)
      .map((item) => ({
        role: item.role,
        content: item.content,
      }));

    await sse.start("/chat", {
      messages,
      systemPrompt: systemPrompt || undefined,
      agentMode,
      provider: llm.provider,
      model: llm.model,
      temperature: llm.temperature,
      maxTokens: llm.maxTokens,
    });
  };

  return (
    <div className="grid min-h-[70vh] gap-4 lg:grid-cols-[240px_1fr_280px]">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">对话会话</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Button className="w-full" onClick={() => void chatStore.createSession("新对话")}>
            新对话
          </Button>
          <div className="space-y-1">
            {chatStore.sessions.map((session) => (
              <button
                key={session.id}
                type="button"
                className={`w-full rounded-md px-2 py-1 text-left text-sm ${
                  chatStore.currentSessionId === session.id ? "bg-accent" : "hover:bg-muted"
                }`}
                onClick={() => void chatStore.setCurrentSession(session.id)}
              >
                {session.title}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">消息窗口</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="max-h-[52vh] space-y-3 overflow-auto rounded-md border p-3">
            {(currentSession?.messages ?? []).map((message) => (
              <div key={message.id} className="rounded-md border bg-muted/30 p-2">
                <div className="mb-1 text-xs text-muted-foreground">
                  {message.role === "user" ? "你" : message.role === "assistant" ? "助手" : "系统"}
                </div>
                <MarkdownViewer content={message.content} />
              </div>
            ))}
            {sse.reasoning ? (
              <div className="rounded-md border bg-amber-50 p-2 text-sm">
                <div className="mb-1 text-xs text-muted-foreground">模型思考过程</div>
                <MarkdownViewer content={sse.reasoning} />
              </div>
            ) : null}
            {sse.content ? (
              <div className="rounded-md border bg-blue-50 p-2 text-sm">
                <div className="mb-1 text-xs text-muted-foreground">实时输出</div>
                <MarkdownViewer content={sse.content} />
              </div>
            ) : null}
          </div>
          <textarea
            className="min-h-[120px] w-full rounded-md border bg-background p-3 text-sm"
            placeholder="输入你的创作问题，Enter 发送，Shift+Enter 换行。"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void sendMessage();
              }
            }}
          />
          <div className="flex gap-2">
            <Button onClick={() => void sendMessage()} disabled={sse.isStreaming || !input.trim()}>
              发送
            </Button>
            <Button variant="secondary" onClick={sse.abort} disabled={!sse.isStreaming}>
              停止
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">模型设置</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div>
            <div className="mb-1 text-xs text-muted-foreground">服务商</div>
            <div>{llm.provider}</div>
          </div>
          <div>
            <div className="mb-1 text-xs text-muted-foreground">模型</div>
            <div>{llm.model}</div>
          </div>
          <div>
            <div className="mb-1 text-xs text-muted-foreground">温度</div>
            <input
              type="number"
              min={0}
              max={2}
              step={0.1}
              className="w-full rounded-md border p-2"
              value={llm.temperature}
              onChange={(event) => llm.setTemperature(Number(event.target.value))}
            />
          </div>
          <div>
            <div className="mb-1 text-xs text-muted-foreground">最大 Tokens</div>
            <input
              type="number"
              min={128}
              max={16384}
              step={128}
              className="w-full rounded-md border p-2"
              value={llm.maxTokens}
              onChange={(event) => llm.setMaxTokens(Number(event.target.value))}
            />
          </div>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={agentMode}
              onChange={(event) => setAgentMode(event.target.checked)}
            />
            启用 Agent 模式
          </label>
          <div>
            <div className="mb-1 text-xs text-muted-foreground">系统提示词（可选）</div>
            <textarea
              className="min-h-[120px] w-full rounded-md border p-2"
              value={systemPrompt}
              onChange={(event) => setSystemPrompt(event.target.value)}
              placeholder="可在这里覆盖默认系统提示词"
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
