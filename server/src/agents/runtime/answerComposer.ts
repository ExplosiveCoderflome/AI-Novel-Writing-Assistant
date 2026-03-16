import { getLLM } from "../../llm/factory";
import { listAgentToolDefinitions } from "../toolRegistry";
import type { StructuredIntent, ToolCall, ToolExecutionContext } from "../types";
import { isRecord, safeJson, type ToolExecutionResult } from "./runtimeHelpers";
import { composeCreateNovelSetupAnswer, composeMissingNovelKickoffAnswer, composeSelectNovelWorkspaceSetupAnswer } from "./novelSetupGuidanceComposer";
import { composeNovelSetupIdeationAnswer } from "./novelSetupIdeationComposer";

const COLLABORATION_FIRST_INTENTS = new Set<StructuredIntent["intent"]>([
  "create_novel",
  "produce_novel",
  "write_chapter",
  "rewrite_chapter",
  "save_chapter_draft",
  "start_pipeline",
  "ideate_novel_setup",
  "general_chat",
  "unknown",
]);

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

function formatMissingInfo(structuredIntent?: StructuredIntent): string[] {
  return (structuredIntent?.missingInfo ?? [])
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 4);
}

function buildCollaborativeQuestion(structuredIntent?: StructuredIntent): string {
  switch (structuredIntent?.intent) {
    case "produce_novel":
    case "create_novel":
      return "你想先把一句话设定钉牢，还是让我直接给你三套可选方向？";
    case "write_chapter":
    case "rewrite_chapter":
      return "这章你最想先解决的是剧情推进、人物情绪，还是文风节奏？";
    case "ideate_novel_setup":
      return "你更想先看核心设定、故事承诺，还是题材风格的备选方案？";
    default:
      return "你现在最想先解决哪一个创作问题？";
  }
}

function buildCollaborativeOptions(structuredIntent?: StructuredIntent): string[] {
  switch (structuredIntent?.intent) {
    case "produce_novel":
    case "create_novel":
      return [
        "我先基于当前信息给你 3 套核心设定方向。",
        "你补一句主角、冲突和目标，我帮你收敛成可执行设定。",
        "如果你已经想清楚，也可以直接说“现在启动整本生产”。",
      ];
    case "write_chapter":
    case "rewrite_chapter":
      return [
        "我先帮你判断这一章的问题出在情节、人物还是节奏。",
        "你告诉我这章的目标和想保留的部分，我给你重写方案。",
        "如果你已经确定范围，也可以直接说要改哪一章、往哪个方向改。",
      ];
    case "ideate_novel_setup":
      return [
        "先给你 3 套核心设定备选。",
        "先给你 3 套故事承诺和卖点方向。",
        "先给你 3 套题材风格与叙事配置组合。",
      ];
    default:
      return [
        "我先帮你拆清楚这个问题。",
        "我先给你几个可选方向。",
        "你补充最关键的限制条件，我再继续推进。",
      ];
  }
}

function composeCollaborativeAnswer(goal: string, structuredIntent?: StructuredIntent): string {
  const missingInfo = formatMissingInfo(structuredIntent);
  const lead = structuredIntent?.intent === "general_chat" || structuredIntent?.intent === "unknown"
    ? `我先不把它当成命令执行，先和你一起把问题说清楚：${goal}`
    : `我理解你现在想推进的是：${goal}`;
  const collaborationLead = structuredIntent?.interactionMode === "review"
    ? "这轮更适合先一起诊断和判断。"
    : "这轮更适合先共创澄清，再决定是否进入执行。";

  if ((structuredIntent?.assistantResponse ?? "explain") === "offer_options") {
    const options = buildCollaborativeOptions(structuredIntent)
      .map((item, index) => `${index + 1}. ${item}`)
      .join("\n");
    const missingLine = missingInfo.length > 0
      ? `在继续之前，我还想补齐这几个点：${missingInfo.join("、")}。\n`
      : "";
    return `${lead}\n${collaborationLead}\n${missingLine}你可以直接选一个方向继续：\n${options}`;
  }

  const missingLine = missingInfo.length > 0
    ? `在继续之前，我还缺这几个关键信息：${missingInfo.join("、")}。`
    : "";
  return [lead, collaborationLead, missingLine, buildCollaborativeQuestion(structuredIntent)]
    .filter(Boolean)
    .join("\n");
}

function composeSocialOpeningAnswer(context: Omit<ToolExecutionContext, "runId" | "agentName">): string {
  if (context.novelId) {
    return "你好。我可以继续陪你打磨这本书的设定、大纲、人物、章节，或者先帮你判断当前卡点。你现在想先推进哪一块？";
  }
  return "你好。我可以帮你一起打磨设定、大纲、人物、章节，或者帮你诊断当前卡点。你现在想先推进哪一块？";
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

function composeBaseCharacterListAnswer(results: ToolExecutionResult[]): string {
  const list = getSuccessfulOutputs(results, "list_base_characters")[0];
  const items = Array.isArray(list?.items) ? list.items : [];
  if (items.length === 0) {
    return "当前基础角色库还是空的。";
  }
  const lines = items.slice(0, 8).map((item, index) => {
    const name = typeof item?.name === "string" && item.name.trim() ? item.name.trim() : "未命名角色";
    const role = typeof item?.role === "string" && item.role.trim() ? item.role.trim() : null;
    const category = typeof item?.category === "string" && item.category.trim() ? item.category.trim() : null;
    const tags = typeof item?.tags === "string" && item.tags.trim() ? item.tags.trim() : null;
    const suffix = [role, category, tags].filter(Boolean).join(" / ");
    return `${index + 1}. ${name}${suffix ? `（${suffix}）` : ""}`;
  });
  return `当前基础角色库共有 ${items.length} 个角色模板：\n${lines.join("\n")}`;
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

function composeUnbindWorldAnswer(
  results: ToolExecutionResult[],
  context: Omit<ToolExecutionContext, "runId" | "agentName">,
): string {
  const unbound = getSuccessfulOutputs(results, "unbind_world_from_novel")[0];
  if (unbound) {
    const summary = typeof unbound.summary === "string" ? unbound.summary.trim() : "";
    if (summary) {
      return summary;
    }
    const novelTitle = typeof unbound.novelTitle === "string" ? unbound.novelTitle.trim() : "";
    const previousWorldName = typeof unbound.previousWorldName === "string" ? unbound.previousWorldName.trim() : "";
    if (novelTitle && previousWorldName) {
      return `已将世界观《${previousWorldName}》从小说《${novelTitle}》解绑。`;
    }
    if (novelTitle) {
      return `已更新小说《${novelTitle}》的世界观绑定状态。`;
    }
    return "已完成世界观解绑。";
  }
  if (!context.novelId) {
    return "没有当前小说上下文，无法解除世界观绑定。";
  }
  const failed = getFailedResult(results, "unbind_world_from_novel");
  if (failed?.summary) {
    return failed.summary;
  }
  return "未完成世界观解绑。";
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

async function composeProduceNovelAnswer(
  results: ToolExecutionResult[],
  waitingForApproval: boolean,
  context: Omit<ToolExecutionContext, "runId" | "agentName">,
  goal: string,
  structuredIntent?: StructuredIntent,
): Promise<string> {
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
    return composeMissingNovelKickoffAnswer(goal, context, structuredIntent, "produce_missing_title");
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
          "如果工具结果不足，不要生硬地终止；优先指出信息缺口，并给出一个追问或 2-3 个下一步选项。",
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
  if (structuredIntent?.intent === "social_opening") {
    return composeSocialOpeningAnswer(context);
  }

  if (
    !waitingForApproval
    && structuredIntent
    && COLLABORATION_FIRST_INTENTS.has(structuredIntent.intent)
    && (
      structuredIntent.shouldAskFollowup
      || ((structuredIntent.interactionMode ?? "execute") !== "execute" && results.length === 0)
    )
  ) {
    return composeCollaborativeAnswer(goal, structuredIntent);
  }

  switch (structuredIntent?.intent) {
    case "list_novels":
      return composeNovelListAnswer(results);
    case "list_base_characters":
      return composeBaseCharacterListAnswer(results);
    case "list_worlds":
      return composeWorldListAnswer(results);
    case "query_task_status":
      return composeTaskListAnswer(results);
    case "create_novel":
      return composeCreateNovelSetupAnswer(goal, results, context, structuredIntent);
    case "select_novel_workspace":
      return composeSelectNovelWorkspaceSetupAnswer(goal, results, context, structuredIntent);
    case "bind_world_to_novel":
      return composeBindWorldAnswer(results, context);
    case "unbind_world_from_novel":
      return composeUnbindWorldAnswer(results, context);
    case "produce_novel":
      return composeProduceNovelAnswer(results, waitingForApproval, context, goal, structuredIntent);
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
    case "ideate_novel_setup":
      return composeNovelSetupIdeationAnswer(goal, results, context, structuredIntent);
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
