import type {
  AgentRunStartInput,
  PlannedAction,
  StructuredIntent,
  ToolCall,
  ToolExecutionContext,
} from "../types";
import type { AgentToolError } from "../types";
import type { AgentToolErrorCode } from "@ai-novel/shared/types/agent";

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
  worldId?: string;
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
  if (typeof output.summary === "string" && output.summary.trim()) {
    return output.summary;
  }
  if (tool === "list_novels") {
    const items = Array.isArray(output.items) ? output.items : [];
    return `已读取 ${items.length} 本小说。`;
  }
  if (tool === "create_novel") {
    const title = typeof output.title === "string" ? output.title : "";
    const stage = typeof (output.setup as Record<string, unknown> | undefined)?.stage === "string"
      ? String((output.setup as Record<string, unknown>).stage)
      : "";
    if (title && stage === "ready_for_production") {
      return `已创建小说《${title}》，初始化已完成。`;
    }
    return title ? `已创建小说《${title}》，并进入初始化引导。` : "已创建小说。";
  }
  if (tool === "select_novel_workspace") {
    const title = typeof output.title === "string" ? output.title : "";
    const stage = typeof (output.setup as Record<string, unknown> | undefined)?.stage === "string"
      ? String((output.setup as Record<string, unknown>).stage)
      : "";
    if (title && stage !== "ready_for_production") {
      return `已切换到小说《${title}》，当前继续初始化。`;
    }
    return title ? `已切换到小说《${title}》。` : "已切换到目标小说。";
  }
  if (tool === "bind_world_to_novel") {
    const worldName = typeof output.worldName === "string" ? output.worldName.trim() : "";
    const novelTitle = typeof output.novelTitle === "string" ? output.novelTitle.trim() : "";
    if (worldName && novelTitle) {
      return `已将世界观《${worldName}》绑定到小说《${novelTitle}》。`;
    }
    if (worldName) {
      return `已绑定世界观《${worldName}》。`;
    }
    return "已完成世界观绑定。";
  }
  if (tool === "unbind_world_from_novel") {
    const previousWorldName = typeof output.previousWorldName === "string" ? output.previousWorldName.trim() : "";
    const novelTitle = typeof output.novelTitle === "string" ? output.novelTitle.trim() : "";
    if (previousWorldName && novelTitle) {
      return `已将世界观《${previousWorldName}》从小说《${novelTitle}》解绑。`;
    }
    if (novelTitle) {
      return `小说《${novelTitle}》当前没有绑定世界观。`;
    }
    return "已处理世界观解绑。";
  }
  if (tool === "generate_world_for_novel") {
    const worldName = typeof output.worldName === "string" ? output.worldName.trim() : "";
    return worldName ? `已生成世界观《${worldName}》。` : "已生成小说世界观。";
  }
  if (tool === "generate_novel_characters") {
    return `已生成 ${String(output.characterCount ?? 0)} 个核心角色。`;
  }
  if (tool === "generate_story_bible") {
    return "已生成小说圣经。";
  }
  if (tool === "generate_novel_outline") {
    return "已生成小说发展走向。";
  }
  if (tool === "generate_structured_outline") {
    return `已生成 ${String(output.targetChapterCount ?? output.chapterCount ?? 0)} 章结构化大纲。`;
  }
  if (tool === "sync_chapters_from_structured_outline") {
    return `已同步 ${String(output.chapterCount ?? 0)} 个章节目录。`;
  }
  if (tool === "start_full_novel_pipeline" || tool === "get_novel_production_status") {
    return typeof output.summary === "string" ? output.summary : `${tool} 执行完成。`;
  }
  if (tool === "get_novel_context") {
    const title = typeof output.title === "string" ? output.title.trim() : "";
    const chapterCount = typeof output.chapterCount === "number" ? output.chapterCount : null;
    return title
      ? `${title}${chapterCount != null ? `（共 ${chapterCount} 章）` : ""}`
      : "已读取小说总览。";
  }
  if (tool === "get_story_bible") {
    const exists = output.exists === true;
    return exists ? "已读取小说圣经设定。" : "当前小说还没有已保存的小说圣经。";
  }
  if (tool === "get_world_constraints") {
    const worldName = typeof output.worldName === "string" ? output.worldName.trim() : "";
    return worldName ? `已读取世界观约束：${worldName}。` : "当前小说尚未绑定世界观约束。";
  }
  if (tool === "list_chapters") {
    const items = Array.isArray(output.items) ? output.items : [];
    return `已读取 ${items.length} 个章节元信息。`;
  }
  if (tool === "get_chapter_by_order" || tool === "get_chapter_content_by_order" || tool === "get_chapter_content") {
    const order = typeof output.order === "number" ? output.order : null;
    const title = typeof output.title === "string" ? output.title.trim() : "";
    return order != null ? `已读取第${order}章${title ? `《${title}》` : ""}。` : "已读取章节内容。";
  }
  if (tool === "summarize_chapter_range") {
    const start = typeof output.startOrder === "number" ? output.startOrder : null;
    const end = typeof output.endOrder === "number" ? output.endOrder : null;
    return start != null && end != null
      ? `已总结第${start}到第${end}章。`
      : "已完成章节范围总结。";
  }
  if (tool === "search_knowledge") {
    const hitCount = typeof output.hitCount === "number" ? output.hitCount : 0;
    return `命中 ${hitCount} 条知识片段。`;
  }
  if (tool === "list_book_analyses") {
    const items = Array.isArray(output.items) ? output.items : [];
    return `已读取 ${items.length} 个拆书任务。`;
  }
  if (tool === "get_book_analysis_detail") {
    return typeof output.title === "string" ? `已读取拆书详情：${output.title}。` : "已读取拆书详情。";
  }
  if (tool === "get_book_analysis_failure_reason" || tool === "get_index_failure_reason" || tool === "get_task_failure_reason" || tool === "get_run_failure_reason") {
    return typeof output.failureSummary === "string" ? output.failureSummary : `${tool} 已返回诊断信息。`;
  }
  if (tool === "list_knowledge_documents") {
    const items = Array.isArray(output.items) ? output.items : [];
    return `已读取 ${items.length} 个知识文档。`;
  }
  if (tool === "get_knowledge_document_detail") {
    return typeof output.title === "string" ? `已读取知识文档《${output.title}》。` : "已读取知识文档详情。";
  }
  if (tool === "list_worlds") {
    const items = Array.isArray(output.items) ? output.items : [];
    return `已读取 ${items.length} 个世界观。`;
  }
  if (tool === "get_world_detail") {
    return typeof output.name === "string" ? `已读取世界观《${output.name}》。` : "已读取世界观详情。";
  }
  if (tool === "explain_world_conflict" || tool === "explain_generation_blocker") {
    return typeof output.failureSummary === "string" ? output.failureSummary : `${tool} 已返回冲突/阻塞说明。`;
  }
  if (tool === "list_writing_formulas") {
    const items = Array.isArray(output.items) ? output.items : [];
    return `已读取 ${items.length} 条写作公式。`;
  }
  if (tool === "get_writing_formula_detail") {
    return typeof output.name === "string" ? `已读取写作公式《${output.name}》。` : "已读取写作公式详情。";
  }
  if (tool === "explain_formula_match") {
    return typeof output.summary === "string" ? output.summary : "已完成写作公式适配分析。";
  }
  if (tool === "list_base_characters") {
    const items = Array.isArray(output.items) ? output.items : [];
    return `已读取 ${items.length} 个基础角色模板。`;
  }
  if (tool === "get_base_character_detail") {
    return typeof output.name === "string" ? `已读取角色模板《${output.name}》。` : "已读取角色模板详情。";
  }
  if (tool === "list_tasks") {
    const items = Array.isArray(output.items) ? output.items : [];
    return `已读取 ${items.length} 个系统任务。`;
  }
  if (tool === "get_task_detail") {
    return typeof output.title === "string" ? `已读取任务详情：${output.title}。` : "已读取任务详情。";
  }
  if (tool === "retry_task" || tool === "cancel_task") {
    return typeof output.summary === "string" ? output.summary : `${tool} 执行完成。`;
  }
  if (tool === "preview_pipeline_run") {
    return `已预览 ${String(output.chapterCount ?? 0)} 个章节。`;
  }
  if (tool === "queue_pipeline_run") {
    return `流水线任务已处理：${String(output.jobId ?? output.status ?? "unknown")}`;
  }
  if (tool === "apply_chapter_patch" || tool === "save_chapter_draft") {
    return `章节写入已处理，字数 ${String(output.contentLength ?? 0)}。`;
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
  return isWriteTool(toolCall.tool) && toolCall.input.dryRun !== true;
}

export function normalizeAgent(value: unknown): PlannedAction["agent"] {
  if (value === "Writer" || value === "Reviewer" || value === "Continuity" || value === "Repair") {
    return value;
  }
  return "Planner";
}

function isStructuredIntent(value: unknown): value is StructuredIntent {
  if (!isRecord(value)) {
    return false;
  }
  return typeof value.goal === "string"
    && typeof value.intent === "string"
    && typeof value.confidence === "number"
    && isRecord(value.chapterSelectors);
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
    worldId: typeof contextRecord.worldId === "string" ? contextRecord.worldId : undefined,
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
  const metadata: RunMetadata = {
    contextMode: raw.contextMode === "novel" ? "novel" : "global",
  };
  if (typeof raw.provider === "string") {
    metadata.provider = raw.provider as AgentRunStartInput["provider"];
  }
  if (typeof raw.worldId === "string") {
    metadata.worldId = raw.worldId;
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
