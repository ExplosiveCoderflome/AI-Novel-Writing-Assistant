import type { BaseMessage } from "@langchain/core/messages";
import { prisma } from "../db/prisma";
import type { TaskType } from "../llm/modelRouter";
import {
  buildPromptAssetKey,
  type PromptAsset,
  type PromptContextRequirement,
  type PromptRunTrace,
} from "./core/promptTypes";
import { preparePromptExecution } from "./core/promptRunner";
import { ContextBroker } from "./context/ContextBroker";
import { formatContextGroupLabel } from "./context/contextGroupLabels";
import { createDefaultContextResolverRegistry } from "./context/defaultContextRegistry";
import { derivePromptContextRequirements } from "./context/promptContextResolution";
import type { PromptExecutionContext } from "./context/types";
import { findRegisteredPromptAssetById, getRegisteredPromptAsset, listRegisteredPromptAssets } from "./registry";
import { getPromptCatalogDescription } from "./addendums/PromptAddendumService";
import { CUSTOM_SLOT_CONTEXT_GROUP, resolvePromptOverlays } from "./slots/slotResolution";
import { promptSlotOverrideService } from "./slots/PromptSlotOverrideService";
import type { PromptSlotDef } from "./slots/slotTypes";
import { compilePromptTemplate, hasBlockingPromptTemplateDiagnostics } from "./templates/templateCompiler";
import { promptTemplateOverrideService } from "./templates/PromptTemplateOverrideService";
import type {
  PromptTemplateDiagnostics,
  PromptTemplateJson,
  PromptTemplateReferenceCatalog,
  PromptTemplateReferenceItem,
} from "./templates/templateTypes";
import { ADVANCED_TEMPLATE_PROMPT_ID, WRITER_REQUIRED_CONTEXT_GROUPS } from "./templates/templateTypes";
import {
  prepareWorkbenchPreviewExecutionContext,
  type PromptWorkbenchPreviewDb,
} from "./workbench/previewContextBuilder";

type UnknownPromptAsset = PromptAsset<unknown, unknown, unknown>;
type PromptWorkbenchDb = PromptWorkbenchPreviewDb;

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
  templateDraft?: PromptTemplateJson;
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
    template?: {
      mode: "official" | "draft" | "custom";
      activeVersionNo?: number;
      diagnostics: PromptTemplateDiagnostics;
    };
  };
}

export interface PromptContextReferencesInput {
  promptId: string;
  novelId?: string;
  chapterId?: string;
  entrypoint?: string;
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
  const writerPromptId = ADVANCED_TEMPLATE_PROMPT_ID;
  const leftIsWriterPrompt = left.id === writerPromptId;
  const rightIsWriterPrompt = right.id === writerPromptId;
  if (leftIsWriterPrompt !== rightIsWriterPrompt) {
    return leftIsWriterPrompt ? -1 : 1;
  }
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

function buildPromptInputReferenceItems(): PromptTemplateReferenceItem[] {
  return [
    { key: "novelTitle", label: "小说标题", token: "{{input.novelTitle}}", group: "input" },
    { key: "chapterOrder", label: "章节序号", token: "{{input.chapterOrder}}", group: "input" },
    { key: "chapterTitle", label: "章节标题", token: "{{input.chapterTitle}}", group: "input" },
    { key: "mode", label: "写作模式", token: "{{input.mode}}", group: "input" },
    { key: "targetWordCount", label: "目标字数", token: "{{input.targetWordCount}}", group: "input" },
    { key: "minWordCount", label: "最小字数", token: "{{input.minWordCount}}", group: "input" },
    { key: "maxWordCount", label: "最大字数", token: "{{input.maxWordCount}}", group: "input" },
    { key: "missingWordGap", label: "补写缺口", token: "{{input.missingWordGap}}", group: "input" },
  ];
}

function buildSlotReferenceItems(slotDefs: PromptSlotDef[]): PromptTemplateReferenceItem[] {
  return slotDefs.map((slot) => ({
    key: slot.key,
    label: slot.label,
    description: slot.description,
    token: `{{slot.${slot.key}}}`,
    group: "slot",
  }));
}

function buildContextReferenceItems(input: {
  requirements: PromptContextRequirement[];
  blocks: Array<{ group: string }>;
}): PromptTemplateReferenceItem[] {
  const previewGroups = new Set(input.blocks.map((block) => block.group));
  const requiredGroups = new Set([
    ...input.requirements.filter((requirement) => requirement.required).map((requirement) => requirement.group),
    ...WRITER_REQUIRED_CONTEXT_GROUPS,
  ]);
  return input.requirements
    .map((requirement) => ({
      key: requirement.group,
      label: formatContextGroupLabel(requirement.group),
      description: requirement.sourceHint,
      token: `{{context.${requirement.group}}}`,
      required: requiredGroups.has(requirement.group),
      hasPreviewBlock: previewGroups.has(requirement.group),
      group: requiredGroups.has(requirement.group) ? "required_context" as const : "optional_context" as const,
    }))
    .sort((left, right) => {
      if (left.group !== right.group) {
        return left.group === "required_context" ? -1 : 1;
      }
      return left.key.localeCompare(right.key);
    });
}

async function resolvePreviewTemplate(input: {
  asset: UnknownPromptAsset;
  novelId?: string;
  templateDraft?: PromptTemplateJson;
}): Promise<{
  mode: "draft" | "custom";
  template: PromptTemplateJson;
  activeVersionNo?: number;
} | null> {
  if (input.asset.id !== ADVANCED_TEMPLATE_PROMPT_ID || !input.novelId) {
    return null;
  }
  if (input.templateDraft) {
    return {
      mode: "draft",
      template: input.templateDraft,
    };
  }
  const active = await promptTemplateOverrideService.getActiveCustomTemplate({
    promptId: input.asset.id,
    novelId: input.novelId,
  });
  if (!active) {
    return null;
  }
  return {
    mode: "custom",
    template: active.template,
    activeVersionNo: active.versionNo,
  };
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
    return prepareWorkbenchPreviewExecutionContext({
      db: this.db,
      asset: input.asset,
      executionContext: input.executionContext,
    });
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
    let previewMessages: BaseMessage[];
    let templateDiagnosticPayload: PromptPreviewResult["diagnostics"]["template"] | undefined;
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
      previewMessages = prepared.messages;

      const templateSource = await resolvePreviewTemplate({
        asset,
        novelId: previewContext.executionContext.novelId,
        templateDraft: input.templateDraft,
      });
      if (templateSource) {
        const compiled = compilePromptTemplate({
          template: templateSource.template,
          promptInput: input.promptInput,
          context: prepared.context,
          slotDefs,
          slots: resolvedSlots,
          allowedContextGroups: prompt.contextRequirements.map((requirement) => requirement.group),
          requiredContextGroups: [...WRITER_REQUIRED_CONTEXT_GROUPS],
        });
        if (hasBlockingPromptTemplateDiagnostics(compiled.diagnostics)) {
          const details = [
            compiled.diagnostics.invalidMessages.join("；"),
            compiled.diagnostics.unknownTokens.length > 0
              ? `未知 token：${compiled.diagnostics.unknownTokens.join("、")}`
              : "",
            compiled.diagnostics.missingRequiredGroups.length > 0
              ? `缺少必需上下文组：${compiled.diagnostics.missingRequiredGroups.join("、")}`
              : "",
          ].filter(Boolean).join("；");
          throw new Error(`高级模板预览失败：${details}`);
        }
        previewMessages = compiled.messages;
        templateDiagnosticPayload = {
          mode: templateSource.mode,
          activeVersionNo: templateSource.activeVersionNo,
          diagnostics: compiled.diagnostics,
        };
      }
    } catch (error) {
      throw formatPreviewRenderError(error, asset);
    }

    const missingRequiredGroups = [
      ...new Set([
        ...brokerResolution.missingRequiredGroups,
        ...(templateDiagnosticPayload?.diagnostics.missingRequiredGroups ?? []),
      ]),
    ];

    return {
      prompt,
      messages: serializeMessages(previewMessages),
      context: serializePromptContext(prepared.context),
      brokerResolution,
      diagnostics: {
        entrypoint: previewContext.executionContext.entrypoint,
        missingRequiredGroups,
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
          extraNotes: [
            ...previewContext.notes,
            ...(templateDiagnosticPayload?.diagnostics.fallbackRequiredGroups.length
              ? [`高级模板已自动追加必需上下文：${templateDiagnosticPayload.diagnostics.fallbackRequiredGroups.join("、")}。`]
              : []),
          ],
        }),
        template: templateDiagnosticPayload,
      },
    };
  }

  async contextReferences(input: PromptContextReferencesInput): Promise<PromptTemplateReferenceCatalog> {
    const asset = findRegisteredPromptAssetById(input.promptId);
    if (!asset) {
      throw new Error(`提示词未注册：${input.promptId}`);
    }
    if (asset.id !== ADVANCED_TEMPLATE_PROMPT_ID) {
      throw new Error("第一阶段仅支持正文写作提示词的上下文引用菜单。");
    }
    const prompt = toCatalogItem(asset);
    const previewContext = await this.preparePreviewExecutionContext({
      asset,
      executionContext: {
        entrypoint: input.entrypoint ?? "manual_test",
        novelId: input.novelId,
        chapterId: input.chapterId,
      },
    });
    const brokerResolution = await this.contextBroker.resolve({
      executionContext: previewContext.executionContext,
      requirements: prompt.contextRequirements,
      maxTokensBudget: asset.contextPolicy.maxTokensBudget,
    });
    return {
      promptId: asset.id,
      novelId: previewContext.executionContext.novelId,
      chapterId: previewContext.executionContext.chapterId,
      items: [
        ...buildContextReferenceItems({
          requirements: prompt.contextRequirements,
          blocks: brokerResolution.blocks,
        }),
        ...buildPromptInputReferenceItems(),
        ...buildSlotReferenceItems(asset.slots ?? []),
      ],
      missingRequiredGroups: brokerResolution.missingRequiredGroups,
    };
  }
}

export const promptWorkbenchService = new PromptWorkbenchService();
