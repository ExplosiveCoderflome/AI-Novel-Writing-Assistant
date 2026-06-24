import type { LLMProvider } from "./llm";

export type BookAnalysisStatus = "draft" | "queued" | "running" | "succeeded" | "failed" | "cancelled" | "archived";
export type BookAnalysisSectionStatus = "idle" | "running" | "succeeded" | "failed";
export type BookAnalysisSectionKey =
  | "overview"
  | "plot_structure"
  | "timeline"
  | "character_system"
  | "worldbuilding"
  | "themes"
  | "style_technique"
  | "market_highlights";
export type BookAnalysisPreset = "quick" | "standard" | "complete";
export type BookAnalysisStructuredFieldType = "string" | "stringArray" | "timelineNodeArray";

export interface BookAnalysisTimelineNode {
  label: string;
  timeHint?: string;
  phase?: string;
  sourceRefs?: string[];
}

export interface BookAnalysisStructuredFieldSpec {
  key: string;
  type: BookAnalysisStructuredFieldType;
}

export const BOOK_ANALYSIS_SECTIONS: ReadonlyArray<{
  key: BookAnalysisSectionKey;
  title: string;
}> = [
  { key: "overview", title: "拆书总览" },
  { key: "plot_structure", title: "剧情结构" },
  { key: "timeline", title: "故事时间线" },
  { key: "character_system", title: "人物系统" },
  { key: "worldbuilding", title: "世界观与设定" },
  { key: "themes", title: "主题表达" },
  { key: "style_technique", title: "文风与技法" },
  { key: "market_highlights", title: "商业化卖点" },
];

export const BOOK_ANALYSIS_PRESETS: ReadonlyArray<{
  key: BookAnalysisPreset;
  title: string;
  summary: string;
  sectionKeys: BookAnalysisSectionKey[];
}> = [
  {
    key: "quick",
    title: "快速拆书",
    summary: "优先看清作品定位、主线结构、人物系统和写法特征，适合先低成本判断是否值得深拆。",
    sectionKeys: ["overview", "plot_structure", "character_system", "style_technique"],
  },
  {
    key: "standard",
    title: "标准拆书",
    summary: "覆盖多数创作复用所需信息，默认不生成时间线，适合大多数网文参考分析。",
    sectionKeys: ["overview", "plot_structure", "character_system", "worldbuilding", "themes", "style_technique", "market_highlights"],
  },
  {
    key: "complete",
    title: "完整拆书",
    summary: "生成全部分析小节，包含故事时间线，适合长篇续写、仿写或深度复盘。",
    sectionKeys: ["overview", "plot_structure", "timeline", "character_system", "worldbuilding", "themes", "style_technique", "market_highlights"],
  },
];

export const BOOK_ANALYSIS_STRUCTURED_FIELD_LABELS: Readonly<Record<string, string>> = {
  oneLinePositioning: "一句话定位",
  genreTags: "题材标签",
  sellingPointTags: "卖点标签",
  targetReaders: "目标读者",
  strengths: "整体优势",
  weaknesses: "整体短板",
  mainlineSummary: "主线梗概",
  phaseProgressions: "阶段推进",
  escalationDesigns: "冲突升级",
  highlightDesigns: "高光设计",
  paceRisks: "节奏风险",
  structureHighlights: "结构亮点",
  reusablePatterns: "可复用套路",
  timeNodes: "关键时间节点",
  eventOrder: "事件先后关系",
  phaseDivisions: "主线阶段划分",
  stateChangeNodes: "状态变化节点",
  tempoRisks: "时间线风险",
  protagonistPositioning: "主角定位",
  supportingFunctions: "配角功能",
  antagonistFunctions: "反派功能",
  relationshipNetwork: "关系网络",
  growthArcs: "成长弧线",
  characterHighlights: "人物高光",
  clarityRisks: "辨识度风险",
  worldFramework: "世界框架",
  ruleSystem: "规则系统",
  settingHighlights: "设定亮点",
  plotSupport: "剧情支撑",
  settingRisks: "设定风险",
  coreThemes: "核心主题",
  motifs: "象征母题",
  emotionalTone: "情绪基调",
  presentationMethods: "呈现方式",
  themeRisks: "主题风险",
  narrativePov: "叙事视角",
  languageStyle: "语言风格",
  descriptionMethods: "描写方式",
  dialoguePatterns: "对话特征",
  rhythmControl: "节奏控制",
  hookDesigns: "钩子设计",
  reusableTechniques: "可复用写法",
  hookPoints: "读者爽点",
  clickDrivers: "点击驱动",
  characterSellingPoints: "人物卖点",
  genreSellingPoints: "题材卖点",
  targetReaderMatches: "读者匹配",
  commercialRisks: "商业化风险",
};

export const BOOK_ANALYSIS_STRUCTURED_FIELD_SPECS: Readonly<Record<BookAnalysisSectionKey, ReadonlyArray<BookAnalysisStructuredFieldSpec>>> = {
  overview: [
    { key: "oneLinePositioning", type: "string" },
    { key: "genreTags", type: "stringArray" },
    { key: "sellingPointTags", type: "stringArray" },
    { key: "targetReaders", type: "stringArray" },
    { key: "strengths", type: "stringArray" },
    { key: "weaknesses", type: "stringArray" },
  ],
  plot_structure: [
    { key: "mainlineSummary", type: "string" },
    { key: "phaseProgressions", type: "stringArray" },
    { key: "escalationDesigns", type: "stringArray" },
    { key: "highlightDesigns", type: "stringArray" },
    { key: "paceRisks", type: "stringArray" },
    { key: "structureHighlights", type: "stringArray" },
    { key: "reusablePatterns", type: "stringArray" },
  ],
  timeline: [
    { key: "timeNodes", type: "timelineNodeArray" },
    { key: "eventOrder", type: "timelineNodeArray" },
    { key: "phaseDivisions", type: "stringArray" },
    { key: "stateChangeNodes", type: "stringArray" },
    { key: "tempoRisks", type: "stringArray" },
  ],
  character_system: [
    { key: "protagonistPositioning", type: "string" },
    { key: "supportingFunctions", type: "stringArray" },
    { key: "antagonistFunctions", type: "stringArray" },
    { key: "relationshipNetwork", type: "stringArray" },
    { key: "growthArcs", type: "stringArray" },
    { key: "characterHighlights", type: "stringArray" },
    { key: "clarityRisks", type: "stringArray" },
  ],
  worldbuilding: [
    { key: "worldFramework", type: "string" },
    { key: "ruleSystem", type: "stringArray" },
    { key: "settingHighlights", type: "stringArray" },
    { key: "plotSupport", type: "stringArray" },
    { key: "settingRisks", type: "stringArray" },
  ],
  themes: [
    { key: "coreThemes", type: "stringArray" },
    { key: "motifs", type: "stringArray" },
    { key: "emotionalTone", type: "string" },
    { key: "presentationMethods", type: "stringArray" },
    { key: "themeRisks", type: "stringArray" },
  ],
  style_technique: [
    { key: "narrativePov", type: "string" },
    { key: "languageStyle", type: "string" },
    { key: "descriptionMethods", type: "stringArray" },
    { key: "dialoguePatterns", type: "stringArray" },
    { key: "rhythmControl", type: "stringArray" },
    { key: "hookDesigns", type: "stringArray" },
    { key: "reusableTechniques", type: "stringArray" },
  ],
  market_highlights: [
    { key: "hookPoints", type: "stringArray" },
    { key: "clickDrivers", type: "stringArray" },
    { key: "characterSellingPoints", type: "stringArray" },
    { key: "genreSellingPoints", type: "stringArray" },
    { key: "targetReaderMatches", type: "stringArray" },
    { key: "commercialRisks", type: "stringArray" },
  ],
};

export interface BookAnalysisEvidenceItem {
  label: string;
  excerpt: string;
  sourceLabel: string;
  fieldKey?: string;
  fieldIndex?: number;
  chapterIndex?: number;
  excerptOffsetRange?: {
    start: number;
    end: number;
  };
}

export interface BookAnalysisSection {
  id: string;
  analysisId: string;
  sectionKey: BookAnalysisSectionKey;
  title: string;
  status: BookAnalysisSectionStatus;
  aiContent?: string | null;
  editedContent?: string | null;
  notes?: string | null;
  focusInstruction?: string | null;
  structuredData?: Record<string, unknown> | null;
  normalizationWarnings?: string[];
  evidence: BookAnalysisEvidenceItem[];
  frozen: boolean;
  sortOrder: number;
  updatedAt: string;
}

export interface BookAnalysis {
  id: string;
  documentId: string;
  documentVersionId: string;
  documentTitle: string;
  documentFileName: string;
  documentVersionNumber: number;
  currentDocumentVersionId?: string | null;
  currentDocumentVersionNumber: number;
  isCurrentVersion: boolean;
  title: string;
  status: BookAnalysisStatus;
  summary?: string | null;
  provider?: LLMProvider | null;
  model?: string | null;
  temperature?: number | null;
  maxTokens?: number | null;
  userFocusInstruction?: string | null;
  progress: number;
  heartbeatAt?: string | null;
  currentStage?: string | null;
  currentItemKey?: string | null;
  currentItemLabel?: string | null;
  cancelRequestedAt?: string | null;
  attemptCount: number;
  maxAttempts: number;
  lastError?: string | null;
  lastRunAt?: string | null;
  publishedDocumentId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BookAnalysisDetail extends BookAnalysis {
  sections: BookAnalysisSection[];
}

export interface BookAnalysisPublishResult {
  analysisId: string;
  novelId: string;
  knowledgeDocumentId: string;
  knowledgeDocumentVersionNumber: number;
  bindingCount: number;
  publishedAt: string;
}

export interface BookAnalysisSectionOptimizePreview {
  optimizedDraft: string;
}
