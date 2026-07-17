import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { ChevronDown, ChevronRight, Eraser, GripHorizontal, Radio, X } from "lucide-react";
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

export default function LiveExecutionDialog(props: { compact?: boolean; className?: string }) {
  const [open, setOpen] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [followingLatest, setFollowingLatest] = useState(true);
  const [collapsedSessionIds, setCollapsedSessionIds] = useState<Set<string>>(() => new Set());
  const logRef = useRef<HTMLDivElement | null>(null);
  const latestSessionRef = useRef<HTMLDivElement | null>(null);
  const dragStartRef = useRef<{ pointerX: number; pointerY: number; offsetX: number; offsetY: number } | null>(null);
  const followLatestRef = useRef(true);
  const latestSessionIdRef = useRef<string | null>(null);
  const { clearSessions, connected, sessions } = useLlmLiveFeed({ enabled: true });
  const orderedSessions = useMemo(
    () => [...sessions],
    [sessions],
  );
  const latestSession = orderedSessions[orderedSessions.length - 1] ?? null;
  const latestSessionId = latestSession ? sessionId(latestSession) : null;
  const activeCount = sessions.filter((session) => isActive(session.phase)).length;

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
            className="fixed right-4 top-20 z-[70] flex max-h-[min(42rem,calc(100dvh-6rem))] w-[min(42rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-xl border border-emerald-400/45 bg-[#080d0c] text-emerald-50 shadow-2xl shadow-emerald-950/40 outline-none"
            style={{ transform: `translate(${dragOffset.x}px, ${dragOffset.y}px)` }}
            aria-describedby="live-execution-description"
          >
            <header
              className="flex shrink-0 touch-none items-start gap-3 border-b border-emerald-400/25 bg-[#0d1714] px-3 py-3 select-none"
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
                <DialogPrimitive.Description id="live-execution-description" className="mt-1 text-xs leading-5 text-emerald-100/65">
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
                onClick={clearFrontendLog}
                onPointerDown={(event) => event.stopPropagation()}
                onPointerMove={(event) => event.stopPropagation()}
                onPointerUp={(event) => event.stopPropagation()}
              >
                <Eraser className="h-3.5 w-3.5" />
                清空前台
              </Button>
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
              className="min-h-0 flex-1 overflow-y-auto bg-[radial-gradient(circle_at_top_right,rgba(16,185,129,0.09),transparent_42%),linear-gradient(to_bottom,#080d0c,#050807)] px-4 py-3 font-mono text-xs leading-6 text-emerald-100"
              onScroll={(event) => {
                const element = event.currentTarget;
                const shouldFollow = element.scrollHeight - element.scrollTop - element.clientHeight < 32;
                followLatestRef.current = shouldFollow;
                setFollowingLatest(shouldFollow);
              }}
            >
              {orderedSessions.length > 0 ? (
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
                          <span className="shrink-0 text-[11px] text-emerald-100/55">{session.totalChars.toLocaleString()} 字符</span>
                          <span className={cn("shrink-0 rounded border px-1.5 py-0.5 text-[10px]", active ? "border-emerald-400/45 text-emerald-200" : "border-emerald-400/20 text-emerald-100/65")}>
                            {phaseLabel(session.phase)}
                          </span>
                        </button>
                        {!collapsed ? (
                          <div className="border-t border-emerald-400/15 px-3 py-2">
                            <div className="mb-2 text-[11px] text-emerald-100/60">{session.phaseMessage}</div>
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

            <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-emerald-400/25 bg-[#0d1714] px-3 py-2 text-xs text-emerald-100/65">
              <span>{followingLatest ? "正在跟随最新输出" : "已停留在当前阅读位置"}</span>
              <Button type="button" size="sm" variant="ghost" className="h-7 px-2 font-mono text-xs text-emerald-200 hover:bg-emerald-400/10 hover:text-emerald-50" onClick={scrollToLatest}>
                回到最新输出
              </Button>
            </footer>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </>
  );
}
