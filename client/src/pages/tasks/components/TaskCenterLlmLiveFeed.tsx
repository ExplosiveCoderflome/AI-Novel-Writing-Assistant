import type { UnifiedTaskDetail } from "@ai-novel/shared/types/task";
import { Activity } from "lucide-react";
import { useLlmLiveFeed } from "@/hooks/useLlmLiveFeed";
import { Badge } from "@/components/ui/badge";
import { WorkspaceStateNotice } from "@/components/workspace";

function formatPhase(phase: string): string {
  const labels: Record<string, string> = {
    requesting: "正在连接",
    streaming: "模型返回中",
    assembling: "正在整理",
    validating: "正在检查",
    repairing: "正在修复",
    applying: "正在应用",
    persisting: "正在保存",
    completed: "已完成",
    failed: "未完成",
    cancelled: "已取消",
  };
  return labels[phase] ?? "正在处理";
}

export default function TaskCenterLlmLiveFeed(props: {
  task: UnifiedTaskDetail;
}) {
  const active = props.task.status === "queued" || props.task.status === "running" || props.task.status === "waiting_approval";
  const { connected, latestSession } = useLlmLiveFeed({
    taskId: props.task.id,
    enabled: active,
  });

  if (!active && !latestSession) {
    return null;
  }

  if (!latestSession) {
    return (
      <WorkspaceStateNotice
        compact
        icon={Activity}
        title="AI 生成实况"
        description="任务正在推进，等待模型开始返回内容。"
      />
    );
  }

  return (
    <div className="rounded-lg border border-border/70 bg-muted/20 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="font-medium">AI 生成实况</div>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {latestSession.context.label} · {latestSession.phaseMessage}
          </p>
        </div>
        <Badge variant="outline">{formatPhase(latestSession.phase)}</Badge>
      </div>
      <div className="mt-2 text-xs text-muted-foreground">
        已返回 {latestSession.totalChars.toLocaleString()} 个字符{connected ? "" : " · 正在重新连接实况"}
      </div>
      {latestSession.preview ? (
        <div className="mt-3 max-h-56 overflow-y-auto rounded-md border border-border/60 bg-background/80 p-3 text-xs leading-6 whitespace-pre-wrap">
          {latestSession.preview}
        </div>
      ) : (
        <p className="mt-3 text-xs leading-5 text-muted-foreground">模型返回的草稿会显示在这里；正式内容将在检查并保存后进入项目。</p>
      )}
    </div>
  );
}
