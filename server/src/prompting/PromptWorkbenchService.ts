import type { BaseMessage } from "@langchain/core/messages";
import { prisma } from "../db/prisma";
import type { TaskType } from "../llm/modelRouter";
import {
  buildPromptAssetKey,
  type PromptAsset,
  type PromptContextBlock,
  type PromptContextRequirement,
  type PromptRunTrace,
} from "./core/promptTypes";
import { createContextBlock } from "./core/contextBudget";
import { preparePromptExecution } from "./core/promptRunner";
import { ContextBroker } from "./context/ContextBroker";
import { createDefaultContextResolverRegistry } from "./context/defaultContextRegistry";
import { derivePromptContextRequirements } from "./context/promptContextResolution";
import type { PromptExecutionContext } from "./context/types";
import { getRegisteredPromptAsset, listRegisteredPromptAssets } from "./registry";
import { getPromptCatalogDescription } from "./addendums/PromptAddendumService";
import { CUSTOM_SLOT_CONTEXT_GROUP, resolvePromptOverlays } from "./slots/slotResolution";
import { promptSlotOverrideService } from "./slots/PromptSlotOverrideService";
import type { PromptSlotDef } from "./slots/slotTypes";

type UnknownPromptAsset = PromptAsset<unknown, unknown, unknown>;
type PromptWorkbenchDb = Pick<typeof prisma, "novel" | "chapter">;

export interface PromptCatalogItem {
  key: string;
  id: string;
  version: string;
  taskType: TaskType;
  mode: string;
  language: string;
  family: string;
  description: string;
  outputType: "structured" | "text";
  contextPolicy: UnknownPromptAsset["contextPolicy"];
  contextRequirements: PromptContextRequirement[];
  slots: PromptSlotDef[];
  slotSupported: boolean;
  lockedFields: string[];
  managementStatus: "complete" | "missing_context_requirements" | "missing_slots";
  capabilities: {
    hasOutputSchema: boolean;
    hasPostValidate: boolean;
    hasSemanticRetryPolicy: boolean;
    hasRepairPolicy: boolean;
    hasStructuredOutputHint: boolean;
  };
}

export interface PromptCatalogFilter {
  taskType?: TaskType;
  mode?: "structured" | "text";
  keyword?: string;
}

export interface PromptPreviewInput {
  promptKey?: string;
  id?: string;
  version?: string;
  promptInput?: unknown;
  executionContext: PromptExecutionContext;
  contextRequirements?: PromptContextRequirement[];
  maxContextTokens?: number;
  contextMode?: "snapshot" | "fresh" | "hybrid";
  slotOverrides?: Record<string, unknown>;
}

export interface PromptPreviewMessage {
  role: string;
  content: string;
}

export interface PromptPreviewResult {
  prompt: PromptCatalogItem;
  messages: PromptPreviewMessage[];
  context: ReturnType<typeof serializePromptContext>;
  brokerResolution: Awaited<ReturnType<ContextBroker["resolve"]>>;
  diagnostics: {
    entrypoint: string;
    missingRequiredGroups: string[];
    resolverErrors: Awaited<ReturnType<ContextBroker["resolve"]>>["resolverErrors"];
    tracePreview: PromptRunTrace;
    notes: string[];
  };
}

const LOCKED_PROMPT_FIELDS = [
  "outputSchema",
  "postValidate",
  "postValidateFailureRecovery",
  "semanticRetryPolicy",
  "taskType",
  "mode",
  "contextPolicy",
  "toolCatalog",
  "approvalBoundary",
];

function toCatalogItem(asset: UnknownPromptAsset): PromptCatalogItem {
  const contextRequirements = derivePromptContextRequirements(asset);
  const slots: PromptSlotDef[] = asset.slots ?? [];
  const slotSupported = slots.length > 0;
  const managementStatus: PromptCatalogItem["managementStatus"] = contextRequirements.length === 0
    ? "missing_context_requirements"
    : !slotSupported
      ? "missing_slots"
      : "complete";
  return {
    key: buildPromptAssetKey(asset),
    id: asset.id,
    version: asset.version,
    taskType: asset.taskType,
    mode: asset.mode,
    language: asset.language,
    family: asset.id.split(".")[0] ?? asset.id,
    description: getPromptCatalogDescription(asset.id, asset.taskType),
    outputType: asset.mode === "structured" ? "structured" : "text",
    contextPolicy: asset.contextPolicy,
    contextRequirements,
    slots,
    slotSupported,
    lockedFields: LOCKED_PROMPT_FIELDS,
    managementStatus,
    capabilities: {
      hasOutputSchema: Boolean(asset.outputSchema),
      hasPostValidate: Boolean(asset.postValidate),
      hasSemanticRetryPolicy: Boolean(asset.semanticRetryPolicy),
      hasRepairPolicy: Boolean(asset.repairPolicy),
      hasStructuredOutputHint: Boolean(asset.structuredOutputHint),
    },
  };
}

function buildPromptTracePreview(input: {
  asset: UnknownPromptAsset;
  prepared: ReturnType<typeof preparePromptExecution>;
  options: Pick<PromptPreviewInput, "executionContext">;
}): PromptRunTrace {
  return {
    promptId: input.asset.id,
    promptVersion: input.asset.version,
    taskType: input.asset.taskType,
    contextBlockIds: input.prepared.context.selectedBlockIds,
    droppedContextBlockIds: input.prepared.context.droppedBlockIds,
    summarizedContextBlockIds: input.prepared.context.summarizedBlockIds,
    customAddendumBlockIds: input.prepared.context.selectedBlockIds.filter((id) => id.startsWith(`${CUSTOM_SLOT_CONTEXT_GROUP}:`)),
    estimatedInputTokens: input.prepared.context.estimatedInputTokens,
    repairUsed: false,
    repairAttempts: 0,
    semanticRetryUsed: false,
    semanticRetryAttempts: 0,
    entrypoint: input.options.executionContext.entrypoint,
    novelId: input.options.executionContext.novelId,
    chapterId: input.options.executionContext.chapterId,
    taskId: input.options.executionContext.taskId,
  };
}

function buildPreviewNotes(input: {
  prompt: PromptCatalogItem;
  brokerResolution: Awaited<ReturnType<ContextBroker["resolve"]>>;
  extraNotes?: string[];
}): string[] {
  const notes: string[] = [...(input.extraNotes ?? [])];
  if (!input.prompt.slotSupported) {
    notes.push("该提示词没有声明可编辑槽位，不能保存槽位覆盖。");
  }
  if (input.brokerResolution.missingRequiredGroups.length > 0) {
    notes.push(`缺少必需上下文组：${input.brokerResolution.missingRequiredGroups.join("、")}。`);
  }
  if (input.brokerResolution.resolverErrors.length > 0) {
    notes.push("部分上下文解析器返回错误。");
  }
  if (input.prompt.contextRequirements.length === 0) {
    notes.push("该提示词没有声明上下文需求。");
  }
  return notes;
}

function isAuditPreviewPrompt(asset: UnknownPromptAsset): boolean {
  return asset.id === "audit.chapter.full" || asset.id === "audit.chapter.light";
}

function compactPreviewText(value: string | null | undefined): string {
  return value?.replace(/\s+/g, " ").trim() ?? "";
}

function truncatePreviewText(value: string | null | undefined, maxChars: number): string {
  const text = value?.trim() ?? "";
  if (text.length <= maxChars) {
    return text;
  }
  return `${text.slice(0, Math.max(0, maxChars - 16)).trimEnd()}\n...[已裁剪]`;
}

function previewListBlock(title: string, values: Array<string | null | undefined>, emptyLabel = "none"): string {
  const items = [...new Set(values.map((item) => compactPreviewText(item)).filter(Boolean))];
  if (items.length === 0) {
    return `${title}: ${emptyLabel}`;
  }
  return [title, ...items.map((item) => `- ${item}`)].join("\n");
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function parseSceneCards(value: string | null | undefined): Record<string, unknown>[] {
  if (!value?.trim()) {
    return [];
  }
  try {
    const parsed = JSON.parse(value);
    const scenes = asRecord(parsed)?.scenes;
    return Array.isArray(scenes)
      ? scenes.map(asRecord).filter((scene): scene is Record<string, unknown> => Boolean(scene))
      : [];
  } catch {
    return [];
  }
}

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function readStringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => readString(item)).filter(Boolean)
    : [];
}

function buildChapterPreviewBlocks(input: {
  novel: {
    id: string;
    title: string;
    description: string | null;
    targetAudience: string | null;
    bookSellingPoint: string | null;
    first30ChapterPromise: string | null;
  };
  chapter: {
    id: string;
    title: string;
    order: number;
    content: string | null;
    expectation: string | null;
    targetWordCount: number | null;
    mustAvoid: string | null;
    taskSheet: string | null;
    sceneCards: string | null;
    hook: string | null;
  };
}): PromptContextBlock[] {
  const { chapter, novel } = input;
  const scenes = parseSceneCards(chapter.sceneCards);
  const firstScene = scenes[0] ?? null;
  const lastScene = scenes[scenes.length - 1] ?? null;
  const mustAdvance = scenes.flatMap((scene) => readStringList(scene.mustAdvance)).slice(0, 8);
  const mustPreserve = scenes.flatMap((scene) => readStringList(scene.mustPreserve)).slice(0, 8);
  const forbiddenExpansion = scenes.flatMap((scene) => readStringList(scene.forbiddenExpansion)).slice(0, 8);
  const chapterLabel = `第 ${chapter.order} 章《${chapter.title || "未命名章节"}》`;

  return [
    createContextBlock({
      id: "chapter_mission",
      group: "chapter_mission",
      priority: 100,
      content: [
        `Chapter mission: ${chapterLabel}`,
        chapter.expectation ? `Objective: ${chapter.expectation}` : "",
        chapter.targetWordCount ? `Target length: around ${chapter.targetWordCount} Chinese characters.` : "",
        previewListBlock("Must advance", mustAdvance.length > 0 ? mustAdvance : [chapter.expectation]),
        previewListBlock("Must preserve", mustPreserve),
        chapter.taskSheet ? `Original task sheet:\n${truncatePreviewText(chapter.taskSheet, 2200)}` : "",
        chapter.hook ? `Ending hook: ${chapter.hook}` : "",
      ].filter(Boolean).join("\n"),
    }),
    createContextBlock({
      id: "chapter_boundary",
      group: "chapter_boundary",
      priority: 99,
      required: true,
      allowSummary: false,
      content: [
        "Chapter boundary:",
        chapter.expectation ? `Exclusive event: ${chapter.expectation}` : `Exclusive event: ${chapterLabel}`,
        firstScene ? `Entry state: ${readString(firstScene.entryState) || "未提供场景入口状态"}` : "",
        lastScene ? `Ending state: ${readString(lastScene.exitState) || compactPreviewText(chapter.hook) || "未提供场景结束状态"}` : "",
        chapter.hook ? `Next chapter entry state: ${chapter.hook}` : "",
        previewListBlock("Do not cross", [
          chapter.mustAvoid,
          ...forbiddenExpansion,
          chapter.hook ? `不得直接展开钩子之后的后续事件：${chapter.hook}` : "",
        ]),
        previewListBlock("Protected reveals", []),
      ].filter(Boolean).join("\n"),
    }),
    createContextBlock({
      id: "structure_obligations",
      group: "structure_obligations",
      priority: 94,
      required: true,
      content: [
        "Structure obligations",
        ...[
          chapter.expectation ? `- chapter objective: ${chapter.expectation}` : "",
          ...mustAdvance.map((item) => `- must advance: ${item}`),
          ...mustPreserve.map((item) => `- must preserve: ${item}`),
          chapter.hook ? `- hook target: ${chapter.hook}` : "",
          chapter.mustAvoid ? `- boundary do-not-cross: ${chapter.mustAvoid}` : "",
        ].filter(Boolean),
      ].join("\n"),
    }),
    createContextBlock({
      id: "local_state",
      group: "local_state",
      priority: 89,
      content: [
        "Local state before review:",
        `Novel: ${novel.title}`,
        `Chapter: ${chapterLabel}`,
        chapter.content?.trim()
          ? `Current draft excerpt:\n${truncatePreviewText(chapter.content, 1800)}`
          : "Current draft excerpt: 当前章节暂无正文，预览只能使用章节任务和任务单进行上下文展示。",
      ].join("\n"),
    }),
    createContextBlock({
      id: "world_rules",
      group: "world_rules",
      priority: 84,
      content: [
        "Relevant book rules:",
        novel.description ? `简介：${truncatePreviewText(novel.description, 600)}` : "",
        novel.targetAudience ? `目标读者：${novel.targetAudience}` : "",
        novel.bookSellingPoint ? `核心卖点：${novel.bookSellingPoint}` : "",
        novel.first30ChapterPromise ? `前 30 章承诺：${novel.first30ChapterPromise}` : "",
      ].filter(Boolean).join("\n"),
    }),
  ].filter((block) => block.content.trim().length > 0);
}

function hasExtraContextBlocks(context: PromptExecutionContext): boolean {
  return Array.isArray(asRecord(context.metadata)?.extraContextBlocks);
}

function matchesCatalogFilter(item: PromptCatalogItem, filter?: PromptCatalogFilter): boolean {
  if (filter?.taskType && item.taskType !== filter.taskType) {
    return false;
  }
  if (filter?.mode && item.mode !== filter.mode) {
    return false;
  }
  const keyword = filter?.keyword?.trim().toLowerCase();
  if (!keyword) {
    return true;
  }
  return [
    item.key,
    item.id,
    item.description,
    item.version,
    item.taskType,
    item.mode,
    item.language,
    item.contextRequirements.map((requirement) => requirement.group).join(" "),
    item.slots.map((slot) => `${slot.key} ${slot.label}`).join(" "),
  ].some((value) => value.toLowerCase().includes(keyword));
}

function sortCatalogItems(left: PromptCatalogItem, right: PromptCatalogItem): number {
  if (left.slotSupported !== right.slotSupported) {
    return left.slotSupported ? -1 : 1;
  }
  return left.key.localeCompare(right.key);
}

function getAssetFromPreviewInput(input: PromptPreviewInput): UnknownPromptAsset {
  if (input.promptKey) {
    const separatorIndex = input.promptKey.lastIndexOf("@");
    if (separatorIndex <= 0 || separatorIndex === input.promptKey.length - 1) {
      throw new Error("promptKey must use the format id@version.");
    }
    const id = input.promptKey.slice(0, separatorIndex);
    const version = input.promptKey.slice(separatorIndex + 1);
    const asset = getRegisteredPromptAsset(id, version);
    if (!asset) {
      throw new Error(`Prompt asset not found: ${input.promptKey}`);
    }
    return asset;
  }

  if (!input.id || !input.version) {
    throw new Error("Provide promptKey or both id and version.");
  }

  const asset = getRegisteredPromptAsset(input.id, input.version);
  if (!asset) {
    throw new Error(`Prompt asset not found: ${input.id}@${input.version}`);
  }
  return asset;
}

function messageContentToString(content: BaseMessage["content"]): string {
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    return content.map((item) => {
      if (typeof item === "string") {
        return item;
      }
      if (item && typeof item === "object" && "text" in item && typeof item.text === "string") {
        return item.text;
      }
      return JSON.stringify(item);
    }).join("\n");
  }
  return JSON.stringify(content);
}

function messageRole(message: BaseMessage): string {
  const candidate = message as BaseMessage & {
    _getType?: () => string;
    getType?: () => string;
  };
  if (typeof candidate._getType === "function") {
    return candidate._getType();
  }
  if (typeof candidate.getType === "function") {
    return candidate.getType();
  }
  return message.constructor.name;
}

function serializeMessages(messages: BaseMessage[]): PromptPreviewMessage[] {
  return messages.map((message) => ({
    role: messageRole(message),
    content: messageContentToString(message.content),
  }));
}

function serializePromptContext(context: ReturnType<typeof preparePromptExecution>["context"]) {
  return {
    blocks: context.blocks,
    selectedBlockIds: context.selectedBlockIds,
    droppedBlockIds: context.droppedBlockIds,
    summarizedBlockIds: context.summarizedBlockIds,
    estimatedInputTokens: context.estimatedInputTokens,
  };
}

function formatPreviewRenderError(error: unknown, asset: UnknownPromptAsset): Error {
  const message = error instanceof Error ? error.message : String(error);
  return new Error(`提示词预览渲染失败（${asset.id}@${asset.version}）：${message}`);
}

export class PromptWorkbenchService {
  private readonly contextBroker = new ContextBroker(createDefaultContextResolverRegistry());

  constructor(private readonly db: PromptWorkbenchDb = prisma) {}

  listCatalog(filter?: PromptCatalogFilter): PromptCatalogItem[] {
    return listRegisteredPromptAssets()
      .map(toCatalogItem)
      .filter((item) => matchesCatalogFilter(item, filter))
      .sort(sortCatalogItems);
  }

  private async preparePreviewExecutionContext(input: {
    asset: UnknownPromptAsset;
    executionContext: PromptExecutionContext;
  }): Promise<{
    executionContext: PromptExecutionContext;
    notes: string[];
  }> {
    const { asset, executionContext } = input;
    if (!isAuditPreviewPrompt(asset) || hasExtraContextBlocks(executionContext)) {
      return { executionContext, notes: [] };
    }

    const novelId = executionContext.novelId?.trim();
    const chapterId = executionContext.chapterId?.trim();
    if (!novelId || !chapterId) {
      return { executionContext, notes: [] };
    }

    const [novel, chapter] = await Promise.all([
      this.db.novel.findUnique({
        where: { id: novelId },
        select: {
          id: true,
          title: true,
          description: true,
          targetAudience: true,
          bookSellingPoint: true,
          first30ChapterPromise: true,
        },
      }),
      this.db.chapter.findFirst({
        where: { id: chapterId, novelId },
        select: {
          id: true,
          title: true,
          order: true,
          content: true,
          expectation: true,
          targetWordCount: true,
          mustAvoid: true,
          taskSheet: true,
          sceneCards: true,
          hook: true,
        },
      }),
    ]);

    if (!novel || !chapter) {
      return {
        executionContext,
        notes: ["未找到所选小说或章节，已按普通手动预览处理。"],
      };
    }

    const extraContextBlocks = buildChapterPreviewBlocks({ novel, chapter });
    return {
      executionContext: {
        ...executionContext,
        metadata: {
          ...(executionContext.metadata ?? {}),
          extraContextBlocks,
        },
      },
      notes: [
        `已使用《${novel.title}》第 ${chapter.order} 章《${chapter.title || "未命名章节"}》组装本书预览上下文。`,
        chapter.content?.trim() ? "" : "所选章节暂无正文，审校预览会使用章节任务和任务单展示上下文。",
      ].filter(Boolean),
    };
  }

  async preview(input: PromptPreviewInput): Promise<PromptPreviewResult> {
    const asset = getAssetFromPreviewInput(input);
    const prompt = toCatalogItem(asset);
    const previewContext = await this.preparePreviewExecutionContext({
      asset,
      executionContext: input.executionContext,
    });
    const contextRequirements = input.contextRequirements ?? prompt.contextRequirements;
    const brokerResolution = await this.contextBroker.resolve({
      executionContext: previewContext.executionContext,
      requirements: contextRequirements,
      maxTokensBudget: input.maxContextTokens ?? asset.contextPolicy.maxTokensBudget,
      mode: input.contextMode,
    });

    // Resolve slot overlays: merge DB-saved overrides with any draft slotOverrides from the caller
    let resolvedSlots: import("./slots/slotTypes").ResolvedSlots | undefined;
    let appendBlocks: import("./core/promptTypes").PromptContextBlock[] = [];
    const slotDefs: PromptSlotDef[] = asset.slots ?? [];
    if (slotDefs.length > 0) {
      const maps = await promptSlotOverrideService.getOverrideMaps({
        promptId: asset.id,
        novelId: previewContext.executionContext.novelId,
      });

      // Draft overrides take priority over saved global overrides (per-slot, novel scope)
      const draftNovelOverrides: import("./slots/slotTypes").PromptSlotOverrideMap = { ...maps.novel };
      if (input.slotOverrides) {
        for (const [key, value] of Object.entries(input.slotOverrides)) {
          const def = slotDefs.find((d) => d.key === key);
          if (!def) continue;
          const hash = (await import("./slots/slotResolution")).hashSlotDefault(
            def.kind === "toggle" ? def.default : def.default,
          );
          draftNovelOverrides[key] = { value: value as string | boolean, baseHash: hash };
        }
      }

      const overlays = resolvePromptOverlays({
        slotDefs,
        globalOverrides: maps.global,
        novelOverrides: draftNovelOverrides,
      });
      resolvedSlots = overlays.inlineSlots;
      appendBlocks = overlays.appendBlocks;
    }

    const allBlocks = appendBlocks.length > 0
      ? [...brokerResolution.blocks, ...appendBlocks]
      : brokerResolution.blocks;

    let prepared: ReturnType<typeof preparePromptExecution>;
    try {
      prepared = preparePromptExecution({
        asset,
        promptInput: input.promptInput,
        contextBlocks: allBlocks,
          resolvedSlots,
        options: {
          entrypoint: previewContext.executionContext.entrypoint,
          novelId: previewContext.executionContext.novelId,
          chapterId: previewContext.executionContext.chapterId,
          taskId: previewContext.executionContext.taskId,
        },
      });
    } catch (error) {
      throw formatPreviewRenderError(error, asset);
    }

    return {
      prompt,
      messages: serializeMessages(prepared.messages),
      context: serializePromptContext(prepared.context),
      brokerResolution,
      diagnostics: {
        entrypoint: previewContext.executionContext.entrypoint,
        missingRequiredGroups: brokerResolution.missingRequiredGroups,
        resolverErrors: brokerResolution.resolverErrors,
        tracePreview: buildPromptTracePreview({
          asset,
          prepared,
          options: {
            ...input,
            executionContext: previewContext.executionContext,
          },
        }),
        notes: buildPreviewNotes({
          prompt,
          brokerResolution,
          extraNotes: previewContext.notes,
        }),
      },
    };
  }
}

export const promptWorkbenchService = new PromptWorkbenchService();
