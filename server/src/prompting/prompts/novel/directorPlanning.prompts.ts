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
import {
  directorCandidateResponseSchema,
  directorPlanBlueprintSchema,
} from "../../../services/novel/director/novelDirectorSchemas";

export interface DirectorCandidatePromptInput {
  idea: string;
  context: DirectorProjectContextInput;
  count: number;
  batches: DirectorCandidateBatch[];
  presets: DirectorCorrectionPreset[];
  feedback?: string;
}

export interface DirectorBlueprintPromptInput {
  idea: string;
  context: DirectorProjectContextInput;
  candidate: DirectorCandidate;
  storyMacroPlan: StoryMacroPlan;
  targetChapterCount: number;
}

function formatProjectContext(input: DirectorProjectContextInput): string {
  const lines = [
    input.title?.trim() ? `当前标题草案：${input.title.trim()}` : "",
    input.description?.trim() ? `当前一句话概述：${input.description.trim()}` : "",
    input.genreId?.trim() ? `类型 ID：${input.genreId.trim()}` : "",
    input.worldId?.trim() ? `世界观 ID：${input.worldId.trim()}` : "",
    input.writingMode ? `创作模式：${input.writingMode}` : "",
    input.projectMode ? `项目模式：${input.projectMode}` : "",
    input.narrativePov ? `叙事视角：${input.narrativePov}` : "",
    input.pacePreference ? `节奏偏好：${input.pacePreference}` : "",
    input.styleTone?.trim() ? `文风关键词：${input.styleTone.trim()}` : "",
    input.emotionIntensity ? `情绪浓度：${input.emotionIntensity}` : "",
    input.aiFreedom ? `AI 自由度：${input.aiFreedom}` : "",
    typeof input.defaultChapterLength === "number" ? `默认章节字数：${input.defaultChapterLength}` : "",
    typeof input.estimatedChapterCount === "number" ? `预计章节数：${input.estimatedChapterCount}` : "",
  ].filter(Boolean);
  return lines.join("\n");
}

function formatPresetHints(presets: DirectorCorrectionPreset[]): string {
  if (presets.length === 0) {
    return "无预设修正。";
  }
  return presets.map((preset) => {
    const meta = DIRECTOR_CORRECTION_PRESETS.find((item) => item.value === preset);
    return meta ? `${meta.label}：${meta.promptHint}` : preset;
  }).join("\n");
}

function formatCandidateDigest(candidate: DirectorCandidate, index: number): string {
  return [
    `方案 ${index + 1}：${candidate.workingTitle}`,
    `一句话：${candidate.logline}`,
    `定位：${candidate.positioning}`,
    `卖点：${candidate.sellingPoint}`,
    `冲突：${candidate.coreConflict}`,
    `主角路径：${candidate.protagonistPath}`,
    `主钩子：${candidate.hookStrategy}`,
    `结局方向：${candidate.endingDirection}`,
  ].join("\n");
}

function formatLatestBatchDigest(batches: DirectorCandidateBatch[]): string {
  const latestBatch = batches.at(-1);
  if (!latestBatch) {
    return "无上一轮候选。";
  }
  return [
    `${latestBatch.roundLabel}：${latestBatch.refinementSummary?.trim() || "上一轮候选"}`,
    ...latestBatch.candidates.map((candidate, index) => formatCandidateDigest(candidate, index)),
  ].join("\n\n");
}

function formatStoryMacroSummary(plan: StoryMacroPlan): string {
  const lines = [
    plan.expansion?.expanded_premise ? `扩展前提：${plan.expansion.expanded_premise}` : "",
    plan.expansion?.protagonist_core ? `主角核心：${plan.expansion.protagonist_core}` : "",
    plan.expansion?.conflict_engine ? `冲突引擎：${plan.expansion.conflict_engine}` : "",
    plan.expansion?.mystery_box ? `悬念盒：${plan.expansion.mystery_box}` : "",
    plan.decomposition?.selling_point ? `卖点拆解：${plan.decomposition.selling_point}` : "",
    plan.decomposition?.core_conflict ? `主线冲突：${plan.decomposition.core_conflict}` : "",
    plan.decomposition?.progression_loop ? `推进循环：${plan.decomposition.progression_loop}` : "",
    plan.decomposition?.growth_path ? `成长路径：${plan.decomposition.growth_path}` : "",
    plan.decomposition?.ending_flavor ? `结局风味：${plan.decomposition.ending_flavor}` : "",
    plan.constraints.length > 0 ? `硬约束：${plan.constraints.join("；")}` : "",
  ].filter(Boolean);
  return lines.join("\n");
}

function buildDirectorCandidatePrompt(input: DirectorCandidatePromptInput): { system: string; user: string } {
  return {
    system: [
      "你是长篇小说自动导演，负责为完全不懂写作的用户快速筛出可落地的书级方向。",
      "你当前只做一件事：生成“书级候选卡片”，用于用户选择方向。",
      "不要展开大纲、不要写宏观结构、不要进入世界观细节。",
      "",
      "只输出严格 JSON，不要输出解释、Markdown、注释或任何额外文本。",
      "",
      "输出格式必须完全等于：",
      "{\"candidates\":[{\"workingTitle\":\"\",\"logline\":\"\",\"positioning\":\"\",\"sellingPoint\":\"\",\"coreConflict\":\"\",\"protagonistPath\":\"\",\"endingDirection\":\"\",\"hookStrategy\":\"\",\"progressionLoop\":\"\",\"whyItFits\":\"\",\"toneKeywords\":[\"\",\"\"],\"targetChapterCount\":24}]}",
      "",
      `必须精确返回 ${input.count} 套候选，不多不少。`,
      "禁止输出 bookSpec、macroDraft、notes、commentary 等任何额外字段。",
      "所有字段必须填满，不允许留空、不允许 null。",
      "",
      "核心要求：",
      "1. 每套候选必须是“可直接写第一章”的方向，而不是概念草稿。",
      "2. 候选之间必须有明显方向差异（题材组合、冲突结构、主角路径、卖点承载方式至少一项不同）。",
      "3. 不要生成同一方案的轻微变体（改名、换词视为无效差异）。",
      "",
      "字段规则：",
      "1. workingTitle：必须像真实网文书名，有辨识度，不要占位词或泛标题。",
      "2. logline：用1-2句讲清主角是谁、遇到什么核心麻烦、故事如何启动。",
      "3. positioning：一句话说明题材组合与市场定位。",
      "4. sellingPoint：明确读者爽点来源或核心吸引力，不要空话。",
      "5. coreConflict：必须具体，能直接驱动剧情，而不是抽象矛盾。",
      "6. protagonistPath：说明主角的行动路径或成长方式，要可持续推进。",
      "7. endingDirection：给出方向性结局（胜利方式/代价/反转类型），不要写开放空话。",
      "8. hookStrategy：说明开篇如何抓人（事件、反转、设定冲击等）。",
      "9. progressionLoop：说明该书如何“不断往前写”，例如循环结构、升级机制、关系推进模式等。",
      "10. whyItFits：必须明确说明为什么这套方案更贴近用户当前意图或本轮修正。",
      "11. toneKeywords：2-4个关键词，具体、有辨识度，不要“热血/爽文/精彩”这种空词。",
      "12. targetChapterCount：优先贴合上下文，否则给24-40之间的合理值。",
      "",
      "风格要求：",
      "1. 所有文本使用简体中文。",
      "2. 表达简洁但具体，像产品卡片文案，不要写成长段分析。",
      "3. 每个字段都必须“有信息密度”，不能用空泛总结填充。",
      "",
      "边界规则：",
      "1. 信息不足时可以合理补全，但必须贴合用户灵感与上下文，不要发散到无关方向。",
      "2. 不要假装已有设定已确定（例如世界观、角色名等），除非用户明确给出。",
    ].join("\n"),
    user: [
      `原始灵感：\n${input.idea.trim()}`,
      `当前项目上下文：\n${formatProjectContext(input.context) || "无额外上下文"}`,
      `上一轮候选摘要：\n${formatLatestBatchDigest(input.batches)}`,
      `本轮预设修正：\n${formatPresetHints(input.presets)}`,
      `本轮自由修正建议：\n${input.feedback?.trim() || "无"}`,
      "",
      [
        "生成要求：",
        "1. 优先围绕“最能成立一本书”的方向生成，而不是列想法。",
        "2. 每套候选都必须自洽：主角路径、冲突、卖点和推进方式要能互相支撑。",
        "3. 如果上一轮已有方向，本轮必须体现修正，而不是重复旧方案。",
        "4. 不要生成无法长期连载的设定（一次性冲突或很快耗尽的机制）。",
        "5. 让用户可以一眼做选择，而不是需要解释才能理解差异。",
      ].join("\n"),
    ].join("\n\n"),
  };
}

function buildDirectorBlueprintPrompt(input: DirectorBlueprintPromptInput): { system: string; user: string } {
  return {
    system: [
      "你是长篇小说总规划导演，负责把已确认的书级方向展开为“可直接写作使用”的整本骨架。",
      "你的输出不是创意描述，而是结构清晰、可执行的写作蓝图。",
      "",
      "只输出严格 JSON，不要输出解释、Markdown、注释或任何额外文本。",
      "输出格式只能是：{\"bookPlan\":{...},\"arcs\":[...]}",
      "",
      "结构硬规则：",
      "1. 每个 arc 必须包含 chapters。",
      "2. 每个 chapter 必须包含 scenes（且为顺序推进的场景数组）。",
      "3. chapter.planRole 只能是：setup、progress、pressure、turn、payoff、cooldown。",
      "4. 不得缺字段、不得改字段名、不得新增近义字段。",
      "",
      "全局规划目标：",
      "1. 这是给写作小白使用的自动规划骨架，每一章都必须“可以照着写”。",
      "2. 每一层结构（book → arc → chapter → scene）都必须承担清晰功能，而不是信息重复。",
      "3. 整体结构必须支持长篇连载，而不是短篇爆点堆叠。",
      "",
      "bookPlan 要求：",
      "1. 必须说明整本书的核心目标（主角最终要达成什么）。",
      "2. 必须明确整本书的核心钩子来源（读者为什么持续看）。",
      "3. 必须指出主要风险（例如节奏疲软点、设定消耗点、关系疲劳点）。",
      "4. 表达要简洁但具体，不能写成空话。",
      "",
      "arc 设计规则：",
      "1. arc.summary 必须说明这一段的结构作用（例如开局建立、第一次反转、关系绑定、压力升级、阶段收束等）。",
      "2. 每个 arc 都要有明确“起 → 推进 → 升级/转折 → 阶段性兑现”的结构。",
      "3. 不同 arc 之间要有推进关系，而不是重复同一模式。",
      "",
      "chapter 设计规则：",
      "1. chapter.expectation 必须是“可直接执行的写作提示”，像在告诉新手这一章具体要写什么。",
      "2. 禁止使用抽象表达，如“展开剧情”“增加冲突”“刻画人物”。",
      "3. 必须写清：这一章发生什么事、冲突如何体现、角色做了什么。",
      "4. planRole 要与该章实际功能一致，不得乱标。",
      "",
      "scenes 设计规则：",
      "1. scenes 必须按顺序推进，每个 scene 都要有明确动作或变化。",
      "2. 每个 scene 应体现“发生了什么”，而不是主题或总结。",
      "3. scene 之间要有因果衔接，避免跳跃或断层。",
      "4. 不要写成抽象标签（如“冲突升级”“情绪变化”），必须具体到行为或事件。",
      "",
      "节奏与连载规则：",
      "1. 前段必须有明确钩子（事件、反转或异常），快速抓住读者。",
      "2. 中段必须持续升级（冲突更强、代价更高、关系更复杂）。",
      "3. 后段必须有阶段性回收（兑现、反转或阶段结果），不能一直悬而不决。",
      "4. 每若干章应有小高潮或推进节点，避免平铺。",
      "",
      "数量规则：",
      "1. arcs 的总章节数必须尽量贴近目标章节数，允许上下浮动 2 章。",
      "2. 不要极端分布（例如一个 arc 过长或过短）。",
      "",
      "风格要求：",
      "1. 全部内容使用简体中文。",
      "2. 表达要具体、清晰、可执行，避免空泛套话。",
      "3. 输出必须像“可以直接交给作者写”的蓝图，而不是分析文档。",
      "",
      "边界规则：",
      "1. 不要扩展额外结构（如人物设定块、世界观块）。",
      "2. 不要重复输入内容原文，要做结构化展开。",
      "3. 不要写解释性语句或说明文字。",
    ].join("\n"),
    user: [
      `原始灵感：\n${input.idea.trim()}`,
      `当前项目上下文：\n${formatProjectContext(input.context) || "无额外上下文"}`,
      `已确认候选：\n${formatCandidateDigest(input.candidate, 0)}`,
      `故事宏观摘要：\n${formatStoryMacroSummary(input.storyMacroPlan) || "暂无额外宏观摘要"}`,
      `目标章节总数：${input.targetChapterCount}`,
      "",
      [
        "规划要求：",
        "1. arcs 的总章节数尽量贴近目标章节总数，可上下浮动 2 章。",
        "2. bookPlan 必须体现整本书的目标、钩子与风险，而不是复述简介。",
        "3. 每个 arc 都要有明确结构作用，避免“只是继续发展”。",
        "4. 每章 expectation 必须让新手知道“这一章具体写什么”，不能抽象。",
        "5. scenes 必须体现具体事件推进，而不是概念描述。",
        "6. 保证整体节奏：开局抓人，中段升级，阶段回收清晰。",
        "7. 不要生成无法支撑长篇连载的结构（例如很快耗尽冲突）。",
      ].join("\n"),
    ].join("\n\n"),
  };
}

export const directorCandidatePrompt: PromptAsset<DirectorCandidatePromptInput, typeof directorCandidateResponseSchema._output> = {
  id: "novel.director.candidates",
  version: "v1",
  taskType: "planner",
  mode: "structured",
  language: "zh",
  contextPolicy: {
    maxTokensBudget: 0,
  },
  outputSchema: directorCandidateResponseSchema,
  render: (input) => {
    const prompt = buildDirectorCandidatePrompt(input);
    return [new SystemMessage(prompt.system), new HumanMessage(prompt.user)];
  },
};

export const directorBlueprintPrompt: PromptAsset<DirectorBlueprintPromptInput, typeof directorPlanBlueprintSchema._output> = {
  id: "novel.director.blueprint",
  version: "v1",
  taskType: "planner",
  mode: "structured",
  language: "zh",
  contextPolicy: {
    maxTokensBudget: 0,
  },
  outputSchema: directorPlanBlueprintSchema,
  render: (input) => {
    const prompt = buildDirectorBlueprintPrompt(input);
    return [new SystemMessage(prompt.system), new HumanMessage(prompt.user)];
  },
};
