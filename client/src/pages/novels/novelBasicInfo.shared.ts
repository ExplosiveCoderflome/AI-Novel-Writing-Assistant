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
  projectMode: "ai_led" | "co_pilot" | "draft_mode" | "auto_pipeline";
  narrativePov: "first_person" | "third_person" | "mixed";
  pacePreference: "slow" | "balanced" | "fast";
  styleTone: string;
  emotionIntensity: "low" | "medium" | "high";
  aiFreedom: "low" | "medium" | "high";
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
    label: "原创",
    summary: "从零开始创建世界、角色和主线，适合大多数新项目。",
    recommended: true,
  },
  {
    value: "continuation",
    label: "续写",
    summary: "基于已有小说或知识文档继续创作，后续会优先注入既有设定和拆书内容。",
  },
];

export const PROJECT_MODE_OPTIONS: BasicInfoOption<NovelBasicFormState["projectMode"]>[] = [
  {
    value: "co_pilot",
    label: "AI 副驾",
    summary: "你定方向，AI 提方案和草稿，适合前期打磨和高频人工决策。",
    recommended: true,
  },
  {
    value: "ai_led",
    label: "AI 接管",
    summary: "AI 负责主推进，你在关键节点审核，适合已有明确目标的项目。",
  },
  {
    value: "draft_mode",
    label: "草稿优先",
    summary: "先快速产出文本和方向，结构约束较弱，适合试故事和找感觉。",
  },
  {
    value: "auto_pipeline",
    label: "流水线优先",
    summary: "适合设定较完整后按规划、生成、审计、修复连续推进。",
  },
];

export const POV_OPTIONS: BasicInfoOption<NovelBasicFormState["narrativePov"]>[] = [
  {
    value: "third_person",
    label: "第三人称",
    summary: "最稳，适合多角色和复杂主线。",
    recommended: true,
  },
  {
    value: "first_person",
    label: "第一人称",
    summary: "代入感强，但信息受限，适合强主角视角叙事。",
  },
  {
    value: "mixed",
    label: "混合视角",
    summary: "更灵活，但更容易失控，适合成熟项目。",
  },
];

export const PACE_OPTIONS: BasicInfoOption<NovelBasicFormState["pacePreference"]>[] = [
  {
    value: "balanced",
    label: "均衡",
    summary: "推进和铺垫兼顾，适合作为默认选择。",
    recommended: true,
  },
  {
    value: "slow",
    label: "慢节奏",
    summary: "更重铺垫、氛围和情绪发酵。",
  },
  {
    value: "fast",
    label: "快节奏",
    summary: "更重事件驱动、钩子和连续推进。",
  },
];

export const EMOTION_OPTIONS: BasicInfoOption<NovelBasicFormState["emotionIntensity"]>[] = [
  {
    value: "medium",
    label: "中情绪浓度",
    summary: "保留起伏但不过载，适合作为默认值。",
    recommended: true,
  },
  {
    value: "low",
    label: "低情绪浓度",
    summary: "更克制，适合冷静叙事或偏理性作品。",
  },
  {
    value: "high",
    label: "高情绪浓度",
    summary: "更强调爆发、冲突和强刺激场面。",
  },
];

export const AI_FREEDOM_OPTIONS: BasicInfoOption<NovelBasicFormState["aiFreedom"]>[] = [
  {
    value: "medium",
    label: "中自由度",
    summary: "允许 AI 在设定内补充细节和局部推进，适合作为默认值。",
    recommended: true,
  },
  {
    value: "low",
    label: "低自由度",
    summary: "严格按设定和规划执行，适合前期控盘。",
  },
  {
    value: "high",
    label: "高自由度",
    summary: "允许 AI 主动扩展剧情和细节，适合中后期稳定项目。",
  },
];

export const PUBLICATION_STATUS_OPTIONS: BasicInfoOption<NovelBasicFormState["status"]>[] = [
  {
    value: "draft",
    label: "草稿",
    summary: "仍在开发和打磨阶段，适合绝大多数项目。",
    recommended: true,
  },
  {
    value: "published",
    label: "已发布",
    summary: "用于标记已成型或已对外发布的作品。",
  },
];

export const PROJECT_STATUS_OPTIONS: Array<{ value: NovelBasicFormState["projectStatus"]; label: string }> = [
  { value: "not_started", label: "未开始" },
  { value: "in_progress", label: "进行中" },
  { value: "completed", label: "已完成" },
  { value: "rework", label: "返工" },
  { value: "blocked", label: "阻塞" },
];

export const BASIC_INFO_FIELD_HINTS = {
  writingMode: "决定项目是从零开始，还是基于已有作品继续创作。它会直接影响后续优先使用哪些上下文来源。",
  targetAudience: "说明这本书最主要写给谁看。不会写专业人群画像也没关系，按直觉描述即可。",
  bookSellingPoint: "写清楚这本书最抓人的点，例如关系拉扯、逆袭爽点、悬念推进或设定新鲜感。",
  competingFeel: "写成读者会联想到的阅读感，不是要求你模仿具体作品。",
  first30ChapterPromise: "写清楚前 30 章一定要让读者看到什么、爽到什么、相信什么。",
  commercialTagsText: "用逗号分隔 3-6 个标签即可，例如逆袭、强冲突、悬念拉满、职场博弈。",
  projectMode: "决定你和 AI 的协作方式。会影响后续哪些步骤自动推进、哪些步骤更依赖人工确认。",
  narrativePov: "决定章节生成默认采用哪种叙述视角，也会影响信息分发方式。",
  pacePreference: "决定章节规划时是偏铺垫还是偏推进，会影响场景密度和钩子强度。",
  emotionIntensity: "决定后续生成时情绪爆发和冲突的频率，不是越高越好。",
  aiFreedom: "决定 AI 可以偏离既有规划和设定的程度。前期建议保持低或中。",
  defaultChapterLength: "这是章节规划和生成时的参考字数，不是硬限制。常见推荐值是 2500 到 3500。",
  estimatedChapterCount: "这是项目预估的总章节数，会作为结构化大纲、剧情拍点和流水线默认范围的参考，不是硬限制。",
  resourceReadyScore: "用于标记当前设定、角色、主线资料是否充分。数值越高，越适合进入自动化生产阶段。",
  styleTone: "写几个关键词即可，例如冷峻、克制、黑色幽默。它会影响生成的语言风格。",
  genreId: "类型会影响规划、标题和卖点倾向，建议尽量尽早确定。",
  primaryStoryModeId: "主流派模式会定义这本书靠什么推进、靠什么兑现，以及冲突边界和章节颗粒。后续规划和生成会优先服从它。",
  secondaryStoryModeId: "副流派模式只负责补充风味，例如在治愈日常中叠加小店经营感，在无敌流中叠加马甲感，不能覆盖主模式的边界。",
  worldId: "如果绑定世界观，后续规划和章节生成会自动注入该世界设定。",
  status: "只是作品生命周期标记，不影响基础创作能力，但会影响列表和项目管理状态。",
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
    projectMode: "co_pilot",
    narrativePov: "third_person",
    pacePreference: "balanced",
    styleTone: "",
    emotionIntensity: "medium",
    aiFreedom: "medium",
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
    projectMode: basicForm.projectMode,
    narrativePov: basicForm.narrativePov,
    pacePreference: basicForm.pacePreference,
    styleTone: basicForm.styleTone.trim() || undefined,
    emotionIntensity: basicForm.emotionIntensity,
    aiFreedom: basicForm.aiFreedom,
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
    projectMode: basicForm.projectMode,
    narrativePov: basicForm.narrativePov,
    pacePreference: basicForm.pacePreference,
    styleTone: basicForm.styleTone || null,
    emotionIntensity: basicForm.emotionIntensity,
    aiFreedom: basicForm.aiFreedom,
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
