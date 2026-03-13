import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface CreativeHubToolResultCardProps {
  toolName: string;
  summary: string;
  success: boolean;
  output?: Record<string, unknown>;
  errorCode?: string;
  onQuickAction?: (prompt: string) => void;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asRecordArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.map((item) => asRecord(item)).filter((item) => Object.keys(item).length > 0)
    : [];
}

function itemLabel(item: Record<string, unknown>): string {
  const candidates = ["title", "name", "label", "summary", "content"];
  for (const key of candidates) {
    const value = item[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  if (typeof item.id === "string" && item.id.trim()) {
    return item.id.trim();
  }
  return "未命名条目";
}

function formatNovelProjectStatus(value: unknown): string | null {
  switch (value) {
    case "in_progress":
      return "在写中";
    case "not_started":
      return "未开始";
    case "completed":
      return "已完成";
    case "rework":
      return "返工中";
    case "blocked":
      return "已阻塞";
    default:
      return null;
  }
}

function renderActionButtons(actions: Array<{ label: string; prompt: string }>, onQuickAction?: (prompt: string) => void) {
  if (!onQuickAction || actions.length === 0) {
    return null;
  }
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {actions.map((action) => (
        <Button
          key={`${action.label}-${action.prompt}`}
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onQuickAction(action.prompt)}
        >
          {action.label}
        </Button>
      ))}
    </div>
  );
}

function renderNovelList(output: Record<string, unknown>, onQuickAction?: (prompt: string) => void) {
  const total = typeof output.total === "number" ? output.total : null;
  const items = asRecordArray(output.items).slice(0, 8);
  return (
    <div className="space-y-2">
      <div className="text-xs text-slate-600">
        已发现 {total ?? items.length} 本小说
        {total != null && total > items.length ? `，当前展示前 ${items.length} 本` : ""}
      </div>
      <div className="space-y-2">
        {items.map((item) => {
          const title = itemLabel(item);
          const chapterCount = typeof item.chapterCount === "number" ? item.chapterCount : null;
          const projectStatus = formatNovelProjectStatus(item.projectStatus);
          return (
            <div key={`${item.id ?? title}`} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
              <div className="text-sm font-medium text-slate-900">《{title}》</div>
              <div className="mt-1 text-xs text-slate-500">
                {chapterCount != null ? `${chapterCount} 章` : "章节未知"}
                {projectStatus ? ` · ${projectStatus}` : ""}
              </div>
              {onQuickAction ? (
                <div className="mt-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => onQuickAction(`把《${title}》设为当前工作区`)}
                  >
                    设为当前工作区
                  </Button>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function renderWorkspaceCard(
  output: Record<string, unknown>,
  variant: "created" | "selected",
  onQuickAction?: (prompt: string) => void,
) {
  const title = typeof output.title === "string" && output.title.trim() ? output.title.trim() : "未命名小说";
  const chapterCount = typeof output.chapterCount === "number" ? output.chapterCount : 0;
  const actions = variant === "created"
    ? [
      { label: "查看当前进度", prompt: "这本书当前写到哪一章" },
      { label: "开始设计第一章", prompt: "为这本书规划第一章" },
    ]
    : [
      { label: "查看当前进度", prompt: "这本书当前写到哪一章" },
      { label: "查看前两章", prompt: "前两章都写了什么" },
    ];
  return (
    <div className="space-y-2">
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-3">
        <div className="text-sm font-medium text-slate-900">《{title}》</div>
        <div className="mt-1 text-xs text-slate-600">
          {variant === "created" ? "新小说已创建并绑定到当前线程。" : "当前线程已切换到该小说工作区。"}
        </div>
        <div className="mt-2 text-xs text-slate-500">当前章节数：{chapterCount}</div>
      </div>
      {renderActionButtons(actions, onQuickAction)}
    </div>
  );
}

function renderWorldBindingCard(output: Record<string, unknown>, onQuickAction?: (prompt: string) => void) {
  const novelTitle = typeof output.novelTitle === "string" && output.novelTitle.trim()
    ? output.novelTitle.trim()
    : "当前小说";
  const worldName = typeof output.worldName === "string" && output.worldName.trim()
    ? output.worldName.trim()
    : "未命名世界观";
  return (
    <div className="space-y-2">
      <div className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-3">
        <div className="text-sm font-medium text-slate-900">《{novelTitle}》</div>
        <div className="mt-1 text-xs text-slate-600">已绑定世界观《{worldName}》。</div>
      </div>
      {renderActionButtons([
        { label: "查看世界观约束", prompt: "查看当前小说的世界观规则" },
        { label: "检查世界观冲突", prompt: "检查当前小说和世界观是否存在冲突" },
      ], onQuickAction)}
    </div>
  );
}

function renderDiagnosticCard(output: Record<string, unknown>, onQuickAction?: (prompt: string) => void) {
  const failureSummary = typeof output.failureSummary === "string" ? output.failureSummary : "";
  const failureDetails = typeof output.failureDetails === "string" ? output.failureDetails : "";
  const recoveryHint = typeof output.recoveryHint === "string" ? output.recoveryHint : "";
  return (
    <div className="space-y-2">
      {failureSummary ? <div className="text-sm font-medium text-slate-900">{failureSummary}</div> : null}
      {failureDetails ? <div className="text-xs leading-5 text-slate-600">详情：{failureDetails}</div> : null}
      {recoveryHint ? <div className="text-xs leading-5 text-slate-600">建议：{recoveryHint}</div> : null}
      {renderActionButtons([
        { label: "继续诊断", prompt: "继续解释失败原因和恢复建议" },
        { label: "查看任务状态", prompt: "列出当前系统任务状态" },
      ], onQuickAction)}
    </div>
  );
}

function renderListCard(
  output: Record<string, unknown>,
  emptyLabel: string,
  onQuickAction?: (prompt: string) => void,
) {
  const items = asRecordArray(output.items).slice(0, 6);
  if (items.length === 0) {
    return <div className="text-xs text-slate-500">{emptyLabel}</div>;
  }
  return (
    <div className="space-y-2">
      <div className="space-y-2">
        {items.map((item) => (
          <div key={`${item.id ?? itemLabel(item)}`} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
            <div className="text-sm font-medium text-slate-900">{itemLabel(item)}</div>
            {"status" in item && typeof item.status === "string" ? (
              <div className="mt-1 text-xs text-slate-500">状态：{item.status}</div>
            ) : null}
          </div>
        ))}
      </div>
      {renderActionButtons([{ label: "继续筛选", prompt: "继续细化这个列表结果" }], onQuickAction)}
    </div>
  );
}

function renderChapterCard(output: Record<string, unknown>, onQuickAction?: (prompt: string) => void) {
  const title = typeof output.title === "string" && output.title.trim() ? output.title.trim() : "";
  const order = typeof output.order === "number" ? output.order : null;
  const content = typeof output.content === "string"
    ? output.content
    : typeof output.summary === "string"
      ? output.summary
      : "";
  return (
    <div className="space-y-2">
      <div className="text-sm font-medium text-slate-900">
        {order != null ? `第${order}章` : "章节内容"}
        {title ? `《${title}》` : ""}
      </div>
      <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm leading-6 text-slate-700">
        {content || "当前没有可显示的章节内容。"}
      </div>
      {renderActionButtons([
        { label: "继续总结", prompt: "总结这一段内容的关键剧情" },
        { label: "检查冲突", prompt: "检查这一章是否和世界观或前文冲突" },
      ], onQuickAction)}
    </div>
  );
}

export default function CreativeHubToolResultCard({
  toolName,
  summary,
  success,
  output,
  errorCode,
  onQuickAction,
}: CreativeHubToolResultCardProps) {
  const payload = asRecord(output);
  const cardContent = (() => {
    if (toolName === "list_novels") {
      return renderNovelList(payload, onQuickAction);
    }
    if (toolName === "create_novel") {
      return renderWorkspaceCard(payload, "created", onQuickAction);
    }
    if (toolName === "select_novel_workspace") {
      return renderWorkspaceCard(payload, "selected", onQuickAction);
    }
    if (toolName === "bind_world_to_novel") {
      return renderWorldBindingCard(payload, onQuickAction);
    }
    if (
      toolName === "get_task_failure_reason"
      || toolName === "get_run_failure_reason"
      || toolName === "get_index_failure_reason"
      || toolName === "get_book_analysis_failure_reason"
      || toolName === "explain_generation_blocker"
      || toolName === "explain_world_conflict"
      || toolName === "failure_diagnostic"
    ) {
      return renderDiagnosticCard(payload, onQuickAction);
    }
    if (
      toolName === "list_worlds"
      || toolName === "list_tasks"
      || toolName === "list_knowledge_documents"
      || toolName === "list_book_analyses"
      || toolName === "list_writing_formulas"
      || toolName === "list_base_characters"
    ) {
      return renderListCard(payload, "当前没有可展示的结果。", onQuickAction);
    }
    if (
      toolName === "get_chapter_content"
      || toolName === "get_chapter_content_by_order"
      || toolName === "summarize_chapter_range"
    ) {
      return renderChapterCard(payload, onQuickAction);
    }
    return null;
  })();

  if (!cardContent) {
    return null;
  }

  return (
    <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="text-sm font-medium text-slate-900">{summary}</div>
        <Badge variant={success ? "secondary" : "destructive"}>{success ? "已解析结果" : errorCode ?? "失败"}</Badge>
      </div>
      <div className="mt-3">{cardContent}</div>
    </div>
  );
}
