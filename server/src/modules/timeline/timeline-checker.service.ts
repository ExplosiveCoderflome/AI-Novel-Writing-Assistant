import type {
  ExtractedTimelineEvent,
  TimelineCheckResult,
  TimelineContextForChapter,
  TimelineIssue,
  TimelineIssueSeverity,
} from "@ai-novel/shared/types/timeline";
import { defaultTimelinePolicy, type TimelinePolicy } from "./timeline-policy";

function normalize(value: string | null | undefined): string {
  return (value ?? "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "")
    .trim();
}

function compact(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function containsText(haystack: string, needle: string): boolean {
  const normalizedHaystack = normalize(haystack);
  const normalizedNeedle = normalize(needle);
  return normalizedNeedle.length >= 4 && normalizedHaystack.includes(normalizedNeedle);
}

function tokenSet(value: string): Set<string> {
  const normalized = value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
  return new Set(normalized.split(/\s+/g).filter((item) => item.length >= 2));
}

function similarity(left: string, right: string): number {
  const a = tokenSet(left);
  const b = tokenSet(right);
  if (a.size === 0 || b.size === 0) {
    return containsText(left, right) || containsText(right, left) ? 1 : 0;
  }
  const intersection = Array.from(a).filter((item) => b.has(item)).length;
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 0 : intersection / union;
}

function eventText(event: ExtractedTimelineEvent): string {
  return `${event.title}\n${event.summary}`;
}

function buildResult(issues: TimelineIssue[]): TimelineCheckResult {
  const hasBlocking = issues.some((issue) => issue.severity === "blocking");
  const hasError = issues.some((issue) => issue.severity === "error");
  const hasWarning = issues.some((issue) => issue.severity === "warning");
  const penalty = issues.reduce((sum, issue) => {
    if (issue.severity === "blocking") return sum + 0.35;
    if (issue.severity === "error") return sum + 0.22;
    if (issue.severity === "warning") return sum + 0.12;
    return sum + 0.04;
  }, 0);
  return {
    status: hasBlocking || hasError ? "failed" : hasWarning ? "warning" : "passed",
    score: Math.max(0, Math.min(1, 1 - penalty)),
    issues,
  };
}

export class TimelineCheckerService {
  constructor(private readonly policy: TimelinePolicy = defaultTimelinePolicy) {}

  checkChapter(input: {
    novelId: string;
    chapterId: string;
    chapterIndex: number;
    extractedEvents: ExtractedTimelineEvent[];
    timelineContext: TimelineContextForChapter;
    chapterContent: string;
  }): TimelineCheckResult {
    const issues: TimelineIssue[] = [];
    issues.push(...this.checkFutureEventLeak(input));
    issues.push(...this.checkUnresolvedHooks(input));
    issues.push(...this.checkTimelineRegression(input));
    issues.push(...this.checkRepeatedEvents(input));
    issues.push(...this.checkStateConflicts(input));
    issues.push(...this.checkMissingPlannedEvents(input));
    issues.push(...this.checkForbiddenEvents(input));
    issues.push(...this.checkUnclearTimeAnchor(input));
    return buildResult(issues);
  }

  private checkFutureEventLeak(input: {
    extractedEvents: ExtractedTimelineEvent[];
    timelineContext: TimelineContextForChapter;
    chapterContent: string;
  }): TimelineIssue[] {
    const issues: TimelineIssue[] = [];
    for (const forbidden of input.timelineContext.forbiddenEvents) {
      const evidence = input.extractedEvents.find((event) =>
        containsText(eventText(event), forbidden.title)
        || similarity(eventText(event), `${forbidden.title} ${forbidden.reason}`) >= 0.55);
      if (!evidence && !containsText(input.chapterContent, forbidden.title)) {
        continue;
      }
      issues.push({
        type: "future_event_leak",
        severity: this.policy.futureEventLeakSeverity,
        message: `本章提前写出或确认了后续事件：${forbidden.title}`,
        evidence: evidence ? `${evidence.title}：${evidence.summary}` : forbidden.title,
        suggestedFix: `删除或改写为铺垫，不要在本章确认“${forbidden.title}”已经发生。`,
        relatedEventIds: [forbidden.id],
        relatedHookIds: [],
      });
    }
    return issues;
  }

  private checkUnresolvedHooks(input: {
    extractedEvents: ExtractedTimelineEvent[];
    timelineContext: TimelineContextForChapter;
    chapterContent: string;
  }): TimelineIssue[] {
    return input.timelineContext.openHooks
      .filter((hook) => hook.priority === "critical" || hook.priority === "high")
      .filter((hook) => {
        const text = `${hook.title}\n${hook.description}`;
        return !input.extractedEvents.some((event) => similarity(eventText(event), text) >= 0.35)
          && !containsText(input.chapterContent, hook.title);
      })
      .map((hook) => ({
        type: "unresolved_previous_hook" as const,
        severity: hook.priority === "critical" ? "blocking" as const : "error" as const,
        message: `本章未承接上一章遗留钩子：${hook.title}`,
        evidence: hook.description,
        suggestedFix: `章节开头或中段必须回应“${hook.title}”，不要直接跳到后续事件。`,
        relatedEventIds: [],
        relatedHookIds: [hook.id],
      }));
  }

  private checkTimelineRegression(input: { timelineContext: TimelineContextForChapter }): TimelineIssue[] {
    const currentDay = input.timelineContext.currentTime?.storyDayIndex;
    if (this.policy.allowTimeRegression || currentDay == null) {
      return [];
    }
    const previousDayLabels = input.timelineContext.previousEvents
      .map((event) => event.storyTimeLabel ?? "")
      .filter(Boolean);
    if (previousDayLabels.length > 0 && input.timelineContext.currentTime?.label?.includes("前")) {
      return [{
        type: "timeline_regression",
        severity: "warning",
        message: "本章时间标签疑似倒退，需要确认是否为回忆或插叙。",
        evidence: input.timelineContext.currentTime.label,
        suggestedFix: "若不是回忆，调整本章时间锚点，使其顺承上一章。",
        relatedEventIds: [],
        relatedHookIds: [],
      }];
    }
    return [];
  }

  private checkRepeatedEvents(input: {
    extractedEvents: ExtractedTimelineEvent[];
    timelineContext: TimelineContextForChapter;
  }): TimelineIssue[] {
    const issues: TimelineIssue[] = [];
    for (const event of input.extractedEvents) {
      const match = input.timelineContext.previousEvents.find((previous) =>
        containsText(eventText(event), previous.title)
        || containsText(`${previous.title} ${previous.summary}`, event.title)
        || similarity(eventText(event), `${previous.title} ${previous.summary}`) >= this.policy.maxRepeatedEventSimilarity);
      if (!match) {
        continue;
      }
      issues.push({
        type: "repeated_event",
        severity: "warning",
        message: `本章疑似重复已经发生过的事件：${match.title}`,
        evidence: `${event.title}：${event.summary}`,
        suggestedFix: "确认本章是在推进后果，而不是把同一事件重新发生一遍。",
        relatedEventIds: [match.id],
        relatedHookIds: [],
      });
    }
    return issues;
  }

  private checkStateConflicts(input: {
    extractedEvents: ExtractedTimelineEvent[];
    timelineContext: TimelineContextForChapter;
  }): TimelineIssue[] {
    const known = new Map(input.timelineContext.knownStateChanges.map((change) => [
      `${change.targetType}:${change.targetId}:${change.field}`,
      change,
    ]));
    const issues: TimelineIssue[] = [];
    for (const event of input.extractedEvents) {
      for (const change of event.stateChanges) {
        const previous = known.get(`${change.targetType}:${change.targetId}:${change.field}`);
        if (!previous || normalize(previous.after) === normalize(change.after)) {
          continue;
        }
        if (previous.certainty !== "confirmed" || change.certainty === "rumored") {
          continue;
        }
        issues.push({
          type: "state_conflict",
          severity: "error",
          message: `本章状态变化与既有确认状态冲突：${change.targetType}:${change.targetId}.${change.field}`,
          evidence: `此前=${previous.after}；本章=${change.after}`,
          suggestedFix: "如果状态已改变，需要先写出明确恢复、转移或反转过程；否则应保持既有状态。",
          relatedEventIds: [],
          relatedHookIds: [],
        });
      }
    }
    return issues;
  }

  private checkMissingPlannedEvents(input: {
    extractedEvents: ExtractedTimelineEvent[];
    timelineContext: TimelineContextForChapter;
  }): TimelineIssue[] {
    if (!this.policy.requirePlannedEventCoverage) {
      return [];
    }
    return input.timelineContext.plannedEventsThisChapter
      .filter((planned) => !input.extractedEvents.some((event) =>
        event.matchedPlannedEventIds.includes(planned.id)
        || similarity(eventText(event), `${planned.title} ${planned.summary}`) >= 0.35))
      .map((planned) => ({
        type: "missing_planned_event" as const,
        severity: "error" as const,
        message: `本章没有完成计划时间线事件：${planned.title}`,
        evidence: planned.summary,
        suggestedFix: `补写或改写正文，让“${planned.title}”在本章真实发生；如果计划错误，应先调整时间线计划。`,
        relatedEventIds: [planned.id],
        relatedHookIds: [],
      }));
  }

  private checkForbiddenEvents(input: {
    extractedEvents: ExtractedTimelineEvent[];
    timelineContext: TimelineContextForChapter;
    chapterContent: string;
  }): TimelineIssue[] {
    return input.timelineContext.continuityRequirements
      .filter((requirement) => requirement.includes("must_not_happen") || requirement.includes("禁止提前发生"))
      .flatMap((requirement) => {
        const matched = input.extractedEvents.find((event) => {
          const title = compact(event.title);
          return title.length > 0 && requirement.includes(title);
        });
        return matched
          ? [{
              type: "forbidden_event_occurred" as const,
              severity: "blocking" as const,
              message: "本章发生了时间线禁止提前发生的事件。",
              evidence: `${matched.title}：${matched.summary}`,
              suggestedFix: requirement,
              relatedEventIds: [],
              relatedHookIds: [],
            }]
          : [];
      });
  }

  private checkUnclearTimeAnchor(input: { timelineContext: TimelineContextForChapter }): TimelineIssue[] {
    if (!this.policy.requireTimeAnchorEveryChapter || input.timelineContext.currentTime?.label) {
      return [];
    }
    return [{
      type: "unclear_time_anchor",
      severity: "info" as TimelineIssueSeverity,
      message: "本章没有明确章节时间锚点。",
      evidence: "ChapterTimeAnchor 缺失",
      suggestedFix: "为本章补充 timeLabel，以便后续章节判断时间推进。",
      relatedEventIds: [],
      relatedHookIds: [],
    }];
  }
}

export const timelineCheckerService = new TimelineCheckerService();
