import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { SSEFrame } from "@ai-novel/shared/types/api";
import type { AgentStep } from "@ai-novel/shared/types/agent";
import { useSearchParams } from "react-router-dom";
import MarkdownViewer from "@/components/common/MarkdownViewer";
import KnowledgeDocumentPicker from "@/components/knowledge/KnowledgeDocumentPicker";
import { getAgentRunDetail, replayAgentRunFromStep } from "@/api/agentRuns";
import { getNovelList } from "@/api/novel";
import { queryKeys } from "@/api/queryKeys";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useSSE } from "@/hooks/useSSE";
import { useChatStore } from "@/store/chatStore";
import { useLLMStore } from "@/store/llmStore";

type ChatMode = "standard" | "agent";
type ContextMode = "global" | "novel";

function formatEvent(event: Extract<SSEFrame, { type: "tool_call" | "tool_result" | "approval_required" | "approval_resolved" }>): string {
  if (event.type === "tool_call") {
    return `调用工具 ${event.toolName}: ${event.inputSummary}`;
  }
  if (event.type === "tool_result") {
    return `${event.toolName} ${event.success ? "成功" : "失败"}: ${event.outputSummary}`;
  }
  if (event.type === "approval_required") {
    return `等待审批: ${event.summary}`;
  }
  return `审批结果: ${event.action}${event.note ? ` (${event.note})` : ""}`;
}

function safePreview(json: string | null | undefined): string {
  if (!json?.trim()) {
    return "N/A";
  }
  try {
    const parsed = JSON.parse(json) as unknown;
    return JSON.stringify(parsed, null, 2).slice(0, 400);
  } catch {
    return json.slice(0, 400);
  }
}

function stepTitle(step: AgentStep): string {
  return `${step.agentName}.${step.stepType} · ${step.status}`;
}

export default function ChatPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const runIdFromUrl = searchParams.get("runId")?.trim() ?? "";
  const novelIdFromUrl = searchParams.get("novelId")?.trim() ?? "";
  const llm = useLLMStore();
  const chatStore = useChatStore();
  const [input, setInput] = useState("");
  const [chatMode, setChatMode] = useState<ChatMode>("standard");
  const [contextMode, setContextMode] = useState<ContextMode>("global");
  const [enableRag, setEnableRag] = useState(true);
  const [systemPrompt, setSystemPrompt] = useState("");
  const [knowledgeDocumentIds, setKnowledgeDocumentIds] = useState<string[] | null>(null);
  const [novelId, setNovelId] = useState(novelIdFromUrl);
  const [approvalNote, setApprovalNote] = useState("");
  const [localError, setLocalError] = useState("");
  const [replayStepId, setReplayStepId] = useState("");

  useEffect(() => {
    if (!chatStore.hydrated) {
      void chatStore.hydrate();
    }
  }, [chatStore]);

  useEffect(() => {
    if (novelIdFromUrl) {
      setNovelId((prev) => prev || novelIdFromUrl);
      setContextMode("novel");
    }
  }, [novelIdFromUrl]);

  const novelListQuery = useQuery({
    queryKey: queryKeys.novels.list(1, 50),
    queryFn: () => getNovelList({ page: 1, limit: 50 }),
  });
  const novels = novelListQuery.data?.data?.items ?? [];

  const currentSession = useMemo(
    () => chatStore.sessions.find((session) => session.id === chatStore.currentSessionId),
    [chatStore.currentSessionId, chatStore.sessions],
  );
  const deferredMessages = useDeferredValue(currentSession?.messages ?? []);
  const runHistoryIds = currentSession?.runIds ?? (currentSession?.latestRunId ? [currentSession.latestRunId] : []);
  const currentRunId = currentSession?.latestRunId ?? runIdFromUrl;
  const runDetailQuery = useQuery({
    queryKey: queryKeys.agentRuns.detail(currentRunId || "none"),
    queryFn: () => getAgentRunDetail(currentRunId),
    enabled: Boolean(currentRunId),
    refetchInterval: (query) => {
      const status = query.state.data?.data?.run.status;
      return status === "running" || status === "waiting_approval" ? 4000 : false;
    },
  });
  const persistedRun = runDetailQuery.data?.data;
  const replaySteps = persistedRun?.steps ?? [];
  const effectiveReplayStepId = useMemo(() => {
    if (replayStepId && replaySteps.some((step) => step.id === replayStepId)) {
      return replayStepId;
    }
    return replaySteps[replaySteps.length - 1]?.id ?? "";
  }, [replayStepId, replaySteps]);

  const sse = useSSE({
    onDone: async (fullContent) => {
      if (!chatStore.currentSessionId || !fullContent.trim()) {
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

  useEffect(() => {
    if (!chatStore.currentSessionId || !sse.latestRun?.runId) {
      return;
    }
    if (currentSession?.latestRunId !== sse.latestRun.runId) {
      void chatStore.setSessionRunId(chatStore.currentSessionId, sse.latestRun.runId);
    }
    const needRunParamUpdate = runIdFromUrl !== sse.latestRun.runId;
    const needNovelParamUpdate = contextMode === "novel"
      ? novelIdFromUrl !== (novelId || "")
      : Boolean(novelIdFromUrl);
    if (!needRunParamUpdate && !needNovelParamUpdate) {
      return;
    }
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("runId", sse.latestRun?.runId ?? "");
      if (contextMode === "novel" && novelId) {
        next.set("novelId", novelId);
      } else {
        next.delete("novelId");
      }
      return next;
    }, { replace: true });
  }, [
    chatStore,
    contextMode,
    currentSession?.latestRunId,
    novelId,
    novelIdFromUrl,
    runIdFromUrl,
    setSearchParams,
    sse.latestRun?.runId,
  ]);

  useEffect(() => {
    if (!chatStore.currentSessionId || !runIdFromUrl) {
      return;
    }
    if (currentSession?.latestRunId === runIdFromUrl) {
      return;
    }
    void chatStore.setSessionRunId(chatStore.currentSessionId, runIdFromUrl);
  }, [chatStore, chatStore.currentSessionId, currentSession?.latestRunId, runIdFromUrl]);

  const ensureSession = async () => {
    if (chatStore.currentSessionId) {
      return chatStore.currentSessionId;
    }
    return chatStore.createSession("New chat");
  };

  const buildPayloadMessages = (sessionMessages: Array<{ role: "user" | "assistant" | "system"; content: string }>) => {
    if (sessionMessages.length > 0) {
      return sessionMessages;
    }
    return [{ role: "user" as const, content: "继续当前任务。" }];
  };

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || sse.isStreaming) {
      return;
    }
    if (chatMode === "agent" && contextMode === "novel" && !novelId.trim()) {
      setLocalError("novel 模式下必须先选择小说。");
      return;
    }
    setLocalError("");

    const sessionId = await ensureSession();
    await chatStore.appendMessage(sessionId, {
      id: `msg_${Date.now()}`,
      role: "user",
      content: text,
      createdAt: new Date().toISOString(),
    });
    setInput("");

    const session = chatStore.sessions.find((item) => item.id === sessionId);
    const messages = buildPayloadMessages(
      [...(session?.messages ?? []), { role: "user" as const, content: text }]
        .slice(-20)
        .map((item) => ({
          role: item.role as "user" | "assistant" | "system",
          content: item.content,
        })),
    );

    await sse.start("/chat", {
      messages,
      systemPrompt: systemPrompt || undefined,
      agentMode: chatMode === "agent",
      chatMode,
      contextMode,
      novelId: contextMode === "novel" ? novelId || undefined : undefined,
      sessionId,
      runId: currentSession?.latestRunId ?? undefined,
      enableRag,
      knowledgeDocumentIds: knowledgeDocumentIds ?? undefined,
      provider: llm.provider,
      model: llm.model,
      temperature: llm.temperature,
      maxTokens: llm.maxTokens,
    });
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (contextMode === "novel" && novelId) {
        next.set("novelId", novelId);
      }
      return next;
    }, { replace: true });
  };

  const submitApproval = async (action: "approve" | "reject") => {
    const sessionId = await ensureSession();
    const runId = currentSession?.latestRunId;
    const persistedPendingApproval = persistedRun?.approvals.find((item) => item.status === "pending");
    const pending = sse.pendingApprovals[0]
      ?? (persistedPendingApproval
        ? {
          approvalId: persistedPendingApproval.id,
        }
        : null);
    if (!runId || !pending) {
      setLocalError("当前没有可处理的审批项。");
      return;
    }
    setLocalError("");
    const sessionMessages = buildPayloadMessages(
      (currentSession?.messages ?? [])
        .slice(-20)
        .map((item) => ({
          role: item.role as "user" | "assistant" | "system",
          content: item.content,
        })),
    );
    await sse.start("/chat", {
      messages: sessionMessages,
      agentMode: true,
      chatMode: "agent",
      contextMode,
      novelId: contextMode === "novel" ? novelId || undefined : undefined,
      sessionId,
      runId,
      approvalResponse: {
        approvalId: pending.approvalId,
        action,
        note: approvalNote || undefined,
      },
      provider: llm.provider,
      model: llm.model,
      temperature: llm.temperature,
      maxTokens: llm.maxTokens,
    });
    setApprovalNote("");
  };

  const triggerReplay = async (mode: "continue" | "dry_run") => {
    if (!currentRunId || !effectiveReplayStepId) {
      setLocalError("请选择可重放的步骤。");
      return;
    }
    setLocalError("");
    const response = await replayAgentRunFromStep(currentRunId, {
      fromStepId: effectiveReplayStepId,
      mode,
    });
    const newRunId = response.data?.run.id;
    if (!newRunId) {
      setLocalError(response.error ?? "重放失败。");
      return;
    }
    if (chatStore.currentSessionId) {
      await chatStore.setSessionRunId(chatStore.currentSessionId, newRunId);
    }
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("runId", newRunId);
      return next;
    }, { replace: true });
  };

  const approvalCards = sse.pendingApprovals.length > 0
    ? sse.pendingApprovals.map((item) => ({
      approvalId: item.approvalId,
      targetType: item.targetType,
      targetId: item.targetId,
      summary: item.summary,
    }))
    : (persistedRun?.approvals ?? [])
      .filter((item) => item.status === "pending")
      .map((item) => ({
        approvalId: item.id,
        targetType: item.targetType,
        targetId: item.targetId,
        summary: item.diffSummary,
      }));

  const approvalHistory = (persistedRun?.approvals ?? [])
    .filter((item) => item.status !== "pending")
    .slice(-6)
    .reverse();

  const traceItems = sse.events.length > 0
    ? sse.events.map((event, index) => ({
      key: `${event.type}-${index}`,
      text: formatEvent(event),
      step: undefined,
    }))
    : (persistedRun?.steps ?? []).slice(-20).map((step) => ({
      key: step.id,
      text: stepTitle(step),
      step,
    }));

  return (
    <div className="grid min-h-[70vh] gap-4 lg:grid-cols-[240px_1fr_320px]">
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
                <div>{session.title}</div>
                {session.latestRunId ? (
                  <div className="text-[11px] text-muted-foreground">
                    run: {session.latestRunId.slice(0, 8)} · {session.runIds?.length ?? 1}条
                  </div>
                ) : null}
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
            {deferredMessages.map((message) => (
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
          {localError ? (
            <div className="rounded-md border border-red-300 bg-red-50 px-2 py-1 text-xs text-red-700">
              {localError}
            </div>
          ) : null}
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
          <CardTitle className="text-base">Runtime & Model</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="grid gap-2">
            <label className="text-xs text-muted-foreground">Chat mode</label>
            <select
              className="w-full rounded-md border bg-background p-2"
              value={chatMode}
              onChange={(event) => setChatMode(event.target.value as ChatMode)}
            >
              <option value="standard">Standard</option>
              <option value="agent">Agent Runtime</option>
            </select>
          </div>
          <div className="grid gap-2">
            <label className="text-xs text-muted-foreground">Context mode</label>
            <select
              className="w-full rounded-md border bg-background p-2"
              value={contextMode}
              onChange={(event) => setContextMode(event.target.value as ContextMode)}
            >
              <option value="global">Global</option>
              <option value="novel">Novel</option>
            </select>
          </div>
          {runHistoryIds.length > 0 ? (
            <div className="grid gap-2">
              <label className="text-xs text-muted-foreground">Session runs</label>
              <select
                className="w-full rounded-md border bg-background p-2"
                value={currentRunId}
                onChange={(event) => {
                  const nextRunId = event.target.value;
                  if (!chatStore.currentSessionId) {
                    return;
                  }
                  void chatStore.setSessionRunId(chatStore.currentSessionId, nextRunId);
                  setSearchParams((prev) => {
                    const next = new URLSearchParams(prev);
                    next.set("runId", nextRunId);
                    return next;
                  }, { replace: true });
                }}
              >
                {runHistoryIds.map((id) => (
                  <option key={id} value={id}>
                    {id.slice(0, 16)}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          {contextMode === "novel" ? (
            <div className="grid gap-2">
              <label className="text-xs text-muted-foreground">Novel</label>
              <select
                className="w-full rounded-md border bg-background p-2"
                value={novelId}
                onChange={(event) => setNovelId(event.target.value)}
              >
                <option value="">Select novel</option>
                {novels.map((novel) => (
                  <option key={novel.id} value={novel.id}>
                    {novel.title}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

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
              checked={enableRag}
              onChange={(event) => setEnableRag(event.target.checked)}
            />
            Enable knowledge retrieval (RAG)
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
            description={enableRag
              ? "Leave empty to use automatic resolution, or select documents to limit retrieval."
              : "RAG is disabled. Re-enable it above to use document retrieval."}
            allowAuto
            queryStatus="enabled"
          />

          {chatMode === "agent" && approvalCards.length > 0 ? (
            <div className="space-y-2 rounded-md border border-amber-300 bg-amber-50 p-2">
              <div className="text-xs font-medium text-amber-800">Pending approvals</div>
              {approvalCards.map((item) => (
                <div key={item.approvalId} className="rounded-md border bg-white p-2">
                  <div className="text-xs text-muted-foreground">{item.targetType}:{item.targetId}</div>
                  <div className="text-sm">{item.summary}</div>
                </div>
              ))}
              <textarea
                className="min-h-[70px] w-full rounded-md border p-2"
                value={approvalNote}
                onChange={(event) => setApprovalNote(event.target.value)}
                placeholder="Approval note (optional)"
              />
              <div className="flex gap-2">
                <Button size="sm" onClick={() => void submitApproval("approve")} disabled={sse.isStreaming}>
                  Approve
                </Button>
                <Button size="sm" variant="destructive" onClick={() => void submitApproval("reject")} disabled={sse.isStreaming}>
                  Reject
                </Button>
              </div>
            </div>
          ) : null}
          {chatMode === "agent" && approvalHistory.length > 0 ? (
            <div className="space-y-2 rounded-md border p-2">
              <div className="text-xs font-medium">Approval history</div>
              {approvalHistory.map((item) => (
                <div key={item.id} className="rounded border bg-muted/20 px-2 py-1 text-xs">
                  {item.status} · {item.targetType}:{item.targetId}
                  {item.decisionNote ? ` · ${item.decisionNote}` : ""}
                </div>
              ))}
            </div>
          ) : null}

          <div className="space-y-2 rounded-md border p-2">
            <div className="text-xs font-medium">Run trace</div>
            {sse.latestRun ? (
              <div className="text-xs text-muted-foreground">
                run {sse.latestRun.runId.slice(0, 10)} · {sse.latestRun.status}
                {sse.latestRun.message ? ` · ${sse.latestRun.message}` : ""}
              </div>
            ) : persistedRun ? (
              <div className="text-xs text-muted-foreground">
                run {persistedRun.run.id.slice(0, 10)} · {persistedRun.run.status}
              </div>
            ) : null}
            {persistedRun?.steps.length ? (
              <div className="space-y-1">
                <select
                  className="w-full rounded-md border bg-background p-1 text-xs"
                  value={effectiveReplayStepId}
                  onChange={(event) => setReplayStepId(event.target.value)}
                >
                  {persistedRun.steps.map((step) => (
                    <option key={step.id} value={step.id}>
                      {step.seq}. {stepTitle(step)}
                    </option>
                  ))}
                </select>
                <div className="flex gap-2">
                  <Button size="sm" variant="secondary" onClick={() => void triggerReplay("continue")} disabled={sse.isStreaming}>
                    Replay
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => void triggerReplay("dry_run")} disabled={sse.isStreaming}>
                    Dry Replay
                  </Button>
                </div>
              </div>
            ) : null}
            <div className="max-h-[180px] space-y-1 overflow-auto">
              {traceItems.map((item) => (
                item.step ? (
                  <details key={item.key} className="rounded border bg-muted/20 px-2 py-1 text-xs">
                    <summary className="cursor-pointer">{item.text}</summary>
                    <div className="mt-1 space-y-1">
                      <div>input: <pre className="overflow-auto whitespace-pre-wrap">{safePreview(item.step.inputJson)}</pre></div>
                      <div>output: <pre className="overflow-auto whitespace-pre-wrap">{safePreview(item.step.outputJson)}</pre></div>
                      {item.step.error ? <div className="text-red-600">error: {item.step.error}</div> : null}
                    </div>
                  </details>
                ) : (
                  <div key={item.key} className="rounded border bg-muted/20 px-2 py-1 text-xs">
                    {item.text}
                  </div>
                )
              ))}
              {sse.events.length === 0 && !persistedRun ? (
                <div className="text-xs text-muted-foreground">No runtime events yet.</div>
              ) : null}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
