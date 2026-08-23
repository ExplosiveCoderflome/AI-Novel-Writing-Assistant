import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";
import type { PromptAsset } from "../../../core/promptTypes";
import {
  directorIdeaConstellationComposeSchema,
  directorIdeaConstellationOptionsSchema,
} from "./ideaConstellation.promptSchemas";

export interface DirectorIdeaConstellationOptionsPromptInput {
  contextSummary: string;
}

export interface DirectorIdeaConstellationComposePromptInput {
  contextSummary: string;
  selectedSummary: string;
}

export const directorIdeaConstellationOptionsPrompt: PromptAsset<
  DirectorIdeaConstellationOptionsPromptInput,
  z.infer<typeof directorIdeaConstellationOptionsSchema>
> = {
  id: "novel.director.idea_constellation_options",
  version: "v3",
  taskType: "planner",
  mode: "structured",
  language: "zh",
  contextPolicy: { maxTokensBudget: 0 },
  repairPolicy: { maxAttempts: 0 },
  semanticRetryPolicy: { maxAttempts: 1 },
  outputSchema: directorIdeaConstellationOptionsSchema,
  structuredOutputHint: {
    example: {
      options: [
        { id: "protagonist-1", category: "protagonist", label: "被夺项目的底层策划", hint: "刚背锅失业，却掌握公司不敢公开的项目漏洞", relevance: "high" },
        { id: "advantage-1", category: "advantage", label: "看见合同隐藏代价", hint: "签字前能看见交易会让谁获利、让谁付出代价", relevance: "high" },
      ],
    },
    note: "options 必须严格输出 35 项，七个 category 各 5 项；字段齐全，不输出额外说明。",
  },
  render: (input) => [
    new SystemMessage([
      "你是面向中文网文新手的开书素材设计师。你的任务是根据当前题材、推进方式和用户想法，生成能直接拼成开书构想的具体网文素材，不是抽象主题词或编剧命题。",
      "必须严格输出七类、每类五项，共 35 项：protagonist 主角开局身份与困境、setting 题材舞台与利益规则、advantage 金手指或核心优势、opening_crisis 第一章爆点、core_goal 前期目标与阶段回报、story_variable 核心对手或主要阻力、relationship 能持续推进的关键关系。",
      "每项 label 必须具体、适合点击选择，控制在2到48个字符；需要表达完整设定时可以使用短句，不要为了凑短而丢失关键机制。hint 说明它会怎样落到开局行动、连续升级或读者回报。",
      "同一类别的五项必须有明显差异，不能只是同义改写；35 个 label 不能重复。",
      "relevance 表示它与当前开书上下文的匹配程度，每类至少一项 high，其余合理分配 medium 或 low。",
      "如果上下文已经给出题材或推进模式，它们是固定创作基础，所有选项必须兼容；缺失信息才允许补足。",
      "protagonist 必须包含题材身份与眼前困境；setting 必须给出可发生事件的具体舞台和利益规则，不能只写世界很残酷。",
      "advantage 必须说明主角能做什么，以及触发条件、使用边界、成长方向或代价；现实题材可以使用专业能力、信息差、身份资源或稀缺关系，不强行添加超自然系统。",
      "opening_crisis 必须是第一章能够实际发生的事件；core_goal 必须说明前 10 至 30 章要争取什么以及读者能看到什么兑现。",
      "story_variable 必须是有身份、有行动能力的对手、组织、规则或倒计时压力；relationship 必须写清双方身份与捆绑方式。",
      "严禁输出“所有人活在谎言里、规则只保护胜利者、每次获胜都要失去、真相藏在谎言中”这类换到多数故事仍成立的抽象句。",
      "可以使用中文网文常见的系统、重生、异能、传承、空间、面板、预知、模拟、职业技能或资源优势，但必须贴合当前题材并给出差异化机制，不能照搬作品专名。",
      "不要输出标题、大纲、正文、Markdown 或解释。",
      "id 使用 category-序号，例如 protagonist-1。只输出严格 JSON。",
    ].join("\n")),
    new HumanMessage([
      "请为以下开书上下文生成故事星图。没有明确上下文时，仍要提供差异清楚、容易开篇、适合连续创作的中文网文元素。",
      "",
      input.contextSummary || "暂无明确上下文。",
    ].join("\n")),
  ],
  postValidate: (output) => {
    const labels = new Set(output.options.map((option) => option.label.replace(/\s+/g, "")));
    if (labels.size !== output.options.length) {
      throw new Error("故事星图选项不能重复。");
    }
    return output;
  },
};

export const directorIdeaConstellationComposePrompt: PromptAsset<
  DirectorIdeaConstellationComposePromptInput,
  z.infer<typeof directorIdeaConstellationComposeSchema>
> = {
  id: "novel.director.idea_constellation_compose",
  version: "v2",
  taskType: "planner",
  mode: "structured",
  language: "zh",
  contextPolicy: { maxTokensBudget: 0 },
  repairPolicy: { maxAttempts: 0 },
  semanticRetryPolicy: { maxAttempts: 1 },
  outputSchema: directorIdeaConstellationComposeSchema,
  structuredOutputHint: {
    example: {
      idea: "末日后的封闭城市里，一名失忆医生为了寻找失踪的妹妹，被迫利用每天重置一次的时间循环追查医院深处的禁忌实验。",
    },
    note: "idea 是 45-220 字的单段开书想法，不输出标题、Markdown 或额外说明。",
  },
  render: (input) => [
    new SystemMessage([
      "你是中文网文开书灵感助手，负责把用户亲自选择的故事元素收束成一段可以直接开始创作的起始想法。",
      "必须保留每个已选元素的核心含义，并让它们形成因果关系，不能只把标签机械串联。",
      "优先写清主角的具体身份、金手指或核心优势、第一章发生的事件，以及前期必须完成的目标；不要重新抽象成主题句。",
      "已有题材和推进模式是固定基础，不得擅自更换。即使用户只选择一个元素，也要结合固定基础轻量补足主角、开局行动和长期牵引，让结果可以直接用于开书。",
      "补足内容只用于建立因果，不能压过用户选择，也不要擅自增加另一套复杂主线。",
      "只写一段 45-220 字的纯文本，不写标题、大纲、结局、Markdown、编号或过程说明。只输出严格 JSON。",
    ].join("\n")),
    new HumanMessage([
      "当前开书上下文：",
      input.contextSummary || "暂无明确上下文。",
      "",
      "用户选择的故事元素：",
      input.selectedSummary,
    ].join("\n")),
  ],
  postValidate: (output) => {
    if (/^\s*(标题|故事简介|起始想法)\s*[：:]/.test(output.idea) || output.idea.includes("```")) {
      throw new Error("起始想法不能包含标题或格式标记。");
    }
    return output;
  },
};
