import type {
  StoryConstraintEngine,
  StoryDecomposition,
  StoryExpansion,
  StoryMacroPlan,
  StoryMacroState,
} from "@ai-novel/shared/types/storyMacro";
import {
  EMPTY_STATE,
  buildConstraintEngine,
  hasMeaningfulDecomposition,
  hasMeaningfulExpansion,
  isDecompositionComplete,
  normalizeConstraints,
  normalizeDecomposition,
  normalizeExpansion,
  normalizeIssues,
  normalizeLockedFields,
  safeParseJSON,
} from "./storyMacroPlanUtils";

export interface PersistedPlanRow {
  id: string;
  novelId: string;
  storyInput: string | null;
  expansionJson: string | null;
  decompositionJson: string | null;
  issuesJson: string | null;
  lockedFieldsJson: string | null;
  constraintEngineJson: string | null;
  stateJson: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface PersistedConstraintPayload {
  constraints?: unknown;
  engine?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function pickString(value: unknown, key: string): string {
  return isRecord(value) && typeof value[key] === "string" ? value[key].trim() : "";
}

function pickStringArray(value: unknown, key: string): string[] {
  if (!isRecord(value) || !Array.isArray(value[key])) {
    return [];
  }
  return value[key]
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
}

function deriveProgressionLoop(rawDecomposition: unknown): string {
  const coreConflict = pickString(rawDecomposition, "core_conflict");
  const mainHook = pickString(rawDecomposition, "main_hook");
  if (!coreConflict && !mainHook) {
    return "";
  }
  if (!coreConflict) {
    return `围绕「${mainHook}」不断发现新线索，并让每次行动都带来更大的反噬。`;
  }
  if (!mainHook) {
    return `围绕「${coreConflict}」持续升级冲突，让每次试探都逼出新的代价与反转。`;
  }
  return `围绕「${coreConflict}」不断发现更深一层真相，并用每次反转继续追问「${mainHook}」。`;
}

function deriveExpansion(rawExpansion: unknown, rawDecomposition: unknown, rawConstraintPayload: PersistedConstraintPayload): StoryExpansion | null {
  const nextValue = normalizeExpansion({
    expanded_premise: pickString(rawExpansion, "expanded_premise"),
    protagonist_core: pickString(rawExpansion, "protagonist_core"),
    conflict_engine: pickString(rawExpansion, "conflict_engine") || pickString(rawDecomposition, "core_conflict"),
    conflict_layers: isRecord(rawExpansion) ? rawExpansion.conflict_layers : rawExpansion,
    mystery_box: pickString(rawExpansion, "mystery_box") || pickString(rawDecomposition, "main_hook"),
    emotional_line: pickString(rawExpansion, "emotional_line"),
    setpiece_seeds: pickStringArray(rawExpansion, "setpiece_seeds"),
    tone_reference: pickString(rawExpansion, "tone_reference") || pickString(rawConstraintPayload.engine, "tone"),
  });
  return hasMeaningfulExpansion(nextValue) ? nextValue : null;
}

function deriveDecomposition(rawDecomposition: unknown): StoryDecomposition | null {
  const nextValue = normalizeDecomposition({
    selling_point: pickString(rawDecomposition, "selling_point"),
    core_conflict: pickString(rawDecomposition, "core_conflict"),
    main_hook: pickString(rawDecomposition, "main_hook"),
    progression_loop: pickString(rawDecomposition, "progression_loop") || deriveProgressionLoop(rawDecomposition),
    growth_path: pickString(rawDecomposition, "growth_path"),
    major_payoffs: pickStringArray(rawDecomposition, "major_payoffs"),
    ending_flavor: pickString(rawDecomposition, "ending_flavor"),
  });
  return hasMeaningfulDecomposition(nextValue) ? nextValue : null;
}

function parseConstraintPayload(raw: string | null | undefined): PersistedConstraintPayload {
  const parsed = safeParseJSON<unknown>(raw, null);
  if (isRecord(parsed) && ("constraints" in parsed || "engine" in parsed)) {
    return parsed as PersistedConstraintPayload;
  }
  return {
    constraints: normalizeConstraints(isRecord(parsed) ? parsed.constraints ?? parsed : parsed),
    engine: isRecord(parsed) ? parsed : null,
  };
}

function deriveConstraintEngine(
  expansion: StoryExpansion | null,
  decomposition: StoryDecomposition | null,
  constraints: string[],
  persistedEngine: unknown,
): StoryConstraintEngine | null {
  if (expansion && decomposition && isDecompositionComplete(decomposition)) {
    return buildConstraintEngine({
      expansion,
      decomposition,
      constraints,
    });
  }
  if (!isRecord(persistedEngine)) {
    return null;
  }
  const conflictAxis = pickString(persistedEngine, "conflict_axis");
  if (!conflictAxis) {
    return null;
  }
  return {
    premise: pickString(persistedEngine, "premise"),
    conflict_axis: conflictAxis,
    mystery_box: pickString(persistedEngine, "mystery_box"),
    pressure_roles: pickStringArray(persistedEngine, "pressure_roles"),
    growth_path: pickStringArray(persistedEngine, "growth_path"),
    phase_model: Array.isArray(persistedEngine.phase_model)
      ? persistedEngine.phase_model
        .map((item) => ({
          name: pickString(item, "name"),
          goal: pickString(item, "goal"),
        }))
        .filter((item) => item.name && item.goal)
      : [],
    hard_constraints: pickStringArray(persistedEngine, "hard_constraints"),
    turning_points: Array.isArray(persistedEngine.turning_points)
      ? persistedEngine.turning_points
        .map((item) => ({
          title: pickString(item, "title"),
          summary: pickString(item, "summary"),
          phase: pickString(item, "phase"),
        }))
        .filter((item) => item.title && item.summary && item.phase)
      : [],
    ending_constraints: {
      must_have: pickStringArray(isRecord(persistedEngine.ending_constraints) ? persistedEngine.ending_constraints : null, "must_have"),
      must_not_have: pickStringArray(isRecord(persistedEngine.ending_constraints) ? persistedEngine.ending_constraints : null, "must_not_have"),
    },
  };
}

export function serializeConstraintPayload(input: {
  constraints: string[];
  constraintEngine: StoryConstraintEngine | null;
}): string {
  return JSON.stringify({
    constraints: input.constraints,
    engine: input.constraintEngine,
  });
}

export function mapRowToPlan(row: PersistedPlanRow): StoryMacroPlan {
  const rawExpansion = safeParseJSON<unknown>(row.expansionJson, null);
  const rawDecomposition = safeParseJSON<unknown>(row.decompositionJson, null);
  const rawConstraintPayload = parseConstraintPayload(row.constraintEngineJson);
  const expansion = deriveExpansion(rawExpansion, rawDecomposition, rawConstraintPayload);
  const decomposition = deriveDecomposition(rawDecomposition);
  const constraints = normalizeConstraints(rawConstraintPayload.constraints);
  return {
    id: row.id,
    novelId: row.novelId,
    storyInput: row.storyInput,
    expansion,
    decomposition,
    constraints,
    issues: normalizeIssues(safeParseJSON(row.issuesJson, [])),
    lockedFields: normalizeLockedFields(safeParseJSON(row.lockedFieldsJson, {})),
    constraintEngine: deriveConstraintEngine(expansion, decomposition, constraints, rawConstraintPayload.engine),
    state: safeParseJSON<StoryMacroState>(row.stateJson, EMPTY_STATE),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
