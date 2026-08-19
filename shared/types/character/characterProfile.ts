export interface CharacterProfileKeyRelation {
  targetName: string;
  relationType: string;
  description?: string;
}

export interface CharacterProfileHighlightScene {
  sceneLabel: string;
  performance: string;
}

export interface CharacterProfile {
  name: string;
  aliases?: string[];
  age?: string;
  gender?: string;
  role: string;
  appearance?: string;
  physique?: string;
  attireStyle?: string;
  signatureDetail?: string;
  personality?: string;
  values?: string;
  speakingStyle?: string;
  outerGoal?: string;
  innerNeed?: string;
  fear?: string;
  wound?: string;
  misbelief?: string;
  arcStages?: string[];
  growthTrajectory?: string;
  keyRelations?: CharacterProfileKeyRelation[];
  highlightScenes?: CharacterProfileHighlightScene[];
}

export const CHARACTER_PROFILE_FIELD_LABELS: Readonly<Record<keyof CharacterProfile, string>> = {
  name: "姓名",
  aliases: "别名",
  age: "年龄",
  gender: "性别",
  role: "角色定位",
  appearance: "外貌",
  physique: "体态",
  attireStyle: "服饰风格",
  signatureDetail: "标志细节",
  personality: "性格",
  values: "价值观",
  speakingStyle: "说话方式",
  outerGoal: "外在目标",
  innerNeed: "内在需求",
  fear: "恐惧",
  wound: "创伤",
  misbelief: "错误信念",
  arcStages: "弧线阶段",
  growthTrajectory: "成长轨迹",
  keyRelations: "关键关系",
  highlightScenes: "高光场景",
};

export const CHARACTER_PROFILE_TEXT_LIMITS: Readonly<Partial<Record<keyof CharacterProfile, number>>> = {
  name: 40,
  role: 80,
  appearance: 320,
  personality: 320,
  speakingStyle: 240,
  outerGoal: 240,
  innerNeed: 240,
  growthTrajectory: 360,
};
