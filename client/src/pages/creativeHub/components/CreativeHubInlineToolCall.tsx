import type { ToolCallMessagePartProps } from "@assistant-ui/react";
import CreativeHubToolResultCard from "./CreativeHubToolResultCard";
import { useCreativeHubInlineControls } from "./CreativeHubInlineControlsContext";

function formatArgs(argsText: string | undefined): string | null {
  const text = argsText?.trim();
  if (!text) {
    return null;
  }
  return text.length > 280 ? `${text.slice(0, 280)}...` : text;
}

function readArtifact(
  value: unknown,
): {
  summary?: string;
  output?: Record<string, unknown>;
  success?: boolean;
  errorCode?: string;
} {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  const record = value as Record<string, unknown>;
  return {
    summary: typeof record.summary === "string" ? record.summary : undefined,
    output: record.output && typeof record.output === "object" && !Array.isArray(record.output)
      ? record.output as Record<string, unknown>
      : undefined,
    success: typeof record.success === "boolean" ? record.success : undefined,
    errorCode: typeof record.errorCode === "string" ? record.errorCode : undefined,
  };
}

export default function CreativeHubInlineToolCall(props: ToolCallMessagePartProps) {
  const inlineControls = useCreativeHubInlineControls();
  const argsText = formatArgs("argsText" in props && typeof props.argsText === "string" ? props.argsText : undefined);
  const resultText = "result" in props && typeof props.result === "string" ? props.result : undefined;
  const artifact = readArtifact("artifact" in props ? props.artifact : undefined);
  const success = artifact.success ?? !("isError" in props && props.isError === true);
  const args = "args" in props && props.args && typeof props.args === "object" && !Array.isArray(props.args)
    ? props.args as Record<string, unknown>
    : {};

  if (props.toolName === "approval_gate") {
    const title = typeof args.title === "string" ? args.title : "等待审批";
    const summary = typeof args.summary === "string" ? args.summary : "当前高影响操作等待确认。";
    const targetType = typeof args.targetType === "string" ? args.targetType : inlineControls.interrupt?.targetType ?? "未知目标";
    const targetId = typeof args.targetId === "string" ? args.targetId : inlineControls.interrupt?.targetId ?? "-";
    return (
      <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <div className="text-sm font-medium text-slate-900">{title}</div>
          <span className="rounded-full border border-amber-200 bg-white px-2 py-1 text-[11px] text-amber-700">
            interrupt
          </span>
        </div>
        <div className="mt-1 text-xs text-slate-500">
          {targetType}:{targetId}
        </div>
        <div className="mt-3 text-sm leading-6 text-slate-700">{summary}</div>
        <textarea
          className="mt-3 min-h-[88px] w-full rounded-xl border border-amber-200 bg-white p-3 text-sm text-slate-700 outline-none focus:border-amber-400"
          value={inlineControls.approvalNote}
          onChange={(event) => inlineControls.onApprovalNoteChange?.(event.target.value)}
          placeholder="审批备注（可选）"
        />
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-medium text-white transition hover:bg-slate-800"
            onClick={() => inlineControls.onResolveInterrupt?.("approve")}
          >
            同意并继续
          </button>
          <button
            type="button"
            className="rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-medium text-red-600 transition hover:bg-red-50"
            onClick={() => inlineControls.onResolveInterrupt?.("reject")}
          >
            拒绝
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-3 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-medium text-slate-900">工具调用 · {props.toolName}</div>
        <span className="rounded-full border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-500">
          tool-call
        </span>
      </div>
      {argsText ? (
        <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded-xl bg-white p-3 text-[11px] leading-5 text-slate-600">
          {argsText}
        </pre>
      ) : null}
      {(resultText || artifact.summary) ? (
        <div className="mt-3">
          <CreativeHubToolResultCard
            toolName={props.toolName}
            summary={artifact.summary ?? resultText ?? "工具已返回结果。"}
            success={success}
            output={artifact.output}
            errorCode={artifact.errorCode}
            onQuickAction={inlineControls.onQuickAction}
          />
        </div>
      ) : null}
    </div>
  );
}
