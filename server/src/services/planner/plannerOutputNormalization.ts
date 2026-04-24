import type { StoryPlanRole } from "@ai-novel/shared/types/novel";

export interface PlannerOutput {
  title?: string;
  objective?: string;
  participants?: string[];
  reveals?: string[];
  riskNotes?: string[];
  hookTarget?: string;
  planRole?: StoryPlanRole | null;
  phaseLabel?: string;
  mustAdvance?: string[];
  mustPreserve?: string[];
  scenes?: Array<{
    title?: string;
    objective?: string;
    conflict?: string;
    reveal?: string;
    emotionBeat?: string;
  }>;
}

const PLANNER_OBJECTIVE_KEYS = [
  "objective",
  "goal",
  "chapterGoal",
  "chapterObjective",
  "mainGoal",
  "mainObjective",
  "coreGoal",
  "coreObjective",
  "purpose",
  "mission",
  "target",
  "目标",
  "章节目标",
  "规划目标",
  "核心目标",
];

const PLANNER_SCENE_OBJECTIVE_KEYS = [
  "objective",
  "sceneObjective",
  "sceneGoal",
  "goal",
  "purpose",
  "mission",
  "target",
  "目标",
  "场景目标",
  "章节目标",
];

function collectPlannerTextFragments(value: unknown): string[] {
  if (typeof value === "string") {
    const normalized = value.trim();
    return normalized ? [normalized] : [];
  }
  if (typeof value === "number") {
    return [String(value)];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item) => collectPlannerTextFragments(item));
  }
  if (value && typeof value === "object") {
    return Object.values(value).flatMap((item) => collectPlannerTextFragments(item));
  }
  return [];
}

function toPlannerOptionalText(value: unknown, separator = "；"): string | null {
  const parts = Array.from(new Set(collectPlannerTextFragments(value)));
  return parts.length > 0 ? parts.join(separator) : null;
}

function pickPlannerOptionalText(record: Record<string, unknown>, keys: string[], separator = "；"): string | null {
  for (const key of keys) {
    const value = toPlannerOptionalText(record[key], separator);
    if (value) {
      return value;
    }
  }
  return null;
}

function toPlannerStringArray(value: unknown): string[] {
  return Array.from(new Set(collectPlannerTextFragments(value)));
}

function normalizePlannerScenes(value: unknown): NonNullable<PlannerOutput["scenes"]> {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((scene: unknown, index: number) => {
    if (!scene || typeof scene !== "object") {
      return {
        title: toPlannerOptionalText(scene) ?? `Scene ${index + 1}`,
      };
    }
    const record = scene as Record<string, unknown>;
    return {
      title: toPlannerOptionalText(record.title) ?? `Scene ${index + 1}`,
      objective: pickPlannerOptionalText(record, PLANNER_SCENE_OBJECTIVE_KEYS) ?? undefined,
      conflict: toPlannerOptionalText(record.conflict) ?? undefined,
      reveal: toPlannerOptionalText(record.reveal) ?? undefined,
      emotionBeat: toPlannerOptionalText(record.emotionBeat) ?? undefined,
    };
  });
}

export function normalizePlannerOutput(output: unknown): PlannerOutput {
  const record = output && typeof output === "object" ? output as Record<string, unknown> : {};
  return {
    title: toPlannerOptionalText(record.title) ?? undefined,
    objective: pickPlannerOptionalText(record, PLANNER_OBJECTIVE_KEYS) ?? undefined,
    participants: toPlannerStringArray(record.participants),
    reveals: toPlannerStringArray(record.reveals),
    riskNotes: toPlannerStringArray(record.riskNotes),
    hookTarget: toPlannerOptionalText(record.hookTarget) ?? undefined,
    planRole: typeof record.planRole === "string" ? record.planRole as StoryPlanRole : undefined,
    phaseLabel: toPlannerOptionalText(record.phaseLabel) ?? undefined,
    mustAdvance: toPlannerStringArray(record.mustAdvance),
    mustPreserve: toPlannerStringArray(record.mustPreserve),
    scenes: normalizePlannerScenes(record.scenes),
  };
}
