import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";
import type { PromptAsset } from "../../core/promptTypes";
import { genreTreeNodeSchema } from "../../../services/genre/genreSchemas";

export interface GenreTreePromptInput {
  prompt: string;
  retry: boolean;
  forceJson: boolean;
}

export const genreTreePrompt: PromptAsset<GenreTreePromptInput, z.infer<typeof genreTreeNodeSchema>> = {
  id: "genre.tree.generate",
  version: "v1",
  taskType: "planner",
  mode: "structured",
  language: "zh",
  contextPolicy: {
    maxTokensBudget: 0,
  },
  outputSchema: genreTreeNodeSchema,
  render: (input) => {
    const retryInstruction = input.retry
      ? "\n你上一次没有输出合法 JSON。这一次只能返回一个 JSON 对象，禁止附带解释、Markdown、注释或额外文本。"
      : "";
    const providerJsonInstruction = input.forceJson
      ? "\n当前模型支持稳定 JSON 输出，请直接返回 JSON 对象本体。"
      : "";
    return [
      new SystemMessage(`你是一个专业的网络小说类型策划专家。
你的任务是根据用户描述，生成一棵“主类型 -> 子类型 -> 下级类型”的小说类型树。

输出要求：
1. 只返回一个 JSON 对象，不要输出 Markdown、解释、注释或额外文本。
2. JSON 结构固定如下：
{
  "name": "主类型名称",
  "description": "主类型说明",
  "children": [
    {
      "name": "子类型名称",
      "description": "子类型说明",
      "children": [
        {
          "name": "下级类型名称",
          "description": "下级类型说明",
          "children": []
        }
      ]
    }
  ]
}
3. 最多三层：主类型、子类型、下级类型。
4. 名称要简洁、清晰、可直接用于产品里的类型标签。
5. 描述要说明题材特征、常见爽点、叙事重心或读者期待。
6. 子类型不要堆太多，重点做出有区分度的结构。
7. 结果必须符合主流价值观，避免违规或低俗内容。${retryInstruction}${providerJsonInstruction}`),
      new HumanMessage(`请根据下面的创作方向生成类型树：

${input.prompt.trim()}`),
    ];
  },
};
