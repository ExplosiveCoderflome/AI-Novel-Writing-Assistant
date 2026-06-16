import type { BaseMessage } from "@langchain/core/messages";
import type { TaskType } from "../llm/modelRouter";
import {
  buildPromptAssetKey,
  type PromptAsset,
  type PromptContextRequirement,
  type PromptRunTrace,
} from "./core/promptTypes";
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
}): string[] {
  const notes: string[] = [];
  if (!input.prompt.slotSupported) {
    notes.push("This prompt has no declared slot definitions — slot overrides are unavailable.");
  }
  if (input.brokerResolution.missingRequiredGroups.length > 0) {
    notes.push(`Missing required context groups: ${input.brokerResolution.missingRequiredGroups.join(", ")}.`);
  }
  if (input.brokerResolution.resolverErrors.length > 0) {
    notes.push("One or more context resolvers returned errors.");
  }
  if (input.prompt.contextRequirements.length === 0) {
    notes.push("This prompt has no declared context requirements.");
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

export class PromptWorkbenchService {
  private readonly contextBroker = new ContextBroker(createDefaultContextResolverRegistry());

  listCatalog(filter?: PromptCatalogFilter): PromptCatalogItem[] {
    return listRegisteredPromptAssets()
      .map(toCatalogItem)
      .filter((item) => matchesCatalogFilter(item, filter))
      .sort(sortCatalogItems);
  }

  async preview(input: PromptPreviewInput): Promise<PromptPreviewResult> {
    const asset = getAssetFromPreviewInput(input);
    const prompt = toCatalogItem(asset);
    const contextRequirements = input.contextRequirements ?? prompt.contextRequirements;
    const brokerResolution = await this.contextBroker.resolve({
      executionContext: input.executionContext,
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
        novelId: input.executionContext.novelId,
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

    const prepared = preparePromptExecution({
      asset,
      promptInput: input.promptInput,
      contextBlocks: allBlocks,
      resolvedSlots,
      options: {
        entrypoint: input.executionContext.entrypoint,
        novelId: input.executionContext.novelId,
        chapterId: input.executionContext.chapterId,
        taskId: input.executionContext.taskId,
      },
    });

    return {
      prompt,
      messages: serializeMessages(prepared.messages),
      context: serializePromptContext(prepared.context),
      brokerResolution,
      diagnostics: {
        entrypoint: input.executionContext.entrypoint,
        missingRequiredGroups: brokerResolution.missingRequiredGroups,
        resolverErrors: brokerResolution.resolverErrors,
        tracePreview: buildPromptTracePreview({ asset, prepared, options: input }),
        notes: buildPreviewNotes({ prompt, brokerResolution }),
      },
    };
  }
}

export const promptWorkbenchService = new PromptWorkbenchService();
