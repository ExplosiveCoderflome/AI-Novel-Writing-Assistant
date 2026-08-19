import i18next from "i18next";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  Code,
  Copy,
  Cpu,
  Eraser,
  GripHorizontal,
  Maximize2,
  Minimize2,
  Radio,
  Search,
  Sparkles,
  X,
  Zap,
} from "lucide-react";
import type { LlmLiveSessionSnapshot } from "@ai-novel/shared/types/llmLive";
import { useLlmLiveFeed } from "@/hooks/useLlmLiveFeed";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function phaseLabel(phase: string): string {
  const labels: Record<string, string> = {
    requesting: i18next.t("liveExecution.liveExecutionDialog.dx29nw"),
    streaming: i18next.t("liveExecution.liveExecutionDialog.dwxpkm"),
    assembling: i18next.t("liveExecution.liveExecutionDialog.dwv56f"),
    validating: i18next.t("layout.desktopUpdaterPresentation.dwvmyy"),
    repairing: i18next.t("liveExecution.liveExecutionDialog.dwrc1w"),
    applying: i18next.t("liveExecution.liveExecutionDialog.dwtzax"),
    persisting: i18next.t("liveExecution.liveExecutionDialog.dwrc3k"),
    completed: i18next.t("tasks.filterStatusSucceeded"),
    failed: i18next.t("dict.gen_7f7de8a2"),
    cancelled: i18next.t("tasks.filterStatusCancelled"),
  };
  return labels[phase] ?? "正在处理";
}

function isActive(phase: string): boolean {
  return !["completed", "failed", "cancelled"].includes(phase);
}

function sessionId(session: LlmLiveSessionSnapshot): string {
  return session.context.interactionId;
}

function formatDuration(startedAt?: string, completedAt?: string | null, updatedAt?: string): string {
  if (!startedAt) return "0s";
  const startMs = new Date(startedAt).getTime();
  const endMs = completedAt
    ? new Date(completedAt).getTime()
    : updatedAt
    ? new Date(updatedAt).getTime()
    : Date.now();
  const diffSec = Math.max(0, Math.floor((endMs - startMs) / 1000));
  if (diffSec < 60) return `${diffSec}s`;
  const mins = Math.floor(diffSec / 60);
  const secs = diffSec % 60;
  return `${mins}m ${secs}s`;
}

function calcSpeed(totalChars: number, startedAt?: string, completedAt?: string | null, updatedAt?: string): string {
  if (!startedAt || totalChars <= 0) return "0";
  const startMs = new Date(startedAt).getTime();
  const endMs = completedAt
    ? new Date(completedAt).getTime()
    : updatedAt
    ? new Date(updatedAt).getTime()
    : Date.now();
  const diffSec = Math.max(0.2, (endMs - startMs) / 1000);
  const speed = Math.round(totalChars / diffSec);
  return `${speed}`;
}

function tryPrettyJson(text: string): { isJson: boolean; content: string } {
  const trimmed = text.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) {
    return { isJson: false, content: text };
  }
  try {
    const parsed = JSON.parse(trimmed);
    return { isJson: true, content: JSON.stringify(parsed, null, 2) };
  } catch {
    return { isJson: false, content: text };
  }
}

interface LiveExecutionDialogProps {
  compact?: boolean;
  className?: string;
  taskId?: string | null;
  autoOpenOnActivity?: boolean;
}

export default function LiveExecutionDialog(props: LiveExecutionDialogProps) {
  const [open, setOpen] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [isMaximized, setIsMaximized] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [followingLatest, setFollowingLatest] = useState(true);
  const [collapsedSessionIds, setCollapsedSessionIds] = useState<Set<string>>(() => new Set());
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [prettyJsonIds, setPrettyJsonIds] = useState<Set<string>>(() => new Set());

  const logRef = useRef<HTMLDivElement | null>(null);
  const latestSessionRef = useRef<HTMLDivElement | null>(null);
  const dragStartRef = useRef<{ pointerX: number; pointerY: number; offsetX: number; offsetY: number } | null>(null);
  const followLatestRef = useRef(true);
  const latestSessionIdRef = useRef<string | null>(null);
  const autoOpenedSessionIdsRef = useRef(new Set<string>());

  const { clearSessions, connected, sessions } = useLlmLiveFeed({
    enabled: true,
    taskId: props.taskId,
  });

  const orderedSessions = useMemo(
    () =>
      [...sessions].sort(
        (a, b) =>
          new Date(b.startedAt || b.updatedAt).getTime() -
          new Date(a.startedAt || a.updatedAt).getTime()
      ),
    [sessions],
  );

  const filteredSessions = useMemo(() => {
    if (!searchQuery.trim()) return orderedSessions;
    const query = searchQuery.toLowerCase().trim();
    return orderedSessions.filter((s) => {
      const label = (s.context.label || "").toLowerCase();
      const prompt = (s.promptPreview || s.context.promptPreview || "").toLowerCase();
      const preview = (s.preview || "").toLowerCase();
      const phaseStr = (phaseLabel(s.phase) || "").toLowerCase();
      const provider = (s.context.provider || "").toLowerCase();
      const model = (s.context.model || "").toLowerCase();
      return (
        label.includes(query) ||
        prompt.includes(query) ||
        preview.includes(query) ||
        phaseStr.includes(query) ||
        provider.includes(query) ||
        model.includes(query)
      );
    });
  }, [orderedSessions, searchQuery]);

  const latestSession = orderedSessions[0] ?? null;
  const latestSessionId = latestSession ? sessionId(latestSession) : null;
  const activeCount = sessions.filter((session) => isActive(session.phase)).length;

  useEffect(() => {
    if (!props.autoOpenOnActivity) {
      return;
    }
    const unseenActiveSession = orderedSessions.find(
      (session) => isActive(session.phase) && !autoOpenedSessionIdsRef.current.has(sessionId(session))
    );
    if (!unseenActiveSession) {
      return;
    }
    for (const session of orderedSessions) {
      if (isActive(session.phase)) {
        autoOpenedSessionIdsRef.current.add(sessionId(session));
      }
    }
    setOpen(true);
    followLatestRef.current = true;
    setFollowingLatest(true);
  }, [orderedSessions, props.autoOpenOnActivity]);

  useLayoutEffect(() => {
    if (!open || !followLatestRef.current || !latestSessionRef.current) {
      return;
    }
    const frame = window.requestAnimationFrame(() => {
      if (latestSessionRef.current && followLatestRef.current) {
        latestSessionRef.current.scrollIntoView({ block: "start" });
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [latestSession?.preview, latestSession?.phase, latestSession?.phaseMessage, latestSessionId, open]);

  useEffect(() => {
    if (!latestSessionId || latestSessionIdRef.current === latestSessionId) {
      return;
    }
    latestSessionIdRef.current = latestSessionId;
    followLatestRef.current = true;
    setFollowingLatest(true);
    setCollapsedSessionIds((previous) => {
      const next = new Set(previous);
      for (const session of orderedSessions) {
        const interactionId = sessionId(session);
        if (interactionId !== latestSessionId && !isActive(session.phase)) {
          next.add(interactionId);
        }
      }
      next.delete(latestSessionId);
      return next;
    });
  }, [latestSessionId, orderedSessions]);

  const scrollToLatest = () => {
    followLatestRef.current = true;
    setFollowingLatest(true);
    if (logRef.current) {
      latestSessionRef.current?.scrollIntoView({ block: "start" });
    }
  };

  const toggleSession = (interactionId: string) => {
    setCollapsedSessionIds((previous) => {
      const next = new Set(previous);
      if (next.has(interactionId)) {
        next.delete(interactionId);
      } else {
        next.add(interactionId);
      }
      return next;
    });
  };

  const togglePrettyJson = (interactionId: string) => {
    setPrettyJsonIds((prev) => {
      const next = new Set(prev);
      if (next.has(interactionId)) {
        next.delete(interactionId);
      } else {
        next.add(interactionId);
      }
      return next;
    });
  };

  const copyToClipboard = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    } catch {
      // Fallback
    }
  };

  const clearFrontendLog = () => {
    clearSessions();
    latestSessionIdRef.current = null;
    setCollapsedSessionIds(new Set());
    followLatestRef.current = true;
    setFollowingLatest(true);
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      followLatestRef.current = true;
      setFollowingLatest(true);
    }
    setOpen(nextOpen);
  };

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className={cn("relative", props.className)}
        onClick={() => handleOpenChange(true)}
        title={i18next.t("liveExecution.liveExecutionDialog.m9968m")}
      >
        <Radio
          className={activeCount > 0 ? "mr-1.5 h-3.5 w-3.5 animate-pulse text-emerald-400" : "mr-1.5 h-3.5 w-3.5"}
          aria-hidden="true"
        />
        {!props.compact ? <span className="hidden sm:inline">AI 实况</span> : null}
        {activeCount > 0 ? (
          <Badge className="ml-1.5 h-5 min-w-5 px-1.5 text-[10px] bg-emerald-500 text-slate-950 font-bold" aria-label={i18next.t("liveExecution.liveExecutionDialog.r6ht0o", { val1: activeCount })}>
            {activeCount}
          </Badge>
        ) : null}
      </Button>

      <DialogPrimitive.Root modal={false} open={open} onOpenChange={handleOpenChange}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Content
            className={cn(
              "fixed z-[70] flex flex-col overflow-hidden border border-emerald-500/40 bg-[#060b09] text-emerald-50 shadow-2xl shadow-emerald-950/60 outline-none transition-all duration-150",
              isMaximized
                ? "inset-3 h-[calc(100vh-1.5rem)] w-[calc(100vw-1.5rem)] rounded-xl"
                : "right-4 top-16 max-h-[min(46rem,calc(100dvh-5rem))] w-[min(44rem,calc(100vw-1.5rem))] rounded-xl"
            )}
            style={isMaximized ? undefined : { transform: `translate(${dragOffset.x}px, ${dragOffset.y}px)` }}
            aria-describedby="live-execution-description"
          >
            {/* Header / Toolbar */}
            <header
              className="flex shrink-0 touch-none items-center gap-2 border-b border-emerald-500/25 bg-[#0a1310] px-3 py-2.5 select-none"
              onPointerDown={(event) => {
                if (isMaximized || event.button !== 0) return;
                dragStartRef.current = {
                  pointerX: event.clientX,
                  pointerY: event.clientY,
                  offsetX: dragOffset.x,
                  offsetY: dragOffset.y,
                };
                event.currentTarget.setPointerCapture(event.pointerId);
              }}
              onPointerMove={(event) => {
                const start = dragStartRef.current;
                if (!start || isMaximized) return;
                setDragOffset({
                  x: start.offsetX + event.clientX - start.pointerX,
                  y: start.offsetY + event.clientY - start.pointerY,
                });
              }}
              onPointerUp={() => {
                dragStartRef.current = null;
              }}
              onPointerCancel={() => {
                dragStartRef.current = null;
              }}
            >
              <GripHorizontal className="h-4 w-4 shrink-0 text-emerald-400/80 cursor-grab" aria-hidden="true" />
              <div className="min-w-0 flex-1 flex items-center gap-2">
                <DialogPrimitive.Title className="font-mono text-sm font-semibold tracking-wide text-emerald-100 flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-emerald-400" />
                  AI 创作实况 / LIVE LOG
                </DialogPrimitive.Title>
              </div>

              {/* Real-time Status Badge */}
              <Badge variant="outline" className="shrink-0 border-emerald-400/50 bg-emerald-400/10 font-mono text-emerald-200 text-[11px] px-2 py-0.5">
                {activeCount > 0 ? i18next.t("liveExecution.liveExecutionDialog.9aqf1p", { val1: activeCount }) : connected ? "等待生成" : "正在连接"}
              </Badge>

              {/* Maximize Toggle */}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-emerald-200 hover:bg-emerald-400/15 hover:text-emerald-50"
                onClick={() => setIsMaximized((prev) => !prev)}
                onPointerDown={(e) => e.stopPropagation()}
                title={isMaximized ? i18next.t("liveExecution.liveExecutionDialog.restore", "还原窗口") : i18next.t("liveExecution.liveExecutionDialog.maximize", "最大化窗口")}
              >
                {isMaximized ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
              </Button>

              {/* Clear Log */}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 gap-1 px-2 font-mono text-xs text-emerald-200 hover:bg-emerald-400/15 hover:text-emerald-50"
                onClick={clearFrontendLog}
                onPointerDown={(event) => event.stopPropagation()}
              >
                <Eraser className="h-3.5 w-3.5" />
                <span>{i18next.t("liveExecution.liveExecutionDialog.edwbh4", "清空")}</span>
              </Button>

              {/* Close */}
              <DialogPrimitive.Close asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-emerald-100 hover:bg-emerald-400/15 hover:text-emerald-50"
                  aria-label={i18next.t("liveExecution.liveExecutionDialog.97qyga", "关闭")}
                  onPointerDown={(event) => event.stopPropagation()}
                >
                  <X className="h-4 w-4" />
                </Button>
              </DialogPrimitive.Close>
            </header>

            {/* Sub-header Filter Bar */}
            <div className="flex items-center gap-2 border-b border-emerald-500/15 bg-[#070e0b] px-3 py-1.5">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1.5 h-3.5 w-3.5 text-emerald-400/60" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={i18next.t("liveExecution.liveExecutionDialog.searchPlaceholder", "搜索提示词、AI返回内容或算法阶段…")}
                  className="w-full rounded border border-emerald-500/20 bg-[#040806] py-1 pl-8 pr-2 text-xs font-mono text-emerald-100 placeholder:text-emerald-500/50 focus:border-emerald-400 focus:outline-none"
                />
              </div>
              <span className="text-[11px] font-mono text-emerald-400/60 shrink-0">
                {filteredSessions.length} / {orderedSessions.length} 会话
              </span>
            </div>

            {/* Log Output Body */}
            <div
              ref={logRef}
              className="min-h-0 flex-1 overflow-y-auto bg-[radial-gradient(circle_at_top_right,rgba(16,185,129,0.08),transparent_40%),linear-gradient(to_bottom,#060b09,#030605)] px-3 py-3 font-mono text-xs leading-6 text-emerald-100"
              onScroll={(event) => {
                const element = event.currentTarget;
                const shouldFollow = element.scrollHeight - element.scrollTop - element.clientHeight < 32;
                followLatestRef.current = shouldFollow;
                setFollowingLatest(shouldFollow);
              }}
            >
              {filteredSessions.length > 0 ? (
                <div className="space-y-2.5">
                  {filteredSessions.map((session) => {
                    const interactionId = sessionId(session);
                    const collapsed = collapsedSessionIds.has(interactionId);
                    const active = isActive(session.phase);
                    const isPretty = prettyJsonIds.has(interactionId);
                    const durationStr = formatDuration(session.startedAt, session.completedAt, session.updatedAt);
                    const speedStr = calcSpeed(session.totalChars, session.startedAt, session.completedAt, session.updatedAt);
                    const promptText = session.promptPreview || session.context.promptPreview || "";
                    const outputText = session.preview || "";
                    const prettyRes = tryPrettyJson(outputText);

                    return (
                      <section
                        key={interactionId}
                        ref={interactionId === latestSessionId ? latestSessionRef : undefined}
                        className={cn(
                          "overflow-hidden rounded-lg border bg-[#06120e]/90 transition-colors",
                          active
                            ? "border-emerald-400/60 shadow-[0_0_12px_rgba(16,185,129,0.12)]"
                            : session.phase === "failed"
                            ? "border-red-500/40 bg-red-950/10"
                            : "border-emerald-500/20"
                        )}
                      >
                        {/* Session Card Header */}
                        <button
                          type="button"
                          className="flex w-full items-center gap-2 bg-emerald-400/[0.04] px-3 py-2 text-left transition-colors hover:bg-emerald-400/[0.09]"
                          onClick={() => toggleSession(interactionId)}
                          aria-expanded={!collapsed}
                        >
                          {collapsed ? (
                            <ChevronRight className="h-4 w-4 shrink-0 text-emerald-300" />
                          ) : (
                            <ChevronDown className="h-4 w-4 shrink-0 text-emerald-300" />
                          )}
                          <span className="min-w-0 flex-1 truncate font-semibold text-emerald-50">
                            {session.context.label}
                          </span>

                          {/* Provider & Model Transparency Tag */}
                          {(session.context.provider || session.context.model) && (
                            <span className="hidden sm:inline-flex items-center gap-1 rounded bg-emerald-950/80 border border-emerald-500/30 px-1.5 py-0.5 text-[10px] text-emerald-300">
                              <Cpu className="h-3 w-3 text-emerald-400" />
                              {session.context.provider ? `${session.context.provider}/` : ""}
                              {session.context.model || "default"}
                            </span>
                          )}

                          {/* Metrics Badges */}
                          <span className="shrink-0 text-[10px] text-emerald-400/70 flex items-center gap-1 bg-emerald-900/30 px-1.5 py-0.5 rounded border border-emerald-500/15">
                            <Clock className="h-2.5 w-2.5" />
                            {durationStr}
                          </span>
                          <span className="shrink-0 text-[10px] text-emerald-300/80 flex items-center gap-1 bg-emerald-900/30 px-1.5 py-0.5 rounded border border-emerald-500/15">
                            <Zap className="h-2.5 w-2.5 text-amber-400" />
                            {speedStr} {i18next.t("liveExecution.liveExecutionDialog.charsPerSec", "字/秒")}
                          </span>

                          {/* Phase Label */}
                          <span
                            className={cn(
                              "shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-semibold",
                              active
                                ? "border-emerald-400/60 bg-emerald-500/15 text-emerald-200 animate-pulse"
                                : session.phase === "failed"
                                ? "border-red-500/50 bg-red-500/20 text-red-300"
                                : "border-emerald-500/25 text-emerald-100/70"
                            )}
                          >
                            {phaseLabel(session.phase)}
                          </span>
                        </button>

                        {/* Collapsible Session Content */}
                        {!collapsed ? (
                          <div className="border-t border-emerald-500/15 px-3 py-2.5 space-y-2.5">
                            <div className="text-[11px] text-emerald-100/70 font-semibold flex items-center justify-between">
                              <span className="flex items-center gap-1.5">
                                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping" />
                                {session.phaseMessage}
                              </span>
                              <span className="text-[10px] text-emerald-400/50 font-mono">
                                {session.startedAt ? new Date(session.startedAt).toLocaleTimeString() : ""}
                              </span>
                            </div>

                            {/* Error Details Alert */}
                            {(session.phase === "failed" || session.errorMessage) && (
                              <div className="rounded border border-red-500/40 bg-red-950/30 p-2.5 space-y-1">
                                <div className="text-[11px] font-bold text-red-300 flex items-center gap-1.5">
                                  <AlertTriangle className="h-3.5 w-3.5 text-red-400" />
                                  <span>{i18next.t("liveExecution.liveExecutionDialog.errorDetails", "错误明细")}</span>
                                </div>
                                <pre className="m-0 whitespace-pre-wrap break-words text-[11px] text-red-200 font-mono leading-relaxed">
                                  {session.errorMessage || session.phaseMessage || "模型调用失败，请检查模型配置与网络"}
                                </pre>
                              </div>
                            )}

                            {/* Input Prompt Context */}
                            {promptText && (
                              <div className="rounded border border-emerald-900/60 bg-[#030705] p-2 space-y-1">
                                <div className="text-[10px] text-emerald-400/80 font-bold uppercase tracking-wider flex justify-between items-center">
                                  <span>📥 上下文窗口 Input Prompt</span>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="h-5 px-1.5 text-[10px] text-emerald-400/70 hover:text-emerald-200 hover:bg-emerald-400/10"
                                    onClick={() => copyToClipboard(promptText, `in-${interactionId}`)}
                                  >
                                    {copiedKey === `in-${interactionId}` ? (
                                      <Check className="h-3 w-3 text-emerald-300" />
                                    ) : (
                                      <Copy className="h-3 w-3" />
                                    )}
                                    <span className="ml-1">
                                      {copiedKey === `in-${interactionId}`
                                        ? i18next.t("liveExecution.liveExecutionDialog.copied", "已复制")
                                        : i18next.t("liveExecution.liveExecutionDialog.copyInput", "复制 Prompt")}
                                    </span>
                                  </Button>
                                </div>
                                <pre className="m-0 whitespace-pre-wrap break-words text-[11px] text-slate-300 font-mono leading-relaxed max-h-48 overflow-y-auto">
                                  {promptText}
                                </pre>
                              </div>
                            )}

                            {/* Output Stream Content */}
                            <div className="rounded border border-emerald-800/40 bg-[#040907] p-2 space-y-1">
                              <div className="text-[10px] text-emerald-400/80 font-bold uppercase tracking-wider flex justify-between items-center">
                                <span className="flex items-center gap-1.5">
                                  <span>📤 LLM 实时返回 Output</span>
                                  <span className="text-[9px] text-emerald-500/50">
                                    {session.totalChars.toLocaleString()} 字符
                                  </span>
                                </span>

                                <div className="flex items-center gap-1">
                                  {/* Pretty JSON Toggle */}
                                  {prettyRes.isJson && (
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      className={cn(
                                        "h-5 px-1.5 text-[10px] transition-colors",
                                        isPretty
                                          ? "bg-emerald-400/20 text-emerald-200 font-bold"
                                          : "text-emerald-400/70 hover:text-emerald-200 hover:bg-emerald-400/10"
                                      )}
                                      onClick={() => togglePrettyJson(interactionId)}
                                    >
                                      <Code className="h-3 w-3 mr-1" />
                                      {isPretty
                                        ? i18next.t("liveExecution.liveExecutionDialog.rawText", "原始文本")
                                        : i18next.t("liveExecution.liveExecutionDialog.prettyJson", "Pretty JSON")}
                                    </Button>
                                  )}

                                  {/* Copy Output Button */}
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="h-5 px-1.5 text-[10px] text-emerald-400/70 hover:text-emerald-200 hover:bg-emerald-400/10"
                                    onClick={() => copyToClipboard(outputText, `out-${interactionId}`)}
                                  >
                                    {copiedKey === `out-${interactionId}` ? (
                                      <Check className="h-3 w-3 text-emerald-300" />
                                    ) : (
                                      <Copy className="h-3 w-3" />
                                    )}
                                    <span className="ml-1">
                                      {copiedKey === `out-${interactionId}`
                                        ? i18next.t("liveExecution.liveExecutionDialog.copied", "已复制")
                                        : i18next.t("liveExecution.liveExecutionDialog.copyOutput", "复制 Output")}
                                    </span>
                                  </Button>
                                </div>
                              </div>

                              {(() => {
                                const imgMatch = outputText.match(/(https?:\/\/[^\s]+|\/api\/[^\s]+|data:image\/[^\s]+)/);
                                const imgUrl = imgMatch ? imgMatch[0] : null;
                                return (
                                  <>
                                    {imgUrl && (
                                      <div className="mb-2 rounded border border-emerald-500/30 bg-[#020604] p-2">
                                        <p className="mb-1 text-[10px] font-bold text-emerald-300">🖼️ 渲染生成结果图像 (Image Output Preview)</p>
                                        <img
                                          src={imgUrl}
                                          alt={i18next.t("liveExecution.liveExecutionDialog.enarf3")}
                                          className="max-h-64 rounded border border-emerald-500/20 object-contain bg-black/50"
                                        />
                                      </div>
                                    )}
                                    <pre className="m-0 whitespace-pre-wrap break-words text-xs text-emerald-100 font-mono leading-relaxed max-h-72 overflow-y-auto">
                                      {outputText
                                        ? isPretty && prettyRes.isJson
                                          ? prettyRes.content
                                          : outputText
                                        : "等待模型开始返回内容…"}
                                    </pre>
                                  </>
                                );
                              })()}
                            </div>
                          </div>
                        ) : null}
                      </section>
                    );
                  })}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-emerald-400/60 space-y-2">
                  <Radio className="h-8 w-8 text-emerald-500/40 animate-pulse" />
                  <p className="text-xs">
                    {searchQuery
                      ? "没有匹配搜索条件的 AI 实况记录"
                      : connected
                      ? "前台日志已清空，等待新的 AI 生成开始…"
                      : "正在连接 AI 实况服务…"}
                  </p>
                </div>
              )}
            </div>

            {/* Footer Navigation */}
            <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-emerald-500/25 bg-[#0a1310] px-3 py-2 text-xs text-emerald-100/65">
              <span>{followingLatest ? "🟢 正在自动跟随最新输出" : "⏸️ 已停留在当前阅读位置"}</span>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 px-2 font-mono text-xs text-emerald-200 hover:bg-emerald-400/10 hover:text-emerald-50"
                onClick={scrollToLatest}
              >
                {i18next.t("liveExecution.liveExecutionDialog.3uc12v", "回到最新输出")}
              </Button>
            </footer>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </>
  );
}
