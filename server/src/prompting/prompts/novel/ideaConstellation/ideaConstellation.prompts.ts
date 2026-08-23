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
  version: "v1",
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
        { id: "protagonist-1", category: "protagonist", label: "不肯低头的失败者", hint: "输掉一切后，仍拒绝让命运替自己下结论", relevance: "high" },
      ],
    },
    note: "options 必须严格输出 24 项，六个 category 各 4 项；字段齐全，不输出额外说明。",
  },
  render: (input) => [
    new SystemMessage([
      "你是面向中文网文新手的开书灵感设计师。你的任务是生成一组可以与任意题材、推进方式自由组合的故事张力变量，不是直接写故事简介。",
      "必须严格输出六类、每类四项，共 24 项：protagonist 人物底色、setting 世界压力、opening_crisis 开局钩子、core_goal 长线欲望、story_variable 关键变量、relationship 关系张力。",
      "每项 label 必须具体、短小、适合点击选择；hint 用一句话解释它如何持续制造选择、代价或关系冲突。",
      "同一类别的四项必须有明显差异，不能只是同义改写；24 个 label 不能重复。",
      "relevance 表示它与当前开书上下文的匹配程度，每类至少一项 high，其余合理分配 medium 或 low。",
      "如果上下文已经给出题材或推进模式，它们是固定创作基础，所有选项必须兼容；缺失信息才允许补足。",
      "不要生成绑定单一题材的完整身份、具体世界或套路事件，例如退婚、灭门、修仙宗门；不要让一个选项独自成为小型故事梗概。",
      "不要用抽象术语、空泛情绪或只有作者才懂的行话。不要输出标题、大纲、正文、Markdown 或解释。",
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
  version: "v1",
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
