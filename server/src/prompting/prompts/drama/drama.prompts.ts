import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";
import type { PromptAsset } from "../../core/promptTypes";

const sourceFactSchema = z.object({
  text: z.string().trim().min(1),
  category: z.enum(["completed", "revealed", "state_changed"]).default("completed"),
});

const sourceCharacterSchema = z.object({
  name: z.string().trim().min(1),
  persona: z.string().trim().optional(),
  relations: z.string().trim().optional(),
  visualHint: z.string().trim().optional(),
  sourceCharacterRef: z.string().trim().optional(),
});

const sourceBeatSchema = z.object({
  order: z.number().int().min(1),
  summary: z.string().trim().min(1),
  sourceChapterStart: z.number().int().min(1).optional(),
  sourceChapterEnd: z.number().int().min(1).optional(),
});

export const dramaSourceBundleOutputSchema = z.object({
  synopsis: z.string().trim().min(1),
  beats: z.array(sourceBeatSchema).min(1).max(120),
  characters: z.array(sourceCharacterSchema).min(1).max(30),
  worldNotes: z.string().trim().optional(),
  hardFacts: z.array(sourceFactSchema).optional(),
  rawText: z.string().trim().optional(),
});

export type DramaSourceBundleOutput = z.infer<typeof dramaSourceBundleOutputSchema>;

const dramaTrackIdSchema = z.enum([
  "counterattack",
  "rebirth_revenge",
  "war_god",
  "live_in_son",
  "miracle_doctor",
  "rich_family",
  "sweet_love",
  "hidden_identity",
]);

export const dramaTrackRecommendationOutputSchema = z.object({
  recommendedTrack: dramaTrackIdSchema,
  reason: z.string().trim().min(1),
  fitSignals: z.array(z.string().trim().min(1)).min(1).max(6),
  risks: z.array(z.string().trim().min(1)).max(5).default([]),
  alternatives: z.array(z.object({
    track: dramaTrackIdSchema,
    reason: z.string().trim().min(1),
  })).max(3).default([]),
});

export type DramaTrackRecommendationOutput = z.infer<typeof dramaTrackRecommendationOutputSchema>;

export interface DramaTrackRecommendationPromptInput {
  title: string;
  sourceType: string;
  sourceDigest: string;
  theme?: string;
  targetEpisodes: number;
  trackCatalog: string;
}

export const dramaTrackRecommendationPrompt: PromptAsset<
  DramaTrackRecommendationPromptInput,
  DramaTrackRecommendationOutput
> = {
  id: "drama.track.recommendation",
  version: "v1",
  taskType: "outline_planning",
  mode: "structured",
  language: "zh",
  contextPolicy: { maxTokensBudget: 5000 },
  outputSchema: dramaTrackRecommendationOutputSchema,
  render: (input) => [
    new SystemMessage([
      "你是竖屏付费短剧选题策划，负责帮创作新手从故事素材中选择最适合的短剧赛道。",
      "必须根据故事核心冲突、主角处境、爽点兑现方式和付费短剧赛道规则作判断。",
      "只能从给定赛道目录中选择 recommendedTrack 和 alternatives.track。",
      "只输出符合 schema 的 JSON，不要 Markdown。",
    ].join("\n")),
    new HumanMessage([
      `【项目名】${input.title}`,
      `【内容来源】${input.sourceType}`,
      `【题材补充】${input.theme || "未填写"}`,
      `【目标集数】${input.targetEpisodes}`,
      "",
      `【赛道目录】\n${input.trackCatalog}`,
      "",
      `【故事素材】\n${input.sourceDigest}`,
      "",
      "请推荐一个最适合的短剧赛道，并给出适配信号、风险和备选赛道。",
    ].join("\n")),
  ],
};

export const dramaSourceSupplementOutputSchema = z.object({
  readiness: z.enum(["ready", "needs_supplement", "needs_rebuild"]),
  summary: z.string().trim().min(1),
  missingItems: z.array(z.object({
    area: z.enum(["synopsis", "beats", "characters", "facts", "world", "other"]),
    problem: z.string().trim().min(1),
    impact: z.string().trim().min(1),
  })).max(8),
  questions: z.array(z.object({
    question: z.string().trim().min(1),
    guidance: z.string().trim().min(1),
    priority: z.enum(["high", "medium", "low"]),
  })).min(1).max(8),
  nextAction: z.enum(["continue", "supplement_notes", "rebuild_source_bundle"]),
});

export type DramaSourceSupplementOutput = z.infer<typeof dramaSourceSupplementOutputSchema>;

export interface DramaSourceSupplementPromptInput {
  projectTitle: string;
  sourceType: string;
  targetEpisodes: number;
  qualitySnapshot: string;
  synopsis: string;
  beatsDigest: string;
  charactersDigest: string;
  factsDigest: string;
  userSupplement?: string;
}

export const dramaSourceSupplementPrompt: PromptAsset<
  DramaSourceSupplementPromptInput,
  DramaSourceSupplementOutput
> = {
  id: "drama.source.supplement",
  version: "v1",
  taskType: "outline_planning",
  mode: "structured",
  language: "zh",
  contextPolicy: { maxTokensBudget: 7000 },
  outputSchema: dramaSourceSupplementOutputSchema,
  render: (input) => [
    new SystemMessage([
      "你是竖屏短剧素材诊断助手，负责判断 SourceBundle 是否足够进入策略、分集和台本生成。",
      "你的输出要帮助创作新手补齐最关键的信息，问题必须具体、易回答、能直接改善后续生成。",
      "不要把普通小瑕疵说成阻断；只有素材严重不足或需要重整内容包时才建议 rebuild_source_bundle。",
      "只输出符合 schema 的 JSON，不要 Markdown。",
    ].join("\n")),
    new HumanMessage([
      `【项目】${input.projectTitle}`,
      `【来源】${input.sourceType}`,
      `【目标集数】${input.targetEpisodes}`,
      `【质量快照】\n${input.qualitySnapshot}`,
      "",
      `【梗概】\n${input.synopsis || "空"}`,
      `【节拍摘要】\n${input.beatsDigest || "空"}`,
      `【角色摘要】\n${input.charactersDigest || "空"}`,
      `【硬事实】\n${input.factsDigest || "空"}`,
      input.userSupplement ? `【用户补充】\n${input.userSupplement}` : "",
      "",
      "请输出素材可用性诊断、缺口、补充问题和下一步建议。",
    ].filter(Boolean).join("\n")),
  ],
};

export interface DramaOriginalSourcePromptInput {
  title: string;
  inspiration: string;
  track?: string;
  theme?: string;
  targetEpisodes: number;
}

export const dramaOriginalSourcePrompt: PromptAsset<
  DramaOriginalSourcePromptInput,
  DramaSourceBundleOutput
> = {
  id: "drama.source.original_bundle",
  version: "v1",
  taskType: "outline_planning",
  mode: "structured",
  language: "zh",
  contextPolicy: { maxTokensBudget: 5000 },
  outputSchema: dramaSourceBundleOutputSchema,
  render: (input) => [
    new SystemMessage([
      "你是竖屏付费短剧策划，负责把原创灵感整理为可进入短剧产线的标准内容包。",
      "必须用 AI 结构化理解补齐主线、角色、关键节拍和硬事实。",
      "只输出符合 schema 的 JSON，不要 Markdown。",
    ].join("\n")),
    new HumanMessage([
      `【标题】${input.title}`,
      `【灵感】${input.inspiration}`,
      `【赛道】${input.track || "未指定，由你按短剧市场判断"}`,
      `【题材】${input.theme || "未指定"}`,
      `【目标集数】${input.targetEpisodes}`,
      "",
      "请生成 SourceBundle：synopsis、beats、characters、worldNotes、hardFacts。",
      "beats 用 12-24 个高密度剧情节拍表达，不要写成长篇章节。",
    ].join("\n")),
  ],
};

export interface DramaTextImportSourcePromptInput {
  title: string;
  rawText: string;
  track?: string;
  theme?: string;
  targetEpisodes: number;
}

export const dramaTextImportSourcePrompt: PromptAsset<
  DramaTextImportSourcePromptInput,
  DramaSourceBundleOutput
> = {
  id: "drama.source.text_bundle",
  version: "v1",
  taskType: "outline_planning",
  mode: "structured",
  language: "zh",
  contextPolicy: { maxTokensBudget: 9000 },
  outputSchema: dramaSourceBundleOutputSchema,
  render: (input) => [
    new SystemMessage([
      "你是竖屏短剧改编策划，负责把导入文本解析成与来源无关的 SourceBundle。",
      "要保留核心人物、冲突、反转、硬事实和可改编节拍，避免逐字复述。",
      "只输出符合 schema 的 JSON，不要 Markdown。",
    ].join("\n")),
    new HumanMessage([
      `【标题】${input.title}`,
      `【赛道】${input.track || "未指定"}`,
      `【题材】${input.theme || "未指定"}`,
      `【目标集数】${input.targetEpisodes}`,
      "",
      `【导入文本】\n${input.rawText.slice(0, 24000)}`,
      "",
      "请输出 SourceBundle。beats 应按剧情推进整理为可供短剧分集使用的节拍。",
    ].join("\n")),
  ],
};

export const dramaStrategyOutputSchema = z.object({
  positioning: z.string().trim().min(1),
  mainPleasureLine: z.string().trim().min(1),
  paywallNote: z.string().trim().min(1),
  paywallPlan: z.object({
    firstPaywallAt: z.number().int().min(8).max(15),
    freeEpisodes: z.number().int().min(1).max(20),
    paywallCadence: z.number().int().min(1).max(5),
    cliffhangerStrengthThreshold: z.number().int().min(60).max(100),
    buildupBeforePaywall: z.string().trim().min(1),
    intensityCurve: z.array(z.object({
      fromEpisode: z.number().int().min(1),
      toEpisode: z.number().int().min(1),
      goal: z.string().trim().min(1),
      targetEmotionNet: z.number().int().min(-5).max(5),
    })).min(1).max(8),
  }),
  emotionCurveNote: z.string().trim().min(1),
  deviationDeclaration: z.string().trim().min(1),
});

export type DramaStrategyOutput = z.infer<typeof dramaStrategyOutputSchema>;

export interface DramaStrategyPromptInput {
  synopsis: string;
  trackLabel: string;
  trackDescription: string;
  rhythmNote: string;
  taboos: string;
  preferredHooks: string;
  targetEpisodes: number;
  freeEpisodes: number;
  firstPaywallAt: number;
}

export const dramaStrategyPrompt: PromptAsset<
  DramaStrategyPromptInput,
  DramaStrategyOutput
> = {
  id: "drama.strategy",
  version: "v1",
  taskType: "outline_planning",
  mode: "structured",
  language: "zh",
  contextPolicy: { maxTokensBudget: 4000 },
  outputSchema: dramaStrategyOutputSchema,
  render: (input) => [
    new SystemMessage([
      "你是顶尖的竖屏付费短剧操盘人，擅长把一个故事改编成高完播、高付费转化的短剧。",
      "你的任务是基于内容梗概与赛道法则，产出这部短剧的改编策略。",
      "只输出符合 schema 的严格 JSON，不要 Markdown、解释或代码块。",
    ].join("\n")),
    new HumanMessage([
      `【内容梗概】\n${input.synopsis}`,
      "",
      `【赛道】${input.trackLabel}：${input.trackDescription}`,
      `【该赛道爽点节奏】${input.rhythmNote}`,
      `【该赛道偏好钩子】${input.preferredHooks}`,
      `【赛道禁忌】${input.taboos}`,
      `【总集数】${input.targetEpisodes}`,
      `【免费引流】前 ${input.freeEpisodes} 集`,
      `【首付费点】第 ${input.firstPaywallAt} 集`,
      "",
      "请输出这部竖屏付费短剧的改编策略 JSON。",
      "paywallPlan.firstPaywallAt 必须在第 8-15 集之间，并结合素材确定首付费点。",
      "paywallPlan.intensityCurve 要把免费引流、付费前蓄憋屈、首付费强卡点和后续连续付费卡点拆成可执行区间。",
    ].join("\n")),
  ],
};

export const dramaEpisodeOutlineItemSchema = z.object({
  order: z.number().int().min(1),
  title: z.string().trim().min(1),
  hookOpening: z.string().trim().min(1),
  hookType: z.string().trim().min(1),
  conflict: z.string().trim().min(1),
  cliffhanger: z.string().trim().min(1),
  emotionNet: z.number().int().min(-5).max(5),
  sourceBeatRefs: z.array(z.number().int()).optional(),
});

export const dramaEpisodeOutlineOutputSchema = z.object({
  episodes: z.array(dramaEpisodeOutlineItemSchema).min(1).max(40),
});

export type DramaEpisodeOutlineOutput = z.infer<typeof dramaEpisodeOutlineOutputSchema>;

export interface DramaEpisodeOutlinePromptInput {
  synopsis: string;
  strategyJson: string;
  beatsDigest: string;
  trackLabel: string;
  hookLibrary: string;
  startOrder: number;
  count: number;
  paywallEpisodes: string;
  paywallPlanDigest: string;
}

export const dramaEpisodeOutlinePrompt: PromptAsset<
  DramaEpisodeOutlinePromptInput,
  DramaEpisodeOutlineOutput
> = {
  id: "drama.episodeOutline",
  version: "v1",
  taskType: "outline_planning",
  mode: "structured",
  language: "zh",
  contextPolicy: { maxTokensBudget: 8000 },
  outputSchema: dramaEpisodeOutlineOutputSchema,
  render: (input) => [
    new SystemMessage([
      "你是顶尖的竖屏付费短剧编剧，负责把故事切成强钩子、强卡点的分集结构。",
      "每集必须包含黄金3秒钩子、主钩子类型、核心冲突、集尾卡点、情绪净值和源映射。",
      "只输出符合 schema 的严格 JSON，不要 Markdown、解释或代码块。",
    ].join("\n")),
    new HumanMessage([
      `【内容梗概】\n${input.synopsis}`,
      `【改编策略】\n${input.strategyJson}`,
      `【赛道】${input.trackLabel}`,
      `【钩子库】\n${input.hookLibrary}`,
      `【内容节拍摘要】\n${input.beatsDigest}`,
      `【本次生成区间】第 ${input.startOrder} 集起，共 ${input.count} 集`,
      `【付费卡点集号】${input.paywallEpisodes || "无"}`,
      `【付费卡点计划】\n${input.paywallPlanDigest}`,
      "",
      "请输出该区间的分集大纲 JSON。",
      "如果本区间包含首付费集，首付费前一集应形成阶段性低谷，首付费集结尾必须达到计划中的强卡点目标。",
    ].join("\n")),
  ],
};

export const dramaScriptOutputSchema = z.object({
  content: z.string().trim().min(1),
  durationSec: z.number().int().min(20).max(300),
  sceneCount: z.number().int().min(1).max(12),
  opening3s: z.string().trim().min(1),
  endingCliffhanger: z.string().trim().min(1),
  newlyIntroducedFacts: z.array(sourceFactSchema).optional(),
  episodeSummary: z.string().trim().min(1),
});

export type DramaScriptOutput = z.infer<typeof dramaScriptOutputSchema>;

export interface DramaScriptPromptInput {
  projectTitle: string;
  strategyJson: string;
  episodeJson: string;
  charactersDigest: string;
  factsDigest: string;
  previousDigest: string;
  sourceDigest: string;
}

export const dramaScriptPrompt: PromptAsset<DramaScriptPromptInput, DramaScriptOutput> = {
  id: "drama.episode.script",
  version: "v1",
  taskType: "chapter_drafting",
  mode: "structured",
  language: "zh",
  contextPolicy: { maxTokensBudget: 9000 },
  outputSchema: dramaScriptOutputSchema,
  render: (input) => [
    new SystemMessage([
      "你是竖屏付费短剧台本编剧。输出必须可拍、对白密集、冲突推进快。",
      "台本要包含角色名、动作提示和对白；不要写小说化大段心理描写。",
      "开场 3 秒必须有冲突/悬念/反差，结尾必须有强卡点。",
      "只输出符合 schema 的 JSON。",
    ].join("\n")),
    new HumanMessage([
      `【项目】${input.projectTitle}`,
      `【策略】\n${input.strategyJson}`,
      `【本集大纲】\n${input.episodeJson}`,
      `【角色】\n${input.charactersDigest}`,
      `【事实账本】\n${input.factsDigest}`,
      `【前序摘要】\n${input.previousDigest}`,
      `【来源节拍】\n${input.sourceDigest}`,
      "",
      "请生成这一集的短剧台本 JSON。",
    ].join("\n")),
  ],
};

export const dramaQualityOutputSchema = z.object({
  status: z.enum(["approved", "repairable", "continue_with_warning", "blocked"]),
  score: z.object({
    hook: z.number().int().min(0).max(100),
    density: z.number().int().min(0).max(100),
    paywall: z.number().int().min(0).max(100),
    emotion: z.number().int().min(0).max(100),
    duration: z.number().int().min(0).max(100),
    consistency: z.number().int().min(0).max(100),
    overall: z.number().int().min(0).max(100),
  }),
  flags: z.array(z.object({
    severity: z.enum(["low", "medium", "high", "critical"]),
    code: z.string().trim().min(1),
    evidence: z.string().trim().min(1),
    suggestion: z.string().trim().min(1),
  })),
  repairPlan: z.object({
    mode: z.enum(["patch", "regenerate"]),
    instruction: z.string().trim().min(1),
  }).optional(),
});

export type DramaQualityOutput = z.infer<typeof dramaQualityOutputSchema>;

export interface DramaQualityPromptInput {
  episodeJson: string;
  content: string;
  factsDigest: string;
  charactersDigest: string;
  strategyJson: string;
  paywallPlanDigest: string;
  episodeRhythmDigest: string;
}

export const dramaQualityPrompt: PromptAsset<DramaQualityPromptInput, DramaQualityOutput> = {
  id: "drama.episode.quality",
  version: "v1",
  taskType: "chapter_review",
  mode: "structured",
  language: "zh",
  contextPolicy: { maxTokensBudget: 7000 },
  outputSchema: dramaQualityOutputSchema,
  render: (input) => [
    new SystemMessage([
      "你是竖屏付费短剧质量闸，检查台本是否适合高完播和付费转化。",
      "重点检查黄金3秒、信息密度、付费卡点、情绪曲线、时长、事实一致和角色一致。",
      "本地质量问题应给出可修复建议；只有无可用内容或严重事实冲突才 blocked。",
      "只输出符合 schema 的 JSON。",
    ].join("\n")),
    new HumanMessage([
      `【本集大纲】\n${input.episodeJson}`,
      `【台本】\n${input.content}`,
      `【策略】\n${input.strategyJson}`,
      `【付费卡点计划】\n${input.paywallPlanDigest}`,
      `【相邻分集节奏】\n${input.episodeRhythmDigest}`,
      `【事实账本】\n${input.factsDigest}`,
      `【角色】\n${input.charactersDigest}`,
      "",
      "请输出质量评估 JSON。付费集要重点判断结尾卡点是否达到计划强度；首付费前一集要判断是否承担蓄憋屈低谷功能。",
    ].join("\n")),
  ],
};

export const dramaRepairPrompt: PromptAsset<{
  content: string;
  repairInstruction: string;
  episodeJson: string;
}, DramaScriptOutput> = {
  id: "drama.episode.repair",
  version: "v1",
  taskType: "chapter_repair",
  mode: "structured",
  language: "zh",
  contextPolicy: { maxTokensBudget: 8000 },
  outputSchema: dramaScriptOutputSchema,
  render: (input) => [
    new SystemMessage([
      "你是竖屏短剧台本修复编剧。基于明确修复指令重写这一集台本。",
      "保持本集大纲目标不变，修复钩子、卡点、时长、事实或角色问题。",
      "只输出符合 schema 的 JSON。",
    ].join("\n")),
    new HumanMessage([
      `【本集大纲】\n${input.episodeJson}`,
      `【修复指令】\n${input.repairInstruction}`,
      `【原台本】\n${input.content}`,
    ].join("\n")),
  ],
};

export const dramaStoryboardOutputSchema = z.object({
  summary: z.string().trim().min(1),
  shots: z.array(z.object({
    order: z.number().int().min(1),
    shotSize: z.string().trim().optional(),
    cameraMove: z.string().trim().optional(),
    durationSec: z.number().int().min(1).max(30).optional(),
    location: z.string().trim().optional(),
    action: z.string().trim().min(1),
    dialogue: z.string().trim().optional(),
    characterRefs: z.array(z.string().trim()).optional(),
    visualPrompt: z.string().trim().optional(),
  })).min(1).max(40),
});

export type DramaStoryboardOutput = z.infer<typeof dramaStoryboardOutputSchema>;

export const dramaStoryboardPrompt: PromptAsset<{
  content: string;
  charactersDigest: string;
}, DramaStoryboardOutput> = {
  id: "drama.storyboard",
  version: "v1",
  taskType: "outline_planning",
  mode: "structured",
  language: "zh",
  contextPolicy: { maxTokensBudget: 8000 },
  outputSchema: dramaStoryboardOutputSchema,
  render: (input) => [
    new SystemMessage([
      "你是竖屏短剧分镜师。把台本拆成可拍摄镜头序列，优先近景、中近景、强表情和明确动作。",
      "每个镜头必须能服务冲突推进，避免空镜和环境铺陈。",
      "只输出符合 schema 的 JSON。",
    ].join("\n")),
    new HumanMessage([
      `【角色视觉锚点】\n${input.charactersDigest}`,
      `【台本】\n${input.content}`,
    ].join("\n")),
  ],
};

export const dramaVideoPromptOutputSchema = z.object({
  prompt: z.string().trim().min(1),
  negativePrompt: z.string().trim().optional(),
  aspectRatio: z.string().trim().default("9:16"),
  durationSec: z.number().int().min(1).max(30).optional(),
});

export type DramaVideoPromptOutput = z.infer<typeof dramaVideoPromptOutputSchema>;

export const dramaVideoPromptPrompt: PromptAsset<{
  shotJson: string;
  charactersDigest: string;
}, DramaVideoPromptOutput> = {
  id: "drama.video.prompt",
  version: "v1",
  taskType: "outline_planning",
  mode: "structured",
  language: "zh",
  contextPolicy: { maxTokensBudget: 4000 },
  outputSchema: dramaVideoPromptOutputSchema,
  render: (input) => [
    new SystemMessage([
      "你是竖屏 AI 视频提示词导演。把单个短剧镜头转成视频生成提示词。",
      "提示词必须保留角色视觉锚点、动作、情绪、镜头语言和 9:16 竖屏构图。",
      "只输出符合 schema 的 JSON。",
    ].join("\n")),
    new HumanMessage([
      `【角色视觉锚点】\n${input.charactersDigest}`,
      `【镜头】\n${input.shotJson}`,
    ].join("\n")),
  ],
};
