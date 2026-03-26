import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";
import type { PromptAsset } from "../../core/promptTypes";
import { snapshotExtractionOutputSchema } from "../../../services/state/stateSchemas";

export interface StateSnapshotPromptInput {
  novelId: string;
  chapterOrder: number;
  chapterTitle: string;
  chapterGoal: string;
  charactersText: string;
  summaryText: string;
  factsText: string;
  timelineText: string;
  previousSummary: string;
  content: string;
}

export const stateSnapshotPrompt: PromptAsset<
  StateSnapshotPromptInput,
  z.infer<typeof snapshotExtractionOutputSchema>
> = {
  id: "state.snapshot.extract",
  version: "v1",
  taskType: "summary",
  mode: "structured",
  language: "zh",
  contextPolicy: {
    maxTokensBudget: 0,
  },
  outputSchema: snapshotExtractionOutputSchema,
  render: (input) => [
    new SystemMessage(
      "你是小说状态引擎。请严格输出 JSON，字段为 summary, characterStates, relationStates, informationStates, foreshadowStates。不要输出额外解释。",
    ),
    new HumanMessage(`小说ID：${input.novelId}
章节：第${input.chapterOrder}章《${input.chapterTitle}》
章节目标：${input.chapterGoal}
角色清单：
${input.charactersText}

章节摘要：
${input.summaryText}

事实：
${input.factsText}

角色时间线：
${input.timelineText}

${input.previousSummary}

正文：
${input.content}

输出 JSON 规则：
1. characterStates 中每个角色最多一条。
2. relationStates 只保留本章实际变化的关系。
3. informationStates 的 holderType 只能是 reader 或 character；status 只能是 known 或 misbelief。
4. foreshadowStates 的 status 只能是 setup, hinted, pending_payoff, paid_off, failed。
5. 如果不知道 characterId，可填 characterName；如果 holderType=character，可填 holderRefName。
6. summary 必须简洁描述当前章节后的全局状态。`),
  ],
};
