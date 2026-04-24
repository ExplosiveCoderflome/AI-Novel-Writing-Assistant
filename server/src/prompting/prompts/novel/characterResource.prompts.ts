import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";
import type { PromptAsset } from "../../core/promptTypes";
import { characterResourceExtractionOutputSchema } from "./characterResource.promptSchemas";

export interface CharacterResourceExtractionPromptInput {
  novelTitle: string;
  chapterOrder: number;
  chapterTitle: string;
  chapterContent: string;
  rosterText: string;
  existingResourceText: string;
}

const CHARACTER_RESOURCE_EXAMPLE = {
  updates: [
    {
      resourceName: "后门铜钥匙",
      resourceType: "credential",
      updateType: "acquired",
      holderCharacterName: "程秩",
      ownerType: "character",
      ownerName: "程秩",
      statusAfter: "available",
      readerKnows: true,
      holderKnows: true,
      knownByCharacterNames: ["程秩"],
      narrativeFunction: "key",
      summary: "程秩拿到能打开后门的铜钥匙。",
      narrativeImpact: "后续可以从后门潜入，但不能凭空进入正门禁区。",
      expectedFutureUse: "潜入库房或逃离追捕。",
      constraints: ["钥匙只能解释后门通行，不能替代其他权限。"],
      evidence: ["程秩把后门铜钥匙收进袖中。"],
      confidence: 0.86,
      riskLevel: "low",
      riskReason: "",
    },
  ],
  continuityRisks: [],
};

export const characterResourceExtractionPrompt: PromptAsset<
  CharacterResourceExtractionPromptInput,
  z.infer<typeof characterResourceExtractionOutputSchema>
> = {
  id: "novel.character_resource.extract_updates",
  version: "v1",
  taskType: "fact_extraction",
  mode: "structured",
  language: "zh",
  contextPolicy: {
    maxTokensBudget: 0,
  },
  repairPolicy: {
    maxAttempts: 1,
  },
  structuredOutputHint: {
    example: CHARACTER_RESOURCE_EXAMPLE,
    note: [
      "只输出章节中有明确证据的关键资源变化。",
      "不要把比喻、普通日用品或一次性环境物误判为长期资源。",
      "临时角色资源只有跨章复用、影响冲突、绑定伏笔或被主角带走时才进入 updates。",
      "confidence 必须是 0-1 数字；拿不准就省略。",
    ].join(" "),
  },
  outputSchema: characterResourceExtractionOutputSchema,
  render: (input) => [
    new SystemMessage([
      "你是长篇小说角色资源账本提取器。",
      "你的任务是从单章正文中提取会影响后续写作、审阅、修复或重规划的角色关键资源变化。",
      "",
      "只输出一个合法 JSON 对象，不要输出 Markdown、解释、注释或代码块。",
      "顶层固定格式为 {\"updates\":[],\"continuityRisks\":[]}。",
      "",
      "抽取范围：",
      "1. 主角和长期角色的关键物品、线索、凭证、底牌、能力代价、关系信物、可消耗资源。",
      "2. 反派或对手掌握的隐藏资源、陷阱、证据、控制权。",
      "3. 临时角色提供并会跨章影响后续的线索或资源。",
      "",
      "不要抽取：",
      "1. 普通吃穿用品、纯环境摆设、无后续影响的一次性小物。",
      "2. 比喻性表达，例如“他握住了命运的钥匙”。",
      "3. 输入中没有证据的新物品、新角色或新能力。",
      "",
      "判断规则：",
      "1. 所有 updates 必须有 evidence。",
      "2. holderCharacterName 必须优先使用已知角色名单中的名称；拿不准可以省略，但不要编造姓名。",
      "3. 关键资源被销毁、消耗、丢失、提前暴露，风险至少为 medium。",
      "4. 影响后续卷级规划、伏笔兑现或主角行动边界的变化，风险至少为 medium。",
      "5. 明显连续性问题放入 continuityRisks，例如未获得却使用、已消耗却复用、读者未知却被当作已铺垫。",
    ].join("\n")),
    new HumanMessage([
      `小说：${input.novelTitle}`,
      `章节：第${input.chapterOrder}章《${input.chapterTitle}》`,
      "",
      "已知角色：",
      input.rosterText,
      "",
      "已有角色资源账本摘要：",
      input.existingResourceText || "暂无已有关键资源。",
      "",
      "章节正文：",
      input.chapterContent,
    ].join("\n")),
  ],
  postValidate: (output) => {
    for (const update of output.updates) {
      if (update.evidence.length === 0) {
        throw new Error(`资源变化缺少证据：${update.resourceName}`);
      }
      if (
        update.expectedUseStartChapterOrder
        && update.expectedUseEndChapterOrder
        && update.expectedUseStartChapterOrder > update.expectedUseEndChapterOrder
      ) {
        throw new Error(`资源 ${update.resourceName} 的使用窗口非法。`);
      }
    }
    return output;
  },
};
