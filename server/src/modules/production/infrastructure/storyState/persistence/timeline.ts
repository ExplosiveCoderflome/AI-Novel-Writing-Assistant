import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import type { TimelineContextForChapter } from "@ai-novel/shared/types/timeline";
import type { StoryTimelineService, TimelineRepository } from "../../../../timeline";
import { InvalidProductionRequestError } from "../../../application";
import type { ArtifactConsumerPort } from "../consumerPorts";
import type { PrismaArtifactCheckpointStore } from "../checkpointStore";
import { timelineArtifactOutputSchema } from "../timeline";
import { requireConsumerClaim } from "./ownership";
import { wire } from "./types";

export interface TimelineConsumerDependencies {
  checkpoints: Pick<PrismaArtifactCheckpointStore, "applyConsumer">;
  /** Construct the existing timeline repository/service with tx, never their global singletons. */
  forTransaction(tx: Prisma.TransactionClient): {
    repository: Pick<TimelineRepository, "upsertChapterTimeAnchor" | "expireOverdueImmediateHooks">;
    service: Pick<StoryTimelineService, "commitChapterTimeline" | "saveCheckReport">;
  };
}
export function createTimelineConsumer(deps: TimelineConsumerDependencies): ArtifactConsumerPort {
  return { async apply(input) {
    const claim = requireConsumerClaim("timeline_boundary", input);
    return deps.checkpoints.applyConsumer(claim, async tx => {
      const { context } = input; const { novelId, chapterId, order: chapterIndex } = context.run.progress.unit;
      const saved = timelineArtifactOutputSchema.parse(input.output);
      if (saved.contentHash !== context.contentHash) throw new InvalidProductionRequestError("Timeline result belongs to a different manuscript");
      const gate = saved.timelineGate; const timelineContext = gate.timelineContext as unknown as TimelineContextForChapter;
      const timeAnchor = gate.timeAnchor as { storyDayIndex?: number | null; label?: string | null } | undefined;
      const { service, repository } = deps.forTransaction(tx);
      await tx.storyTimelineEvent.updateMany({ where: { novelId, chapterId, source: "chapter_extraction", status: { not: "superseded" } }, data: { status: "superseded" } });
      await tx.timelineHook.updateMany({ where: { novelId, createdInChapterId: chapterId }, data: { status: "dropped" } });
      await tx.timelineHook.updateMany({ where: { novelId, resolvedInChapterId: chapterId, createdInChapterId: { not: chapterId }, status: { in: ["addressed", "resolved", "expired"] } },
        data: { status: "open", resolvedInChapterId: null, resolvedInChapterIndex: null } });
      await service.saveCheckReport({ novelId, chapterId, chapterIndex, result: gate.result });
      const syncMode = gate.result.status === "failed" ? "degraded" : "stable";
      const qualityDebt = Boolean(context.run.progress.debts?.length);
      if (syncMode === "stable") {
        await service.commitChapterTimeline({ novelId, chapterId, chapterIndex, timeAnchor, timelineContext,
          extractedEvents: gate.extractedEvents, extractedHooks: gate.extractedHooks, addressedHookIds: gate.addressedHookIds, resolvedHookIds: gate.resolvedHookIds });
      } else {
        await repository.upsertChapterTimeAnchor({ novelId, chapterId, chapterIndex,
          storyDayIndex: timelineContext.currentTime?.storyDayIndex ?? null, timeLabel: timelineContext.currentTime?.label?.trim() || `第 ${chapterIndex} 章`,
          startsAfterEventIds: timelineContext.previousEvents?.slice(-3).map(event => event.id) ?? [],
          plannedEventIds: timelineContext.plannedEventsThisChapter?.map(event => event.id) ?? [], endedWithEventIds: [],
          previousHookIds: timelineContext.openHooks?.map(hook => hook.id) ?? [], nextHookIds: [], forbiddenEventIds: timelineContext.forbiddenEvents?.map(event => event.id) ?? [] });
        if (qualityDebt) await repository.expireOverdueImmediateHooks({ novelId, chapterId, chapterIndex });
      }
      // Legacy readers hash trimmed text with SHA-1. The kernel receipt independently retains its SHA-256 identity.
      const contentHash = createHash("sha1").update(context.content.trim()).digest("hex");
      const result = { syncMode, contentHash, extractorSucceeded: true, eventCount: gate.extractedEvents.length, hookCount: gate.extractedHooks.length, checkpointWritten: true };
      const identity = { novelId, chapterId, contentHash, artifactType: "timeline_finalization", syncMode };
      const data = { status: "succeeded", sourceStage: "production_kernel", metadataJson: JSON.stringify({ ...result, qualityDebt, anchorFallbackUsed: !timeAnchor }) };
      await tx.chapterArtifactSyncCheckpoint.upsert({ where: { novelId_chapterId_contentHash_artifactType_syncMode: identity }, create: { ...identity, ...data }, update: data });
      return wire(result);
    });
  } };
}
