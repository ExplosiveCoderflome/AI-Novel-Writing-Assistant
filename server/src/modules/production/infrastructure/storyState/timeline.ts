import { z } from "zod";
import { timelineCheckResultSchema, extractedTimelineEventSchema, timelineHookDraftSchema } from "@ai-novel/shared/types/timeline";
import type { LLMProvider } from "@ai-novel/shared/types/llm";
import type { TimelineExtractorService, TimelineExtractorServiceInput, TimelineCheckerService } from "../../../timeline";
import { canonicalProductionJson, checkContextBudget, cloneProductionData, type ProductionJson } from "../../common";
import { hashProductionContent, InvalidProductionRequestError, ProductionSnapshotConflictError } from "../../application";
import type { PreparedChapter } from "../stages";
import type { ArtifactPromptDescription } from "./extraction";
import type { ArtifactConsumerPort, ArtifactReconciliationPorts } from "./consumerPorts";

export const timelineArtifactOutputSchema = z.object({ contentHash: z.string(), timelineGate: z.object({
  result: timelineCheckResultSchema, extractedEvents: z.array(extractedTimelineEventSchema), extractedHooks: z.array(timelineHookDraftSchema),
  addressedHookIds: z.array(z.string()), resolvedHookIds: z.array(z.string()), extractorSucceeded: z.literal(true),
  timeAnchor: z.unknown().optional(), timelineContext: z.object({}).passthrough(),
}) });
const wire = (value: unknown): ProductionJson => JSON.parse(JSON.stringify(value));
export interface TimelineArtifactDependencies {
  extractor: Pick<TimelineExtractorService, "extractFromChapter" | "normalizeEvents" | "normalizeHooks">;
  checker: Pick<TimelineCheckerService, "checkChapter">;
  consumer: ArtifactConsumerPort;
  /** Describe the existing timeline extractor's actual registered prompt and complete input. */
  describePrompt(input: TimelineExtractorServiceInput): Promise<ArtifactPromptDescription>;
}
function fingerprint(request: TimelineExtractorServiceInput, description: ArtifactPromptDescription): string {
  return hashProductionContent(canonicalProductionJson(wire({ request, identity: description.identity, promptVersion: description.promptVersion,
    provider: description.provider, model: description.model, outputTokens: description.outputTokens,
    contextWindow: description.contextWindow, renderedHash: hashProductionContent(description.renderedInput) })));
}

/** The paid extraction is checkpointed separately; finalization always receives its saved gate and cannot re-extract. */
export function createTimelineArtifactPorts(deps: TimelineArtifactDependencies): NonNullable<ArtifactReconciliationPorts["timeline"]> {
  return {
    extraction: {
      async prepare(context) {
        const prepared = context.run.artifacts.prepared as unknown as PreparedChapter;
        const timelineContext = prepared?.contextPackage.timelineContext;
        if (!timelineContext) throw new InvalidProductionRequestError("Timeline context must be prepared before finalization");
        const request: TimelineExtractorServiceInput = {
          novelId: context.run.progress.unit.novelId, chapterId: context.run.progress.unit.chapterId,
          chapterIndex: context.run.progress.unit.order, novelTitle: prepared.novelTitle, chapterTitle: prepared.chapterTitle,
          chapterGoal: prepared.contextPackage.chapterWriteContext?.chapterMission.objective
            ?? prepared.contextPackage.chapter.expectation ?? "无明确章节目标",
          chapterContent: context.content, timelineContext,
          provider: context.run.snapshots.model.provider as LLMProvider, model: context.run.snapshots.model.model, temperature: 0.2,
        };
        const description = await deps.describePrompt(request);
        if (!checkContextBudget({ input: description.renderedInput, contextWindow: description.contextWindow,
          outputTokens: description.outputTokens, safetyTokens: 1024 }).ok) throw new InvalidProductionRequestError("完整时间线上下文超出有效模型预算。");
        return { inputFingerprint: fingerprint(request, description), outputTokens: description.outputTokens, input: wire(request) };
      },
      async invoke(context, prepared) {
        const request = cloneProductionData(prepared.input) as unknown as TimelineExtractorServiceInput;
        if (request.novelId !== context.run.progress.unit.novelId || request.chapterId !== context.run.progress.unit.chapterId
          || request.chapterContent !== context.content) throw new InvalidProductionRequestError("Timeline request identity differs");
        if (fingerprint(request, await deps.describePrompt(request)) !== prepared.inputFingerprint) throw new ProductionSnapshotConflictError();
        const extracted = await deps.extractor.extractFromChapter(request);
        const extractedEvents = deps.extractor.normalizeEvents(extracted);
        const extractedHooks = deps.extractor.normalizeHooks(extracted);
        const result = deps.checker.checkChapter({ novelId: request.novelId, chapterId: request.chapterId, chapterIndex: request.chapterIndex,
          extractedEvents, timelineContext: request.timelineContext, chapterContent: request.chapterContent });
        if (fingerprint(request, await deps.describePrompt(request)) !== prepared.inputFingerprint) throw new ProductionSnapshotConflictError();
        return wire(timelineArtifactOutputSchema.parse({ contentHash: context.contentHash, timelineGate: { result, extractedEvents, extractedHooks,
          addressedHookIds: extracted.addressedHookIds, resolvedHookIds: extracted.resolvedHookIds,
          timeAnchor: extracted.timeAnchor, extractorSucceeded: true, timelineContext: request.timelineContext } }));
      },
      validate: value => wire(timelineArtifactOutputSchema.parse(value)),
    },
    consumer: {
      apply: input => deps.consumer.apply(input),
    },
  };
}
