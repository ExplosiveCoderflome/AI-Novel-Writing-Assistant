import { useId, useState } from "react";
import type { ToolCallMessagePartProps } from "@assistant-ui/react";
import CreativeHubToolResultCard from "./CreativeHubToolResultCard";
import CreativeHubDebugTraceCard, { type CreativeHubDebugTraceEntry } from "./CreativeHubDebugTraceCard";
import CreativeHubTurnSummaryCard from "./CreativeHubTurnSummaryCard";
import { useCreativeHubInlineControls } from "./CreativeHubInlineControlsContext";
import type { CreativeHubTurnSummary } from "@ai-novel/shared/types/creativeHub";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

function formatArgs(argsText: string | undefined): string | null {
  const text = argsText?.trim();
  if (!text) {
    return null;
  }
  return text.length > 280 ? `${text.slice(0, 280)}...` : text;
}

function formatSummary(text: string | undefined): string | null {
  const value = text?.replace(/\s+/g, " ").trim();
  if (!value) {
    return null;
  }
  return value.length > 120 ? `${value.slice(0, 120)}...` : value;
}

function formatToolLabel(toolName: string): string {
  switch (toolName) {
    case "list_novels":
    case "list_worlds":
    case "list_tasks":
    case "list_knowledge_documents":
    case "list_book_analyses":
    case "list_writing_formulas":
    case "list_base_characters":
      return "读取创作资料";
    case "create_novel":
    case "select_novel_workspace":
    case "bind_world_to_novel":
      return "更新小说工作区";
    case "generate_world_for_novel":
    case "generate_novel_characters":
    case "generate_story_bible":
    case "generate_novel_outline":
    case "generate_structured_outline":
    case "sync_chapters_from_structured_outline":
      return "生成小说资产";
    case "start_full_novel_pipeline":
    case "get_novel_production_status":
    case "preview_pipeline_run":
    case "queue_pipeline_run":
      return "推进整本写作";
    case "get_task_failure_reason":
    case "get_run_failure_reason":
    case "get_index_failure_reason":
    case "get_book_analysis_failure_reason":
    case "explain_generation_blocker":
    case "explain_world_conflict":
    case "failure_diagnostic":
      return "诊断创作问题";
    case "get_chapter_content":
    case "get_chapter_content_by_order":
    case "summarize_chapter_range":
      return "读取章节内容";
    default:
      return "执行创作辅助操作";
  }
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
  const [showArgs, setShowArgs] = useState(false);
  const argsPanelId = useId();
  const approvalNoteId = useId();
  const inlineControls = useCreativeHubInlineControls();
  const argsText = formatArgs("argsText" in props && typeof props.argsText === "string" ? props.argsText : undefined);
  const resultText = "result" in props && typeof props.result === "string" ? props.result : undefined;
  const artifact = readArtifact("artifact" in props ? props.artifact : undefined);
  const summaryText = formatSummary(artifact.summary ?? resultText ?? undefined);
  const success = artifact.success ?? !("isError" in props && props.isError === true);
  const args = "args" in props && props.args && typeof props.args === "object" && !Array.isArray(props.args)
    ? props.args as Record<string, unknown>
    : {};

  if (props.toolName === "approval_gate") {
    const approvalDisabled = inlineControls.approvalPending || inlineControls.actionDisabled;
    const title = typeof args.title === "string" ? args.title : "等待审批";
    const summary = typeof args.summary === "string" ? args.summary : "当前高影响操作等待确认。";
    const targetType = typeof args.targetType === "string" ? args.targetType : inlineControls.interrupt?.targetType ?? "未知目标";
    const targetId = typeof args.targetId === "string" ? args.targetId : inlineControls.interrupt?.targetId ?? "-";
    return (
      <div
        className="mt-3 rounded-md border border-warning/30 bg-warning/5 p-4"
        aria-busy={inlineControls.approvalPending}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="text-sm font-medium text-foreground">{title}</div>
          <Badge variant="secondary">等待确认</Badge>
        </div>
        <div className="mt-3 text-sm leading-6 text-foreground">{summary}</div>
        <details className="mt-3 rounded-md border border-border/70 bg-background/70 px-3 py-2 text-xs text-muted-foreground">
          <summary className="cursor-pointer">审批目标信息</summary>
          <div className="mt-2 break-all">类型：{targetType}</div>
          <div className="mt-1 break-all">资源 ID：{targetId}</div>
        </details>
        <label htmlFor={approvalNoteId} className="mt-3 block text-xs font-medium text-muted-foreground">
          审批备注（可选）
        </label>
        <textarea
          id={approvalNoteId}
          className="mt-2 min-h-[88px] w-full rounded-md border border-input bg-background p-3 text-base text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60 md:text-sm"
          value={inlineControls.approvalNote}
          disabled={approvalDisabled}
          onChange={(event) => inlineControls.onApprovalNoteChange?.(event.target.value)}
          placeholder="审批备注（可选）"
        />
        <div className="mt-3 flex gap-2">
          <Button
            type="button"
            size="sm"
            disabled={approvalDisabled}
            onClick={() => inlineControls.onResolveInterrupt?.("approve")}
          >
            {inlineControls.approvalPending ? "正在处理..." : "同意并继续"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="destructive"
            disabled={approvalDisabled}
            onClick={() => inlineControls.onResolveInterrupt?.("reject")}
          >
            拒绝
          </Button>
        </div>
      </div>
    );
  }

  if (props.toolName === "creative_hub_turn_summary") {
    return (
      <CreativeHubTurnSummaryCard
        summary={args as unknown as CreativeHubTurnSummary}
        onQuickAction={inlineControls.onQuickAction}
      />
    );
  }

  if (props.toolName === "creative_hub_debug_trace") {
    const entries = Array.isArray(args.entries)
      ? args.entries.filter((item): item is CreativeHubDebugTraceEntry => !!item && typeof item === "object")
      : [];
    return (
      <CreativeHubDebugTraceCard
        runId={typeof args.runId === "string" ? args.runId : null}
        entries={entries}
        defaultCollapsed={args.defaultCollapsed !== false}
      />
    );
  }

  return (
    <div className="mt-3 rounded-md border border-border bg-muted/20 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="space-y-1">
          <div className="text-sm font-medium text-foreground">{formatToolLabel(props.toolName)}</div>
          {summaryText ? <div className="text-xs text-muted-foreground">{summaryText}</div> : null}
        </div>
        <div className="flex items-center gap-2">
          {argsText ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setShowArgs((value) => !value)}
              aria-expanded={showArgs}
              aria-controls={argsPanelId}
            >
              {showArgs ? "收起参数" : "查看参数"}
            </Button>
          ) : null}
          <Badge variant="outline">工具执行</Badge>
        </div>
      </div>
      {argsText && showArgs ? (
        <pre id={argsPanelId} className="mt-2 overflow-x-auto whitespace-pre-wrap rounded-md bg-background p-3 text-[11px] leading-5 text-muted-foreground">
          {argsText}
        </pre>
      ) : argsText ? (
        <div className="mt-2 text-xs text-muted-foreground">请求参数默认收起，可按需查看。</div>
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
