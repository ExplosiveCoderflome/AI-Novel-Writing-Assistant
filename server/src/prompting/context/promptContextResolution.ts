import type {
  PromptAsset,
  PromptContextBlock,
  PromptContextFreshnessMode,
  PromptContextRequirement,
} from "../core/promptTypes";
import { ContextBroker } from "./ContextBroker";
import { createDefaultContextResolverRegistry } from "./defaultContextRegistry";
import type { ContextBrokerResolution, PromptExecutionContext } from "./types";

export function derivePromptContextRequirements(
  asset: Pick<PromptAsset<unknown, unknown, unknown>, "contextPolicy" | "contextRequirements">,
): PromptContextRequirement[] {
  if (asset.contextRequirements && asset.contextRequirements.length > 0) {
    return asset.contextRequirements;
  }

  const required = (asset.contextPolicy.requiredGroups ?? []).map((group, index) => ({
    group,
    required: true,
    priority: 100 - index,
    sourceHint: "asset.contextPolicy.requiredGroups",
  } satisfies PromptContextRequirement));
  const preferred = (asset.contextPolicy.preferredGroups ?? []).map((group, index) => ({
    group,
    required: false,
    priority: 50 - index,
    sourceHint: "asset.contextPolicy.preferredGroups",
  } satisfies PromptContextRequirement));
  return [...required, ...preferred];
}

let defaultPromptContextBroker: ContextBroker | null = null;

function getDefaultPromptContextBroker(): ContextBroker {
  defaultPromptContextBroker ??= new ContextBroker(createDefaultContextResolverRegistry());
  return defaultPromptContextBroker;
}

function mergeContextBlocks(input: {
  fallbackBlocks?: PromptContextBlock[];
  brokerBlocks: PromptContextBlock[];
}): PromptContextBlock[] {
  const byId = new Map<string, PromptContextBlock>();
  for (const block of input.fallbackBlocks ?? []) {
    byId.set(block.id, block);
  }
  for (const block of input.brokerBlocks) {
    byId.set(block.id, block);
  }
  return [...byId.values()].sort((left, right) => right.priority - left.priority);
}

export async function resolvePromptContextBlocksForAsset<I, O, R = O>(input: {
  asset: PromptAsset<I, O, R>;
  executionContext: PromptExecutionContext;
  fallbackBlocks?: PromptContextBlock[];
  requirements?: PromptContextRequirement[];
  mode?: PromptContextFreshnessMode;
  maxTokensBudget?: number;
  broker?: ContextBroker;
}): Promise<{
  blocks: PromptContextBlock[];
  brokerResolution: ContextBrokerResolution;
}> {
  const broker = input.broker ?? getDefaultPromptContextBroker();
  const brokerResolution = await broker.resolve({
    executionContext: input.executionContext,
    requirements: input.requirements
      ?? derivePromptContextRequirements(input.asset as unknown as PromptAsset<unknown, unknown, unknown>),
    mode: input.mode,
    maxTokensBudget: input.maxTokensBudget ?? input.asset.contextPolicy.maxTokensBudget,
  });

  return {
    blocks: mergeContextBlocks({
      fallbackBlocks: input.fallbackBlocks,
      brokerBlocks: brokerResolution.blocks,
    }),
    brokerResolution,
  };
}
