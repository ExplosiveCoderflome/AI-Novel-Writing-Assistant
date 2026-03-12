import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { SSEFrame } from "@ai-novel/shared/types/api";
import type { AgentStep } from "@ai-novel/shared/types/agent";
import { useSearchParams } from "react-router-dom";
import { getAgentRunDetail, replayAgentRunFromStep } from "@/api/agentRuns";
import { getNovelList } from "@/api/novel";
import { queryKeys } from "@/api/queryKeys";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useSSE } from "@/hooks/useSSE";
import { useChatStore, type ChatMessage } from "@/store/chatStore";
import { useLLMStore } from "@/store/llmStore";
import AssistantChatPanel from "@/pages/chat/components/AssistantChatPanel";
import RuntimeSidebar from "@/pages/chat/components/RuntimeSidebar";

type ChatMode = "standard" | "agent";
type ContextMode = "global" | "novel";
type RuntimeEvent = Extract<SSEFrame, {
  type: "tool_call" | "tool_result" | "approval_required" | "approval_resolved";
}>;
type ApprovalRequiredEvent = Extract<SSEFrame, { type: "approval_required" }>;
type RunStatusEvent = Extract<SSEFrame, { type: "run_status" }>;

function toRunStatusLabel(status: string): string {
  if (status === "queued") return "排队中";
  if (status === "running") return "运行中";
  if (status === "waiting_approval") return "待审批";
  if (status === "succeeded") return "已完成";
  if (status === "failed") return "失败";
  if (status === "cancelled") return "已取消";
  return status;
}

function toApprovalActionLabel(action: string): string {
  if (action === "approved") return "已通过";
  if (action === "rejected") return "已拒绝";
  return action;
}

function toStepTypeLabel(stepType: string): string {
  if (stepType === "planning") return "规划";
  if (stepType === "tool_call") return "工具调用";
  if (stepType === "tool_result") return "工具结果";
  if (stepType === "approval") return "审批";
  if (stepType === "completion") return "收尾";
  if (stepType === "analysis") return "分析";
  if (stepType === "review") return "审校";
  if (stepType === "repair") return "修复";
  if (stepType === "writing") return "写作";
  if (stepType === "context") return "上下文";
  return stepType;
}

function toAgentNameLabel(name: string): string {
  const normalized = name.toLowerCase();
  if (normalized === "planner") return "规划器";
  if (normalized === "writer") return "写作器";
  if (normalized === "reviewer") return "审校器";
  if (normalized === "continuity") return "连续性检查";
  if (normalized === "repair") return "修复器";
  return name;
}

function formatEvent(event: RuntimeEvent): string {
  if (event.type === "tool_call") {
    return `调用工具 ${event.toolName}: ${event.inputSummary}`;
  }
  if (event.type === "tool_result") {
    return `${event.toolName} ${event.success ? "成功" : "失败"}: ${event.outputSummary}`;
  }
  if (event.type === "approval_required") {
    return `等待审批: ${event.summary}`;
  }
  return `审批结果: ${toApprovalActionLabel(event.action)}${event.note ? ` (${event.note})` : ""}`;
}

function safePreview(json: string | null | undefined): string {
  if (!json?.trim()) {
    return "无";
  }
  try {
    const parsed = JSON.parse(json) as unknown;
    return JSON.stringify(parsed, null, 2).slice(0, 400);
  } catch {
    return json.slice(0, 400);
  }
}

function stepTitle(step: AgentStep): string {
  return `${toAgentNameLabel(step.agentName)} · ${toStepTypeLabel(step.stepType)} · ${toRunStatusLabel(step.status)}`;
}

export default function ChatPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const runIdFromUrl = searchParams.get("runId")?.trim() ?? "";
  const novelIdFromUrl = searchParams.get("novelId")?.trim() ?? "";
  const llm = useLLMStore();
  const chatStore = useChatStore();
  const [chatMode, setChatMode] = useState<ChatMode>("standard");
  const [contextMode, setContextMode] = useState<ContextMode>("global");
  const [enableRag, setEnableRag] = useState(true);
  const [systemPrompt, setSystemPrompt] = useState("");
  const [knowledgeDocumentIds, setKnowledgeDocumentIds] = useState<string[] | null>(null);
  const [novelId, setNovelId] = useState(novelIdFromUrl);
  const [approvalNote, setApprovalNote] = useState("");
  const [localError, setLocalError] = useState("");
  const [replayStepId, setReplayStepId] = useState("");
  const [runtimeEvents, setRuntimeEvents] = useState<RuntimeEvent[]>([]);
  const [runtimePendingApprovals, setRuntimePendingApprovals] = useState<ApprovalRequiredEvent[]>([]);
  const [runtimeLatestRun, setRuntimeLatestRun] = useState<RunStatusEvent | null>(null);
  const [runtimeIsStreaming, setRuntimeIsStreaming] = useState(false);
  const [runtimeError, setRuntimeError] = useState<string | null>(null);
  const [runtimeResetToken, setRuntimeResetToken] = useState(0);

  useEffect(() => {
    if (!chatStore.hydrated) {
      void chatStore.hydrate();
    }
  }, [chatStore]);

  useEffect(() => {
    if (!chatStore.hydrated || chatStore.currentSessionId || chatStore.sessions.length > 0) {
      return;
    }
    void chatStore.createSession("新对话");
  }, [chatStore, chatStore.currentSessionId, chatStore.hydrated, chatStore.sessions.length]);

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
  const replayableSteps = useMemo(() => (
    replaySteps.filter((step) => replaySteps.some((candidate) => (
      candidate.seq > step.seq && candidate.stepType === "tool_call"
    )))
  ), [replaySteps]);
  const effectiveReplayStepId = useMemo(() => {
    if (replayStepId && replayableSteps.some((step) => step.id === replayStepId)) {
      return replayStepId;
    }
    return replayableSteps[replayableSteps.length - 1]?.id ?? "";
  }, [replayStepId, replayableSteps]);

  const approvalSse = useSSE({
    onDone: async (fullContent) => {
      if (!chatStore.currentSessionId || !fullContent.trim()) {
        await runDetailQuery.refetch();
        return;
      }
      await chatStore.appendMessage(chatStore.currentSessionId, {
        id: `msg_${Date.now()}`,
        role: "assistant",
        content: fullContent,
        createdAt: new Date().toISOString(),
      });
      await runDetailQuery.refetch();
      setRuntimeResetToken((prev) => prev + 1);
    },
  });

  useEffect(() => {
    setRuntimeEvents([]);
    setRuntimePendingApprovals([]);
    setRuntimeLatestRun(null);
    setRuntimeError(null);
  }, [chatStore.currentSessionId, currentRunId]);

  const persistedRunState = persistedRun
    ? {
      runId: persistedRun.run.id,
      status: persistedRun.run.status,
      message: persistedRun.run.error ?? undefined,
    }
    : null;
  const latestRun = approvalSse.latestRun ?? runtimeLatestRun;
  const scopedLatestRun = latestRun && latestRun.runId === currentRunId
    ? latestRun
    : null;
  const isStreaming = runtimeIsStreaming || approvalSse.isStreaming;
  const displayError = localError || runtimeError || approvalSse.error || "";

  useEffect(() => {
    if (!chatStore.currentSessionId || !latestRun?.runId) {
      return;
    }
    if (currentSession?.latestRunId !== latestRun.runId) {
      void chatStore.setSessionRunId(chatStore.currentSessionId, latestRun.runId);
    }
    const needRunParamUpdate = runIdFromUrl !== latestRun.runId;
    const needNovelParamUpdate = contextMode === "novel"
      ? novelIdFromUrl !== (novelId || "")
      : Boolean(novelIdFromUrl);
    if (!needRunParamUpdate && !needNovelParamUpdate) {
      return;
    }
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("runId", latestRun.runId);
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
    latestRun?.runId,
    novelId,
    novelIdFromUrl,
    runIdFromUrl,
    setSearchParams,
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

  const ensureSession = useCallback(async () => {
    if (chatStore.currentSessionId) {
      return chatStore.currentSessionId;
    }
    return chatStore.createSession("新对话");
  }, [chatStore]);

  const buildPayloadMessages = (
    sessionMessages: Array<{ role: "user" | "assistant" | "system"; content: string }>,
  ) => {
    if (sessionMessages.length > 0) {
      return sessionMessages;
    }
    return [{ role: "user" as const, content: "继续当前任务。" }];
  };

  const onRuntimeEvent = useCallback((event: RuntimeEvent) => {
    setRuntimeEvents((prev) => [...prev, event]);
    if (event.type === "approval_required") {
      setRuntimePendingApprovals((prev) => {
        if (prev.some((item) => item.approvalId === event.approvalId)) {
          return prev;
        }
        return [...prev, event];
      });
      return;
    }
    if (event.type === "approval_resolved") {
      setRuntimePendingApprovals((prev) => prev.filter((item) => item.approvalId !== event.approvalId));
    }
  }, []);

  const onPersistConversation = useCallback(async (payload: {
    sessionId: string;
    messages: ChatMessage[];
    runId?: string;
  }) => {
    await chatStore.setSessionMessages(payload.sessionId, payload.messages);
    if (payload.runId) {
      await chatStore.setSessionRunId(payload.sessionId, payload.runId);
    }
  }, [chatStore]);

  const submitApproval = async (action: "approve" | "reject") => {
    const sessionId = await ensureSession();
    const runId = currentRunId;
    const persistedPendingApproval = persistedRun?.approvals.find((item) => item.status === "pending");
    const livePending = runtimePendingApprovals[0] ?? approvalSse.pendingApprovals[0];
    const pending = livePending
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
    setRuntimePendingApprovals((prev) => prev.filter((item) => item.approvalId !== pending.approvalId));
    setRuntimeLatestRun({
      type: "run_status",
      runId,
      status: "running",
      message: action === "approve" ? "审批已提交，继续执行中" : "审批已提交，处理中",
    });
    const sessionMessages = buildPayloadMessages(
      (currentSession?.messages ?? [])
        .slice(-20)
        .map((item) => ({
          role: item.role as "user" | "assistant" | "system",
          content: item.content,
        })),
    );
    await approvalSse.start("/chat", {
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
      setLocalError("当前运行没有可重放的步骤。");
      return;
    }
    setLocalError("");
    try {
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
    } catch (error) {
      const message = error instanceof Error
        ? error.message
        : "重放失败。";
      setLocalError(
        message === "No replayable tool steps after source step."
          ? "所选步骤之后没有可重放的工具步骤，请选择更早的步骤。"
          : message,
      );
      return;
    }
  };

  const resolvedApprovalIds = useMemo(() => {
    const ids = new Set<string>();
    for (const event of runtimeEvents) {
      if (event.type === "approval_resolved") {
        ids.add(event.approvalId);
      }
    }
    for (const event of approvalSse.events) {
      if (event.type === "approval_resolved") {
        ids.add(event.approvalId);
      }
    }
    return ids;
  }, [approvalSse.events, runtimeEvents]);

  const livePendingApprovals = useMemo(() => {
    const byId = new Map<string, ApprovalRequiredEvent>();
    for (const item of runtimePendingApprovals) {
      if (!resolvedApprovalIds.has(item.approvalId)) {
        byId.set(item.approvalId, item);
      }
    }
    for (const item of approvalSse.pendingApprovals) {
      if (!resolvedApprovalIds.has(item.approvalId)) {
        byId.set(item.approvalId, item);
      }
    }
    return [...byId.values()];
  }, [approvalSse.pendingApprovals, resolvedApprovalIds, runtimePendingApprovals]);

  const approvalCards = livePendingApprovals.length > 0
    ? livePendingApprovals.map((item) => ({
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

  const headerRunState = isStreaming
    ? (scopedLatestRun ?? persistedRunState)
    : (persistedRunState ?? scopedLatestRun);
  const headerRunLabel = headerRunState ? toRunStatusLabel(headerRunState.status) : "";
  const headerRunMessage = headerRunState?.status === "waiting_approval"
    ? "当前运行等待审批"
    : headerRunState?.status === "running"
      ? (headerRunState.message?.trim() || "当前运行中")
      : headerRunState?.status === "succeeded"
        ? "当前运行已完成"
        : headerRunState?.status === "failed"
          ? (headerRunState.message?.trim() || "当前运行失败")
          : headerRunState?.status === "cancelled"
            ? "当前运行已取消"
            : "";

  const liveEvents = [...runtimeEvents, ...approvalSse.events];
  const traceItems = liveEvents.length > 0
    ? liveEvents.map((event, index) => ({
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
    <div className="grid min-h-[70vh] gap-4 lg:grid-cols-[240px_minmax(0,1fr)_360px]">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">会话列表</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Button className="w-full" onClick={() => void chatStore.createSession("新对话")}>
            新建对话
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
                    运行: {session.latestRunId.slice(0, 8)} · {session.runIds?.length ?? 1}条
                  </div>
                ) : null}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
          <div className="space-y-1">
            <CardTitle className="text-base">对话消息</CardTitle>
            {headerRunMessage ? (
              <div className="text-xs text-slate-500">{headerRunMessage}</div>
            ) : null}
          </div>
          {headerRunState ? (
            <div className="shrink-0 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700">
              {headerRunLabel}
            </div>
          ) : null}
        </CardHeader>
        <CardContent className="space-y-3">
          <AssistantChatPanel
            key={`${chatStore.currentSessionId || "empty"}:${runtimeResetToken}`}
            initialMessages={currentSession?.messages ?? []}
            ensureSession={ensureSession}
            chatMode={chatMode}
            contextMode={contextMode}
            novelId={novelId}
            runId={currentRunId}
            enableRag={enableRag}
            knowledgeDocumentIds={knowledgeDocumentIds}
            systemPrompt={systemPrompt}
            provider={llm.provider}
            model={llm.model}
            temperature={llm.temperature}
            maxTokens={llm.maxTokens}
            onRunStart={() => {
              setLocalError("");
              setRuntimeError(null);
              setRuntimeEvents([]);
              setRuntimePendingApprovals([]);
            }}
            onRuntimeEvent={onRuntimeEvent}
            onRunStatus={setRuntimeLatestRun}
            onStreamStateChange={({ isStreaming: nextStreaming, error }) => {
              setRuntimeIsStreaming(nextStreaming);
              setRuntimeError(error);
            }}
            onValidationError={setLocalError}
            onPersistConversation={onPersistConversation}
          />
          {displayError ? (
            <div className="rounded-md border border-red-300 bg-red-50 px-2 py-1 text-xs text-red-700">
              {displayError}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <RuntimeSidebar
        chatMode={chatMode}
        onChatModeChange={setChatMode}
        contextMode={contextMode}
        onContextModeChange={setContextMode}
        runHistoryIds={runHistoryIds}
        currentRunId={currentRunId}
        onSelectRun={(nextRunId) => {
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
        novelId={novelId}
        novels={novels}
        onNovelChange={setNovelId}
        provider={llm.provider}
        model={llm.model}
        temperature={llm.temperature}
        onTemperatureChange={llm.setTemperature}
        maxTokens={llm.maxTokens}
        onMaxTokensChange={llm.setMaxTokens}
        enableRag={enableRag}
        onEnableRagChange={setEnableRag}
        systemPrompt={systemPrompt}
        onSystemPromptChange={setSystemPrompt}
        knowledgeDocumentIds={knowledgeDocumentIds}
        onKnowledgeDocumentIdsChange={setKnowledgeDocumentIds}
        approvalCards={approvalCards}
        approvalHistory={approvalHistory}
        approvalNote={approvalNote}
        onApprovalNoteChange={setApprovalNote}
        onSubmitApproval={(action) => void submitApproval(action)}
        isStreaming={isStreaming}
        persistedSteps={persistedRun?.steps ?? []}
        replayableSteps={replayableSteps}
        effectiveReplayStepId={effectiveReplayStepId}
        onReplayStepChange={setReplayStepId}
        onReplay={(mode) => void triggerReplay(mode)}
        traceItems={traceItems}
        hasLiveEvents={liveEvents.length > 0}
        safePreview={safePreview}
        stepTitle={stepTitle}
      />
    </div>
  );
}
