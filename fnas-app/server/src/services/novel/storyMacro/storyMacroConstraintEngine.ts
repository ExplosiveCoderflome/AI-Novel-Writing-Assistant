import type {
  StoryConstraintEngine,
  StoryDecomposition,
  StoryExpansion,
  StoryMacroField,
  StoryMacroFieldValue,
  StoryMacroLocks,
  StoryMacroPhase,
  StoryMacroTurningPoint,
} from "@ai-novel/shared/types/storyMacro";
import {
  normalizeConflictLayers,
  normalizeConstraints,
  normalizeDecomposition,
  normalizeExpansion,
  STORY_MACRO_FIELDS,
} from "./storyMacroPlanSchema";

export interface StoryMacroEditablePlan {
  expansion: StoryExpansion;
  decomposition: StoryDecomposition;
  constraints: string[];
}

function mergeUnique(items: string[], maxItems: number): string[] {
  return Array.from(new Set(items.map((item) => item.trim()).filter(Boolean))).slice(0, maxItems);
}

function summarizeText(value: string, fallback: string): string {
  const parts = value
    .split(/\r?\n|。|！|!|？|\?|；|;/)
    .map((item) => item.trim())
    .filter(Boolean);
  return parts[0] ?? fallback;
}

function negativeConstraintsOnly(value: string[]): string[] {
  return value.filter((item) => /^(不要|禁止|避免|不可|不能)/.test(item.trim()));
}

export function toGrowthSteps(value: string): string[] {
  const steps = value
    .split(/\r?\n|->|→|=>|，|、|；|;/)
    .map((item) => item.trim())
    .filter(Boolean);
  return Array.from(new Set(steps)).slice(0, 6);
}

function buildPressureRoles(expansion: StoryExpansion): string[] {
  return mergeUnique([
    `主角位：${summarizeText(expansion.protagonist_core, "主角被困在无法轻易退出的处境中。")}`,
    `对立位：${summarizeText(expansion.conflict_layers.external, "外部力量持续压迫主角。")}`,
    `关系压力位：${summarizeText(expansion.conflict_layers.relational, "关键关系不断施压并制造选择代价。")}`,
  ], 4);
}

const DEFAULT_PHASE_NAMES = [
  "困局锁死",
  "误判行动",
  "代价升级",
  "认知翻转",
  "终局兑现",
] as const;

function buildPhaseModel(plan: StoryMacroEditablePlan): StoryMacroPhase[] {
  const { expansion, decomposition } = plan;
  return [
    {
      name: DEFAULT_PHASE_NAMES[0],
      goal: `先把主角困进「${summarizeText(expansion.protagonist_core, decomposition.core_conflict)}」，并抛出核心未知：${expansion.mystery_box || decomposition.main_hook}`,
    },
    {
      name: DEFAULT_PHASE_NAMES[1],
      goal: `围绕「${decomposition.progression_loop}」推进第一次行动，让主角在误判下付出代价。`,
    },
    {
      name: DEFAULT_PHASE_NAMES[2],
      goal: `同步拉高外部、内部、关系三条压力线，兑现冲突引擎：${summarizeText(expansion.conflict_engine, decomposition.core_conflict)}`,
    },
    {
      name: DEFAULT_PHASE_NAMES[3],
      goal: `逼近并改写核心未知「${expansion.mystery_box || decomposition.main_hook}」，让主角的认知发生翻转。`,
    },
    {
      name: DEFAULT_PHASE_NAMES[4],
      goal: `以「${decomposition.ending_flavor}」完成收束，并兑现关键爆点与情绪后劲。`,
    },
  ];
}

function buildTurningPoints(payoffs: string[]): StoryMacroTurningPoint[] {
  return payoffs.map((item, index) => ({
    title: `兑现节点 ${index + 1}`,
    summary: item,
    phase: DEFAULT_PHASE_NAMES[Math.min(index, DEFAULT_PHASE_NAMES.length - 1)] ?? DEFAULT_PHASE_NAMES[DEFAULT_PHASE_NAMES.length - 1],
  }));
}

function buildHardConstraints(plan: StoryMacroEditablePlan): string[] {
  const growthSteps = toGrowthSteps(plan.decomposition.growth_path).map((item) => `主角认知推进必须经过：${item}`);
  return mergeUnique([
    ...plan.constraints,
    "角色创建前禁止生成具体角色姓名、固定角色阵容或完整人物小传。",
    `每轮推进都必须持续回应核心未知：${plan.expansion.mystery_box || plan.decomposition.main_hook}`,
    `剧情升级必须由冲突引擎驱动：${summarizeText(plan.expansion.conflict_engine, plan.decomposition.core_conflict)}`,
    `高张力场面必须服务于主线，而不是单独炫技：${plan.expansion.setpiece_seeds.join(" / ")}`,
    ...growthSteps,
  ], 10);
}

export function buildConstraintEngine(plan: StoryMacroEditablePlan): StoryConstraintEngine {
  const growthSteps = toGrowthSteps(plan.decomposition.growth_path);
  const hardConstraints = buildHardConstraints(plan);
  const mustNotHave = mergeUnique([
    ...negativeConstraintsOnly(plan.constraints),
    "用具体人物设定替代故事发动机",
    "让世界观说明压过冲突推进",
  ], 6);
  return {
    premise: plan.expansion.expanded_premise || `${plan.decomposition.selling_point} 主线围绕「${plan.decomposition.core_conflict}」展开。`,
    conflict_axis: plan.decomposition.core_conflict,
    mystery_box: plan.expansion.mystery_box || plan.decomposition.main_hook,
    pressure_roles: buildPressureRoles(plan.expansion),
    growth_path: growthSteps.length > 0 ? growthSteps : [plan.decomposition.growth_path].filter(Boolean),
    phase_model: buildPhaseModel(plan),
    hard_constraints: hardConstraints,
    turning_points: buildTurningPoints(plan.decomposition.major_payoffs),
    ending_constraints: {
      must_have: mergeUnique([
        `回应主线问题：${plan.decomposition.main_hook}`,
        `保留结局味道：${plan.decomposition.ending_flavor}`,
        plan.decomposition.major_payoffs[plan.decomposition.major_payoffs.length - 1] ?? "",
      ], 4),
      must_not_have: mustNotHave,
    },
  };
}

export function getEditablePlanFieldValue(plan: StoryMacroEditablePlan, field: StoryMacroField): StoryMacroFieldValue {
  switch (field) {
    case "expanded_premise":
    case "protagonist_core":
    case "conflict_engine":
    case "mystery_box":
    case "emotional_line":
    case "tone_reference":
      return plan.expansion[field];
    case "conflict_layers":
      return plan.expansion.conflict_layers;
    case "setpiece_seeds":
      return plan.expansion.setpiece_seeds;
    case "selling_point":
    case "core_conflict":
    case "main_hook":
    case "progression_loop":
    case "growth_path":
    case "ending_flavor":
      return plan.decomposition[field];
    case "major_payoffs":
      return plan.decomposition.major_payoffs;
    case "constraints":
      return plan.constraints;
  }
}

export function setEditablePlanFieldValue(
  plan: StoryMacroEditablePlan,
  field: StoryMacroField,
  value: StoryMacroFieldValue,
): StoryMacroEditablePlan {
  const nextPlan: StoryMacroEditablePlan = {
    expansion: normalizeExpansion(plan.expansion),
    decomposition: normalizeDecomposition(plan.decomposition),
    constraints: normalizeConstraints(plan.constraints),
  };
  switch (field) {
    case "expanded_premise":
    case "protagonist_core":
    case "conflict_engine":
    case "mystery_box":
    case "emotional_line":
    case "tone_reference":
      nextPlan.expansion = normalizeExpansion({
        ...nextPlan.expansion,
        [field]: typeof value === "string" ? value : "",
      });
      return nextPlan;
    case "conflict_layers":
      nextPlan.expansion = normalizeExpansion({
        ...nextPlan.expansion,
        conflict_layers: normalizeConflictLayers(value),
      });
      return nextPlan;
    case "setpiece_seeds":
      nextPlan.expansion = normalizeExpansion({
        ...nextPlan.expansion,
        setpiece_seeds: Array.isArray(value) ? value : [],
      });
      return nextPlan;
    case "selling_point":
    case "core_conflict":
    case "main_hook":
    case "progression_loop":
    case "growth_path":
    case "ending_flavor":
      nextPlan.decomposition = normalizeDecomposition({
        ...nextPlan.decomposition,
        [field]: typeof value === "string" ? value : "",
      });
      return nextPlan;
    case "major_payoffs":
      nextPlan.decomposition = normalizeDecomposition({
        ...nextPlan.decomposition,
        major_payoffs: Array.isArray(value) ? value : [],
      });
      return nextPlan;
    case "constraints":
      nextPlan.constraints = normalizeConstraints(value);
      return nextPlan;
  }
}

export function mergeLockedFields(
  nextPlan: StoryMacroEditablePlan,
  previousPlan: StoryMacroEditablePlan | null,
  locks: StoryMacroLocks,
): StoryMacroEditablePlan {
  if (!previousPlan) {
    return nextPlan;
  }
  let merged = {
    expansion: normalizeExpansion(nextPlan.expansion),
    decomposition: normalizeDecomposition(nextPlan.decomposition),
    constraints: normalizeConstraints(nextPlan.constraints),
  };
  for (const field of STORY_MACRO_FIELDS) {
    if (!locks[field]) {
      continue;
    }
    merged = setEditablePlanFieldValue(
      merged,
      field,
      getEditablePlanFieldValue(previousPlan, field),
    );
  }
  return merged;
}
