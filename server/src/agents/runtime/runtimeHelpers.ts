import type { AgentToolErrorCode } from "@ai-novel/shared/types/agent";
import { getLLM } from "../../llm/factory";
import { listAgentToolDefinitions } from "../toolRegistry";
import type { AgentToolError } from "../types";
import type { AgentRunStartInput, PlannedAction, StructuredIntent, ToolCall, ToolExecutionContext } from "../types";

export interface ToolExecutionResult {
  tool: ToolCall["tool"];
  success: boolean;
  summary: string;
  output?: Record<string, unknown>;
  errorCode?: AgentToolErrorCode;
  stepId?: string;
}

export interface SerializedContinuationPayload {
  goal: string;
  structuredIntent?: StructuredIntent;
  context: Omit<ToolExecutionContext, "runId" | "agentName">;
  plannedActions: PlannedAction[];
}

export interface RunMetadata {
  contextMode: AgentRunStartInput["contextMode"];
  provider?: AgentRunStartInput["provider"];
  model?: string;
  temperature?: number;
  maxTokens?: number;
  messages?: AgentRunStartInput["messages"];
  parentRunId?: string;
  replayFromStepId?: string;
  plannerIntent?: StructuredIntent;
}

export const APPROVAL_TTL_MS = 1000 * 60 * 30;
export const MAX_TOOL_RETRIES = 1;
export const TERMINAL_STATUSES = new Set(["succeeded", "failed", "cancelled"]);

export function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value ?? {});
  } catch {
    return JSON.stringify({ error: "serialize_failed" });
  }
}

export function asObject(value: string | null | undefined): Record<string, unknown> {
  if (!value?.trim()) {
    return {};
  }
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    return parsed as Record<string, unknown>;
  } catch {
    return {};
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export function extractErrorCode(error: unknown): AgentToolErrorCode {
  if ((error as AgentToolError)?.name === "AgentToolError" && typeof (error as AgentToolError).code === "string") {
    return (error as AgentToolError).code;
  }
  return "INTERNAL";
}

export function canRetry(errorCode: AgentToolErrorCode): boolean {
  return errorCode === "TIMEOUT" || errorCode === "INTERNAL";
}

export function summarizeOutput(tool: string, output: Record<string, unknown>): string {
  const truncateText = (value: string, max = 240): string => {
    const normalized = value.replace(/\s+/g, " ").trim();
    if (normalized.length <= max) {
      return normalized;
    }
    return `${normalized.slice(0, max)}…`;
  };
  if (typeof output.summary === "string" && output.summary.trim()) {
    return output.summary;
  }
  if (tool === "get_novel_context") {
    const title = typeof output.title === "string" ? output.title.trim() : "";
    const chapterCount = typeof output.chapterCount === "number" ? output.chapterCount : null;
    const completedChapterCount = typeof output.completedChapterCount === "number" ? output.completedChapterCount : null;
    const latestCompletedChapterOrder = typeof output.latestCompletedChapterOrder === "number"
      ? output.latestCompletedChapterOrder
      : null;
    const chapterSummary = Array.isArray(output.chapterSummary) ? output.chapterSummary : [];
    const parts: string[] = [];
    if (title) {
      let titleLine = chapterCount !== null ? `当前小说标题：${title}（章节数 ${chapterCount}）` : `当前小说标题：${title}`;
      if (completedChapterCount !== null) {
        titleLine += `，已完成 ${completedChapterCount} 章`;
        if (latestCompletedChapterOrder !== null) {
          titleLine += `，最近完成到第${latestCompletedChapterOrder}章`;
        }
      }
      parts.push(titleLine);
    }
    for (const ch of chapterSummary) {
      if (isRecord(ch) && typeof ch.order === "number" && (typeof ch.title === "string" || typeof ch.excerpt === "string")) {
        const excerpt = typeof ch.excerpt === "string" && ch.excerpt.trim().length > 0 ? ch.excerpt : "";
        if (excerpt) {
          parts.push(`第${ch.order}章 ${String(ch.title ?? "").trim() || "（无标题）"}：${truncateText(excerpt, 400)}`);
        }
      }
    }
    if (parts.length > 0) return parts.join("\n");
    return "已读取小说上下文。";
  }
  if (tool === "get_chapter_content") {
    const order = typeof output.order === "number" ? output.order : null;
    const title = typeof output.title === "string" ? output.title.trim() : "";
    const content = typeof output.content === "string" ? output.content : "";
    const label = order != null
      ? `第${order}章${title ? `《${title}》` : ""}`
      : title || "章节";
    return `${label}：${truncateText(content, 500) || "正文为空。"}`;
  }
  if (tool === "search_knowledge") {
    const hitCount = typeof output.hitCount === "number" ? output.hitCount : 0;
    return `命中 ${hitCount} 条知识片段。`;
  }
  if (tool === "queue_pipeline_run") {
    return `流水线任务已处理：${String(output.jobId ?? output.status ?? "")}`;
  }
  if (tool === "preview_pipeline_run") {
    return `流水线预览章节数：${String(output.chapterCount ?? 0)}`;
  }
  if (tool === "apply_chapter_patch" || tool === "save_chapter_draft") {
    return `章节处理完成，字数 ${String(output.contentLength ?? 0)}。`;
  }
  return `${tool} 执行完成。`;
}

export function summarizeFailure(tool: string, error: unknown): string {
  return `${tool} 执行失败：${error instanceof Error ? error.message : "unknown error"}`;
}

export function buildFinalMessage(results: ToolExecutionResult[], waitingForApproval: boolean): string {
  const lines: string[] = [];
  if (results.length > 0) {
    lines.push("已完成以下步骤：");
    for (const item of results) {
      lines.push(`- ${item.summary}`);
    }
  }
  if (waitingForApproval) {
    lines.push("当前存在高影响写入，已暂停等待审批。");
  } else if (results.length > 0) {
    lines.push("执行完成。");
  } else {
    lines.push("没有可执行的工具步骤。");
  }
  return lines.join("\n");
}

function isWriteTool(tool: ToolCall["tool"]): boolean {
  return tool === "save_chapter_draft" || tool === "apply_chapter_patch" || tool === "queue_pipeline_run";
}

export function shouldUseDryRunPreview(toolCall: ToolCall): boolean {
  if (!isWriteTool(toolCall.tool)) {
    return false;
  }
  return toolCall.input.dryRun !== true;
}

export function normalizeAgent(value: unknown): PlannedAction["agent"] {
  if (value === "Writer" || value === "Reviewer" || value === "Continuity" || value === "Repair") {
    return value;
  }
  return "Planner";
}

export function parseApprovalPayload(payloadJson: string | null | undefined): SerializedContinuationPayload | null {
  const raw = asObject(payloadJson);
  if (!Array.isArray(raw.plannedActions) || typeof raw.goal !== "string" || !isRecord(raw.context)) {
    return null;
  }
  const contextRecord = raw.context;
  const context: SerializedContinuationPayload["context"] = {
    contextMode: contextRecord.contextMode === "novel" ? "novel" : "global",
    novelId: typeof contextRecord.novelId === "string" ? contextRecord.novelId : undefined,
    provider: typeof contextRecord.provider === "string"
      ? contextRecord.provider as AgentRunStartInput["provider"]
      : undefined,
    model: typeof contextRecord.model === "string" ? contextRecord.model : undefined,
    temperature: typeof contextRecord.temperature === "number" ? contextRecord.temperature : undefined,
    maxTokens: typeof contextRecord.maxTokens === "number" ? contextRecord.maxTokens : undefined,
  };
  const plannedActions: PlannedAction[] = raw.plannedActions
    .filter((item): item is Record<string, unknown> => isRecord(item))
    .map((item) => {
      const callsRaw = Array.isArray(item.calls) ? item.calls : [];
      const calls: ToolCall[] = callsRaw
        .filter((call): call is Record<string, unknown> => isRecord(call))
        .map((call) => ({
          tool: call.tool as ToolCall["tool"],
          reason: typeof call.reason === "string" ? call.reason : "工具调用",
          idempotencyKey: typeof call.idempotencyKey === "string" ? call.idempotencyKey : `k_${Date.now()}`,
          input: isRecord(call.input) ? call.input : {},
          dryRun: call.dryRun === true,
          approvalSatisfied: call.approvalSatisfied === true,
        }));
      return {
        agent: normalizeAgent(item.agent),
        reasoning: typeof item.reasoning === "string" ? item.reasoning : "继续执行",
        calls,
      };
    })
    .filter((item) => item.calls.length > 0);

  if (plannedActions.length === 0) {
    return null;
  }
  return {
    goal: raw.goal,
    structuredIntent: isStructuredIntent(raw.structuredIntent) ? raw.structuredIntent : undefined,
    context,
    plannedActions,
  };
}

export function buildAlternativePathFromRejectedApproval(
  approvalPayload: SerializedContinuationPayload | null,
  note?: string,
): PlannedAction[] {
  if (!approvalPayload) {
    return [];
  }
  const firstCall = approvalPayload.plannedActions[0]?.calls[0];
  if (!firstCall) {
    return [];
  }

  if (firstCall.tool === "apply_chapter_patch") {
    const novelId = typeof firstCall.input.novelId === "string" ? firstCall.input.novelId : undefined;
    const chapterId = typeof firstCall.input.chapterId === "string" ? firstCall.input.chapterId : undefined;
    const content = typeof firstCall.input.content === "string" ? firstCall.input.content : "";
    if (novelId && chapterId && content.trim()) {
      return [{
        agent: "Writer",
        reasoning: "审批拒绝后改为草稿保存，避免直接覆盖正文。",
        calls: [{
          tool: "save_chapter_draft",
          reason: `审批拒绝，转草稿保存。${note ? `备注: ${note}` : ""}`.trim(),
          idempotencyKey: `fallback_draft_${chapterId}_${Date.now()}`,
          input: {
            novelId,
            chapterId,
            content,
            dryRun: false,
          },
        }],
      }];
    }
  }

  if (firstCall.tool === "queue_pipeline_run") {
    const novelId = typeof firstCall.input.novelId === "string" ? firstCall.input.novelId : undefined;
    const startOrder = typeof firstCall.input.startOrder === "number" ? firstCall.input.startOrder : undefined;
    const endOrder = typeof firstCall.input.endOrder === "number" ? firstCall.input.endOrder : undefined;
    if (novelId && typeof startOrder === "number" && typeof endOrder === "number") {
      return [{
        agent: "Planner",
        reasoning: "审批拒绝后保留预览，不实际启动流水线。",
        calls: [{
          tool: "preview_pipeline_run",
          reason: "审批拒绝，改为范围预览。",
          idempotencyKey: `fallback_preview_${startOrder}_${endOrder}_${Date.now()}`,
          input: {
            novelId,
            startOrder,
            endOrder,
          },
        }],
      }];
    }
  }

  return [];
}

export function parseRunMetadata(metadataJson: string | null | undefined): RunMetadata {
  const raw = asObject(metadataJson);
  const contextMode = raw.contextMode === "novel" ? "novel" : "global";
  const metadata: RunMetadata = {
    contextMode,
  };
  if (typeof raw.provider === "string") {
    metadata.provider = raw.provider as AgentRunStartInput["provider"];
  }
  if (typeof raw.model === "string") {
    metadata.model = raw.model;
  }
  if (typeof raw.temperature === "number") {
    metadata.temperature = raw.temperature;
  }
  if (typeof raw.maxTokens === "number") {
    metadata.maxTokens = raw.maxTokens;
  }
  if (Array.isArray(raw.messages)) {
    metadata.messages = raw.messages
      .filter((item): item is { role: "user" | "assistant" | "system"; content: string } =>
        isRecord(item)
        && (item.role === "user" || item.role === "assistant" || item.role === "system")
        && typeof item.content === "string")
      .slice(-30);
  }
  if (typeof raw.parentRunId === "string") {
    metadata.parentRunId = raw.parentRunId;
  }
  if (typeof raw.replayFromStepId === "string") {
    metadata.replayFromStepId = raw.replayFromStepId;
  }
  if (isStructuredIntent(raw.plannerIntent)) {
    metadata.plannerIntent = raw.plannerIntent;
  }
  return metadata;
}

function truncateText(value: string, max = 300): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "";
  }
  return normalized.length > max ? `${normalized.slice(0, max)}…` : normalized;
}

function getSuccessfulOutputs(results: ToolExecutionResult[], tool: ToolCall["tool"]): Record<string, unknown>[] {
  return results
    .filter((item) => item.success && item.tool === tool && item.output)
    .map((item) => item.output as Record<string, unknown>);
}

function composeChapterAnswerFromOutputs(results: ToolExecutionResult[]): string | null {
  const chapterOutputs = getSuccessfulOutputs(results, "get_chapter_content")
    .filter((item) => typeof item.order === "number")
    .sort((left, right) => Number(left.order) - Number(right.order));
  if (chapterOutputs.length > 0) {
    return chapterOutputs
      .map((item) => {
        const order = Number(item.order);
        const title = typeof item.title === "string" ? item.title.trim() : "";
        const content = typeof item.content === "string" ? item.content : "";
        const heading = `第${order}章${title ? `《${title}》` : ""}`;
        const excerpt = truncateText(content, 320);
        return `${heading}：${excerpt || "正文为空。"}`;
      })
      .join("\n\n");
  }

  const contextOutputs = getSuccessfulOutputs(results, "get_novel_context");
  for (const item of contextOutputs) {
    const chapterSummary = Array.isArray(item.chapterSummary) ? item.chapterSummary : [];
    const chapterLines = chapterSummary
      .filter((entry) => isRecord(entry) && typeof entry.order === "number")
      .sort((left, right) => Number(left.order) - Number(right.order))
      .map((entry) => {
        const order = Number(entry.order);
        const title = typeof entry.title === "string" ? entry.title.trim() : "";
        const excerpt = typeof entry.excerpt === "string" ? truncateText(entry.excerpt, 320) : "";
        return `第${order}章${title ? `《${title}》` : ""}：${excerpt || "暂无摘要。"}`
      });
    if (chapterLines.length > 0) {
      return chapterLines.join("\n\n");
    }
  }
  return null;
}

function composePipelineAnswer(results: ToolExecutionResult[], waitingForApproval: boolean): string | null {
  const queueResult = getSuccessfulOutputs(results, "queue_pipeline_run")[0];
  const previewResult = getSuccessfulOutputs(results, "preview_pipeline_run")[0];
  if (waitingForApproval && previewResult) {
    const start = typeof previewResult.startOrder === "number" ? previewResult.startOrder : null;
    const end = typeof previewResult.endOrder === "number" ? previewResult.endOrder : null;
    if (start != null && end != null) {
      return start === end
        ? `已完成第${start}章的执行预览，当前为高影响写入，等待审批后继续。`
        : `已完成第${start}到第${end}章的执行预览，当前为高影响写入，等待审批后继续。`;
    }
  }
  if (queueResult) {
    const start = typeof queueResult.startOrder === "number" ? queueResult.startOrder : null;
    const end = typeof queueResult.endOrder === "number" ? queueResult.endOrder : null;
    const jobId = typeof queueResult.jobId === "string" ? queueResult.jobId : "";
    if (start != null && end != null) {
      const scope = start === end ? `第${start}章` : `第${start}到第${end}章`;
      return `已创建 ${scope} 的写作流水线任务${jobId ? `（任务 ${jobId}）` : ""}。`;
    }
  }
  return null;
}

function composeProgressAnswer(results: ToolExecutionResult[]): string | null {
  const context = getSuccessfulOutputs(results, "get_novel_context")[0];
  if (!context) {
    return null;
  }
  const completedChapterCount = typeof context.completedChapterCount === "number"
    ? context.completedChapterCount
    : null;
  const chapterCount = typeof context.chapterCount === "number" ? context.chapterCount : null;
  const latestCompletedChapterOrder = typeof context.latestCompletedChapterOrder === "number"
    ? context.latestCompletedChapterOrder
    : null;
  if (completedChapterCount == null) {
    return null;
  }
  const parts = [
    chapterCount != null
      ? `当前实际已写完 ${completedChapterCount} / ${chapterCount} 章。`
      : `当前实际已写完 ${completedChapterCount} 章。`,
  ];
  if (latestCompletedChapterOrder != null) {
    parts.push(`最近完成到第${latestCompletedChapterOrder}章。`);
  }
  if (completedChapterCount === 0) {
    parts.push("当前还没有检测到已写入正文的章节内容。");
  }
  return parts.join("");
}

function buildGroundingFacts(results: ToolExecutionResult[]): string {
  const facts = results.map((item) => ({
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
  }));
  return safeJson(facts);
}

function extractTitleFromSummary(summary: string): string | null {
  const lines = summary.split("\n");
  for (const line of lines) {
    const match = line.match(/当前小说标题[:：]\s*([^\n（(]+)/);
    if (!match?.[1]) {
      continue;
    }
    const title = match[1].trim();
    if (title) {
      return title;
    }
  }
  return null;
}

function isStructuredIntent(value: unknown): value is StructuredIntent {
  if (!isRecord(value)) {
    return false;
  }
  if (typeof value.goal !== "string" || typeof value.intent !== "string" || typeof value.confidence !== "number") {
    return false;
  }
  return isRecord(value.chapterSelectors);
}

export async function composeAssistantMessage(
  goal: string,
  summary: string,
  results: ToolExecutionResult[],
  waitingForApproval: boolean,
  context: Omit<ToolExecutionContext, "runId" | "agentName">,
  structuredIntent?: StructuredIntent,
): Promise<string> {
  if (structuredIntent?.intent === "query_novel_title") {
    const title = getSuccessfulOutputs(results, "get_novel_context")
      .map((item) => (typeof item.title === "string" ? item.title.trim() : ""))
      .find(Boolean)
      ?? extractTitleFromSummary(summary);
    if (title) {
      return /^《.+》$/.test(title) ? title : `《${title}》`;
    }
    return "当前运行没有拿到小说标题，请确认已在 Novel 模式选中小说后重试。";
  }

  if (structuredIntent?.intent === "query_progress") {
    const progressAnswer = composeProgressAnswer(results);
    if (progressAnswer) {
      return progressAnswer;
    }
    return "当前没有获取到小说写作进度信息，请重试。";
  }

  if (structuredIntent?.intent === "query_chapter_content") {
    const chapterAnswer = composeChapterAnswerFromOutputs(results);
    if (chapterAnswer) {
      return chapterAnswer;
    }
    return "当前没有获取到对应章节的正文或摘要，请确认章节范围后重试。";
  }

  const pipelineAnswer = composePipelineAnswer(results, waitingForApproval);
  if (pipelineAnswer) {
    return pipelineAnswer;
  }

  if (waitingForApproval) {
    return summary;
  }

  try {
    const llm = await getLLM(context.provider ?? "deepseek", {
      model: context.model,
      temperature: 0.3,
      maxTokens: context.maxTokens,
    });
    const toolList = listAgentToolDefinitions()
      .map((item) => `- ${item.name}: ${item.description}`)
      .join("\n");
    const result = await llm.invoke([
      {
        role: "system",
        content: `你是小说创作代理总控。请根据执行摘要生成简洁回复。
硬约束：
1) 只能使用执行摘要里明确出现的事实，禁止编造。
2) 摘要里没有的信息必须明确说“未获取到”。
3) 如果工具结果已经提供标题、章节正文、任务状态等字段，必须优先使用这些字段。
4) 当前解析出的意图只用于约束回答方向，不能据此补充不存在的事实。
可用工具：
${toolList}`,
      },
      {
        role: "user",
        content: `用户目标：${goal}\n解析意图：${safeJson(structuredIntent ?? { intent: "unknown" })}\n执行摘要：\n${summary}\n工具事实：\n${buildGroundingFacts(results)}\n请返回简洁中文结果。`,
      },
    ]);
    if (typeof result.content === "string") {
      return result.content.trim();
    }
    if (Array.isArray(result.content)) {
      return result.content
        .map((item) => {
          if (typeof item === "string") {
            return item;
          }
          if (typeof item === "object" && item && "text" in item && typeof item.text === "string") {
            return item.text;
          }
          return "";
        })
        .join("")
        .trim();
    }
    return summary;
  } catch {
    return summary;
  }
}
