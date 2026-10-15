import type {
  PromptAsset,
  PromptContextBlock,
  PromptContextFreshnessMode,
  PromptContextRequirement,
} from "../core/promptTypes";
import { ContextBroker } from "./ContextBroker";
import { createDefaultContextResolverRegistry } from "./defaultContextRegistry";
import type { ContextBrokerResolution, PromptExecutionContext } from "./types";

export { derivePromptContextRequirements } from "./promptContextRequirements";
import { derivePromptContextRequirements } from "./promptContextRequirements";

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
