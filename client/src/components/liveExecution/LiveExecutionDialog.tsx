import { useMemo, useState } from "react";
import { Activity, Radio } from "lucide-react";
import { useLlmLiveFeed } from "@/hooks/useLlmLiveFeed";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AppDialogContent, Dialog } from "@/components/ui/dialog";
import { WorkspaceStateNotice } from "@/components/workspace";
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

export default function LiveExecutionDialog(props: { compact?: boolean; className?: string }) {
  const [open, setOpen] = useState(false);
  const { connected, sessions } = useLlmLiveFeed({ enabled: true });
  const orderedSessions = useMemo(
    () => [...sessions].sort((left, right) => Number(isActive(right.phase)) - Number(isActive(left.phase))),
    [sessions],
  );
  const activeCount = sessions.filter((session) => isActive(session.phase)).length;

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className={cn("relative", props.className)}
        onClick={() => setOpen(true)}
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

      <Dialog open={open} onOpenChange={setOpen}>
        <AppDialogContent
          title="AI 创作实况"
          description="这里显示正在生成、检查或修复的内容。预览仅帮助你了解进度，正式内容会在检查完成后再保存。"
          className="max-w-4xl"
          bodyClassName="space-y-3"
        >
          {orderedSessions.length === 0 ? (
            <WorkspaceStateNotice
              icon={Activity}
              title="暂时没有正在展示的 AI 生成"
              description={connected ? "发起规划、写作或修复后，返回内容会自动出现在这里。" : "正在连接 AI 实况服务，稍后会自动显示新的生成过程。"}
            />
          ) : (
            orderedSessions.map((session) => (
              <section key={session.context.interactionId} className="rounded-lg border border-border/70 bg-muted/20 p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium">{session.context.label}</div>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      {session.phaseMessage} · 已返回 {session.totalChars.toLocaleString()} 个字符
                    </p>
                  </div>
                  <Badge variant={isActive(session.phase) ? "default" : "outline"}>{phaseLabel(session.phase)}</Badge>
                </div>
                {session.preview ? (
                  <div className="mt-3 max-h-64 overflow-y-auto rounded-md border border-border/60 bg-background/80 p-3 text-xs leading-6 whitespace-pre-wrap">
                    {session.preview}
                  </div>
                ) : null}
              </section>
            ))
          )}
        </AppDialogContent>
      </Dialog>
    </>
  );
}
