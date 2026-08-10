import i18next from "i18next";
import type { BookAnalysisSectionKey } from "@ai-novel/shared/types/bookAnalysis";
import { formatCommercialTagsInput, normalizeCommercialTags } from "@ai-novel/shared/types/novelFraming";

export interface NovelBasicFormState {
  title: string;
  description: string;
  targetAudience: string;
  bookSellingPoint: string;
  competingFeel: string;
  first30ChapterPromise: string;
  commercialTagsText: string;
  genreId: string;
  primaryStoryModeId: string;
  secondaryStoryModeId: string;
  worldId: string;
  status: "draft" | "published";
  writingMode: "original" | "continuation";
  language: string;
  projectMode: "ai_led" | "co_pilot" | "draft_mode" | "auto_pipeline";
  readerChannelPreference: "ai_judge" | "male_oriented" | "female_oriented" | "general";
  narrativePov: "first_person" | "third_person" | "mixed";
  pacePreference: "slow" | "balanced" | "fast";
  styleTone: string;
  emotionIntensity: "low" | "medium" | "high";
  aiFreedom: "low" | "medium" | "high";
  postGenerationStyleReviewEnabled: boolean;
  defaultChapterLength: number;
  estimatedChapterCount: number;
  projectStatus: "not_started" | "in_progress" | "completed" | "rework" | "blocked";
  storylineStatus: "not_started" | "in_progress" | "completed" | "rework" | "blocked";
  outlineStatus: "not_started" | "in_progress" | "completed" | "rework" | "blocked";
  resourceReadyScore: number;
  continuationSourceType: "novel" | "knowledge_document";
  sourceNovelId: string;
  sourceKnowledgeDocumentId: string;
  continuationBookAnalysisId: string;
  continuationBookAnalysisSections: BookAnalysisSectionKey[];
}

export interface BasicInfoOption<T extends string> {
  value: T;
  label: string;
  summary: string;
  recommended?: boolean;
}

export const DEFAULT_ESTIMATED_CHAPTER_COUNT = 80;

export const WRITING_MODE_OPTIONS: BasicInfoOption<NovelBasicFormState["writingMode"]>[] = [
  {
    value: "original",
    label: i18next.t("common.original"),
    summary: i18next.t("novels.novelBasicInfo.shared.9a65cx"),
    recommended: true,
  },
  {
    value: "continuation",
    label: i18next.t("common.continuation"),
    summary: i18next.t("novels.novelBasicInfo.shared.q6tg6j"),
  },
];

export const PROJECT_MODE_OPTIONS: BasicInfoOption<NovelBasicFormState["projectMode"]>[] = [
  {
    value: "co_pilot",
    label: i18next.t("novels.novelBasicInfo.shared.11grmv"),
    summary: i18next.t("novels.novelBasicInfo.shared.9rah21"),
    recommended: true,
  },
  {
    value: "ai_led",
    label: i18next.t("novels.novelBasicInfo.shared.11jixg"),
    summary: i18next.t("novels.novelBasicInfo.shared.c7v4n4"),
  },
  {
    value: "draft_mode",
    label: i18next.t("creativeHub.novelProductionStarterCard.h2eo5i"),
    summary: i18next.t("novels.novelBasicInfo.shared.rerl6x"),
  },
  {
    value: "auto_pipeline",
    label: i18next.t("novels.novelBasicInfo.shared.f62ou4"),
    summary: i18next.t("novels.novelBasicInfo.shared.oe7g75"),
  },
];

export const READER_CHANNEL_OPTIONS: BasicInfoOption<NovelBasicFormState["readerChannelPreference"]>[] = [
  {
    value: "ai_judge",
    label: i18next.t("dict.aiJudging"),
    summary: i18next.t("novels.novelBasicInfo.shared.7pdep2"),
    recommended: true,
  },
  {
    value: "male_oriented",
    label: i18next.t("novels.novelBasicInfo.shared.hwhef"),
    summary: i18next.t("novels.novelBasicInfo.shared.mvb6td"),
  },
  {
    value: "female_oriented",
    label: i18next.t("novels.novelBasicInfo.shared.du2qb"),
    summary: i18next.t("novels.novelBasicInfo.shared.lixekm"),
  },
  {
    value: "general",
    label: i18next.t("novels.novelBasicInfo.shared.e6go5n"),
    summary: i18next.t("novels.novelBasicInfo.shared.445gfy"),
  },
];

export const POV_OPTIONS: BasicInfoOption<NovelBasicFormState["narrativePov"]>[] = [
  {
    value: "third_person",
    label: i18next.t("dict.gen_5eff3cab"),
    summary: i18next.t("novels.novelBasicInfo.shared.vmwto8"),
    recommended: true,
  },
  {
    value: "first_person",
    label: i18next.t("dict.gen_f69e8c5f"),
    summary: i18next.t("novels.novelBasicInfo.shared.e3rzg9"),
  },
  {
    value: "mixed",
    label: i18next.t("dict.gen_73b444ba"),
    summary: i18next.t("novels.novelBasicInfo.shared.km8jno"),
  },
];

export const PACE_OPTIONS: BasicInfoOption<NovelBasicFormState["pacePreference"]>[] = [
  {
    value: "balanced",
    label: i18next.t("dict.gen_f07d8f75"),
    summary: i18next.t("novels.novelBasicInfo.shared.ehy0pa"),
    recommended: true,
  },
  {
    value: "slow",
    label: i18next.t("dict.gen_7209da38"),
    summary: i18next.t("novels.novelBasicInfo.shared.210sxp"),
  },
  {
    value: "fast",
    label: i18next.t("dict.gen_de82b2fd"),
    summary: i18next.t("novels.novelBasicInfo.shared.s4i63j"),
  },
];

export const EMOTION_OPTIONS: BasicInfoOption<NovelBasicFormState["emotionIntensity"]>[] = [
  {
    value: "medium",
    label: i18next.t("dict.mediumEmotionalIntensity"),
    summary: i18next.t("novels.novelBasicInfo.shared.enkepd"),
    recommended: true,
  },
  {
    value: "low",
    label: i18next.t("dict.lowEmotionalIntensity"),
    summary: i18next.t("novels.novelBasicInfo.shared.ap89ok"),
  },
  {
    value: "high",
    label: i18next.t("dict.gen_13fc3cc2"),
    summary: i18next.t("novels.novelBasicInfo.shared.d44uzm"),
  },
];

export const AI_FREEDOM_OPTIONS: BasicInfoOption<NovelBasicFormState["aiFreedom"]>[] = [
  {
    value: "medium",
    label: i18next.t("novels.novelBasicInfo.shared.aeka0i"),
    summary: i18next.t("novels.novelBasicInfo.shared.pb5ggp"),
    recommended: true,
  },
  {
    value: "low",
    label: i18next.t("novels.novelBasicInfo.shared.ajot81"),
    summary: i18next.t("novels.novelBasicInfo.shared.izc9lu"),
  },
  {
    value: "high",
    label: i18next.t("novels.novelBasicInfo.shared.k2olk7"),
    summary: i18next.t("novels.novelBasicInfo.shared.c9b47c"),
  },
];

export const PUBLICATION_STATUS_OPTIONS: BasicInfoOption<NovelBasicFormState["status"]>[] = [
  {
    value: "draft",
    label: i18next.t("common.draft"),
    summary: i18next.t("novels.novelBasicInfo.shared.s54x9r"),
    recommended: true,
  },
  {
    value: "published",
    label: i18next.t("common.published"),
    summary: i18next.t("novels.novelBasicInfo.shared.v20hj6"),
  },
];

export const PROJECT_STATUS_OPTIONS: Array<{ value: NovelBasicFormState["projectStatus"]; label: string }> = [
  { value: "not_started", label: i18next.t("dict.gen_dd4e55c3") },
  { value: "in_progress", label: i18next.t("tasks.levelRunning") },
  { value: "completed", label: i18next.t("tasks.filterStatusSucceeded") },
  { value: "rework", label: i18next.t("novels.novelBasicInfo.shared.oz9t") },
  { value: "blocked", label: i18next.t("tasks.levelBlocking") },
];

export const BASIC_INFO_FIELD_HINTS = {
  writingMode: "决定项目是从零开始，还是基于已有作品继续创作。它会直接影响后续优先使用哪些上下文来源。",
  targetAudience: "说明这本书最主要写给谁看。不会写专业人群画像也没关系，按直觉描述即可。",
  bookSellingPoint: "写清楚这本书最抓人的点，例如关系拉扯、逆袭爽点、悬念推进或设定新鲜感。",
  competingFeel: "写成读者会联想到的阅读感，不是要求你模仿具体作品。",
  first30ChapterPromise: "写清楚前 30 章一定要让读者看到什么、爽到什么、相信什么。",
  commercialTagsText: "用逗号分隔 3-6 个标签即可，例如逆袭、强冲突、悬念拉满、职场博弈。",
  projectMode: "决定你和 AI 的协作方式。会影响后续哪些步骤自动推进、哪些步骤更依赖人工确认。",
  readerChannelPreference: "帮助 AI 判断默认爽点、情绪重心和关系线权重。不确定时保持 AI 判断。",
  narrativePov: "决定章节生成默认采用哪种叙述视角，也会影响信息分发方式。",
  pacePreference: "决定章节规划时是偏铺垫还是偏推进，会影响场景密度和钩子强度。",
  emotionIntensity: "决定后续生成时情绪爆发和冲突的频率，不是越高越好。",
  aiFreedom: "决定 AI 可以偏离既有规划和设定的程度。前期建议保持低或中。",
  postGenerationStyleReviewEnabled: "控制正文生成后的去 AI 味检测与自动修正。生成前的写法和反 AI 提示仍按规则库执行。",
  defaultChapterLength: "这是章节规划和生成时的参考字数，不是硬限制。常见推荐值是 2500 到 3500。",
  estimatedChapterCount: "这是项目预估的总章节数，会作为结构化大纲、剧情拍点和流水线默认范围的参考，不是硬限制。",
  resourceReadyScore: "用于标记设定、角色、主线资料是否充分。数值越高，越适合进入自动化生产阶段。",
  styleTone: "写几个关键词即可，例如冷峻、克制、黑色幽默。它会影响生成的语言风格。",
  genreId: "题材基底回答“这是什么书”，例如修仙、都市、历史架空。它会影响规划、标题和整体卖点倾向，建议尽量尽早确定。",
  primaryStoryModeId: "主推进模式回答“这本书靠什么持续推进和兑现”，例如系统流、无敌流、种田流。后续规划和生成会优先服从它。",
  secondaryStoryModeId: "副推进模式只负责补充风味，例如在治愈日常中叠加小店经营感，在无敌流中叠加马甲感，不能覆盖主模式的边界。",
  worldId: "这里只记录一个参考样本，方便初始化本书世界。小说生成会优先读取页面上方“本书世界”卡片中的内容。",
  status: i18next.t("novels.novelBasicInfo.shared.mpw8fo"),
  continuationSourceType: "续写时选择是引用站内小说，还是知识库里的文档版本。",
  continuationBookAnalysis: "拆书内容会作为高权重结构化上下文，适合续写项目保持风格和设定一致。",
} satisfies Record<string, string>;

export function createDefaultNovelBasicFormState(): NovelBasicFormState {
  return {
    title: "",
    description: "",
    targetAudience: "",
    bookSellingPoint: "",
    competingFeel: "",
    first30ChapterPromise: "",
    commercialTagsText: "",
    genreId: "",
    primaryStoryModeId: "",
    secondaryStoryModeId: "",
    worldId: "",
    status: "draft",
    writingMode: "original",
    language: "zh",
    projectMode: "co_pilot",
    readerChannelPreference: "ai_judge",
    narrativePov: "third_person",
    pacePreference: "balanced",
    styleTone: "",
    emotionIntensity: "medium",
    aiFreedom: "medium",
    postGenerationStyleReviewEnabled: true,
    defaultChapterLength: 2800,
    estimatedChapterCount: DEFAULT_ESTIMATED_CHAPTER_COUNT,
    projectStatus: "not_started",
    storylineStatus: "not_started",
    outlineStatus: "not_started",
    resourceReadyScore: 0,
    continuationSourceType: "novel",
    sourceNovelId: "",
    sourceKnowledgeDocumentId: "",
    continuationBookAnalysisId: "",
    continuationBookAnalysisSections: [],
  };
}

export function patchNovelBasicForm(
  previous: NovelBasicFormState,
  patch: Partial<NovelBasicFormState>,
): NovelBasicFormState {
  const next = { ...previous, ...patch };
  if (
    next.primaryStoryModeId
    && next.secondaryStoryModeId
    && next.primaryStoryModeId === next.secondaryStoryModeId
  ) {
    next.secondaryStoryModeId = "";
  }
  if (next.writingMode === "original") {
    next.sourceNovelId = "";
    next.sourceKnowledgeDocumentId = "";
    next.continuationBookAnalysisId = "";
    next.continuationBookAnalysisSections = [];
  } else if (next.continuationSourceType === "novel") {
    next.sourceKnowledgeDocumentId = "";
  } else if (next.continuationSourceType === "knowledge_document") {
    next.sourceNovelId = "";
  }
  if (
    patch.continuationSourceType !== undefined
    && patch.continuationSourceType !== previous.continuationSourceType
  ) {
    next.continuationBookAnalysisId = "";
    next.continuationBookAnalysisSections = [];
  }
  if (
    next.continuationSourceType === "novel"
    && patch.sourceNovelId !== undefined
    && patch.sourceNovelId !== previous.sourceNovelId
  ) {
    next.continuationBookAnalysisId = "";
    next.continuationBookAnalysisSections = [];
  }
  if (
    next.continuationSourceType === "knowledge_document"
    && patch.sourceKnowledgeDocumentId !== undefined
    && patch.sourceKnowledgeDocumentId !== previous.sourceKnowledgeDocumentId
  ) {
    next.continuationBookAnalysisId = "";
    next.continuationBookAnalysisSections = [];
  }
  if (patch.continuationBookAnalysisId !== undefined && !patch.continuationBookAnalysisId) {
    next.continuationBookAnalysisSections = [];
  }
  return next;
}

export function buildNovelCreatePayload(basicForm: NovelBasicFormState) {
  const commercialTags = normalizeCommercialTags(basicForm.commercialTagsText);
  return {
    title: basicForm.title.trim(),
    description: basicForm.description.trim() || undefined,
    targetAudience: basicForm.targetAudience.trim() || undefined,
    bookSellingPoint: basicForm.bookSellingPoint.trim() || undefined,
    competingFeel: basicForm.competingFeel.trim() || undefined,
    first30ChapterPromise: basicForm.first30ChapterPromise.trim() || undefined,
    commercialTags: commercialTags.length > 0 ? commercialTags : undefined,
    genreId: basicForm.genreId || undefined,
    primaryStoryModeId: basicForm.primaryStoryModeId || undefined,
    secondaryStoryModeId: basicForm.secondaryStoryModeId || undefined,
    worldId: basicForm.worldId || undefined,
    writingMode: basicForm.writingMode,
    language: basicForm.language,
    projectMode: basicForm.projectMode,
    narrativePov: basicForm.narrativePov,
    pacePreference: basicForm.pacePreference,
    styleTone: basicForm.styleTone.trim() || undefined,
    emotionIntensity: basicForm.emotionIntensity,
    aiFreedom: basicForm.aiFreedom,
    postGenerationStyleReviewEnabled: basicForm.postGenerationStyleReviewEnabled,
    defaultChapterLength: basicForm.defaultChapterLength,
    estimatedChapterCount: basicForm.estimatedChapterCount,
    projectStatus: basicForm.projectStatus,
    storylineStatus: basicForm.storylineStatus,
    outlineStatus: basicForm.outlineStatus,
    resourceReadyScore: basicForm.resourceReadyScore,
    sourceNovelId: basicForm.writingMode === "continuation" && basicForm.continuationSourceType === "novel"
      ? (basicForm.sourceNovelId || undefined)
      : undefined,
    sourceKnowledgeDocumentId: basicForm.writingMode === "continuation" && basicForm.continuationSourceType === "knowledge_document"
      ? (basicForm.sourceKnowledgeDocumentId || undefined)
      : undefined,
    continuationBookAnalysisId: basicForm.writingMode === "continuation"
      && (
        (basicForm.continuationSourceType === "novel" && Boolean(basicForm.sourceNovelId))
        || (basicForm.continuationSourceType === "knowledge_document" && Boolean(basicForm.sourceKnowledgeDocumentId))
      )
      ? (basicForm.continuationBookAnalysisId || undefined)
      : undefined,
    continuationBookAnalysisSections:
      basicForm.writingMode === "continuation"
        && (
          (basicForm.continuationSourceType === "novel" && Boolean(basicForm.sourceNovelId))
          || (basicForm.continuationSourceType === "knowledge_document" && Boolean(basicForm.sourceKnowledgeDocumentId))
        )
        && basicForm.continuationBookAnalysisId
        ? (basicForm.continuationBookAnalysisSections.length > 0 ? basicForm.continuationBookAnalysisSections : undefined)
        : undefined,
  };
}

export function buildNovelUpdatePayload(basicForm: NovelBasicFormState) {
  const commercialTags = normalizeCommercialTags(basicForm.commercialTagsText);
  return {
    title: basicForm.title,
    description: basicForm.description,
    targetAudience: basicForm.targetAudience.trim() || null,
    bookSellingPoint: basicForm.bookSellingPoint.trim() || null,
    competingFeel: basicForm.competingFeel.trim() || null,
    first30ChapterPromise: basicForm.first30ChapterPromise.trim() || null,
    commercialTags: commercialTags.length > 0 ? commercialTags : null,
    genreId: basicForm.genreId || null,
    primaryStoryModeId: basicForm.primaryStoryModeId || null,
    secondaryStoryModeId: basicForm.secondaryStoryModeId || null,
    worldId: basicForm.worldId || null,
    status: basicForm.status,
    writingMode: basicForm.writingMode,
    language: basicForm.language,
    projectMode: basicForm.projectMode,
    narrativePov: basicForm.narrativePov,
    pacePreference: basicForm.pacePreference,
    styleTone: basicForm.styleTone || null,
    emotionIntensity: basicForm.emotionIntensity,
    aiFreedom: basicForm.aiFreedom,
    postGenerationStyleReviewEnabled: basicForm.postGenerationStyleReviewEnabled,
    defaultChapterLength: basicForm.defaultChapterLength,
    estimatedChapterCount: basicForm.estimatedChapterCount,
    projectStatus: basicForm.projectStatus,
    storylineStatus: basicForm.storylineStatus,
    outlineStatus: basicForm.outlineStatus,
    resourceReadyScore: basicForm.resourceReadyScore,
    sourceNovelId: basicForm.writingMode === "continuation" && basicForm.continuationSourceType === "novel"
      ? (basicForm.sourceNovelId || null)
      : null,
    sourceKnowledgeDocumentId: basicForm.writingMode === "continuation" && basicForm.continuationSourceType === "knowledge_document"
      ? (basicForm.sourceKnowledgeDocumentId || null)
      : null,
    continuationBookAnalysisId: basicForm.writingMode === "continuation"
      && (
        (basicForm.continuationSourceType === "novel" && Boolean(basicForm.sourceNovelId))
        || (basicForm.continuationSourceType === "knowledge_document" && Boolean(basicForm.sourceKnowledgeDocumentId))
      )
      ? (basicForm.continuationBookAnalysisId || null)
      : null,
    continuationBookAnalysisSections:
      basicForm.writingMode === "continuation"
        && (
          (basicForm.continuationSourceType === "novel" && Boolean(basicForm.sourceNovelId))
          || (basicForm.continuationSourceType === "knowledge_document" && Boolean(basicForm.sourceKnowledgeDocumentId))
        )
        && basicForm.continuationBookAnalysisId
        ? (basicForm.continuationBookAnalysisSections.length > 0 ? basicForm.continuationBookAnalysisSections : null)
        : null,
  };
}

export { formatCommercialTagsInput };
