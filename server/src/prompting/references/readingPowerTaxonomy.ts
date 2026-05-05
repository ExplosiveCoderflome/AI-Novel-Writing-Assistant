/**
 * 追读力（Reading Power）分类体系
 * 参考 webnovel-writer 项目的追读力系统设计
 */

// ─── Hook 类型 ───
export type HookType =
  | "suspense"      // 悬念钩子：未解之谜、伏笔揭示
  | "conflict"      // 冲突钩子：矛盾升级、对抗展开
  | "reversal"      // 反转钩子：意料之外、情理之中
  | "emotion"       // 情感钩子：共情触发、情绪渲染
  | "progression";  // 成长钩子：实力提升、境界突破

export const HOOK_TYPES: readonly HookType[] = [
  "suspense", "conflict", "reversal", "emotion", "progression",
] as const;

export const HOOK_TYPE_LABELS: Record<HookType, string> = {
  suspense: "悬念钩子",
  conflict: "冲突钩子",
  reversal: "反转钩子",
  emotion: "情感钩子",
  progression: "成长钩子",
};

export const HOOK_TYPE_DESCRIPTIONS: Record<HookType, string> = {
  suspense: "通过未解之谜和伏笔制造追读动力，让读者迫切想知道答案",
  conflict: "通过矛盾对立和对抗升级制造紧张感，推动读者继续阅读",
  reversal: "通过出人意料的转折颠覆预期，刺激读者好奇心",
  emotion: "通过情感共鸣和情绪渲染建立读者粘性，让读者关心角色命运",
  progression: "通过成长升级和突破展示满足读者爽感期待",
};

// ─── Cool Point (爽点) 模式 ───
export type CoolPointPattern =
  | "face_slap"          // 打脸：以弱胜强、扮猪吃虎
  | "power_reveal"       // 实力展示：底牌揭示、碾压
  | "treasure_gain"      // 获宝：奇遇、传承、神器
  | "status_elevation"   // 地位提升：拜师、封赏、身份揭晓
  | "mystery_solved"     // 谜底揭晓：真相大白、身世揭秘
  | "revenge_complete"   // 复仇达成：以牙还牙、恶有恶报
  | "relationship_peak"  // 关系高潮：表白、结义、背叛揭穿
  | "crisis_resolve";    // 危机化解：绝境翻盘、力挽狂澜

export const COOL_POINT_PATTERNS: readonly CoolPointPattern[] = [
  "face_slap", "power_reveal", "treasure_gain", "status_elevation",
  "mystery_solved", "revenge_complete", "relationship_peak", "crisis_resolve",
] as const;

export const COOL_POINT_LABELS: Record<CoolPointPattern, string> = {
  face_slap: "打脸",
  power_reveal: "实力展示",
  treasure_gain: "获宝奇遇",
  status_elevation: "地位跃升",
  mystery_solved: "谜底揭晓",
  revenge_complete: "复仇达成",
  relationship_peak: "关系高潮",
  crisis_resolve: "绝境翻盘",
};

// ─── Micro Payoff (微型回报) 类型 ───
export type MicroPayoffType =
  | "foreshadow_callback"  // 伏笔回收
  | "skill_application"    // 技能应用：之前学到的能力派上用场
  | "character_growth"     // 角色成长：性格变化的微妙体现
  | "world_expansion"      // 世界扩展：设定揭示带来新鲜感
  | "humor_relief"         // 幽默调剂：紧张后的轻松时刻
  | "promise_kept"         // 承诺兑现：前文许下的承诺得到履行
  | "detail_reward";       // 细节奖励：认真阅读的读者获得的满足

export const MICRO_PAYOFF_TYPES: readonly MicroPayoffType[] = [
  "foreshadow_callback", "skill_application", "character_growth",
  "world_expansion", "humor_relief", "promise_kept", "detail_reward",
] as const;

export const MICRO_PAYOFF_LABELS: Record<MicroPayoffType, string> = {
  foreshadow_callback: "伏笔回收",
  skill_application: "技能应用",
  character_growth: "角色成长",
  world_expansion: "世界扩展",
  humor_relief: "幽默调剂",
  promise_kept: "承诺兑现",
  detail_reward: "细节奖励",
};

// ─── Hard Invariants (硬约束) ───
export interface HardInvariant {
  id: string;
  label: string;
  description: string;
}

export const HARD_INVARIANTS: readonly HardInvariant[] = [
  {
    id: "no_ooc",
    label: "禁止OOC",
    description: "角色言行必须符合已建立的性格设定，不得无故偏离",
  },
  {
    id: "no_deus_ex_machina",
    label: "禁止天降神兵",
    description: "解决危机必须有合理铺垫，不得凭空出现未交代的力量或人物",
  },
  {
    id: "power_system_consistent",
    label: "力量体系一致",
    description: "修炼等级、战力对比必须遵循已建立的力量体系，不得随意打破",
  },
  {
    id: "timeline_coherent",
    label: "时间线一致",
    description: "事件发生的时间顺序和因果关系必须自洽，不得出现时间矛盾",
  },
  {
    id: "worldbuilding_consistent",
    label: "世界观一致",
    description: "地理、历史、社会规则等世界设定必须前后一致",
  },
  {
    id: "no_info_leak",
    label: "禁止信息泄露",
    description: "角色不得知道超出其信息获取范围的内容，不得读者视角代入",
  },
  {
    id: "emotional_continuity",
    label: "情感连续性",
    description: "角色的情感状态变化必须有过渡和原因，不得突变",
  },
] as const;

// ─── Soft Guidance (软引导) ───
export interface SoftGuidance {
  id: string;
  label: string;
  description: string;
  weight: number; // 0-1, higher = more important
}

export const SOFT_GUIDANCES: readonly SoftGuidance[] = [
  {
    id: "hook_density",
    label: "钩子密度",
    description: "每2000-3000字至少布置一个有效钩子，保持追读动力",
    weight: 0.9,
  },
  {
    id: "cool_point_pacing",
    label: "爽点节奏",
    description: "爽点需要铺垫-蓄力-爆发的节奏，不要连续堆爽点导致疲劳",
    weight: 0.85,
  },
  {
    id: "micro_payoff_frequency",
    label: "微回报频率",
    description: "每章至少有1-2个微型回报，维持阅读满足感",
    weight: 0.8,
  },
  {
    id: "tension_curve",
    label: "张力曲线",
    description: "章节内张力应呈波浪上升趋势，高低交替，结尾略高于开头",
    weight: 0.75,
  },
  {
    id: "chapter_end_hook",
    label: "章末钩子",
    description: "每章结尾必须有一个有效钩子，形式可变但必须制造追读动力",
    weight: 0.95,
  },
  {
    id: "show_dont_tell",
    label: "展示而非叙述",
    description: "优先通过场景、对话、动作展示信息，减少直接叙述和心理旁白",
    weight: 0.7,
  },
] as const;
