export type PresetKey = "xiuxian" | "xuanyi" | "cyberpunk" | "dushi";

export interface TelosCreatorProfile {
  mission?: string;             // 创作使命 (如: "探讨人性微光与宿命反抗")
  goals?: string[];             // 目标偏好 (如: ["单章强悬念", "节奏紧凑"])
  beliefs?: string[];           // 核心价值观
  writingModels?: string[];     // 偏好的叙事结构模型
  writingStrategies?: string[]; // 常用写作策略 (如: "前 500 字必须出现冲突钩子")
  narrativeTone?: string;       // 专属口吻风味 (如: "冷峻克制、感官细节丰富")
  learnedTaboos?: string[];     // 禁用忌讳套路 (如: "严禁机械降神", "少用感叹词")
  challengesToAvoid?: string[]; // 防范瓶颈
}

export interface CreatorProfileStoreInput {
  creatorName?: string;
  activePreset?: PresetKey | null;
  profile: TelosCreatorProfile;
}

export const BUILTIN_CREATOR_PRESETS: Record<PresetKey, { label: string; profile: TelosCreatorProfile }> = {
  xiuxian: {
    label: "修仙立志",
    profile: {
      mission: "讲述凡人逆天改命、坚守本心的修仙传奇",
      narrativeTone: "宏大浩瀚、古风意境、动作描写利落",
      writingStrategies: ["章尾保留悬念", "境界突破突出艰难反差"],
      learnedTaboos: ["严禁主角无脑圣母", "少用现代网络流行语", "严禁机械降神"],
    },
  },
  xuanyi: {
    label: "悬疑古风",
    profile: {
      mission: "揭示深宅大院与市井暗流中的人心诡谲",
      narrativeTone: "暗流涌动、冷峻克制、重视细节与潜台词",
      writingStrategies: ["前 500 字抛出线索钩子", "对话带有隐藏动机"],
      learnedTaboos: ["严禁直接剧透凶手动机", "少用叙述性直接叹词", "严禁使用逻辑漏洞解谜"],
    },
  },
  cyberpunk: {
    label: "赛博朋克",
    profile: {
      mission: "展现高科技低生活下的个体挣扎与人性火花",
      narrativeTone: "霓虹阴冷、感官细节丰富、节奏硬核",
      writingStrategies: ["场景结合科技与破败对比", "强化身体改造与心理冲突"],
      learnedTaboos: ["严禁说教式大段背景科普", "少用低幼拟声词"],
    },
  },
  dushi: {
    label: "都市爽文",
    profile: {
      mission: "小人物逆袭翻盘，带来畅快淋漓的阅读体验",
      narrativeTone: "节奏明快、情感张力强、爽点突出",
      writingStrategies: ["打脸翻盘需有铺垫", "冲突升级迅速"],
      learnedTaboos: ["严禁拖沓憋屈超过 2 章", "少用平淡说明性文字"],
    },
  },
};
