import type { HookType, CoolPointPattern, MicroPayoffType } from "./readingPowerTaxonomy";

export interface GenreHookConfig {
  primary: HookType[];
  secondary: HookType[];
  avoidOveruse: HookType[];
}

export interface GenreCoolPointConfig {
  signature: CoolPointPattern[];
  occasional: CoolPointPattern[];
  rare: CoolPointPattern[];
}

export interface GenreMicroPayoffConfig {
  frequent: MicroPayoffType[];
  moderate: MicroPayoffType[];
}

export interface GenrePacingConfig {
  chapterHookDensity: number;        // 每章推荐钩子数
  coolPointInterval: number;         // 每N章至少一个大爽点
  tensionFloor: number;              // 最低张力值 0-1
  tensionCeiling: number;            // 最高张力值 0-1
  buildupToPayoffRatio: number;      // 铺垫:爆发 比例
}

export interface GenreProfile {
  id: string;
  label: string;
  description: string;
  hookConfig: GenreHookConfig;
  coolPointConfig: GenreCoolPointConfig;
  microPayoffConfig: GenreMicroPayoffConfig;
  pacingConfig: GenrePacingConfig;
  toneKeywords: string[];
  avoidKeywords: string[];
}

export const GENRE_PROFILES: readonly GenreProfile[] = [
  {
    id: "shuangwen",
    label: "爽文",
    description: "以快节奏爽感为核心的网文类型，强调打脸、升级、碾压",
    hookConfig: {
      primary: ["progression", "conflict"],
      secondary: ["reversal"],
      avoidOveruse: ["emotion"],
    },
    coolPointConfig: {
      signature: ["face_slap", "power_reveal"],
      occasional: ["treasure_gain", "status_elevation"],
      rare: ["mystery_solved"],
    },
    microPayoffConfig: {
      frequent: ["skill_application", "detail_reward"],
      moderate: ["foreshadow_callback", "world_expansion"],
    },
    pacingConfig: {
      chapterHookDensity: 3,
      coolPointInterval: 2,
      tensionFloor: 0.4,
      tensionCeiling: 0.95,
      buildupToPayoffRatio: 0.3,
    },
    toneKeywords: ["爽快", "节奏紧凑", "高燃", "碾压", "逆袭"],
    avoidKeywords: ["拖沓", "文艺腔", "长篇心理描写"],
  },
  {
    id: "xianxia",
    label: "仙侠",
    description: "以修仙求道为核心的东方奇幻类型，强调境界突破和世界探索",
    hookConfig: {
      primary: ["progression", "suspense"],
      secondary: ["conflict", "reversal"],
      avoidOveruse: ["emotion"],
    },
    coolPointConfig: {
      signature: ["power_reveal", "treasure_gain"],
      occasional: ["face_slap", "crisis_resolve"],
      rare: ["mystery_solved", "status_elevation"],
    },
    microPayoffConfig: {
      frequent: ["world_expansion", "skill_application"],
      moderate: ["foreshadow_callback", "character_growth"],
    },
    pacingConfig: {
      chapterHookDensity: 2,
      coolPointInterval: 3,
      tensionFloor: 0.3,
      tensionCeiling: 0.9,
      buildupToPayoffRatio: 0.5,
    },
    toneKeywords: ["磅礴", "大气", "悠远", "仙气", "玄妙"],
    avoidKeywords: ["现代口语", "网络用语", "过度搞笑"],
  },
  {
    id: "romance",
    label: "言情",
    description: "以情感关系为核心的类型，强调情感互动和关系推进",
    hookConfig: {
      primary: ["emotion", "suspense"],
      secondary: ["reversal", "conflict"],
      avoidOveruse: ["progression"],
    },
    coolPointConfig: {
      signature: ["relationship_peak", "mystery_solved"],
      occasional: ["revenge_complete", "status_elevation"],
      rare: ["face_slap"],
    },
    microPayoffConfig: {
      frequent: ["character_growth", "promise_kept"],
      moderate: ["foreshadow_callback", "humor_relief"],
    },
    pacingConfig: {
      chapterHookDensity: 2,
      coolPointInterval: 4,
      tensionFloor: 0.2,
      tensionCeiling: 0.85,
      buildupToPayoffRatio: 0.6,
    },
    toneKeywords: ["细腻", "温暖", "甜蜜", "虐心", "心动"],
    avoidKeywords: ["粗暴", "无脑打斗", "忽略情感"],
  },
  {
    id: "mystery",
    label: "悬疑推理",
    description: "以解谜和推理为核心的类型，强调线索布置和真相揭示",
    hookConfig: {
      primary: ["suspense", "reversal"],
      secondary: ["conflict", "emotion"],
      avoidOveruse: ["progression"],
    },
    coolPointConfig: {
      signature: ["mystery_solved", "crisis_resolve"],
      occasional: ["revenge_complete", "relationship_peak"],
      rare: ["power_reveal"],
    },
    microPayoffConfig: {
      frequent: ["foreshadow_callback", "detail_reward"],
      moderate: ["character_growth", "world_expansion"],
    },
    pacingConfig: {
      chapterHookDensity: 3,
      coolPointInterval: 5,
      tensionFloor: 0.35,
      tensionCeiling: 0.95,
      buildupToPayoffRatio: 0.7,
    },
    toneKeywords: ["紧张", "烧脑", "层层递进", "出人意料", "逻辑缜密"],
    avoidKeywords: ["低智商", "显而易见", "强行巧合"],
  },
  {
    id: "urban-power",
    label: "都市",
    description: "以都市背景为核心的类型，强调权谋博弈和社会地位",
    hookConfig: {
      primary: ["conflict", "reversal"],
      secondary: ["suspense", "progression"],
      avoidOveruse: ["emotion"],
    },
    coolPointConfig: {
      signature: ["face_slap", "status_elevation"],
      occasional: ["revenge_complete", "power_reveal"],
      rare: ["mystery_solved"],
    },
    microPayoffConfig: {
      frequent: ["skill_application", "detail_reward"],
      moderate: ["character_growth", "promise_kept"],
    },
    pacingConfig: {
      chapterHookDensity: 2,
      coolPointInterval: 3,
      tensionFloor: 0.3,
      tensionCeiling: 0.9,
      buildupToPayoffRatio: 0.4,
    },
    toneKeywords: ["犀利", "现实", "权谋", "逆袭", "商战"],
    avoidKeywords: ["过于中二", "脱离现实", "龙傲天"],
  },
  {
    id: "rules-mystery",
    label: "规则怪谈",
    description: "以诡异规则和生存挑战为核心的类型，强调气氛营造和规则解读",
    hookConfig: {
      primary: ["suspense", "conflict"],
      secondary: ["reversal", "emotion"],
      avoidOveruse: ["progression"],
    },
    coolPointConfig: {
      signature: ["mystery_solved", "crisis_resolve"],
      occasional: ["power_reveal", "revenge_complete"],
      rare: ["status_elevation"],
    },
    microPayoffConfig: {
      frequent: ["foreshadow_callback", "detail_reward"],
      moderate: ["world_expansion", "skill_application"],
    },
    pacingConfig: {
      chapterHookDensity: 3,
      coolPointInterval: 4,
      tensionFloor: 0.5,
      tensionCeiling: 1.0,
      buildupToPayoffRatio: 0.65,
    },
    toneKeywords: ["诡异", "紧张", "窒息感", "细思极恐", "规则"],
    avoidKeywords: ["轻松日常", "无脑搞笑", "忽视氛围"],
  },
  {
    id: "history-travel",
    label: "历史穿越",
    description: "以穿越到历史时代为核心的类型，强调历史知识运用和蝴蝶效应",
    hookConfig: {
      primary: ["suspense", "progression"],
      secondary: ["conflict", "reversal"],
      avoidOveruse: ["emotion"],
    },
    coolPointConfig: {
      signature: ["status_elevation", "face_slap"],
      occasional: ["mystery_solved", "crisis_resolve"],
      rare: ["treasure_gain"],
    },
    microPayoffConfig: {
      frequent: ["skill_application", "world_expansion"],
      moderate: ["foreshadow_callback", "character_growth"],
    },
    pacingConfig: {
      chapterHookDensity: 2,
      coolPointInterval: 3,
      tensionFloor: 0.25,
      tensionCeiling: 0.85,
      buildupToPayoffRatio: 0.55,
    },
    toneKeywords: ["厚重", "权谋", "智计", "蝴蝶效应", "历史感"],
    avoidKeywords: ["现代思维过重", "魔改历史", "无视时代背景"],
  },
  {
    id: "game-lit",
    label: "游戏文",
    description: "以游戏系统/数值为核心的类型，强调系统探索和数值成长",
    hookConfig: {
      primary: ["progression", "suspense"],
      secondary: ["conflict", "reversal"],
      avoidOveruse: ["emotion"],
    },
    coolPointConfig: {
      signature: ["power_reveal", "treasure_gain"],
      occasional: ["face_slap", "crisis_resolve"],
      rare: ["mystery_solved", "status_elevation"],
    },
    microPayoffConfig: {
      frequent: ["skill_application", "world_expansion"],
      moderate: ["detail_reward", "foreshadow_callback"],
    },
    pacingConfig: {
      chapterHookDensity: 3,
      coolPointInterval: 2,
      tensionFloor: 0.3,
      tensionCeiling: 0.9,
      buildupToPayoffRatio: 0.35,
    },
    toneKeywords: ["系统", "数据流", "探索", "升级", "彩蛋"],
    avoidKeywords: ["数值堆砌", "无聊刷怪", "无剧情推进"],
  },
] as const;
