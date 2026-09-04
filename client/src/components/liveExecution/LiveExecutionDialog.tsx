import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { ChevronDown, ChevronRight, Clipboard, Eraser, Expand, GripHorizontal, Maximize2, Minimize2, Radio, Shrink, X } from "lucide-react";
import type { LlmLiveSessionSnapshot } from "@ai-novel/shared/types/llmLive";
import { useLlmLiveFeed } from "@/hooks/useLlmLiveFeed";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function phaseLabel(phase: string): string {
  const labels: Record<string, string> = {
    requesting: "正在连接",
    streaming: "正在生成",
    assembling: "正在整理",
    validating: "正在检查",
    repairing: "正在修复",
    applying: "正在应用",
    persisting: "正在保存",
    completed: "已完成",
    failed: "生成失败",
    cancelled: "已取消",
  };
  return labels[phase] ?? "正在处理";
}

function isActive(phase: string): boolean {
  return !["completed", "failed", "cancelled"].includes(phase);
}

function sessionId(session: LlmLiveSessionSnapshot): string {
  return session.context.interactionId;
}

function durationLabel(durationMs: number): string {
  if (!Number.isFinite(durationMs)) {
    return "未知";
  }
  const seconds = Math.max(0, durationMs) / 1_000;
  if (seconds < 60) {
    return `${seconds.toFixed(1)} 秒`;
  }
  return `${Math.floor(seconds / 60)} 分 ${Math.floor(seconds % 60).toString().padStart(2, "0")} 秒`;
}

function sessionDurationMs(session: LlmLiveSessionSnapshot, nowMs: number): number {
  const startedAt = Date.parse(session.startedAt);
  const endedAt = session.completedAt ? Date.parse(session.completedAt) : nowMs;
  return Number.isFinite(startedAt) && Number.isFinite(endedAt) ? endedAt - startedAt : 0;
}

function SessionMetrics({ session, nowMs }: { session: LlmLiveSessionSnapshot; nowMs: number }) {
  const firstResponseMs = session.firstResponseAt
    ? Date.parse(session.firstResponseAt) - Date.parse(session.startedAt)
    : null;
  const usage = session.tokenUsage;
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-emerald-100/55">
      <span>总耗时 {durationLabel(sessionDurationMs(session, nowMs))}</span>
      <span>首返 {firstResponseMs === null ? (isActive(session.phase) ? "等待中" : "未返回") : durationLabel(firstResponseMs)}</span>
      {usage ? (
        <span title="思考 Token 通常包含在输出 Token 中">
          Token 输入 {usage.promptTokens.toLocaleString()} / 输出 {usage.completionTokens.toLocaleString()} / 思考 {usage.reasoningTokens?.toLocaleString() ?? "未提供"} / 合计 {usage.totalTokens.toLocaleString()}
        </span>
      ) : (
        <span>Token {isActive(session.phase) ? "统计中" : "未返回"}</span>
      )}
    </div>
  );
}

interface LiveExecutionDialogProps {
  compact?: boolean;
  className?: string;
  taskId?: string | null;
  autoOpenOnActivity?: boolean;
}

export default function LiveExecutionDialog(props: LiveExecutionDialogProps) {
  const [open, setOpen] = useState(false);
  const [briefMode, setBriefMode] = useState(false);
  const [fullScreen, setFullScreen] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [followingLatest, setFollowingLatest] = useState(true);
  const [collapsedSessionIds, setCollapsedSessionIds] = useState<Set<string>>(() => new Set());
  const [promptSessionIds, setPromptSessionIds] = useState<Set<string>>(() => new Set());
  const [nowMs, setNowMs] = useState(Date.now());
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
    () => [...sessions],
    [sessions],
  );
  const latestSession = orderedSessions[orderedSessions.length - 1] ?? null;
  const latestSessionId = latestSession ? sessionId(latestSession) : null;
  const latestPreview = latestSession?.preview
    ? latestSession.preview.slice(-1200)
    : "等待模型开始返回内容…";
  const activeCount = sessions.filter((session) => isActive(session.phase)).length;

  useEffect(() => {
    if (!open || activeCount === 0) {
      return;
    }
    setNowMs(Date.now());
    const timer = window.setInterval(() => setNowMs(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [activeCount, open]);

  useEffect(() => {
    if (!props.autoOpenOnActivity) {
      return;
    }
    const unseenActiveSession = orderedSessions.find((session) => (
      isActive(session.phase)
      && !autoOpenedSessionIdsRef.current.has(sessionId(session))
    ));
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
        latestSessionRef.current.scrollIntoView({ block: "end" });
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
      latestSessionRef.current?.scrollIntoView({ block: "end" });
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

  const togglePrompt = (interactionId: string) => {
    setPromptSessionIds((previous) => {
      const next = new Set(previous);
      if (next.has(interactionId)) next.delete(interactionId);
      else next.add(interactionId);
      return next;
    });
  };

  const clearFrontendLog = () => {
    clearSessions();
    latestSessionIdRef.current = null;
    setCollapsedSessionIds(new Set());
    setPromptSessionIds(new Set());
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

  const toggleDisplayMode = () => {
    setBriefMode((current) => !current);
    followLatestRef.current = true;
    setFollowingLatest(true);
  };

  const toggleFullScreen = () => {
    setFullScreen((current) => !current);
    setDragOffset({ x: 0, y: 0 });
    followLatestRef.current = true;
    setFollowingLatest(true);
  };

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className={cn(
          "relative transition-[border-color,background-color,box-shadow] duration-300",
          activeCount > 0 && "border-primary/60 bg-primary/[0.06] shadow-[0_0_0_3px_hsl(var(--primary)/0.12)] animate-[pulse_2s_ease-in-out_infinite]",
          props.className,
        )}
        onClick={() => handleOpenChange(true)}
        title="查看 AI 创作实况"
      >
        <Radio className={activeCount > 0 ? "mr-1.5 h-3.5 w-3.5 animate-pulse text-primary" : "mr-1.5 h-3.5 w-3.5"} aria-hidden="true" />
        {!props.compact ? <span className="hidden sm:inline">AI 实况</span> : null}
        {activeCount > 0 ? (
          <Badge className="ml-1.5 h-5 min-w-5 px-1.5 text-[10px]" aria-label={`${activeCount} 项 AI 生成正在进行`}>
            {activeCount}
          </Badge>
        ) : null}
      </Button>

      <DialogPrimitive.Root modal={false} open={open} onOpenChange={handleOpenChange}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Content
            className={cn(
              "fixed z-[70] flex flex-col overflow-hidden border border-emerald-400/45 bg-[#080d0c] text-emerald-50 shadow-2xl shadow-emerald-950/40 outline-none transition-[height,width,top,right,border-radius] duration-200 ease-out",
              fullScreen
                ? "inset-0 h-[100dvh] w-full rounded-none"
                : "right-4 top-20 w-[min(42rem,calc(100vw-1.5rem))] rounded-xl",
              !fullScreen && briefMode
                ? "h-[13rem] max-h-[calc(100dvh-6rem)]"
                : !fullScreen ? "h-[min(42rem,calc(100dvh-6rem))]" : "",
            )}
            style={{ transform: `translate(${dragOffset.x}px, ${dragOffset.y}px)` }}
            aria-describedby="live-execution-description"
          >
            <header
              className={cn(
                "flex shrink-0 touch-none items-start gap-3 border-b border-emerald-400/25 bg-[#0d1714] px-3 select-none",
                briefMode ? "py-2.5" : "py-3",
              )}
              onPointerDown={(event) => {
                if (event.button !== 0) return;
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
                if (!start) return;
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
              <GripHorizontal className="mt-1 h-4 w-4 shrink-0 text-emerald-400/80" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <DialogPrimitive.Title className="font-mono text-sm font-semibold tracking-wide text-emerald-100">AI 创作实况 / LIVE LOG</DialogPrimitive.Title>
                <DialogPrimitive.Description
                  id="live-execution-description"
                  className={cn("mt-1 text-xs leading-5 text-emerald-100/65", briefMode && "sr-only")}
                >
                  每次调用独立显示。新调用会自动聚焦，已完成调用会收起；清空只影响当前窗口。
                </DialogPrimitive.Description>
              </div>
              <Badge variant="outline" className="shrink-0 border-emerald-400/50 bg-emerald-400/10 font-mono text-emerald-200">
                {activeCount > 0 ? `${activeCount} 项进行中` : connected ? "等待生成" : "正在连接"}
              </Badge>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 shrink-0 gap-1.5 px-2 font-mono text-xs text-emerald-200 hover:bg-emerald-400/10 hover:text-emerald-50"
                onClick={toggleDisplayMode}
                onPointerDown={(event) => event.stopPropagation()}
                onPointerMove={(event) => event.stopPropagation()}
                onPointerUp={(event) => event.stopPropagation()}
                aria-label={briefMode ? "切换到详细模式" : "切换到简略模式"}
                title={briefMode ? "查看全部调用" : "只看最新输出"}
              >
                {briefMode ? <Maximize2 className="h-3.5 w-3.5" /> : <Minimize2 className="h-3.5 w-3.5" />}
                {briefMode ? "详细" : "简略"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0 text-emerald-100 hover:bg-emerald-400/10 hover:text-emerald-50"
                onClick={toggleFullScreen}
                onPointerDown={(event) => event.stopPropagation()}
                onPointerMove={(event) => event.stopPropagation()}
                onPointerUp={(event) => event.stopPropagation()}
                aria-label={fullScreen ? "退出全屏" : "全屏显示"}
                title={fullScreen ? "退出全屏" : "全屏显示"}
              >
                {fullScreen ? <Shrink className="h-4 w-4" /> : <Expand className="h-4 w-4" />}
              </Button>
              {!briefMode ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 shrink-0 gap-1.5 px-2 font-mono text-xs text-emerald-200 hover:bg-emerald-400/10 hover:text-emerald-50"
                onClick={clearFrontendLog}
                onPointerDown={(event) => event.stopPropagation()}
                onPointerMove={(event) => event.stopPropagation()}
                onPointerUp={(event) => event.stopPropagation()}
              >
                <Eraser className="h-3.5 w-3.5" />
                清空前台
              </Button>
              ) : null}
              <DialogPrimitive.Close asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="-mr-1 -mt-1 h-8 w-8 shrink-0 text-emerald-100 hover:bg-emerald-400/10 hover:text-emerald-50"
                  aria-label="关闭 AI 创作实况"
                  onPointerDown={(event) => event.stopPropagation()}
                  onPointerMove={(event) => event.stopPropagation()}
                  onPointerUp={(event) => event.stopPropagation()}
                >
                  <X className="h-4 w-4" />
                </Button>
              </DialogPrimitive.Close>
            </header>

            <div
              ref={logRef}
              className={cn(
                "live-execution-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain bg-[radial-gradient(circle_at_top_right,rgba(16,185,129,0.09),transparent_42%),linear-gradient(to_bottom,#080d0c,#050807)] font-mono text-xs leading-6 text-emerald-100",
                briefMode ? "px-3 py-2.5" : "px-4 py-3",
              )}
              onScroll={(event) => {
                const element = event.currentTarget;
                const shouldFollow = element.scrollHeight - element.scrollTop - element.clientHeight < 32;
                followLatestRef.current = shouldFollow;
                setFollowingLatest(shouldFollow);
              }}
            >
              {briefMode && latestSession ? (
                <section ref={latestSessionRef} className="min-h-full">
                  <div className="mb-1.5 flex items-center gap-2 text-[11px]">
                    <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", isActive(latestSession.phase) ? "animate-pulse bg-emerald-300" : "bg-emerald-500/60")} />
                    <span className="min-w-0 flex-1 truncate font-semibold text-emerald-50">{latestSession.context.label}</span>
                    <span className="shrink-0 text-emerald-100/55">{phaseLabel(latestSession.phase)}</span>
                  </div>
                  <div className="mb-1 truncate text-[11px] text-emerald-100/45">{latestSession.phaseMessage}</div>
                  <SessionMetrics session={latestSession} nowMs={nowMs} />
                  {latestSession.reasoning ? (
                    <>
                      <div className="mt-2 text-[11px] font-semibold text-amber-200/80">思考过程</div>
                      <pre className="m-0 whitespace-pre-wrap break-words text-amber-100/80">{latestSession.reasoning}</pre>
                      <div className="mt-2 text-[11px] font-semibold text-emerald-200/80">生成内容</div>
                    </>
                  ) : null}
                  <pre className="m-0 whitespace-pre-wrap break-words text-emerald-100/90">{latestPreview}</pre>
                </section>
              ) : orderedSessions.length > 0 ? (
                <div className="space-y-2">
                  {orderedSessions.map((session) => {
                    const interactionId = sessionId(session);
                    const collapsed = collapsedSessionIds.has(interactionId);
                    const active = isActive(session.phase);
                    return (
                      <section
                        key={interactionId}
                        ref={interactionId === latestSessionId ? latestSessionRef : undefined}
                        className={cn(
                          "overflow-hidden rounded-lg border bg-[#07100d]/80",
                          active ? "border-emerald-400/50 shadow-[0_0_0_1px_rgba(52,211,153,0.08)]" : "border-emerald-400/20",
                        )}
                      >
                        <button
                          type="button"
                          className="flex w-full items-center gap-2 bg-emerald-400/[0.04] px-3 py-2 text-left transition-colors hover:bg-emerald-400/[0.09]"
                          onClick={() => toggleSession(interactionId)}
                          aria-expanded={!collapsed}
                        >
                          {collapsed ? <ChevronRight className="h-4 w-4 shrink-0 text-emerald-300" /> : <ChevronDown className="h-4 w-4 shrink-0 text-emerald-300" />}
                          <span className="min-w-0 flex-1 truncate font-semibold text-emerald-50">{session.context.label}</span>
                          <span className="shrink-0 text-[11px] text-emerald-100/55">
                            {durationLabel(sessionDurationMs(session, nowMs))}
                            {session.tokenUsage ? ` · ${session.tokenUsage.totalTokens.toLocaleString()} Tokens` : ""}
                          </span>
                          <span className={cn("shrink-0 rounded border px-1.5 py-0.5 text-[10px]", active ? "border-emerald-400/45 text-emerald-200" : "border-emerald-400/20 text-emerald-100/65")}>
                            {phaseLabel(session.phase)}
                          </span>
                        </button>
                        {!collapsed ? (
                          <div className="border-t border-emerald-400/15 px-3 py-2">
                            <div className="mb-2 text-[11px] text-emerald-100/60">{session.phaseMessage}</div>
                            <div className="mb-2"><SessionMetrics session={session} nowMs={nowMs} /></div>
                            {session.context.promptText ? (
                              <div className="mb-2">
                                <button type="button" className="inline-flex items-center gap-1.5 text-[11px] text-emerald-200/80 hover:text-emerald-50" onClick={() => togglePrompt(interactionId)}>
                                  <Clipboard className="h-3 w-3" />
                                  {promptSessionIds.has(interactionId) ? "收起发送 Prompt" : "查看发送 Prompt"}
                                </button>
                                {promptSessionIds.has(interactionId) ? (
                                  <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-words rounded border border-emerald-400/20 bg-black/20 p-2 text-[11px] leading-5 text-emerald-100/85">{session.context.promptText}</pre>
                                ) : null}
                              </div>
                            ) : null}
                            {session.reasoning ? (
                              <div className="mb-3 border-l-2 border-amber-300/35 pl-3">
                                <div className="mb-1 text-[11px] font-semibold text-amber-200/80">
                                  思考过程 · {session.totalReasoningChars.toLocaleString()} 字符
                                </div>
                                <pre className="m-0 whitespace-pre-wrap break-words text-amber-100/80">{session.reasoning}</pre>
                              </div>
                            ) : null}
                            {session.reasoning ? <div className="mb-1 text-[11px] font-semibold text-emerald-200/80">生成内容</div> : null}
                            <pre className="m-0 whitespace-pre-wrap break-words text-emerald-100">{session.preview || "等待模型开始返回内容…"}</pre>
                          </div>
                        ) : null}
                      </section>
                    );
                  })}
                </div>
              ) : (
                <div className="text-emerald-200/65">
                  {connected ? "前台日志已清空，等待新的 AI 生成开始…" : "正在连接 AI 实况服务…"}
                </div>
              )}
            </div>

            <footer className={cn(
              "flex shrink-0 items-center justify-between gap-3 border-t border-emerald-400/25 bg-[#0d1714] px-3 text-xs text-emerald-100/65",
              briefMode ? "py-1.5" : "py-2",
            )}>
              <span>{followingLatest ? "正在跟随最新输出" : "已停留在当前阅读位置"}</span>
              {!briefMode ? (
                <Button type="button" size="sm" variant="ghost" className="h-7 px-2 font-mono text-xs text-emerald-200 hover:bg-emerald-400/10 hover:text-emerald-50" onClick={scrollToLatest}>
                  回到最新输出
                </Button>
              ) : (
                <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-emerald-300/60">Live</span>
              )}
            </footer>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </>
  );
}
