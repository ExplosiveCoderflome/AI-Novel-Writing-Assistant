import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";
import type { PromptAsset } from "../../core/promptTypes";
import { genreTreeDraftNodeSchema } from "./genre.promptSchemas";

export interface GenreTreePromptInput {
  prompt: string;
  retry: boolean;
  forceJson: boolean;
}

export const genreTreePrompt: PromptAsset<GenreTreePromptInput, z.infer<typeof genreTreeDraftNodeSchema>> = {
  id: "genre.tree.generate",
  version: "v1",
  taskType: "planner",
  mode: "structured",
  language: "zh",
  contextPolicy: {
    maxTokensBudget: 0,
  },
  outputSchema: genreTreeDraftNodeSchema,
  render: (input) => {
    const retryInstruction = input.retry
      ? "\n你上一次没有输出合法 JSON。这一次只能返回一个 JSON 对象本体，禁止附带解释、Markdown、注释、代码块或任何额外文本。"
      : "";
    const providerJsonInstruction = input.forceJson
      ? "\n当前模型支持稳定 JSON 输出，请直接返回 JSON 对象本体。"
      : "";

    return [
      new SystemMessage([
        "你是资深网络小说类型策划专家。",
        "你的任务是根据用户给出的创作方向，生成一棵适合小说策划与产品标签使用的“类型树”。",
        "这棵树的目标不是堆砌名词，而是建立清晰、可区分、可落地的题材层级结构，帮助后续进行定位、标签组织与内容规划。",
        "",
        "只返回一个 JSON 对象，不要输出 Markdown、解释、注释、代码块或额外文本。",
        "",
        "固定 JSON 结构如下：",
        "{",
        '  "name": "主类型名称",',
        '  "description": "主类型说明",',
        '  "children": [',
        "    {",
        '      "name": "子类型名称",',
        '      "description": "子类型说明",',
        '      "children": [',
        "        {",
        '          "name": "下级类型名称",',
        '          "description": "下级类型说明",',
        '          "children": []',
        "        }",
        "      ]",
        "    }",
        "  ]",
        "}",
        "",
        "结构规则：",
        "1. 最多三层，且只能是：主类型 -> 子类型 -> 下级类型。",
        "2. 每个节点都必须包含 name、description、children 三个键，不要缺键，不要改名，不要新增近义字段。",
        "3. 若某节点不再继续细分，children 必须返回空数组。",
        "4. 结果必须是一棵结构清晰的单树，不要输出多个并列主类型。",
        "",
        "命名规则：",
        "1. name 必须简洁、明确、稳定，适合直接作为产品中的类型标签使用。",
        "2. 不要使用过长名称、解释式名称、宣传语、口号式表达。",
        "3. 同层节点之间必须有明确区分度，避免同义改写或轻微措辞变化。",
        "4. 名称优先体现题材核心差异，而不是泛泛的情绪词或质量判断。",
        "",
        "描述规则：",
        "1. description 必须说明该类型的题材特征、常见爽点、叙事重心或读者期待。",
        "2. 描述应具体、凝练，不要写成空话，如“内容精彩”“情节丰富”“很有代入感”。",
        "3. 描述应服务于类型区分，帮助用户理解“为什么它属于这一类”。",
        "",
        "策划规则：",
        "1. 优先建立有区分度的层级，而不是机械罗列尽可能多的子类。",
        "2. 子类型数量要克制，宁可少而清楚，也不要堆成一片标签菜市场。",
        "3. 下级类型应是对子类型的进一步细分，而不是跳到别的分类维度。",
        "4. 整棵树的划分维度应尽量统一，不要一层按世界观分、下一层突然按情感线或主角身份乱切。",
        "5. 若用户描述较模糊，应做保守、低风险、行业常见的类型归纳，不要过度发散。",
        "6. 输出结果应自然、自洽、可直接用于后续产品化和创作规划。",
        retryInstruction,
        providerJsonInstruction,
      ].join("\n")),
      new HumanMessage([
        "请根据下面的创作方向生成类型树：",
        "",
        input.prompt.trim(),
      ].join("\n")),
    ];
  },
};
