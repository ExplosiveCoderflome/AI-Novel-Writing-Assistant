import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { z } from "zod";
import type { PromptAsset } from "../../core/promptTypes";
import {
  characterVisibleProfileOutputSchema,
} from "./characterVisibleProfile.promptSchemas";

export interface CharacterVisibleProfilePromptInput {
  novelTitle: string;
  genreName: string;
  projectMode: string;
  storyModeBlock: string;
  bookContractText: string;
  bibleText: string;
  storyMacroText: string;
  characterName: string;
  characterRole: string;
  characterFunction: string;
  relationToProtagonist: string;
  existingCharacterProfile: string;
  existingVisibleProfile: string;
  relationText: string;
  userGuidance: string;
}

export const characterVisibleProfileCompletionPrompt: PromptAsset<
  CharacterVisibleProfilePromptInput,
  z.infer<typeof characterVisibleProfileOutputSchema>
> = {
  id: "novel.character.visible_profile.complete",
  version: "v1",
  taskType: "planner",
  mode: "structured",
  language: "zh",
  contextPolicy: {
    maxTokensBudget: 0,
  },
  outputSchema: characterVisibleProfileOutputSchema,
  render: (input) => [
    new SystemMessage([
      "你是顶尖长篇小说作家兼角色造型编辑。",
      "你的任务是为小说内角色补齐稳定外显资料，让后续正文能更容易写出“读者一眼认得出”的人物。",
      "",
      "只输出一个合法 JSON 对象，不要输出 Markdown、解释、注释、代码块或额外文本。",
      "",
      "输出结构固定为：",
      "{",
      '  "appearance": "样貌记忆点",',
      '  "physique": "体态、年龄感、身体状态基底",',
      '  "attireStyle": "常见穿着或身份相关外观",',
      '  "signatureDetail": "读者能记住的标志物、动作或细节",',
      '  "voiceTexture": "声音质感、说话节奏、口吻特征",',
      '  "presenceImpression": "首次或常规登场给读者的直观感受",',
      '  "confidence": 0.86,',
      '  "warnings": []',
      "}",
      "",
      "硬规则：",
      "1. 所有内容必须使用简体中文。",
      "2. 只补稳定外显资料，不写临时伤势、临时换装、当章情绪、短暂疲惫或一次性状态。",
      "3. 每个字段必须能直接帮助正文描写或角色辨识，禁止“很好看”“气质清冷”“很有辨识度”“身材匀称”等空话。",
      "4. 不得覆盖输入中已有的明确设定；如果已有内容清楚，应在同一方向上补得更可写，不要推翻。",
      "5. 外显资料必须服务题材、角色功能位、关系张力和书级承诺，不能只做静态人设图鉴。",
      "6. 不要把性格分析、剧情总结、成长弧分析写进外显字段。",
      "7. 如果作者给了补全倾向，优先吸收为外显方向；但不能违背已给定的题材、身份、世界规则和明确角色资料。",
      "",
      "质量要求：",
      "1. appearance 要包含可视化记忆点，例如眉眼、肤色、发型、表情习惯中的具体组合。",
      "2. physique 要包含体态、年龄感、行动姿态或身体基底，但不要写成数值档案。",
      "3. attireStyle 要体现身份、阶层、职业、世界观或生活状态中的稳定穿着倾向。",
      "4. signatureDetail 要能在正文中反复轻量出现，可以是物件、手势、微动作、气味、伤疤、整理习惯等稳定细节。",
      "5. voiceTexture 要让角色对白更容易区分，包含声线、句式节奏或口头习惯。",
      "6. presenceImpression 要描述读者第一次或常规看到此人时的直观压迫、亲近、危险、滑稽、疏离等感受。",
      "",
      "warnings 用于记录信息不足、与已有资料可能冲突、只能保守推断的点；没有则输出空数组。",
      "输出必须严格符合 characterVisibleProfileOutputSchema。",
    ].join("\n")),
    new HumanMessage([
      `小说：${input.novelTitle}`,
      `题材/流派：${input.genreName}`,
      `项目模式：${input.projectMode}`,
      "",
      "故事模式：",
      input.storyModeBlock || "暂无",
      "",
      "书级承诺：",
      input.bookContractText || "暂无",
      "",
      "作品圣经：",
      input.bibleText || "暂无",
      "",
      "发展走向/宏观约束：",
      input.storyMacroText || "暂无",
      "",
      `角色：${input.characterName}（${input.characterRole}）`,
      `角色功能：${input.characterFunction || "暂无"}`,
      `与主角关系：${input.relationToProtagonist || "暂无"}`,
      "",
      "当前角色资料：",
      input.existingCharacterProfile || "暂无",
      "",
      "已有外显资料：",
      input.existingVisibleProfile || "暂无",
      "",
      "角色关系：",
      input.relationText || "暂无",
      "",
      "作者补全倾向：",
      input.userGuidance || "暂无",
    ].join("\n")),
  ],
};
