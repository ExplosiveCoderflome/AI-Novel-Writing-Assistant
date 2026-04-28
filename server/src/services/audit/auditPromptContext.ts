import type { GenerationContextPackage } from "@ai-novel/shared/types/chapterRuntime";
import type { PromptAsset, PromptContextBlock } from "../../prompting/core/promptTypes";
import { resolvePromptContextBlocksForAsset } from "../../prompting/context/promptContextResolution";
import {
  type AuditChapterPromptInput,
} from "../../prompting/prompts/audit/audit.prompts";
import { buildChapterReviewContextBlocks } from "../../prompting/prompts/novel/chapterLayeredContext";

export async function resolveAuditChapterContextBlocks<O, R = O>(input: {
  asset: PromptAsset<AuditChapterPromptInput, O, R>;
  novelId: string;
  contextPackage?: GenerationContextPackage;
  ragContext: string;
}): Promise<PromptContextBlock[] | undefined> {
  const reviewContext = input.contextPackage?.chapterReviewContext;
  if (!reviewContext) {
    return undefined;
  }

  const fallbackContextBlocks = buildChapterReviewContextBlocks(reviewContext);
  const resolvedContext = await resolvePromptContextBlocksForAsset({
    asset: input.asset,
    executionContext: {
      entrypoint: "chapter_pipeline",
      novelId: input.novelId,
      chapterId: input.contextPackage?.chapter.id,
      metadata: {
        chapterReviewContext: reviewContext,
        ragContext: input.ragContext,
      },
    },
    fallbackBlocks: fallbackContextBlocks,
  });
  return resolvedContext.blocks;
}
