import type {
  StoryConstraintEngine,
  StoryDecomposition,
  StoryExpansion,
  StoryMacroField,
  StoryMacroIssue,
  StoryMacroLocks,
  StoryMacroState,
  StoryMacroTurningPoint,
} from "@ai-novel/shared/types/storyMacro";
import { z } from "zod";

const STORY_MACRO_FIELD_SET = new Set<string>([
  "selling_point",
  "core_conflict",
  "main_hook",
  "growth_path",
  "major_payoffs",
  "ending_flavor",
  "global",
]);

export const STORY_MACRO_FIELDS = [
  "selling_point",
  "core_conflict",
  "main_hook",
  "growth_path",
  "major_payoffs",
  "ending_flavor",
] as const satisfies StoryMacroField[];

export const EMPTY_STATE: StoryMacroState = {
  currentPhase: 0,
  progress: 0,
  protagonistState: "",
};

export const STORY_MACRO_RESPONSE_SCHEMA = z.object({
  expansion: z.object({
    expanded_premise: z.string().trim().min(1).max(900),
    protagonist_core: z.string().trim().min(1).max(400),
    conflict_layers: z.array(z.string().trim().min(1).max(240)).min(2).max(5),
    emotional_line: z.string().trim().min(1).max(400),
    setpiece_seeds: z.array(z.string().trim().min(1).max(240)).min(2).max(5),
    tone_reference: z.string().trim().min(1).max(300),
  }),
  decomposition: z.object({
    selling_point: z.string().trim().min(1).max(200),
    core_conflict: z.string().trim().min(1).max(300),
    main_hook: z.string().trim().min(1).max(300),
    growth_path: z.string().trim().min(1).max(400),
    major_payoffs: z.array(z.string().trim().min(1).max(200)).min(1).max(5),
    ending_flavor: z.string().trim().min(1).max(200),
  }),
  issues: z.array(z.object({
    type: z.string().trim().min(1).max(40),
    field: z.string().trim().min(1).max(60),
    message: z.string().trim().min(1).max(300),
  })).max(6).default([]),
});

export function toText(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    return content.map((item) => {
      if (typeof item === "string") {
        return item;
      }
      if (item && typeof item === "object" && "text" in item && typeof item.text === "string") {
        return item.text;
      }
      return "";
    }).join("");
  }
  return JSON.stringify(content ?? "");
}

export function extractJSONObject(source: string): string {
  const cleaned = source.replace(/```json|```/gi, "").trim();
  const first = cleaned.indexOf("{");
  const last = cleaned.lastIndexOf("}");
  if (first < 0 || last < 0 || first >= last) {
    throw new Error("Story Macro Plan AI 输出中未检测到有效 JSON 对象。");
  }
  return cleaned.slice(first, last + 1);
}

export function safeParseJSON<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw?.trim()) {
    return fallback;
  }
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function normalizeDecomposition(value: StoryDecomposition): StoryDecomposition {
  return {
    selling_point: value.selling_point.trim(),
    core_conflict: value.core_conflict.trim(),
    main_hook: value.main_hook.trim(),
    growth_path: value.growth_path.trim(),
    major_payoffs: value.major_payoffs.map((item) => item.trim()).filter(Boolean).slice(0, 5),
    ending_flavor: value.ending_flavor.trim(),
  };
}

export function normalizeExpansion(value: StoryExpansion): StoryExpansion {
  return {
    expanded_premise: value.expanded_premise.trim(),
    protagonist_core: value.protagonist_core.trim(),
    conflict_layers: value.conflict_layers.map((item) => item.trim()).filter(Boolean).slice(0, 5),
    emotional_line: value.emotional_line.trim(),
    setpiece_seeds: value.setpiece_seeds.map((item) => item.trim()).filter(Boolean).slice(0, 5),
    tone_reference: value.tone_reference.trim(),
  };
}

export function isDecompositionComplete(value: Partial<StoryDecomposition> | null | undefined): value is StoryDecomposition {
  return Boolean(
    value
    && typeof value.selling_point === "string"
    && value.selling_point.trim()
    && typeof value.core_conflict === "string"
    && value.core_conflict.trim()
    && typeof value.main_hook === "string"
    && value.main_hook.trim()
    && typeof value.growth_path === "string"
    && value.growth_path.trim()
    && Array.isArray(value.major_payoffs)
    && value.major_payoffs.length > 0
    && value.major_payoffs.every((item) => typeof item === "string" && item.trim())
    && typeof value.ending_flavor === "string"
    && value.ending_flavor.trim(),
  );
}

export function toGrowthSteps(value: string): string[] {
  const steps = value
    .split(/\r?\n|->|→|=>|，|、|；|;/)
    .map((item) => item.trim())
    .filter(Boolean);
  return Array.from(new Set(steps)).slice(0, 6);
}

function buildForbiddenRules(endingFlavor: string): string[] {
  const source = endingFlavor.trim();
  const forbidden = new Set<string>([
    "轻松成功",
    "完美结局",
    "无代价成长",
  ]);
  if (/现实|克制|压抑|冷峻|残酷|苦涩/.test(source)) {
    forbidden.add("爽点直接抹平现实代价");
    forbidden.add("所有关系自动修复");
  }
  if (/治愈|温暖|希望|明亮/.test(source)) {
    forbidden.add("为了悲剧而悲剧");
    forbidden.add("纯绝望收尾");
  }
  if (/开放|留白|余味/.test(source)) {
    forbidden.add("把所有问题解释到失去余味");
  }
  return Array.from(forbidden);
}

function buildTurningPoints(payoffs: string[]): StoryMacroTurningPoint[] {
  const phases = ["失衡", "崩塌", "试探", "重建"];
  return payoffs.map((item, index) => ({
    title: `关键节点 ${index + 1}`,
    summary: item,
    phase: phases[Math.min(index, phases.length - 1)] ?? "重建",
  }));
}

export function buildConstraintEngine(decomposition: StoryDecomposition): StoryConstraintEngine {
  const growthSteps = toGrowthSteps(decomposition.growth_path);
  const forbidden = buildForbiddenRules(decomposition.ending_flavor);
  const requiredTrends = [
    `围绕「${decomposition.core_conflict}」持续升级冲突`,
    `持续回应主线问题：${decomposition.main_hook}`,
    ...growthSteps.map((item) => `角色推进必须经过：${item}`),
  ].slice(0, 8);

  return {
    premise: `${decomposition.selling_point} 主线围绕「${decomposition.core_conflict}」展开。`,
    conflict_axis: decomposition.core_conflict,
    growth_path: growthSteps.length > 0 ? growthSteps : [decomposition.growth_path],
    phase_model: [
      { name: "失衡", goal: `打破现状并抛出主线问题：${decomposition.main_hook}` },
      { name: "崩塌", goal: `扩大代价，让「${decomposition.core_conflict}」变得不可回避` },
      { name: "试探", goal: `围绕「${decomposition.growth_path}」寻找可行路径` },
      { name: "重建", goal: `以「${decomposition.ending_flavor}」完成收束与兑现` },
    ],
    constraints: {
      tone: decomposition.ending_flavor,
      forbidden,
      required_trends: requiredTrends,
    },
    turning_points: buildTurningPoints(decomposition.major_payoffs),
    ending_constraints: {
      must_have: [
        `回应主线钩子：${decomposition.main_hook}`,
        `保留结局味道：${decomposition.ending_flavor}`,
        decomposition.major_payoffs[decomposition.major_payoffs.length - 1] ?? decomposition.major_payoffs[0],
      ].filter(Boolean),
      must_not_have: forbidden,
    },
  };
}

export function mergeLockedFields(
  nextValue: StoryDecomposition,
  previousValue: StoryDecomposition | null,
  locks: StoryMacroLocks,
): StoryDecomposition {
  if (!previousValue) {
    return nextValue;
  }
  const merged = { ...nextValue } as StoryDecomposition;
  for (const field of STORY_MACRO_FIELDS) {
    if (locks[field]) {
      if (field === "major_payoffs") {
        merged.major_payoffs = previousValue.major_payoffs;
      } else {
        merged[field] = previousValue[field];
      }
    }
  }
  return merged;
}

export function buildExpansionAndDecompositionPrompt(storyInput: string): { system: string; user: string } {
  return {
    system: [
      "你是资深小说作者兼前期策划，先要从作者视角把用户的故事想法扩展成更有戏剧张力的创作底稿，再提炼成结构化约束。",
      "扩展时允许做高质量、克制的戏剧化补强，但不要无依据地发明大量世界观细节。",
      "优先补强人物处境、冲突层次、情绪推进、关键场面和叙事气质。",
      "如果信息不足，不要强装完整，而是在 issues 中标记 missing_info。",
      "如果用户表达存在明显冲突，也要在 issues 中标记 conflict。",
      "输出必须是 JSON 对象，不要输出解释文字。",
      "JSON 结构：",
      "{",
      '  "expansion": {',
      '    "expanded_premise": "以资深作者口吻扩写后的故事前提，1-2段或一段较完整说明",',
      '    "protagonist_core": "主角的处境、内在困境、可塑空间",',
      '    "conflict_layers": ["外部冲突", "内部冲突", "关系冲突"],',
      '    "emotional_line": "主要情绪走势和变化逻辑",',
      '    "setpiece_seeds": ["值得写成高张力场面的桥段种子1", "桥段种子2"],',
      '    "tone_reference": "建议的叙事气质与写法方向"',
      "  },",
      '  "decomposition": {',
      '    "selling_point": "一句话卖点",',
      '    "core_conflict": "长期对立关系",',
      '    "main_hook": "驱动持续阅读的问题句",',
      '    "growth_path": "主角变化路径",',
      '    "major_payoffs": ["关键爆点1", "关键爆点2"],',
      '    "ending_flavor": "结局味道"',
      "  },",
      '  "issues": [{"type":"conflict|missing_info","field":"selling_point|core_conflict|main_hook|growth_path|major_payoffs|ending_flavor|global","message":"说明"}]',
      "}",
    ].join("\n"),
    user: `故事想法：\n${storyInput}`,
  };
}

export function buildFieldRegenerationPrompt(input: {
  field: StoryMacroField;
  storyInput: string;
  expansion: StoryExpansion | null;
  decomposition: StoryDecomposition;
  lockedFields: StoryMacroLocks;
}): { system: string; user: string } {
  return {
    system: [
      "你是小说规划助手，只能重写一个指定字段，其他字段只是上下文。",
      "输出必须是 JSON 对象，不要输出解释。",
      "如果字段是 major_payoffs，请返回字符串数组；否则返回字符串。",
      `目标字段：${input.field}`,
    ].join("\n"),
    user: [
      `原始故事想法：\n${input.storyInput}`,
      input.expansion ? `作家视角扩展：\n${JSON.stringify(input.expansion, null, 2)}` : "",
      `当前拆解：\n${JSON.stringify(input.decomposition, null, 2)}`,
      `已锁定字段：\n${JSON.stringify(input.lockedFields, null, 2)}`,
      `请只重写字段 ${input.field}，输出格式：{"value":"..."} 或 {"value":["..."]}`,
    ].filter(Boolean).join("\n\n"),
  };
}

export function normalizeIssues(value: Array<{ type: string; field: string; message: string }>): StoryMacroIssue[] {
  return value.slice(0, 6).map((item) => ({
    type: item.type === "conflict" ? "conflict" : "missing_info",
    field: STORY_MACRO_FIELD_SET.has(item.field) ? (item.field as StoryMacroIssue["field"]) : "global",
    message: item.message.trim(),
  }));
}
