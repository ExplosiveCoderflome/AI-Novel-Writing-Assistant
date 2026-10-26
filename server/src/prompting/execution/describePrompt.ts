import type { PromptAsset, PromptContextBlock, PromptExecutionOptions } from "../core/promptTypes";
import { preparePromptExecution, resolvePromptOverlaysForAsset } from "../core/promptRunner";
import { appendStructuredOutputHintMessages } from "../core/structuredOutputHint";
import { resolveAdvancedPromptMessages } from "../templates/templateRuntime";

/** Read-only effective rendering. Uses the same overlays, context selection, template and schema hints as execution. */
export async function prepareEffectivePromptExecution<I,O,R=O>(input: {
  asset: PromptAsset<I,O,R>; promptInput: I; contextBlocks?: PromptContextBlock[]; options?: PromptExecutionOptions;
}) {
  const overlays = await resolvePromptOverlaysForAsset({
    asset:input.asset as PromptAsset<unknown,unknown,unknown>,contextBlocks:input.contextBlocks,options:input.options,
  });
  const prepared = preparePromptExecution({...input,contextBlocks:overlays.blocks,resolvedSlots:overlays.resolvedSlots});
  const resolved = await resolveAdvancedPromptMessages({asset:input.asset,promptInput:input.promptInput,
    context:prepared.context,officialMessages:prepared.messages,novelId:input.options?.novelId});
  const messages = input.asset.mode === "structured" && resolved !== prepared.messages
    ? appendStructuredOutputHintMessages({asset:input.asset,promptInput:input.promptInput,context:prepared.context,
      messages:resolved,preserveMessageLayout:true}) : resolved;
  return {...prepared,messages};
}
