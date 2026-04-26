import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";
import type { PromptAsset } from "../../core/promptTypes";
import { characterSyncProposalAiOutputSchema } from "./characterSync.promptSchemas";

export interface CharacterSyncClassificationPromptInput {
  novelTitle: string;
  novelSummary: string;
  novelCharacterJson: string;
  baseCharacterJson: string;
  currentBaseRevisionJson: string;
  recentTimelineText: string;
  userIntent: string;
}

export const characterSyncClassificationPrompt: PromptAsset<
  CharacterSyncClassificationPromptInput,
  z.infer<typeof characterSyncProposalAiOutputSchema>
> = {
  id: "character.sync.classify",
  version: "v1",
  taskType: "planner",
  mode: "structured",
  language: "zh",
  contextPolicy: {
    maxTokensBudget: 0,
  },
  outputSchema: characterSyncProposalAiOutputSchema,
  render: (input) => [
    new SystemMessage([
      "你是 AI 小说工作台的角色资产同步审校员，服务对象是不懂小说设定管理的新手用户。",
      "你的任务是判断“小说内角色实例”的变化中，哪些适合沉淀到外部角色库，哪些必须只留在当前小说。",
      "",
      "核心边界：",
      "1. 角色库是可复用角色资产，只保存稳定身份、基础人格、长期背景、可复用表达特征。",
      "2. 小说内角色是某本书里的剧情实例，保存当前目标、当前状态、章节关系、事件结果、资源持有、死亡/受伤/黑化/和解等运行状态。",
      "3. 任何一本小说里的剧情状态都不能自动污染角色库，也不能影响其他小说。",
      "4. 你只能提出同步建议，最终是否写入由用户确认。",
      "",
      "分类规则：",
      "1. identity：姓名、基础身份、可复用外貌、稳定标签，可作为 safeUpdates。",
      "2. persona：基础性格、长期动机、弱点、说话方式、价值观，通常需要 review_before_apply。",
      "3. story_adaptation：本书叙事功能、与主角关系、阵营位置、阶段弧线，默认 novelOnlyUpdates 或 riskyUpdates。",
      "4. runtime_state：当前状态、当前目标、情绪、秘密暴露状态、章节后果、资源变化，必须 novelOnlyUpdates。",
      "5. growth_deposit：从本书中沉淀出的稳定人格补充，可放入 safeUpdates 或 riskyUpdates，但要说明风险。",
      "",
      "输出要求：",
      "1. 只输出合法 JSON，不要 Markdown、解释、注释、代码块或额外文本。",
      "2. 必须使用固定键名：confidence、summary、safeUpdates、novelOnlyUpdates、riskyUpdates、baseCharacterDraft、recommendedAction、scopeNote。",
      "3. baseCharacterDraft 只包含角色库允许保存的字段：name、role、personality、background、development、appearance、weaknesses、interests、keyEvents、tags、category。",
      "4. baseCharacterDraft 不得写入 currentState、currentGoal、章节结果、死亡受伤、关系进度、资源持有等本书运行状态。",
      "5. 如果信息不足以生成角色库草稿，baseCharacterDraft 设为 null，并推荐 keep_novel_only 或 review_before_apply。",
      "6. scopeNote 必须明确说明：这次建议不会自动影响其他小说。",
    ].join("\n")),
    new HumanMessage([
      `用户意图：${input.userIntent}`,
      `小说标题：${input.novelTitle}`,
      `小说概况：${input.novelSummary || "无"}`,
      "",
      "小说内角色实例：",
      input.novelCharacterJson,
      "",
      "当前角色库角色：",
      input.baseCharacterJson || "无",
      "",
      "当前角色库版本：",
      input.currentBaseRevisionJson || "无",
      "",
      "近期角色时间线：",
      input.recentTimelineText || "无",
    ].join("\n")),
  ],
};
