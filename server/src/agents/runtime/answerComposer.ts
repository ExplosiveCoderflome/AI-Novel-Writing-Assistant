import { getLLM } from "../../llm/factory";
import { listAgentToolDefinitions } from "../toolRegistry";
import type { StructuredIntent, ToolCall, ToolExecutionContext } from "../types";
import { isRecord, safeJson, type ToolExecutionResult } from "./runtimeHelpers";

function truncateText(value: string, max = 320): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "";
  }
  return normalized.length > max ? `${normalized.slice(0, max)}...` : normalized;
}

function getSuccessfulOutputs(results: ToolExecutionResult[], tool: ToolCall["tool"]): Record<string, unknown>[] {
  return results
    .filter((item) => item.success && item.tool === tool && item.output)
    .map((item) => item.output as Record<string, unknown>);
}

function buildGroundingFacts(results: ToolExecutionResult[]): string {
  return safeJson(results.map((item) => ({
    tool: item.tool,
    success: item.success,
    summary: item.summary,
    output: item.output
      ? Object.fromEntries(
        Object.entries(item.output).map(([key, value]) => {
          if (typeof value === "string") {
            return [key, truncateText(value, 400)];
          }
          if (Array.isArray(value)) {
            return [key, value.slice(0, 6)];
          }
          return [key, value];
        }),
      )
      : undefined,
  })));
}

function composeTitleAnswer(results: ToolExecutionResult[]): string {
  const title = getSuccessfulOutputs(results, "get_novel_context")
    .map((item) => (typeof item.title === "string" ? item.title.trim() : ""))
    .find(Boolean);
  return title ? `《${title}》` : "未获取到标题";
}

function composeProgressAnswer(results: ToolExecutionResult[]): string {
  const context = getSuccessfulOutputs(results, "get_novel_context")[0];
  if (!context) {
    return "当前信息不足，无法继续";
  }
  const completedChapterCount = typeof context.completedChapterCount === "number"
    ? context.completedChapterCount
    : null;
  const chapterCount = typeof context.chapterCount === "number" ? context.chapterCount : null;
  const latestCompletedChapterOrder = typeof context.latestCompletedChapterOrder === "number"
    ? context.latestCompletedChapterOrder
    : null;
  if (completedChapterCount == null) {
    return "当前信息不足，无法继续";
  }
  const parts = [
    chapterCount != null
      ? `当前已完成 ${completedChapterCount} / ${chapterCount} 章。`
      : `当前已完成 ${completedChapterCount} 章。`,
  ];
  if (latestCompletedChapterOrder != null) {
    parts.push(`最近完成到第${latestCompletedChapterOrder}章。`);
  }
  if (completedChapterCount === 0) {
    parts.push("当前还没有检测到已写入正文的章节。");
  }
  return parts.join("");
}

function composeChapterAnswer(results: ToolExecutionResult[]): string | null {
  const contentOutputs = [
    ...getSuccessfulOutputs(results, "get_chapter_content_by_order"),
    ...getSuccessfulOutputs(results, "get_chapter_content"),
  ]
    .filter((item) => typeof item.order === "number")
    .sort((left, right) => Number(left.order) - Number(right.order));
  if (contentOutputs.length > 0) {
    return contentOutputs.map((item) => {
      const order = Number(item.order);
      const title = typeof item.title === "string" ? item.title.trim() : "";
      const content = typeof item.content === "string" ? item.content : "";
      return `第${order}章${title ? `《${title}》` : ""}：${truncateText(content, 360) || "正文为空"}`;
    }).join("\n\n");
  }

  const rangeSummary = getSuccessfulOutputs(results, "summarize_chapter_range")[0];
  if (rangeSummary && typeof rangeSummary.summary === "string" && rangeSummary.summary.trim()) {
    return rangeSummary.summary.trim();
  }
  return null;
}

function composeWriteAnswer(results: ToolExecutionResult[], waitingForApproval: boolean): string | null {
  const preview = getSuccessfulOutputs(results, "preview_pipeline_run")[0];
  const queue = getSuccessfulOutputs(results, "queue_pipeline_run")[0];
  const draft = getSuccessfulOutputs(results, "save_chapter_draft")[0];
  const patch = getSuccessfulOutputs(results, "apply_chapter_patch")[0];

  if (draft && typeof draft.summary === "string") {
    return draft.summary;
  }
  if (patch && typeof patch.summary === "string") {
    return patch.summary;
  }
  if (waitingForApproval && preview) {
    const start = typeof preview.startOrder === "number" ? preview.startOrder : null;
    const end = typeof preview.endOrder === "number" ? preview.endOrder : null;
    if (start != null && end != null) {
      return start === end
        ? `已完成第${start}章执行预览，当前等待审批。`
        : `已完成第${start}到第${end}章执行预览，当前等待审批。`;
    }
  }
  if (queue) {
    const start = typeof queue.startOrder === "number" ? queue.startOrder : null;
    const end = typeof queue.endOrder === "number" ? queue.endOrder : null;
    const jobId = typeof queue.jobId === "string" ? queue.jobId : "";
    if (start != null && end != null) {
      const scope = start === end ? `第${start}章` : `第${start}到第${end}章`;
      return `已创建 ${scope} 的写作任务${jobId ? `（任务 ${jobId}）` : ""}。`;
    }
  }
  return null;
}

function composeFailureDiagnosisAnswer(results: ToolExecutionResult[]): string {
  const candidates = [
    ...getSuccessfulOutputs(results, "get_run_failure_reason"),
    ...getSuccessfulOutputs(results, "explain_generation_blocker"),
    ...getSuccessfulOutputs(results, "get_task_failure_reason"),
    ...getSuccessfulOutputs(results, "get_index_failure_reason"),
    ...getSuccessfulOutputs(results, "get_book_analysis_failure_reason"),
  ];
  const first = candidates.find((item) => typeof item.failureSummary === "string" && item.failureSummary.trim());
  if (!first) {
    return "当前没有可用的失败诊断信息";
  }
  const parts = [String(first.failureSummary).trim()];
  if (typeof first.failureDetails === "string" && first.failureDetails.trim() && first.failureDetails.trim() !== parts[0]) {
    parts.push(`详情：${first.failureDetails.trim()}`);
  }
  if (typeof first.recoveryHint === "string" && first.recoveryHint.trim()) {
    parts.push(`建议：${first.recoveryHint.trim()}`);
  }
  if (typeof first.lastFailedStep === "string" && first.lastFailedStep.trim()) {
    parts.push(`失败步骤：${first.lastFailedStep.trim()}`);
  }
  return parts.join("\n");
}

async function composeFallbackAnswer(
  goal: string,
  summary: string,
  results: ToolExecutionResult[],
  context: Omit<ToolExecutionContext, "runId" | "agentName">,
  structuredIntent?: StructuredIntent,
): Promise<string> {
  try {
    const llm = await getLLM(context.provider ?? "deepseek", {
      model: context.model,
      temperature: 0.2,
      maxTokens: context.maxTokens,
    });
    const toolList = listAgentToolDefinitions()
      .map((item) => `- ${item.name}: ${item.description}`)
      .join("\n");
    const result = await llm.invoke([
      {
        role: "system",
        content: [
          "你是小说创作 Agent 的回答整理器。",
          "只能使用工具结果中的明确事实回答，禁止补充未执行到的信息。",
          "如果工具结果不足，就明确说“当前信息不足，无法继续”。",
          "以下是可用工具目录：",
          toolList,
        ].join("\n"),
      },
      {
        role: "user",
        content: [
          `用户目标：${goal}`,
          `结构化意图：${safeJson(structuredIntent ?? { intent: "unknown" })}`,
          `执行摘要：${summary}`,
          `工具事实：${buildGroundingFacts(results)}`,
          "请返回简洁中文结果。",
        ].join("\n\n"),
      },
    ]);
    if (typeof result.content === "string") {
      return result.content.trim() || "当前信息不足，无法继续";
    }
    if (Array.isArray(result.content)) {
      const text = result.content
        .map((item) => {
          if (typeof item === "string") {
            return item;
          }
          if (item && typeof item === "object" && "text" in item && typeof item.text === "string") {
            return item.text;
          }
          return "";
        })
        .join("")
        .trim();
      return text || "当前信息不足，无法继续";
    }
  } catch {
    return summary || "当前信息不足，无法继续";
  }
  return "当前信息不足，无法继续";
}

export async function composeAssistantMessage(
  goal: string,
  summary: string,
  results: ToolExecutionResult[],
  waitingForApproval: boolean,
  context: Omit<ToolExecutionContext, "runId" | "agentName">,
  structuredIntent?: StructuredIntent,
): Promise<string> {
  switch (structuredIntent?.intent) {
    case "query_novel_title":
      return composeTitleAnswer(results);
    case "query_progress":
      return composeProgressAnswer(results);
    case "query_chapter_content":
      return composeChapterAnswer(results) ?? "未获取到章节正文";
    case "inspect_failure_reason":
      return composeFailureDiagnosisAnswer(results);
    case "write_chapter":
    case "rewrite_chapter":
    case "save_chapter_draft":
    case "start_pipeline":
      return composeWriteAnswer(results, waitingForApproval) ?? "未获取到可执行范围";
    default:
      break;
  }

  if (waitingForApproval) {
    return summary;
  }
  return composeFallbackAnswer(goal, summary, results, context, structuredIntent);
}

export function hasUsableStructuredIntent(value: unknown): value is StructuredIntent {
  if (!isRecord(value)) {
    return false;
  }
  return typeof value.goal === "string"
    && typeof value.intent === "string"
    && typeof value.confidence === "number"
    && isRecord(value.chapterSelectors);
}
