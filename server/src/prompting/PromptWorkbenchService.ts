import type { BaseMessage } from "@langchain/core/messages";
import type { TaskType } from "../llm/modelRouter";
import { buildPromptAssetKey, type PromptAsset, type PromptContextRequirement } from "./core/promptTypes";
import { preparePromptExecution } from "./core/promptRunner";
import { ContextBroker } from "./context/ContextBroker";
import { createDefaultContextResolverRegistry } from "./context/defaultContextRegistry";
import { derivePromptContextRequirements } from "./context/promptContextResolution";
import type { PromptExecutionContext } from "./context/types";
import { getRegisteredPromptAsset, listRegisteredPromptAssets } from "./registry";

type UnknownPromptAsset = PromptAsset<unknown, unknown, unknown>;

export interface PromptCatalogItem {
  key: string;
  id: string;
  version: string;
  taskType: TaskType;
  mode: string;
  language: string;
  contextPolicy: UnknownPromptAsset["contextPolicy"];
  contextRequirements: PromptContextRequirement[];
  editableSlots: NonNullable<UnknownPromptAsset["editableSlots"]>;
  overrideSupported: false;
  lockedFields: string[];
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
  return {
    key: buildPromptAssetKey(asset),
    id: asset.id,
    version: asset.version,
    taskType: asset.taskType,
    mode: asset.mode,
    language: asset.language,
    contextPolicy: asset.contextPolicy,
    contextRequirements: derivePromptContextRequirements(asset),
    editableSlots: asset.editableSlots ?? [],
    overrideSupported: false,
    lockedFields: LOCKED_PROMPT_FIELDS,
    capabilities: {
      hasOutputSchema: Boolean(asset.outputSchema),
      hasPostValidate: Boolean(asset.postValidate),
      hasSemanticRetryPolicy: Boolean(asset.semanticRetryPolicy),
      hasRepairPolicy: Boolean(asset.repairPolicy),
      hasStructuredOutputHint: Boolean(asset.structuredOutputHint),
    },
  };
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
    item.version,
    item.taskType,
    item.mode,
    item.language,
    item.contextRequirements.map((requirement) => requirement.group).join(" "),
    item.editableSlots.map((slot) => `${slot.key} ${slot.label}`).join(" "),
  ].some((value) => value.toLowerCase().includes(keyword));
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
      .sort((left, right) => left.key.localeCompare(right.key));
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
    const prepared = preparePromptExecution({
      asset,
      promptInput: input.promptInput,
      contextBlocks: brokerResolution.blocks,
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
    };
  }
}

export const promptWorkbenchService = new PromptWorkbenchService();
