import type { BookAnalysisSectionKey } from "@ai-novel/shared/types/bookAnalysis";

export const CHAPTER_HEADING_REGEX =
  /^\s*((序章|楔子|尾声|后记|番外|第[零一二三四五六七八九十百千万两\d]+[章节回卷部集篇]|chapter\s+\d+|chap\.\s*\d+)[^\n]{0,40})\s*$/i;
export const MIN_CHAPTER_DETECTION_COUNT = 3;
export const MIN_SEGMENT_BODY_LENGTH = 120;
export const MAX_SEGMENT_COUNT = 12;
export const MIN_SEGMENT_CHARS = 6_000;
export const TARGET_SEGMENT_CHARS = 10_000;
export const MAX_SEGMENT_CHARS = 16_000;
export const CHUNK_OVERLAP_CHARS = 400;
export const DEFAULT_ANALYSIS_TEMPERATURE = 0.3;
export const MIN_ANALYSIS_MAX_TOKENS = 256;
export const MAX_ANALYSIS_MAX_TOKENS = 32_768;
export const UNLIMITED_NOTES_MAX_TOKENS_CACHE_KEY = 0;

export const SECTION_PROMPTS: Record<BookAnalysisSectionKey, string> = {
  overview: "请输出拆书总览，覆盖：一句话定位、题材标签、卖点标签、目标读者、整体优势、整体短板，并优先做基于整书笔记的低风险综合判断。",
  plot_structure: "请分析剧情结构，覆盖：主线梗概、阶段推进、冲突升级、高光设计、节奏评估、章节组织、结构问题、结构亮点、可复用套路。",
  timeline: "请分析故事时间线，覆盖：关键时间节点、事件先后关系、主线阶段划分、角色状态变化节点、时间跨度与节奏风险。",
  character_system: "请分析人物系统，覆盖：主角定位、配角与反派功能、关系网络、成长弧线、人物高光、分工清晰度。",
  worldbuilding: "请分析世界观与设定，覆盖：世界框架、规则系统、关键设定亮点、设定如何服务剧情、设定问题或风险。",
  themes: "请分析主题表达，覆盖：核心主题、题眼、情绪基调、象征母题、主题呈现方式、主题表达风险。",
  style_technique: "请分析文风与技法，覆盖：叙事视角、语言风格、描写方式、对话特征、节奏控制、钩子设计、可复用写法。",
  market_highlights: "请分析商业化卖点，覆盖：读者爽点、点击驱动、人物卖点、题材卖点、目标读者匹配点、商业化风险。",
};
