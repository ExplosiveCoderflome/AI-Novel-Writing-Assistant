import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";
import type { NarrativeForm } from "@ai-novel/shared/types/creationStudio";
import type { WritingPlatformRecommendation } from "@ai-novel/shared/types/writingPlatform";
import type { PromptAsset } from "../../core/promptTypes";
import { supportsWritingPlatformForm } from "../../../modules/novel/writing-platform";

export interface WritingPlatformRecommendationInput {
  narrativeForm: NarrativeForm;
  title?: string;
  description?: string;
  targetAudience?: string;
  bookSellingPoint?: string;
  styleTone?: string;
  originalIdea?: string;
}

const schema = z.object({
  platform: z.enum(["fanqie_free", "qidian_male", "jinjiang_female", "zhihu_story"]),
  confidence: z.number().min(0).max(1),
  reason: z.string().min(10).max(800),
}).strict();

export const writingPlatformRecommendationPrompt: PromptAsset<WritingPlatformRecommendationInput, WritingPlatformRecommendation, z.output<typeof schema>> = {
  id: "novel.writing_platform.recommend",
  version: "v1",
  taskType: "planner",
  mode: "structured",
  language: "zh",
  contextPolicy: { maxTokensBudget: 0 },
  outputSchema: schema,
  repairPolicy: { maxAttempts: 1 },
  semanticRetryPolicy: { maxAttempts: 1 },
  management: { productPrompt: true, editModes: ["readonly"] },
  render: (input) => [
    new SystemMessage([
      "你负责为中文网络小说选择目标平台写法。必须基于作品体验、受众、冲突引擎、篇幅和叙事重点做结构化判断，不得用关键词或题材正则机械路由。",
      "可选平台：番茄免费网文（长篇/短篇）、起点男频（长篇）、晋江女频（长篇）、知乎短故事（短篇）。",
      "推荐必须适配作品形态，并给出新手能理解的具体理由。只输出严格 JSON。",
    ].join("\n")),
    new HumanMessage(JSON.stringify(input, null, 2)),
  ],
  postValidate: (output, input) => {
    if (!supportsWritingPlatformForm(output.platform, input.narrativeForm)) throw new Error("推荐平台不支持当前作品形态。");
    return output;
  },
};

