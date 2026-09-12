import { createHash } from "node:crypto";
import { resolveLLMClientOptions } from "../../../../llm/factory";
import { preparePromptExecution } from "../../../../prompting/core/promptRunner";
import { resolvePromptContextBlocksForAsset } from "../../../../prompting/context/promptContextResolution";
import { buildChapterReviewContextBlocks } from "../../../../prompting/prompts/novel/chapterLayeredContext";
import { chapterAcceptanceAssessmentPrompt } from "../../../../prompting/prompts/novel/chapterAcceptance.prompts";
import { promptSlotOverrideService } from "../../../../prompting/slots/PromptSlotOverrideService";
import { resolveAdvancedPromptMessages } from "../../../../prompting/templates/templateRuntime";
import type { ChapterAcceptanceAssessmentInput } from "../ChapterAcceptanceAssessmentService";

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => [key, canonicalize(item)]));
  }
  return value;
}

// Hash only effective input; timestamps on the surrounding runtime package are not inputs.
export async function buildAcceptanceCacheIdentity(input: ChapterAcceptanceAssessmentInput): Promise<string> {
  const asset = chapterAcceptanceAssessmentPrompt;
  const context = await resolvePromptContextBlocksForAsset({
    asset,
    executionContext: {
      entrypoint: "chapter_pipeline", novelId: input.novelId, chapterId: input.chapterId,
      metadata: { chapterReviewContext: input.contextPackage.chapterReviewContext },
    },
    fallbackBlocks: input.contextPackage.chapterReviewContext
      ? buildChapterReviewContextBlocks(input.contextPackage.chapterReviewContext) : [],
  });
  const overlays = asset.slots?.length
    ? await promptSlotOverrideService.resolveForRuntime({ promptId: asset.id, novelId: input.novelId })
    : null;
  const promptInput = {
    novelTitle: input.novelTitle, chapterTitle: input.chapterTitle, chapterOrder: input.chapterOrder,
    targetWordCount: input.targetWordCount ?? null, content: input.content,
  };
  const prepared = preparePromptExecution({
    asset, promptInput, contextBlocks: [...context.blocks, ...(overlays?.appendBlocks ?? [])],
    resolvedSlots: overlays?.inlineSlots,
  });
  const messages = await resolveAdvancedPromptMessages({
    asset, promptInput, context: prepared.context, officialMessages: prepared.messages, novelId: input.novelId,
  });
  const resolved = await resolveLLMClientOptions(input.provider, {
    model: input.model, temperature: Math.min(input.temperature ?? 0.2, 0.35),
    maxTokens: 3200, taskType: asset.taskType, executionMode: "structured",
  });
  const identity = {
    version: 2, promptId: asset.id, promptVersion: asset.version,
    messages: messages.map((message) => ({ role: message.getType(), content: message.content })),
    model: {
      provider: resolved.provider, model: resolved.model, baseURL: resolved.baseURL,
      temperature: resolved.temperature, maxTokens: resolved.maxTokens,
      reasoningEnabled: resolved.reasoningEnabled, reasoningEffort: resolved.reasoningEffort,
      requestProtocol: resolved.requestProtocol, structuredStrategy: resolved.structuredStrategy,
      structuredProfile: resolved.structuredProfile,
      modelKwargs: resolved.modelKwargs,
    },
  };
  return createHash("sha256").update(JSON.stringify(canonicalize(identity))).digest("hex");
}
