import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { PromptAsset } from "../../core/promptTypes";

export interface RuntimeFallbackAnswerPromptInput {
  toolList: string;
  goal: string;
  structuredIntentJson: string;
  summary: string;
  groundingFacts: string;
}

export interface RuntimeSetupGuidancePromptInput {
  sceneInstruction: string;
  goal: string;
  intentFacts: string;
  knownFacts: string;
}

export interface RuntimeSetupIdeationPromptInput {
  goal: string;
  structuredIntentJson: string;
  facts: string;
}

export const runtimeFallbackAnswerPrompt: PromptAsset<RuntimeFallbackAnswerPromptInput, string, string> = {
  id: "agent.runtime.fallback_answer",
  version: "v1",
  taskType: "chat",
  mode: "text",
  language: "zh",
  contextPolicy: {
    maxTokensBudget: 0,
  },
  render: (input) => [
    new SystemMessage([
      "你是小说创作 Agent 的回答整理器。",
      "只能使用工具结果中的明确事实回答，禁止补充未执行到的信息。",
      "如果工具结果不足，不要生硬地终止；优先指出信息缺口，并给出一个追问或 2-3 个下一步选项。",
      "以下是可用工具目录：",
      input.toolList,
    ].join("\n")),
    new HumanMessage([
      `用户目标：${input.goal}`,
      `结构化意图：${input.structuredIntentJson}`,
      `执行摘要：${input.summary}`,
      `工具事实：${input.groundingFacts}`,
      "请返回简洁中文结果。",
    ].join("\n\n")),
  ],
};

export const runtimeSetupGuidancePrompt: PromptAsset<RuntimeSetupGuidancePromptInput, string, string> = {
  id: "agent.runtime.setup_guidance",
  version: "v1",
  taskType: "chat",
  mode: "text",
  language: "zh",
  contextPolicy: {
    maxTokensBudget: 0,
  },
  render: (input) => [
    new SystemMessage([
      "你是小说创作中枢里的开书引导助手。",
      "你的任务是根据已知事实，用更自然、亲切、简洁的中文把用户带到下一步，不要像表单提示或系统通知。",
      "必须严格基于给定事实，不得虚构小说设定、进度、角色或用户偏好。",
      "如果标题还没确定，不要假装小说已经创建；可以自然地邀请用户先给暂定标题，或者先讲题材、主角、冲突。",
      "如果已有初始化状态，先轻轻承接当前进展，再围绕最优先的一项自然追问，不要原样复读“系统建议提问”或“系统建议动作”。",
      "输出 2 到 4 句，不要用列表，不要使用“缺失项”“recommendedAction”“nextQuestion”这类内部术语。",
      "最后一句尽量是便于用户直接回答的问题；如果用户暂时没想好，可以顺带给出“我也可以先给你几个方向”的柔和选项。",
    ].join("\n")),
    new HumanMessage([
      `场景：${input.sceneInstruction}`,
      `用户原始目标：${input.goal}`,
      `结构化线索：${input.intentFacts}`,
      `已知事实：\n${input.knownFacts}`,
      "请生成现在要发给用户的下一条回复。",
    ].join("\n\n")),
  ],
};

export const runtimeSetupIdeationPrompt: PromptAsset<RuntimeSetupIdeationPromptInput, string, string> = {
  id: "agent.runtime.setup_ideation",
  version: "v1",
  taskType: "chat",
  mode: "text",
  language: "zh",
  contextPolicy: {
    maxTokensBudget: 0,
  },
  render: (input) => [
    new SystemMessage([
      "你是小说开书阶段的设定脑暴助手。",
      "用户现在要基于当前小说工作区的已知信息，生成若干套可选方案。",
      "必须优先使用给定事实；如果事实还不完整，也要围绕标题和已有线索给出暂定方案，不要回答“当前信息不足，无法继续”。",
      "不要虚构成已经确定的事实。凡是你补足的方向，都要以“可以走这个方向 / 可选方案 / 暂定版本”的口吻表达。",
      "如果已有世界规则、故事承诺、风格偏好或禁用规则，生成的方案必须与这些约束保持一致。",
      "严格满足用户请求的数量和格式。如果用户要 3 套，就给 3 套。",
      "每套方案之间要拉开差异，不要只是改几个词。",
      "输出简洁中文，默认使用编号列表。最后补一句简短引导，方便用户直接选一版、混搭，或继续细化。",
    ].join("\n")),
    new HumanMessage([
      `用户当前请求：${input.goal}`,
      `结构化意图：${input.structuredIntentJson}`,
      `当前可用事实：\n${input.facts}`,
      "请直接生成现在要发给用户的回答。",
    ].join("\n\n")),
  ],
};
