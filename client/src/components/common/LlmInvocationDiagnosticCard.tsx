import type { TaskLlmInvocationDiagnostic } from "@ai-novel/shared/types/task";

interface LlmInvocationDiagnosticCardProps {
  diagnostic?: TaskLlmInvocationDiagnostic | null;
  className?: string;
  compact?: boolean;
}

function formatNumber(value: number | null | undefined, suffix = ""): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "暂无";
  }
  return `${new Intl.NumberFormat("zh-CN").format(Math.max(0, Math.round(value)))}${suffix}`;
}

export function LlmInvocationDiagnosticCard({
  diagnostic,
  className,
  compact = false,
}: LlmInvocationDiagnosticCardProps) {
  if (!diagnostic) {
    return null;
  }

  return (
    <div className={["rounded-xl border bg-muted/20 p-3 text-sm text-muted-foreground", className].filter(Boolean).join(" ")}>
      <div className="font-medium text-foreground">最近 LLM 诊断</div>
      <div className={compact ? "mt-2 space-y-1 text-xs" : "mt-2 grid gap-2 text-xs sm:grid-cols-2"}>
        <div>诊断 ID：{diagnostic.id}</div>
        <div>模型：{diagnostic.provider || "暂无"} / {diagnostic.model || "暂无"}</div>
        <div>协议：{diagnostic.requestProtocol ?? "暂无"}</div>
        <div>策略：{diagnostic.strategy ?? "暂无"}</div>
        <div>输入估算：{formatNumber(diagnostic.estimatedInputTokens, " Tokens")}</div>
        <div>提示词字符：{formatNumber(diagnostic.renderedPromptChars)}</div>
        <div>消息字符：{formatNumber(diagnostic.messageChars)}</div>
        <div>耗时：{formatNumber(diagnostic.latencyMs, " ms")}</div>
        <div>错误分类：{diagnostic.errorCategory ?? "暂无"}</div>
        <div>上游请求 ID：{diagnostic.upstreamRequestId ?? "暂无"}</div>
      </div>
      {diagnostic.warningCode ? (
        <div className="mt-2 text-xs text-amber-700">提示：输入规模较高，可优先检查模型上下文上限。</div>
      ) : null}
      {diagnostic.errorMessage ? (
        <div className="mt-2 break-words text-xs">错误摘要：{diagnostic.errorMessage}</div>
      ) : null}
      <div className="mt-2 text-xs">
        恢复建议：先按诊断 ID 对照服务端日志或上游 request id；若错误为传输类，可直接重试或切换更稳定的同协议模型。
      </div>
    </div>
  );
}
