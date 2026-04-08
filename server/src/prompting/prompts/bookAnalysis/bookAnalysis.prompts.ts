import type { BookAnalysisSectionKey } from "@ai-novel/shared/types/bookAnalysis";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";
import type { PromptAsset } from "../../core/promptTypes";
import {
  bookAnalysisOptimizeDraftOutputSchema,
  bookAnalysisSectionOutputSchema,
  bookAnalysisSourceNoteOutputSchema,
} from "../../../services/bookAnalysis/bookAnalysisSchemas";

export interface BookAnalysisSourceNotePromptInput {
  segmentLabel: string;
  segmentContent: string;
}

export interface BookAnalysisSectionPromptInput {
  sectionKey: BookAnalysisSectionKey;
  sectionTitle: string;
  promptFocus: string;
  notesText: string;
}

export interface BookAnalysisOptimizeDraftPromptInput {
  sectionKey: BookAnalysisSectionKey;
  sectionTitle: string;
  instruction: string;
  currentDraft: string;
  notesText: string;
}

function buildSectionStructuredDataContract(sectionKey: BookAnalysisSectionKey): string {
  const commonRules = [
    "structuredData 必须是一个 JSON 对象。",
    "优先使用当前 section 约定的固定键名，不要擅自改写、删减或新增近义键名。",
    "如某项信息依据不足，字符串字段返回空字符串，数组字段返回空数组。",
    "数组元素使用简洁中文短语，不要写成长段解释。",
    "不要把 markdown 里的大段分析原样搬进 structuredData；structuredData 应更适合作为程序读取、筛选、展示和后续复用的数据层。",
    "所有内容都必须基于现有 notes 或分析中已经成立的归纳，不得补写无依据的信息。",
  ].join("\n");

  switch (sectionKey) {
    case "overview":
      return [
        commonRules,
        `当前 section 推荐使用以下固定结构：
{
  "oneLinePositioning": "一句话定位",
  "genreTags": ["题材标签"],
  "sellingPointTags": ["卖点标签"],
  "targetReaders": ["目标读者"],
  "strengths": ["整体优势"],
  "weaknesses": ["整体短板"]
}`,
        "类型要求：oneLinePositioning 为字符串，其余字段为字符串数组。",
        "targetReaders 与 weaknesses 允许基于多条 notes 做低风险综合判断，但必须能被题材、卖点、读者信号、短板信号、人物塑造、叙事方式等信息支撑；若支撑不足则返回空数组。",
      ].join("\n\n");

    case "plot_structure":
      return [
        commonRules,
        `当前 section 推荐使用以下固定结构：
{
  "mainlineSummary": "主线梗概",
  "phaseProgressions": ["阶段推进"],
  "escalationDesigns": ["冲突升级方式"],
  "highlightDesigns": ["高光设计"],
  "paceRisks": ["节奏风险"],
  "structureHighlights": ["结构亮点"],
  "reusablePatterns": ["可复用套路"]
}`,
        "类型要求：mainlineSummary 为字符串，其余字段为字符串数组。",
      ].join("\n\n");

    case "timeline":
      return [
        commonRules,
        `当前 section 推荐使用以下固定结构：
{
  "timeNodes": ["关键时间节点"],
  "eventOrder": ["事件先后关系"],
  "phaseDivisions": ["主线阶段划分"],
  "stateChangeNodes": ["角色状态变化节点"],
  "tempoRisks": ["时间跨度或节奏风险"]
}`,
        "类型要求：所有字段均为字符串数组。",
      ].join("\n\n");

    case "character_system":
      return [
        commonRules,
        `当前 section 推荐使用以下固定结构：
{
  "protagonistPositioning": "主角定位",
  "supportingFunctions": ["配角功能"],
  "antagonistFunctions": ["反派功能"],
  "relationshipNetwork": ["关系网络要点"],
  "growthArcs": ["成长弧线"],
  "characterHighlights": ["人物高光"],
  "clarityRisks": ["人物分工或辨识度风险"]
}`,
        "类型要求：protagonistPositioning 为字符串，其余字段为字符串数组。",
      ].join("\n\n");

    case "worldbuilding":
      return [
        commonRules,
        `当前 section 推荐使用以下固定结构：
{
  "worldFramework": "世界框架",
  "ruleSystem": ["规则系统"],
  "settingHighlights": ["设定亮点"],
  "plotSupport": ["设定如何服务剧情"],
  "settingRisks": ["设定问题或风险"]
}`,
        "类型要求：worldFramework 为字符串，其余字段为字符串数组。",
      ].join("\n\n");

    case "themes":
      return [
        commonRules,
        `当前 section 推荐使用以下固定结构：
{
  "coreThemes": ["核心主题"],
  "motifs": ["象征母题"],
  "emotionalTone": "情绪基调",
  "presentationMethods": ["主题呈现方式"],
  "themeRisks": ["主题表达风险"]
}`,
        "类型要求：emotionalTone 为字符串，其余字段为字符串数组。",
      ].join("\n\n");

    case "style_technique":
      return [
        commonRules,
        `当前 section 推荐使用以下固定结构：
{
  "narrativePov": "叙事视角",
  "languageStyle": "语言风格",
  "descriptionMethods": ["描写方式"],
  "dialoguePatterns": ["对话特征"],
  "rhythmControl": ["节奏控制方式"],
  "hookDesigns": ["钩子设计"],
  "reusableTechniques": ["可复用写法"]
}`,
        "类型要求：narrativePov、languageStyle 为字符串，其余字段为字符串数组。",
      ].join("\n\n");

    case "market_highlights":
      return [
        commonRules,
        `当前 section 推荐使用以下固定结构：
{
  "hookPoints": ["读者爽点"],
  "clickDrivers": ["点击驱动"],
  "characterSellingPoints": ["人物卖点"],
  "genreSellingPoints": ["题材卖点"],
  "targetReaderMatches": ["目标读者匹配点"],
  "commercialRisks": ["商业化风险"]
}`,
        "类型要求：所有字段均为字符串数组。",
        "targetReaderMatches 允许基于题材、卖点与读者信号做低风险匹配判断，但不要伪装成精确人群画像。",
      ].join("\n\n");

    default:
      return [
        commonRules,
        "当前 section 没有预设固定结构时，structuredData 仍必须保持字段名简洁、稳定，并与该 section 的分析重点直接对应。",
      ].join("\n\n");
  }
}

function buildOverviewMarkdownRequirements(sectionTitle: string, promptFocus: string): string {
  return [
    `markdown 必须写成一份可直接展示给用户阅读的《${sectionTitle}》分析稿，全篇使用简体中文。`,
    "正文必须按以下顺序输出二级标题：",
    "## 一句话定位",
    "## 题材标签",
    "## 卖点标签",
    "## 目标读者",
    "## 整体优势",
    "## 整体短板",
    "不要写成“总体判断 / 重点分析 / 保留判断或局限说明”这种审计报告结构。",
    "允许基于多条 notes 做低风险综合判断，尤其是目标读者和整体短板；但判断必须建立在题材、情节、人物、文风、卖点、读者信号、短板信号等已给出的信息之上。",
    "若属于综合推断，请使用“更偏向”“相对适合”“可能会”“对……读者更有吸引力”等谨慎表述，不要伪装成确定事实。",
    "只有当连低风险归纳都无法形成时，才写“材料不足”或“现有笔记无法支持更强判断”。",
    "每个小节都应先直接给出结论，再用 1-3 句说明它体现在哪里、为什么成立、会带来什么阅读效果或产品价值。",
    "不要机械复述所有 notes，也不要把整节写成空泛提纲。",
    "必须优先覆盖以下重点：",
    promptFocus,
  ].join("\n");
}

function buildGenericSectionMarkdownRequirements(sectionTitle: string, promptFocus: string): string {
  return [
    `markdown 必须写成一份可直接展示给用户阅读的《${sectionTitle}》分析稿，全篇使用简体中文。`,
    "正文应有清晰层次，但不要写成审计报告腔的空泛模板。",
    "结论必须具体，尽量说明“体现在哪里、为什么成立、会带来什么阅读效果或创作价值”。",
    "允许基于多条 notes 做低风险归纳，但不得虚构 notes 之外的新事实、原文细节、作者意图或隐性因果。",
    "如果某个判断主要来自综合推断，请用谨慎措辞降低结论强度，而不是把推断写成确定事实。",
    "只有当 notes 的支撑明显不够时，才写“材料不足”或“现有笔记无法支持更强判断”。",
    "不要复述全部原文或全部笔记，而要进行筛选、归纳、比较和判断。",
    "必须优先覆盖以下重点：",
    promptFocus,
  ].join("\n");
}

function buildSectionMarkdownRequirements(
  sectionKey: BookAnalysisSectionKey,
  sectionTitle: string,
  promptFocus: string,
): string {
  if (sectionKey === "overview") {
    return buildOverviewMarkdownRequirements(sectionTitle, promptFocus);
  }
  return buildGenericSectionMarkdownRequirements(sectionTitle, promptFocus);
}

export const bookAnalysisSourceNotePrompt: PromptAsset<
  BookAnalysisSourceNotePromptInput,
  z.infer<typeof bookAnalysisSourceNoteOutputSchema>
> = {
  id: "bookAnalysis.source.note",
  version: "v1",
  taskType: "planner",
  mode: "structured",
  language: "zh",
  contextPolicy: {
    maxTokensBudget: 0,
  },
  semanticRetryPolicy: {
    maxAttempts: 1,
  },
  outputSchema: bookAnalysisSourceNoteOutputSchema,
  render: (input) => [
    new SystemMessage([
      "你是中文网文拆书助手。",
      "你的任务不是写书评，也不是做文学赏析，而是把“单个原文片段”整理成可供后续章节分析复用的结构化笔记。",
      "",
      "你只可基于当前片段中明确出现的信息进行提取，允许做低风险、贴近原文的归纳，但禁止补写原文没有直接体现的人物深层动机、隐藏因果、作者意图、整书级结论或过强市场判断。",
      "",
      "只输出一个 JSON 对象，不要输出 Markdown、解释、注释或额外文本。",
      "结构固定为：",
      "{",
      '  "summary": "1-2句中文摘要",',
      '  "plotPoints": ["..."],',
      '  "timelineEvents": ["..."],',
      '  "characters": ["..."],',
      '  "worldbuilding": ["..."],',
      '  "themes": ["..."],',
      '  "styleTechniques": ["..."],',
      '  "marketHighlights": ["..."],',
      '  "readerSignals": ["..."],',
      '  "weaknessSignals": ["..."],',
      '  "evidence": [{"label": "...", "excerpt": "..."}]',
      "}",
      "",
      "字段说明：",
      "1. summary：用 1-2 句概括这个片段写了什么，只概括片段本身，不延伸到整本书。",
      "2. plotPoints：提取这个片段里的关键剧情信息、冲突、转折、行动结果，偏“发生了什么”。",
      "3. timelineEvents：只提取带有时间推进、先后顺序、阶段变化的信息。若片段没有明确时间顺序，可返回空数组，不要与 plotPoints 机械重复。",
      "4. characters：提取片段中明确出现、被提及或具有作用的人物信息，可包含状态、关系、行为特征，但不要补深层心理。",
      "5. worldbuilding：提取片段中明确体现的背景设定、规则、社会环境、地理空间、职业体系、权力结构等。没有就留空。",
      "6. themes：提取片段中已经明显显露的主题倾向或情绪母题，例如求生、复仇、忠诚、压迫、信任裂痕。不要拔高成空泛价值判断。",
      "7. styleTechniques：提取片段里能直接看见的表达方式或叙事技法，例如反差、悬念钩子、感官描写、群像切换、对白推进、快节奏剪切。不要写成空泛夸奖。",
      "8. marketHighlights：提取当前片段中能直接看出来、对阅读吸引力有帮助的卖点，例如开场冲突强、人物标签鲜明、卧底悬念明确、战斗画面强、情绪刺激足。",
      "9. readerSignals：提取当前片段透露出的阅读满足点或受众偏好信号，例如智斗、热血、群像协作、暧昧拉扯、地域风物、价值感明确。不要直接上升成确定的目标读者标签。",
      "10. weaknessSignals：只记录当前片段已显露、且风险较低的创作短板或争议点信号，例如人物脸谱化、说明过多、口号化对白、冲突重复、推进依赖巧合、情感线偏弱、时代语体较强。没有就留空。",
      "11. evidence：提供最多 3 条证据。label 是证据信息点名称，excerpt 必须是尽量贴近原文的短摘录，优先保留原句措辞，不要改写成长分析。",
      "",
      "硬规则：",
      "1. 所有值必须使用简体中文。",
      "2. 只提取片段里明确存在或可做低风险归纳的信息，不要脑补。",
      "3. 每个数组最多 5 项；evidence 最多 3 项。",
      "4. 若某一类信息不明显，返回空数组，不要硬编。",
      "5. evidence.excerpt 必须是短摘录，不能写成分析说明。",
      "6. 不要把同一信息换说法重复塞进多个数组。",
      "7. 输出内容要尽量具体，少用“体现了张力”“营造了氛围”这类空话。",
      "8. themes、styleTechniques、marketHighlights、readerSignals、weaknessSignals 要保留最有辨识度的信号，不要机械清空，也不要为了凑数硬填。",
    ].join("\n")),
    new HumanMessage([
      `片段标签：${input.segmentLabel}`,
      "",
      "原文片段：",
      input.segmentContent,
    ].join("\n")),
  ],
};

export const bookAnalysisSectionPrompt: PromptAsset<
  BookAnalysisSectionPromptInput,
  z.infer<typeof bookAnalysisSectionOutputSchema>
> = {
  id: "bookAnalysis.section.generate",
  version: "v1",
  taskType: "planner",
  mode: "structured",
  language: "zh",
  contextPolicy: {
    maxTokensBudget: 0,
  },
  semanticRetryPolicy: {
    maxAttempts: 1,
  },
  outputSchema: bookAnalysisSectionOutputSchema,
  render: (input) => [
    new SystemMessage([
      `你是资深中文网文拆书分析师。你当前只负责撰写拆书章节《${input.sectionTitle}》。`,
      "你的任务是基于给定 notes，产出一份可直接展示给用户阅读的正式分析稿，以及一份便于程序消费的 structuredData。",
      "你不是在复述原文，不是在写读后感，也不是在补全 notes 之外的内容。",
      "",
      "只输出一个 JSON 对象，不要输出解释、代码块、前言、后记或额外文本。固定结构为：",
      "{",
      '  "markdown": "给用户展示的 Markdown 分析稿",',
      '  "structuredData": {},',
      '  "evidence": [{ "label": "...", "excerpt": "...", "sourceLabel": "..." }]',
      "}",
      "",
      "全局硬规则：",
      "1. 所有内容必须使用简体中文。",
      "2. 只能基于给定 notes 中已出现的事实、归纳和摘录进行分析，不得补写 notes 之外的原文细节、作者意图、隐藏因果或人物深层动机。",
      "3. 允许基于多条 notes 做低风险综合判断，但不得把综合判断伪装成确定事实。",
      "4. 若某条结论属于推断，请用“更偏向”“相对适合”“可能会”“容易让……读者买单”等谨慎措辞降低强度。",
      "5. 只有在 notes 的支撑明显不够时，才写“材料不足”或“现有笔记无法支持更强判断”；不要一遇到需要归纳就机械回避。",
      "6. 分析应优先抓最关键、最能支撑结论的信息，不要平均铺开，不要把同一观点换说法重复表达。",
      "7. markdown、structuredData、evidence 三部分必须相互一致，不得互相矛盾。",
      "",
      buildSectionMarkdownRequirements(input.sectionKey, input.sectionTitle, input.promptFocus),
      "",
      "structuredData 规则：",
      buildSectionStructuredDataContract(input.sectionKey),
      "",
      "补充约束：",
      "1. structuredData 必须更适合作为程序读取、筛选、展示和复用的数据层，不要把 markdown 大段分析原样搬进去。",
      "2. 若某项信息依据不足，字符串字段返回空字符串，数组字段返回空数组；不要省略字段，不要返回 null，不要自造近义键名。",
      "3. 数组项使用简洁中文短语，避免长解释；数组内避免同义重复。",
      "4. 输出时尽量保持字段顺序与约定结构一致。",
      "",
      "evidence 规则：",
      "1. evidence 只保留最能支撑结论的 3-8 条证据。",
      "2. excerpt 必须来自给定 notes 中已有的现成摘录或明确信息，优先保留原有措辞，不要虚构原文句子。",
      "3. label 应明确对应某个判断点或分析点，不要写成空泛标签。",
      "4. sourceLabel 必须尽量对应具体片段标签。",
      "5. 如果某条结论无法找到足够依据，就降低结论强度，而不是硬补证据。",
      "6. 不要让多条 evidence 反复证明同一件事，优先保留覆盖面更广、信息量更高的证据。",
    ].join("\n")),
    new HumanMessage([
      `请基于以下结构化笔记生成《${input.sectionTitle}》分析稿。`,
      "",
      "分析重点：",
      input.promptFocus,
      "",
      "可用 notes：",
      input.notesText,
    ].join("\n")),
  ],
};

export const bookAnalysisOptimizedDraftPrompt: PromptAsset<
  BookAnalysisOptimizeDraftPromptInput,
  z.infer<typeof bookAnalysisOptimizeDraftOutputSchema>
> = {
  id: "bookAnalysis.section.optimize",
  version: "v1",
  taskType: "planner",
  mode: "structured",
  language: "zh",
  contextPolicy: {
    maxTokensBudget: 0,
  },
  semanticRetryPolicy: {
    maxAttempts: 1,
  },
  outputSchema: bookAnalysisOptimizeDraftOutputSchema,
  render: (input) => [
    new SystemMessage([
      `你是拆书稿优化编辑，当前只负责优化《${input.sectionTitle}》这一节的分析稿。`,
      "你的目标是：在严格服从用户修改意图的前提下，把当前草稿修成一份更准确、更清晰、更适合直接展示给用户阅读的正式分析稿。",
      "",
      '只输出一个 JSON 对象：{"optimizedDraft":"..."}',
      "不要输出解释、代码块、注释、前言、后记或额外文本。",
      "",
      "全局硬规则：",
      "1. 必须优先执行用户修改指令，但不能引入 notes 里没有依据的新事实、新结论、新原文细节或过强判断。",
      "2. 只能基于当前草稿与给定 notes 进行修订；允许基于多条 notes 做低风险综合判断，但不得越过 notes 的可支撑边界。",
      "3. 如果当前草稿为空，可以基于 notes 补出首版，但仍必须严格围绕当前 section 主题，不要扩写成整篇拆书报告。",
      "4. 尽量保留当前草稿中已成立的有效判断，不要无故推翻；若必须调整，应优先做局部修正，而不是整体重写。",
      "5. 若用户要求超出 notes 可支撑范围，可缩写、删减、改写为更谨慎表述，或明确写“材料不足”“现有笔记无法支持更强判断”，不要编造。",
      "6. 若当前草稿中存在与 notes 不一致、证据不足、表达过强、重复啰嗦或偏离本节主题的内容，应主动修正。",
      "7. optimizedDraft 必须是可直接展示给用户的中文 Markdown 正文，不是 JSON 解释，不是修改说明，也不是提纲。",
      "",
      "正文要求：",
      "1. 全文使用简体中文。",
      "2. 结论必须具体，避免“人物鲜明”“节奏不错”“张力很强”这类空话；尽量写清楚体现在哪里、为什么成立、意味着什么。",
      "3. 不要复述全部 notes 或原文，要做筛选、归纳、比较和判断。",
      "4. 若多个观点本质重复，应合并表达，避免同义反复。",
      "5. 语言应更稳、更像正式拆书分析稿，而不是口语批注或编辑备忘。",
      `6. 优化后的内容必须仍然聚焦《${input.sectionTitle}》这一节，不要跑题。`,
      "",
      "修改优先级：",
      "1. 先满足用户修改指令。",
      "2. 再修正事实依据与结论强度。",
      "3. 再优化结构、表达、重复与可读性。",
      "4. 若用户指令与 notes 冲突，以 notes 可支撑范围为准，做保守改写。",
    ].join("\n")),
    new HumanMessage([
      `章节：${input.sectionTitle}`,
      `sectionKey：${input.sectionKey}`,
      "",
      "用户修改指令：",
      input.instruction,
      "",
      "当前草稿：",
      input.currentDraft || "（空）",
      "",
      "可用 notes：",
      input.notesText,
    ].join("\n")),
  ],
};
