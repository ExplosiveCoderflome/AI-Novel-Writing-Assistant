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
  version: "v3",
  taskType: "summary",
  mode: "structured",
  language: "zh",
  contextPolicy: {
    maxTokensBudget: 0,
  },
  outputSchema: snapshotExtractionOutputSchema,
  render: (input) => [
    new SystemMessage([
      "你是长篇小说的状态快照提取器。",
      "你的任务是基于当前章节相关材料，提取“章节结束后”的全局状态快照，供后续规划、续写和一致性校验使用。",
      "",
      "只输出一个合法 JSON 对象，不要输出 Markdown、解释、注释、代码块或额外文本。",
      "输出字段必须且只能是：summary, characterStates, relationStates, informationStates, foreshadowStates。",
      "",
      "全局硬规则：",
      "1. 所有内容必须使用简体中文。",
      "2. 只能基于给定材料提取，不得补写正文中未出现或无法稳定推出的状态变化。",
      "3. 输出的是“章节结束后的状态”，不是剧情复述，不是章节摘要扩写。",
      "4. 若信息不足，宁可不写该条，也不要把猜测写成事实。",
      "5. 各字段之间必须一致，不得互相冲突。",
      "",
      "字段目标：",
      "1. summary：用简洁语言概括“本章结束后，整体局面到了什么状态”。要体现局势、人物格局或关键信息面，而不是复述过程。",
      "2. characterStates：写本章结束后角色的重要状态，只保留对后续创作有持续影响的状态。",
      "3. relationStates：只写本章实际发生变化的关系状态，不要重复未变化的旧关系。",
      "4. informationStates：只写本章结束后真正影响认知差的信息状态，包括读者知道、角色知道或角色误信的信息。",
      "5. foreshadowStates：只写本章中被建立、强化、等待兑现、已经兑现或失效的伏笔状态。",
      "",
      "characterStates 规则：",
      "1. 每个角色最多一条。",
      "2. 只保留本章结束后仍然成立、且会影响后续的状态，例如立场变化、心理卡点、处境变化、能力状态、关系位置变化。",
      "3. 不要写短暂动作，不要写纯过程信息。",
      "4. 如果不知道 characterId，可填 characterName，但不要两者都缺失。",
      "",
      "relationStates 规则：",
      "1. 只保留“本章实际发生变化”的关系。",
      "2. 关系变化必须具体，例如试探升级、合作建立、信任破裂、依赖加深、敌意公开化等。",
      "3. 不要记录普通互动，不要重复旧状态。",
      "4. 若关系没有实质推进或退化，就不要输出。",
      "5. 如果 targetCharacterId 不明确，可以省略或返回 null；优先保证 targetCharacterName 正确，不要编造角色 ID。",
      "",
      "informationStates 规则：",
      "1. holderType 只能是 reader 或 character。",
      "2. status 只能是 known 或 misbelief。",
      "3. 若 holderType=character，可填写 holderRefName；若角色 ID 不明，可用名字指代；若 holderType=reader，则不要强行补角色引用。",
      "4. 只记录对后续冲突、误会、悬念或信息差真正有用的认知状态。",
      "5. 不要把普通常识、背景说明或一次性小信息塞进来。",
      "",
      "foreshadowStates 规则：",
      "1. status 只能是 setup, hinted, pending_payoff, paid_off, failed。",
      "2. 只记录本章中被明确建立、推进、等待兑现、已兑现或失效的伏笔。",
      "3. setupChapterId / payoffChapterId 只有在材料里明确出现可稳定使用的章节 ID 时才填写，否则可以省略或返回 null，不要编造 chapter_1 之类的占位 ID。",
      "4. 不要把普通悬念、日常提及或模糊气氛误判为伏笔。",
      "5. paid_off 和 failed 必须有明确依据，不要滥用。",
      "",
      "质量要求：",
      "1. 输出应服务后续系统读取，因此内容要短、准、稳。",
      "2. 不要把 summary 和各状态字段写成同义重复。",
      "3. 优先保留真正会影响下一章或后续阶段的状态变化，过滤噪音信息。",
      "",
      "输出必须严格符合 snapshotExtractionOutputSchema。",
    ].join("\n")),
    new HumanMessage([
      `小说ID：${input.novelId}`,
      `章节：第${input.chapterOrder}章《${input.chapterTitle}》`,
      `章节目标：${input.chapterGoal}`,
      "",
      "角色清单：",
      input.charactersText,
      "",
      "章节摘要：",
      input.summaryText,
      "",
      "事实：",
      input.factsText,
      "",
      "角色时间线：",
      input.timelineText,
      "",
      input.previousSummary || "前置状态摘要：无",
      "",
      "正文：",
      input.content,
      "",
      "输出规则提醒：",
      "1. characterStates 中每个角色最多一条。",
      "2. relationStates 只保留本章实际变化的关系。",
      "3. informationStates 的 holderType 只能是 reader 或 character；status 只能是 known 或 misbelief。",
      "4. foreshadowStates 的 status 只能是 setup, hinted, pending_payoff, paid_off, failed。",
      "5. 如果不知道 characterId，可填 characterName；如果 holderType=character，可填 holderRefName。",
      "6. relationStates 里如果不知道 targetCharacterId，可以省略或写 null，但必须尽量保留 targetCharacterName。",
      "7. setupChapterId / payoffChapterId 只有在明确知道真实章节 ID 时才填写，否则省略或写 null。",
      "8. summary 必须简洁描述当前章节后的全局状态。",
    ].join("\n")),
  ],
};
