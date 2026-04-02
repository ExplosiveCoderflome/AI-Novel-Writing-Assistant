import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import {
  DIRECTOR_CORRECTION_PRESETS,
  type DirectorCandidate,
  type DirectorCandidateBatch,
  type DirectorCorrectionPreset,
  type DirectorProjectContextInput,
} from "@ai-novel/shared/types/novelDirector";
import type { StoryMacroPlan } from "@ai-novel/shared/types/storyMacro";
import type { PromptAsset } from "../../core/promptTypes";
import { renderSelectedContextBlocks } from "../../core/renderContextBlocks";
import {
  buildDirectorBookContractContextBlocks,
  buildDirectorBlueprintContextBlocks,
  buildDirectorCandidateContextBlocks,
  formatProjectContext,
} from "./planningContextBlocks";
import {
  directorBookContractSchema,
  directorCandidateSchema,
  directorCandidateResponseSchema,
  directorPlanBlueprintSchema,
} from "../../../services/novel/director/novelDirectorSchemas";
import { NOVEL_PROMPT_BUDGETS } from "./promptBudgetProfiles";

export interface DirectorCandidatePromptInput {
  idea: string;
  context: DirectorProjectContextInput;
  count: number;
  batches: DirectorCandidateBatch[];
  presets: DirectorCorrectionPreset[];
  feedback?: string;
}

export interface DirectorCandidatePatchPromptInput {
  idea: string;
  context: DirectorProjectContextInput;
  candidate: DirectorCandidate;
  batches: DirectorCandidateBatch[];
  presets: DirectorCorrectionPreset[];
  feedback: string;
}

export interface DirectorBlueprintPromptInput {
  idea: string;
  context: DirectorProjectContextInput;
  candidate: DirectorCandidate;
  storyMacroPlan: StoryMacroPlan;
  targetChapterCount: number;
}

export interface DirectorBookContractPromptInput {
  idea: string;
  context: DirectorProjectContextInput;
  candidate: DirectorCandidate;
  storyMacroPlan: StoryMacroPlan | null;
  targetChapterCount: number;
}

function formatPresetHints(presets: DirectorCorrectionPreset[]): string {
  if (presets.length === 0) {
    return "none";
  }
  return presets
    .map((preset) => {
      const meta = DIRECTOR_CORRECTION_PRESETS.find((item) => item.value === preset);
      return meta ? `${meta.label}: ${meta.promptHint}` : preset;
    })
    .join("\n");
}

function formatCandidateDigest(candidate: DirectorCandidate, index: number): string {
  return [
    `option ${index + 1}: ${candidate.workingTitle}`,
    `logline: ${candidate.logline}`,
    `positioning: ${candidate.positioning}`,
    `selling point: ${candidate.sellingPoint}`,
    `core conflict: ${candidate.coreConflict}`,
    `protagonist path: ${candidate.protagonistPath}`,
    `hook strategy: ${candidate.hookStrategy}`,
    `progression loop: ${candidate.progressionLoop}`,
    `ending direction: ${candidate.endingDirection}`,
  ].join("\n");
}

function formatLatestBatchDigest(batches: DirectorCandidateBatch[]): string {
  const latestBatch = batches.at(-1);
  if (!latestBatch) {
    return "No previous batch.";
  }
  return [
    `${latestBatch.roundLabel}: ${latestBatch.refinementSummary?.trim() || "latest candidate round"}`,
    ...latestBatch.candidates.map((candidate, index) => formatCandidateDigest(candidate, index)),
  ].join("\n\n");
}

export const directorCandidatePrompt: PromptAsset<
  DirectorCandidatePromptInput,
  typeof directorCandidateResponseSchema._output
> = {
  id: "novel.director.candidates",
  version: "v1",
  taskType: "planner",
  mode: "structured",
  language: "zh",
  contextPolicy: {
    maxTokensBudget: NOVEL_PROMPT_BUDGETS.directorCandidates,
    requiredGroups: ["idea_seed"],
    preferredGroups: ["project_context", "preset_hints", "freeform_feedback"],
    dropOrder: ["latest_batch"],
  },
  outputSchema: directorCandidateResponseSchema,
  render: (input, context) => [
    new SystemMessage([
      "你是长篇小说书级方向规划导演，服务对象是不懂写作流程的新手用户。",
      "你的任务不是展开大纲，也不是写章节，而是基于种子想法生成一批现在就可以继续推进整本书规划的候选方向卡片。",
      "",
      "【任务边界】",
      "当前阶段只生成书级候选卡片，不展开大纲、不进入章节、不进入场景细节、不补人物小传。",
      `必须精准输出 ${input.count} 套候选，数量不得多也不得少。`,
      "只输出严格 JSON，不要输出 Markdown、解释、注释或额外文本。",
      "",
      "【字段要求】",
      "每个候选必须完整包含：workingTitle、logline、positioning、sellingPoint、coreConflict、protagonistPath、endingDirection、hookStrategy、progressionLoop、whyItFits、toneKeywords、targetChapterCount。",
      "不得缺漏字段，不得改名，不得新增 schema 之外字段。",
      "",
      "【核心要求】",
      "1. workingTitle 必须是可读的暂定书名，适合封面展示，不要写成策划案口号、世界观概念短语或陈旧套壳名。",
      "2. logline 必须清晰说明：这是谁，在什么处境下，面临什么核心冲突，会朝什么方向展开。",
      "3. positioning 必须说明这本书在题材、阅读满足或读者感知上的定位，而不是泛泛写“爽文”“成长文”。",
      "4. sellingPoint 必须突出这条方向最值得继续做整书规划的核心卖点。",
      "5. coreConflict 必须写清真正能支撑长篇连载的主要矛盾，不要只写一时事件。",
      "6. protagonistPath 必须体现主角长期变化方向，而不是静态人设描述。",
      "7. endingDirection 只给高层终局方向，不要写死详细结局。",
      "8. hookStrategy 必须说明前期如何抓住读者追读，而不是空泛写“制造悬念”。",
      "9. progressionLoop 必须说明这本书主要靠什么循环推进，比如升级、博弈、探索、关系裂变、任务兑现等。",
      "10. whyItFits 必须说明这条候选为什么适合当前用户输入，而不是夸候选本身。",
      "11. toneKeywords 必须是能帮助后续创作定调的关键词，避免空泛抒情词堆叠。",
      "12. targetChapterCount 必须是合理的整书目标体量，与题材密度和推进方式相匹配。",
      "",
      "【差异化要求】",
      "1. 候选之间必须有明显方向差异，不能只是换词、改名或轻微调整设定包装。",
      "2. 差异优先体现在：主卖点、主冲突形态、主角路径、推进循环、情绪调性、结局方向。",
      "3. 不允许多套候选共享几乎相同的 hookStrategy 或 progressionLoop。",
      "4. 每个候选都必须是完整可继续规划的整书方向，而不是模糊概念或半成品。",
      "",
      "【质量要求】",
      "1. 优先生成对新手用户友好的清晰方向，不要故作复杂。",
      "2. 不要脱离上下文臆造庞杂设定块。",
      "3. 如果上一轮候选已有明显不合适方向，应主动避开重复。",
      "4. 信息不足时可以保守补全，但必须保证每个候选完整、可执行、可区分。",
    ].join("\n")),
    new HumanMessage([
      "请基于以下上下文，生成书级候选方向。",
      "",
      "【分层上下文】",
      renderSelectedContextBlocks(context),
      "",
      "【项目上下文补充】",
      formatProjectContext(input.context) || "none",
      "",
      "【上一轮候选】",
      formatLatestBatchDigest(input.batches),
      "",
      "【预设修正】",
      formatPresetHints(input.presets),
      "",
      "【自由修正意见】",
      input.feedback?.trim() || "none",
      "",
      "【输出要求】",
      `- 必须精准输出 ${input.count} 套候选`,
      "- 只输出严格 JSON",
      "- 每套候选都必须可直接进入后续整书规划",
      "- 优先保证候选差异度、可执行性与新手可理解性",
    ].join("\n")),
  ],
};

export const directorCandidatePatchPrompt: PromptAsset<
  DirectorCandidatePatchPromptInput,
  typeof directorCandidateSchema._output
> = {
  id: "novel.director.candidate_patch",
  version: "v1",
  taskType: "planner",
  mode: "structured",
  language: "zh",
  contextPolicy: {
    maxTokensBudget: NOVEL_PROMPT_BUDGETS.directorCandidatePatch,
    requiredGroups: ["idea_seed"],
    preferredGroups: ["project_context", "preset_hints", "freeform_feedback", "latest_batch"],
    dropOrder: ["latest_batch"],
  },
  outputSchema: directorCandidateSchema,
  render: (input, context) => [
    new SystemMessage([
      "你是长篇小说书级方向修正导演，服务对象是不懂写作流程的新手用户。",
      "你的任务不是重新发散两套新方案，而是基于用户已经偏向的一套候选，做一次定向修正。",
      "",
      "【任务边界】",
      "本次只输出 1 套修正后的完整候选卡片。",
      "必须保留原候选的核心方向，不要把它改成另一套完全不同的书。",
      "只输出严格 JSON，不要输出 Markdown、解释、注释或额外文本。",
      "",
      "【修正原则】",
      "1. 优先响应用户反馈里真正不满意的偏差点，不要重做全部方向。",
      "2. 允许调整 workingTitle、logline、positioning、sellingPoint、coreConflict、protagonistPath、endingDirection、hookStrategy、progressionLoop、whyItFits、toneKeywords、targetChapterCount。",
      "3. 如果用户说“我就偏向这套，但有些地方不对”，要把这套修得更准，而不是重新另起炉灶。",
      "4. 修正后仍然必须是完整、清晰、可继续推进整书规划的候选。",
      "",
      "【字段要求】",
      "输出字段必须完整包含：workingTitle、logline、positioning、sellingPoint、coreConflict、protagonistPath、endingDirection、hookStrategy、progressionLoop、whyItFits、toneKeywords、targetChapterCount。",
      "不得缺漏字段，不得改名，不得新增 schema 之外字段。",
      "",
      "【质量要求】",
      "1. 修正后要比原方案更贴近用户口味，而不是更抽象。",
      "2. 如果用户要求都市感、现实感、钩子更强、冲突更猛等，要落实到卖点、冲突和推进循环，而不只是改几个词。",
      "3. workingTitle 仍然必须适合中文网文封面展示，不要回退成概念短语或土味套壳名。",
      "4. whyItFits 必须说明这次修正为什么更贴近用户反馈。",
    ].join("\n")),
    new HumanMessage([
      "请基于以下上下文，对选中方案做定向修正。",
      "",
      "【分层上下文】",
      renderSelectedContextBlocks(context),
      "",
      "【项目上下文补充】",
      formatProjectContext(input.context) || "none",
      "",
      "【当前选中方案】",
      formatCandidateDigest(input.candidate, 0),
      "",
      "【上一轮候选】",
      formatLatestBatchDigest(input.batches),
      "",
      "【预设修正】",
      formatPresetHints(input.presets),
      "",
      "【用户反馈】",
      input.feedback.trim(),
      "",
      "【输出要求】",
      "- 只输出 1 套修正后的完整候选 JSON",
      "- 保留原候选主方向，不要重做成完全不同的书",
      "- 优先修准用户指出的偏差点",
    ].join("\n")),
  ],
};

export const directorBlueprintPrompt: PromptAsset<
  DirectorBlueprintPromptInput,
  typeof directorPlanBlueprintSchema._output
> = {
  id: "novel.director.blueprint",
  version: "v1",
  taskType: "planner",
  mode: "structured",
  language: "zh",
  contextPolicy: {
    maxTokensBudget: NOVEL_PROMPT_BUDGETS.directorBlueprint,
    requiredGroups: ["book_contract", "idea_seed", "macro_constraints"],
    preferredGroups: ["project_context"],
  },
  outputSchema: directorPlanBlueprintSchema,
  render: (input, context) => [
    new SystemMessage([
      "你是长篇小说总规划导演，负责把确认后的书级方向展开成可执行蓝图。",
      "你的任务不是写正文，也不是展开 scene，而是把整本书规划到 book -> arc -> chapter shell 这一层。",
      "",
      "【任务边界】",
      "本阶段只生成 bookPlan 与 arcs，不进入 scene 级细化，不补人物百科，不补世界观百科。",
      "输出必须是严格 JSON，结构只能是 {\"bookPlan\":{...},\"arcs\":[...]}。",
      "不要输出 Markdown、解释、注释或额外文本。",
      "",
      "【chapter shell 字段要求】",
      "每个 chapter 必须完整包含：title、objective、expectation、planRole、hookTarget、participants、reveals、riskNotes、mustAdvance、mustPreserve、scenes。",
      "其中 scenes 必须返回空数组，不允许在本阶段展开场景细节。",
      "planRole 只能是：setup、progress、pressure、turn、payoff、cooldown。",
      "",
      "【规划原则】",
      "1. 整体结构必须支持长篇连载，不要过早把后半本细化到场景级。",
      "2. bookPlan 负责整书级承诺、主线、阶段推进与总节奏控制。",
      "3. arcs 必须体现明确阶段功能，不能只是把章节机械分组。",
      "4. 每个 arc 都要说明自己为什么单独存在，它负责哪一段阶段性承诺、冲突升级或关系变化。",
      "5. 每个 chapter shell 都要让新手用户一眼知道：这一章必须推进什么、必须保留什么、结尾要留下什么。",
      "",
      "【chapter shell 质量要求】",
      "1. title 必须像真实章节规划标题，能体现本章推进重点。",
      "2. objective 必须写清本章最核心的推进任务，不能写成泛泛总结。",
      "3. expectation 必须说明读者在这一章主要期待看到什么兑现或变化。",
      "4. hookTarget 必须说明本章结尾要把读者推向什么新的关注点或压力点。",
      "5. participants 必须只包含本章实际关键参与者，不要泛滥堆角色。",
      "6. reveals 必须写本章应揭出的关键信息或认知变化，没有则保守填写，不要硬造大反转。",
      "7. riskNotes 必须指出本章最容易写歪、写空或越界的风险。",
      "8. mustAdvance 和 mustPreserve 必须具体、短促、可执行，不能写空话。",
      "",
      "【节奏要求】",
      "1. 前段 chapter shell 要快速建立局面、主卖点与追读钩子。",
      "2. 中段要体现升级、博弈、转向或代价抬升，避免平推。",
      "3. 后段要体现阶段性兑现、高潮集中与后续入口。",
      "4. 不同 arc 之间要有阶段差异，不能多个 arc 只是同义升级。",
      "",
      "【禁止事项】",
      "禁止生成新的核心设定块、人物小传或世界观百科。",
      "禁止把 scenes 写出内容。",
      "禁止用空泛词替代可执行规划，例如“增强张力”“推进剧情”。",
      "禁止把每章写成同一种功能模板。",
      "",
      "【生成原则】",
      "信息不足时可以保守补全，但必须保证结构完整、阶段清晰、可继续细化。",
    ].join("\n")),
    new HumanMessage([
      "请基于以下上下文，输出整书执行蓝图。",
      "",
      "【分层上下文】",
      renderSelectedContextBlocks(context),
      "",
      "【目标章节总数】",
      String(input.targetChapterCount),
      "",
      "【输出要求】",
      "- 只输出严格 JSON",
      '- 结构只能是 {"bookPlan":{...},"arcs":[...]}',
      "- 只规划到 chapter shell",
      "- scenes 必须全部为空数组",
      "- 优先保证长篇可连载性、阶段差异与新手可执行性",
    ].join("\n")),
  ],
};

export const directorBookContractPrompt: PromptAsset<
  DirectorBookContractPromptInput,
  typeof directorBookContractSchema._output
> = {
  id: "novel.director.book_contract",
  version: "v1",
  taskType: "planner",
  mode: "structured",
  language: "zh",
  contextPolicy: {
    maxTokensBudget: NOVEL_PROMPT_BUDGETS.directorBookContract,
    requiredGroups: ["book_contract", "idea_seed"],
    preferredGroups: ["project_context", "macro_constraints"],
  },
  outputSchema: directorBookContractSchema,
  render: (input, context) => [
    new SystemMessage([
      "你是长篇网文总导演，负责把已确认的书级方向收束成一本书的 Book Contract。",
      "服务对象是不懂写作流程的新手用户。",
      "你的任务不是重写大纲，而是提炼这本书后续所有规划都必须服从的高层创作契约。",
      "",
      "【任务边界】",
      "只输出严格 JSON，不要输出解释文本、Markdown、注释或额外字段。",
      "必须输出字段：readingPromise、protagonistFantasy、coreSellingPoint、chapter3Payoff、chapter10Payoff、chapter30Payoff、escalationLadder、relationshipMainline、absoluteRedLines。",
      "",
      "【字段要求】",
      "1. readingPromise 必须写清这本书持续给读者什么阅读满足，说明读者为什么会追下去。",
      "2. protagonistFantasy 必须写清主角视角下最核心的代入幻想或爽点承载，不要泛写成人设标签。",
      "3. coreSellingPoint 必须指出这本书最不可替代的主卖点，而不是多个卖点平均罗列。",
      "4. chapter3Payoff、chapter10Payoff、chapter30Payoff 必须体现明确的连载兑现节奏，说明在对应阶段读者能拿到什么阶段性满足。",
      "5. escalationLadder 必须体现整书主要升级阶梯或压力抬升路径，而不是抽象写‘越来越难’。",
      "6. relationshipMainline 必须写清核心关系线如何驱动长期推进，不要只写人物关系现状。",
      "7. absoluteRedLines 必须是明确禁区，能防止故事写歪、卖点跑偏或角色失真。",
      "",
      "【核心原则】",
      "1. Book Contract 必须足够短硬，能指导后续分卷、拆章、续写与审查。",
      "2. 它不是宣传文案，而是创作约束文件。",
      "3. 它必须同时服务前期抓力、中期续航、长期连载稳定性。",
      "4. 对新手用户要清晰，不能写成模糊抽象的文学评论。",
      "",
      "【质量要求】",
      "1. chapter3Payoff 应偏向开书抓手与快速兑现。",
      "2. chapter10Payoff 应体现中前段建立后的第一阶段回报或局面变化。",
      "3. chapter30Payoff 应体现更稳定的中段承诺兑现或阶段性大跃迁。",
      "4. escalationLadder 要能与题材、主卖点、成长逻辑相匹配。",
      "5. absoluteRedLines 必须具体可执行，避免“不要崩”“保持一致”这类空话。",
      "",
      "【生成原则】",
      "信息不足时可以保守补全，但必须保证每个字段都能真实约束后续创作。",
    ].join("\n")),
    new HumanMessage([
      "请基于以下上下文，输出这本书的 Book Contract。",
      "",
      "【分层上下文】",
      renderSelectedContextBlocks(context),
      "",
      "【目标章节总数】",
      String(input.targetChapterCount),
      "",
      "【输出要求】",
      "- 只输出严格 JSON",
      "- 必须完整输出所有指定字段",
      "- 优先保证可约束性、可执行性与连载节奏指导价值",
    ].join("\n")),
  ],
};

export {
  buildDirectorBookContractContextBlocks,
  buildDirectorBlueprintContextBlocks,
  buildDirectorCandidateContextBlocks,
};
