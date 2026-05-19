import type { TimelineIssueSeverity } from "@ai-novel/shared/types/timeline";

export interface TimelinePolicy {
  maxOpenCriticalHooks: number;
  maxChaptersBeforeHookExpires: number;
  allowTimeRegression: boolean;
  requireTimeAnchorEveryChapter: boolean;
  maxRepeatedEventSimilarity: number;
  requirePlannedEventCoverage: boolean;
  futureEventLeakSeverity: TimelineIssueSeverity;
}

export const defaultTimelinePolicy: TimelinePolicy = {
  maxOpenCriticalHooks: 3,
  maxChaptersBeforeHookExpires: 2,
  allowTimeRegression: false,
  requireTimeAnchorEveryChapter: true,
  maxRepeatedEventSimilarity: 0.82,
  requirePlannedEventCoverage: true,
  futureEventLeakSeverity: "blocking",
};

export const plotHeavyTimelinePolicy: TimelinePolicy = {
  ...defaultTimelinePolicy,
  maxChaptersBeforeHookExpires: 1,
  requirePlannedEventCoverage: true,
};

export const sliceOfLifeTimelinePolicy: TimelinePolicy = {
  ...defaultTimelinePolicy,
  maxChaptersBeforeHookExpires: 4,
  requirePlannedEventCoverage: false,
};
