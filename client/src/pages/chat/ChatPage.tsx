import { useEffect, useMemo, useState } from "react";
import MarkdownViewer from "@/components/common/MarkdownViewer";
import KnowledgeDocumentPicker from "@/components/knowledge/KnowledgeDocumentPicker";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useSSE } from "@/hooks/useSSE";
import { useChatStore } from "@/store/chatStore";
import { useLLMStore } from "@/store/llmStore";

export default function ChatPage() {
  const llm = useLLMStore();
  const chatStore = useChatStore();
  const [input, setInput] = useState("");
  const [agentMode, setAgentMode] = useState(false);
  const [systemPrompt, setSystemPrompt] = useState("");
  const [knowledgeDocumentIds, setKnowledgeDocumentIds] = useState<string[] | null>(null);

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
    return chatStore.createSession("New chat");
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
      knowledgeDocumentIds: knowledgeDocumentIds ?? undefined,
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
          <CardTitle className="text-base">Chat Sessions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Button className="w-full" onClick={() => void chatStore.createSession("New chat")}>
            New chat
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
          <CardTitle className="text-base">Messages</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="max-h-[52vh] space-y-3 overflow-auto rounded-md border p-3">
            {(currentSession?.messages ?? []).map((message) => (
              <div key={message.id} className="rounded-md border bg-muted/30 p-2">
                <div className="mb-1 text-xs text-muted-foreground">
                  {message.role === "user" ? "User" : message.role === "assistant" ? "Assistant" : "System"}
                </div>
                <MarkdownViewer content={message.content} />
              </div>
            ))}
            {sse.reasoning ? (
              <div className="rounded-md border bg-amber-50 p-2 text-sm">
                <div className="mb-1 text-xs text-muted-foreground">Reasoning</div>
                <MarkdownViewer content={sse.reasoning} />
              </div>
            ) : null}
            {sse.content ? (
              <div className="rounded-md border bg-blue-50 p-2 text-sm">
                <div className="mb-1 text-xs text-muted-foreground">Streaming</div>
                <MarkdownViewer content={sse.content} />
              </div>
            ) : null}
          </div>
          <textarea
            className="min-h-[120px] w-full rounded-md border bg-background p-3 text-sm"
            placeholder="Enter to send. Shift+Enter for a newline."
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
              Send
            </Button>
            <Button variant="secondary" onClick={sse.abort} disabled={!sse.isStreaming}>
              Stop
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Model Settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div>
            <div className="mb-1 text-xs text-muted-foreground">Provider</div>
            <div>{llm.provider}</div>
          </div>
          <div>
            <div className="mb-1 text-xs text-muted-foreground">Model</div>
            <div>{llm.model}</div>
          </div>
          <div>
            <div className="mb-1 text-xs text-muted-foreground">Temperature</div>
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
            <div className="mb-1 text-xs text-muted-foreground">Max tokens</div>
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
            Enable agent mode
          </label>
          <div>
            <div className="mb-1 text-xs text-muted-foreground">System prompt</div>
            <textarea
              className="min-h-[120px] w-full rounded-md border p-2"
              value={systemPrompt}
              onChange={(event) => setSystemPrompt(event.target.value)}
              placeholder="Override the default system prompt."
            />
          </div>
          <KnowledgeDocumentPicker
            selectedIds={knowledgeDocumentIds}
            onChange={setKnowledgeDocumentIds}
            title="Knowledge documents"
            description="Leave empty to use automatic resolution, or select documents to limit retrieval."
            allowAuto
            queryStatus="enabled"
          />
        </CardContent>
      </Card>
    </div>
  );
}
