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

function getFailedResult(results: ToolExecutionResult[], tool: ToolCall["tool"]): ToolExecutionResult | null {
  return results.find((item) => !item.success && item.tool === tool) ?? null;
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

function composeNovelListAnswer(results: ToolExecutionResult[]): string {
  const list = getSuccessfulOutputs(results, "list_novels")[0];
  const items = Array.isArray(list?.items) ? list.items : [];
  const total = typeof list?.total === "number" ? list.total : items.length;
  if (items.length === 0) {
    return "当前还没有小说。";
  }
  const lines = items.slice(0, 8).map((item, index) => {
    const title = typeof item?.title === "string" && item.title.trim() ? item.title.trim() : "未命名小说";
    const chapterCount = typeof item?.chapterCount === "number" ? item.chapterCount : null;
    return `${index + 1}. 《${title}》${chapterCount != null ? `（${chapterCount}章）` : ""}`;
  });
  return `当前共有 ${total} 本小说：\n${lines.join("\n")}`;
}

function composeWorldListAnswer(results: ToolExecutionResult[]): string {
  const list = getSuccessfulOutputs(results, "list_worlds")[0];
  const items = Array.isArray(list?.items) ? list.items : [];
  if (items.length === 0) {
    return "当前还没有世界观。";
  }
  const lines = items.slice(0, 8).map((item, index) => {
    const name = typeof item?.name === "string" && item.name.trim() ? item.name.trim() : "未命名世界观";
    const status = typeof item?.status === "string" && item.status.trim() ? item.status.trim() : null;
    return `${index + 1}. ${name}${status ? `（${status}）` : ""}`;
  });
  return `当前共有 ${items.length} 个世界观：\n${lines.join("\n")}`;
}

function composeTaskListAnswer(results: ToolExecutionResult[]): string {
  const list = getSuccessfulOutputs(results, "list_tasks")[0];
  const items = Array.isArray(list?.items) ? list.items : [];
  if (items.length === 0) {
    return "当前没有系统任务。";
  }
  const lines = items.slice(0, 8).map((item, index) => {
    const title = typeof item?.title === "string" && item.title.trim() ? item.title.trim() : "未命名任务";
    const status = typeof item?.status === "string" && item.status.trim() ? item.status.trim() : "unknown";
    const kind = typeof item?.kind === "string" && item.kind.trim() ? item.kind.trim() : null;
    return `${index + 1}. ${title}${kind ? `（${kind}）` : ""} - ${status}`;
  });
  return `当前共有 ${items.length} 个系统任务：\n${lines.join("\n")}`;
}

function getFirstSuccessfulOutput(results: ToolExecutionResult[], tool: ToolCall["tool"]): Record<string, unknown> | null {
  return getSuccessfulOutputs(results, tool)[0] ?? null;
}

function composeCreateNovelAnswer(results: ToolExecutionResult[]): string {
  const created = getSuccessfulOutputs(results, "create_novel")[0];
  if (!created) {
    return "请先提供小说标题";
  }
  const title = typeof created.title === "string" ? created.title.trim() : "";
  return title ? `已创建小说《${title}》。` : "已创建小说。";
}

function composeSelectNovelWorkspaceAnswer(results: ToolExecutionResult[]): string {
  const selected = getSuccessfulOutputs(results, "select_novel_workspace")[0];
  if (!selected) {
    return "请先提供要切换的小说名称";
  }
  const title = typeof selected.title === "string" ? selected.title.trim() : "";
  return title ? `已将当前工作区切换到《${title}》。` : "已切换当前工作区。";
}

function composeBindWorldAnswer(
  results: ToolExecutionResult[],
  context: Omit<ToolExecutionContext, "runId" | "agentName">,
): string {
  const bound = getSuccessfulOutputs(results, "bind_world_to_novel")[0];
  if (bound) {
    const summary = typeof bound.summary === "string" ? bound.summary.trim() : "";
    if (summary) {
      return summary;
    }
    const worldName = typeof bound.worldName === "string" ? bound.worldName.trim() : "";
    const novelTitle = typeof bound.novelTitle === "string" ? bound.novelTitle.trim() : "";
    if (worldName && novelTitle) {
      return `已将世界观《${worldName}》绑定到小说《${novelTitle}》。`;
    }
    return "已完成世界观绑定。";
  }
  if (!context.novelId) {
    return "没有当前小说上下文，无法设置世界观。";
  }
  const failed = getFailedResult(results, "bind_world_to_novel");
  if (failed?.errorCode === "NOT_FOUND") {
    return "未找到要绑定的世界观。";
  }
  if (failed?.summary) {
    return failed.summary;
  }
  return "未完成世界观绑定。";
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

function composeCharacterAnswer(results: ToolExecutionResult[]): string {
  const characterState = getSuccessfulOutputs(results, "get_character_states")[0];
  if (!characterState) {
    return "未获取到角色状态信息";
  }
  const count = typeof characterState.count === "number" ? characterState.count : 0;
  const items = Array.isArray(characterState.items) ? characterState.items : [];
  if (count === 0 || items.length === 0) {
    return "当前小说还没有已规划角色。";
  }
  const lines = items.slice(0, 6).map((item, index) => {
    const name = typeof item?.name === "string" && item.name.trim() ? item.name.trim() : "未命名角色";
    const role = typeof item?.role === "string" && item.role.trim() ? item.role.trim() : null;
    return `${index + 1}. ${name}${role ? `（${role}）` : ""}`;
  });
  return `当前小说已规划 ${count} 个角色：\n${lines.join("\n")}`;
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

function composeProductionStatusAnswer(
  results: ToolExecutionResult[],
  context: Omit<ToolExecutionContext, "runId" | "agentName">,
): string {
  const status = getFirstSuccessfulOutput(results, "get_novel_production_status");
  if (!status) {
    return context.novelId
      ? "未获取到整本生产状态。"
      : "没有当前小说上下文，无法读取整本生产状态。";
  }
  const title = typeof status.title === "string" ? status.title.trim() : "当前小说";
  const currentStage = typeof status.currentStage === "string" ? status.currentStage.trim() : "未知阶段";
  const chapterCount = typeof status.chapterCount === "number" ? status.chapterCount : 0;
  const targetChapterCount = typeof status.targetChapterCount === "number" ? status.targetChapterCount : null;
  const pipelineStatus = typeof status.pipelineStatus === "string" ? status.pipelineStatus.trim() : null;
  const failureSummary = typeof status.failureSummary === "string" ? status.failureSummary.trim() : "";
  const recoveryHint = typeof status.recoveryHint === "string" ? status.recoveryHint.trim() : "";
  const parts = [`《${title}》当前阶段：${currentStage}。`];
  parts.push(targetChapterCount != null ? `章节目录：${chapterCount}/${targetChapterCount} 章。` : `章节目录：${chapterCount} 章。`);
  if (pipelineStatus) {
    parts.push(`整本写作任务状态：${pipelineStatus}。`);
  }
  if (failureSummary) {
    parts.push(`失败原因：${failureSummary}`);
  }
  if (recoveryHint) {
    parts.push(`建议：${recoveryHint}`);
  }
  return parts.join("");
}

function composeProduceNovelAnswer(
  results: ToolExecutionResult[],
  waitingForApproval: boolean,
  context: Omit<ToolExecutionContext, "runId" | "agentName">,
): string {
  const created = getFirstSuccessfulOutput(results, "create_novel");
  const world = getFirstSuccessfulOutput(results, "generate_world_for_novel");
  const characters = getFirstSuccessfulOutput(results, "generate_novel_characters");
  const bible = getFirstSuccessfulOutput(results, "generate_story_bible");
  const outline = getFirstSuccessfulOutput(results, "generate_novel_outline");
  const structured = getFirstSuccessfulOutput(results, "generate_structured_outline");
  const synced = getFirstSuccessfulOutput(results, "sync_chapters_from_structured_outline");
  const preview = getFirstSuccessfulOutput(results, "preview_pipeline_run");
  const queued = getFirstSuccessfulOutput(results, "queue_pipeline_run");
  const productionStatus = getFirstSuccessfulOutput(results, "get_novel_production_status");

  if (!created && !context.novelId) {
    return "请先提供小说标题";
  }

  const title = typeof created?.title === "string" && created.title.trim()
    ? created.title.trim()
    : typeof productionStatus?.title === "string" && productionStatus.title.trim()
      ? productionStatus.title.trim()
      : "当前小说";
  const assetParts: string[] = [];
  if (world) {
    const worldName = typeof world.worldName === "string" ? world.worldName.trim() : "";
    assetParts.push(worldName ? `世界观《${worldName}》` : "世界观");
  }
  if (characters) {
    const characterCount = typeof characters.characterCount === "number" ? characters.characterCount : 0;
    assetParts.push(`${characterCount} 个核心角色`);
  }
  if (bible) {
    assetParts.push("小说圣经");
  }
  if (outline) {
    assetParts.push("发展走向");
  }
  if (structured) {
    const targetChapterCount = typeof structured.targetChapterCount === "number" ? structured.targetChapterCount : null;
    assetParts.push(targetChapterCount != null ? `${targetChapterCount} 章结构化大纲` : "结构化大纲");
  }
  if (synced) {
    const chapterCount = typeof synced.chapterCount === "number" ? synced.chapterCount : null;
    assetParts.push(chapterCount != null ? `${chapterCount} 个章节目录` : "章节目录");
  }

  if (waitingForApproval && preview) {
    return `《${title}》的核心资产已生成完成${assetParts.length > 0 ? `：${assetParts.join("、")}。` : "。"}整本写作预览已完成，当前等待审批。`;
  }
  if (queued) {
    const jobId = typeof queued.jobId === "string" && queued.jobId.trim() ? `（任务 ${queued.jobId}）` : "";
    return `《${title}》的核心资产已生成完成${assetParts.length > 0 ? `：${assetParts.join("、")}。` : "。"}整本写作任务已启动${jobId}。`;
  }
  if (preview) {
    return `《${title}》的核心资产已生成完成${assetParts.length > 0 ? `：${assetParts.join("、")}。` : "。"}整本写作未启动。`;
  }
  return `《${title}》的核心资产已生成完成${assetParts.length > 0 ? `：${assetParts.join("、")}。` : "。"}`
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
    case "list_novels":
      return composeNovelListAnswer(results);
    case "list_worlds":
      return composeWorldListAnswer(results);
    case "query_task_status":
      return composeTaskListAnswer(results);
    case "create_novel":
      return composeCreateNovelAnswer(results);
    case "select_novel_workspace":
      return composeSelectNovelWorkspaceAnswer(results);
    case "bind_world_to_novel":
      return composeBindWorldAnswer(results, context);
    case "produce_novel":
      return composeProduceNovelAnswer(results, waitingForApproval, context);
    case "query_novel_production_status":
      return composeProductionStatusAnswer(results, context);
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
