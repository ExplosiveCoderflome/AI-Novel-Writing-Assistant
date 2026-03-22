import type { StoryPlan, StoryPlanLevel, StoryPlanRole } from "@ai-novel/shared/types/novel";

export interface PlannerPlanMetadata {
  planRole: StoryPlanRole | null;
  phaseLabel: string | null;
  mustAdvance: string[];
  mustPreserve: string[];
  sourceIssueIds: string[];
  replannedFromPlanId: string | null;
}

interface ChapterPlanFallbackInput {
  chapterOrder?: number | null;
  totalChapters?: number | null;
  expectation?: string | null;
}

function collectStringArray(value: unknown): string[] {
  if (typeof value === "string") {
    const normalized = value.trim();
    return normalized ? [normalized] : [];
  }
  if (typeof value === "number") {
    return [String(value)];
  }
  if (Array.isArray(value)) {
    return Array.from(new Set(value.flatMap((item) => collectStringArray(item))));
  }
  if (value && typeof value === "object") {
    return Array.from(new Set(Object.values(value).flatMap((item) => collectStringArray(item))));
  }
  return [];
}

function normalizeStoryPlanRole(value: unknown, fallback: StoryPlanRole | null): StoryPlanRole | null {
  if (typeof value !== "string") {
    return fallback;
  }
  const normalized = value.trim().toLowerCase();
  if (
    normalized === "setup"
    || normalized === "progress"
    || normalized === "pressure"
    || normalized === "turn"
    || normalized === "payoff"
    || normalized === "cooldown"
  ) {
    return normalized as StoryPlanRole;
  }
  return fallback;
}

function buildDefaultChapterPlanRole(input: ChapterPlanFallbackInput): StoryPlanRole {
  const chapterOrder = input.chapterOrder ?? 1;
  const total = Math.max(input.totalChapters ?? chapterOrder, chapterOrder, 1);
  const progress = chapterOrder / total;

  if (chapterOrder <= 2 || progress <= 0.15) {
    return "setup";
  }
  if (progress <= 0.45) {
    return "progress";
  }
  if (progress <= 0.7) {
    return "pressure";
  }
  if (progress <= 0.9) {
    return "turn";
  }
  return chapterOrder >= total ? "cooldown" : "payoff";
}

function buildDefaultPhaseLabel(level: StoryPlanLevel, input: ChapterPlanFallbackInput): string | null {
  if (level === "book") {
    return "全书主线";
  }
  if (level === "arc") {
    return "阶段推进";
  }

  const chapterOrder = input.chapterOrder ?? 1;
  const total = Math.max(input.totalChapters ?? chapterOrder, chapterOrder, 1);
  const progress = chapterOrder / total;

  if (progress <= 0.2) {
    return "开篇铺垫";
  }
  if (progress <= 0.5) {
    return "中段推进";
  }
  if (progress <= 0.8) {
    return "冲突加压";
  }
  return "终局兑现";
}

function buildDefaultMustAdvance(level: StoryPlanLevel, input: ChapterPlanFallbackInput): string[] {
  if (level !== "chapter") {
    return [];
  }
  const expectation = collectStringArray(input.expectation);
  return expectation.slice(0, 2);
}

function buildDefaultMustPreserve(level: StoryPlanLevel): string[] {
  if (level === "chapter") {
    return ["保持主角目标连续", "不要跳过关键因果"];
  }
  return [];
}

export function buildDefaultPlanMetadata(level: StoryPlanLevel, input: ChapterPlanFallbackInput = {}): PlannerPlanMetadata {
  return {
    planRole: level === "chapter" ? buildDefaultChapterPlanRole(input) : null,
    phaseLabel: buildDefaultPhaseLabel(level, input),
    mustAdvance: buildDefaultMustAdvance(level, input),
    mustPreserve: buildDefaultMustPreserve(level),
    sourceIssueIds: [],
    replannedFromPlanId: null,
  };
}

export function normalizePlanMetadata(
  level: StoryPlanLevel,
  raw: unknown,
  fallback: PlannerPlanMetadata,
): PlannerPlanMetadata {
  const record = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  return {
    planRole: normalizeStoryPlanRole(record.planRole, fallback.planRole ?? (level === "chapter" ? "progress" : null)),
    phaseLabel: collectStringArray(record.phaseLabel)[0] ?? fallback.phaseLabel,
    mustAdvance: collectStringArray(record.mustAdvance).slice(0, 5).length > 0
      ? collectStringArray(record.mustAdvance).slice(0, 5)
      : fallback.mustAdvance,
    mustPreserve: collectStringArray(record.mustPreserve).slice(0, 5).length > 0
      ? collectStringArray(record.mustPreserve).slice(0, 5)
      : fallback.mustPreserve,
    sourceIssueIds: collectStringArray(record.sourceIssueIds).slice(0, 12).length > 0
      ? collectStringArray(record.sourceIssueIds).slice(0, 12)
      : fallback.sourceIssueIds,
    replannedFromPlanId: collectStringArray(record.replannedFromPlanId)[0] ?? fallback.replannedFromPlanId,
  };
}

export function readPlanMetadata(rawPlanJson: string | null | undefined): PlannerPlanMetadata {
  if (!rawPlanJson?.trim()) {
    return buildDefaultPlanMetadata("chapter");
  }
  try {
    const parsed = JSON.parse(rawPlanJson) as { level?: StoryPlanLevel } & Record<string, unknown>;
    const level = parsed.level === "book" || parsed.level === "arc" || parsed.level === "chapter"
      ? parsed.level
      : "chapter";
    return normalizePlanMetadata(level, parsed, buildDefaultPlanMetadata(level));
  } catch {
    return buildDefaultPlanMetadata("chapter");
  }
}

export function enrichStoryPlan<T extends StoryPlan>(plan: T): T {
  const fallback = buildDefaultPlanMetadata(plan.level, {});
  const metadata = normalizePlanMetadata(plan.level, parsePlanJson(plan.rawPlanJson), fallback);
  return {
    ...plan,
    planRole: metadata.planRole,
    phaseLabel: metadata.phaseLabel,
    mustAdvanceJson: JSON.stringify(metadata.mustAdvance),
    mustPreserveJson: JSON.stringify(metadata.mustPreserve),
    sourceIssueIdsJson: JSON.stringify(metadata.sourceIssueIds),
    replannedFromPlanId: metadata.replannedFromPlanId,
  };
}

function parsePlanJson(rawPlanJson: string | null | undefined): Record<string, unknown> {
  if (!rawPlanJson?.trim()) {
    return {};
  }
  try {
    return JSON.parse(rawPlanJson) as Record<string, unknown>;
  } catch {
    return {};
  }
}
