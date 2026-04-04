import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";
import type { PromptAsset } from "../../core/promptTypes";
import { novelCreateResourceRecommendationSchema } from "./resourceRecommendation.promptSchemas";

export interface NovelCreateResourceRecommendationPromptInput {
  userIntentSummary: string;
  genreCatalogText: string;
  storyModeCatalogText: string;
  allowedGenreIds: string[];
  allowedStoryModeIds: string[];
}

export const novelCreateResourceRecommendationPrompt: PromptAsset<
  NovelCreateResourceRecommendationPromptInput,
  z.infer<typeof novelCreateResourceRecommendationSchema>
> = {
  id: "novel.create.resource_recommendation",
  version: "v1",
  taskType: "planner",
  mode: "structured",
  language: "zh",
  contextPolicy: {
    maxTokensBudget: 0,
  },
  semanticRetryPolicy: {
    maxAttempts: 1,
  },
  outputSchema: novelCreateResourceRecommendationSchema,
  render: (input) => [
    new SystemMessage([
      "你是小说开书资源推荐器，服务对象是写作经验不足、容易被术语和配置吓退的新手作者。",
      "你的任务是根据用户当前提供的开书信息，从给定的题材基底库和推进模式库中，推荐一套最适合作为默认起步底座的组合。",
      "",
      "只允许从给定列表中选择，不得杜撰新的题材 ID、推进模式 ID、名称或路径。",
      "",
      "推荐时必须优先考虑：",
      "1. 是否能帮助新手低认知负担地开始第一本书",
      "2. 是否有利于稳定写完整本中长篇，而不只是前几章看起来热闹",
      "3. 是否能兑现题材承诺、目标读者预期和前30章承诺",
      "4. 是否与已有卖点、阅读感、节奏、情绪强度和视角倾向相匹配",
      "",
      "推荐原则：",
      "1. 题材基底回答“这是什么书”，要优先选能稳住故事外观和市场预期的项。",
      "2. 主推进模式回答“这本书靠什么持续推进和兑现”，必须选择一个最核心、最稳定的驱动。",
      "3. 副推进模式只有在确实能补充风味且不干扰主驱动时才给；否则宁可不推荐。",
      "4. 如果信息还比较少，优先选择更稳、更宽、更不容易写崩的组合，而不是看起来华丽但难以驾驭的细分组合。",
      "5. 如果用户当前已经手动选了某个方向，除非明显冲突，否则应尽量围绕它收敛，而不是强行推翻。",
      "6. 如果能够判断到具体子类，就优先推荐具体子类；如果信息不足，再退回更宽的父类。",
      "",
      "输出必须是一个 JSON 对象，不要输出 Markdown、解释、注释或额外文本。",
      "固定格式为：",
      "{\"summary\":\"...\",\"genreId\":\"...\",\"genreReason\":\"...\",\"primaryStoryModeId\":\"...\",\"primaryStoryModeReason\":\"...\",\"secondaryStoryModeId\":\"...\",\"secondaryStoryModeReason\":\"...\",\"caution\":\"...\"}",
      "",
      "字段要求：",
      "1. summary：用简洁中文说明这套组合为什么适合作为当前开书默认底座。",
      "2. genreReason：说明为什么这个题材基底适合当前故事方向与读者预期。",
      "3. primaryStoryModeReason：说明为什么这个主推进模式能稳定兑现核心阅读期待。",
      "4. secondaryStoryModeId / secondaryStoryModeReason：只有在确实有必要时才填写；否则返回空字符串或 null。",
      "5. caution：提示这套组合最容易翻车的点；没有明显风险时可为空字符串。",
      "",
      "硬性约束：",
      "1. genreId 必须来自给定题材基底列表。",
      "2. primaryStoryModeId 必须来自给定推进模式列表。",
      "3. secondaryStoryModeId 如果有值，必须来自给定推进模式列表，且不能与 primaryStoryModeId 相同。",
      "4. 不得返回空 summary、空 genreReason 或空 primaryStoryModeReason。",
    ].join("\n")),
    new HumanMessage([
      "当前开书信息：",
      input.userIntentSummary,
      "",
      "可选题材基底列表：",
      input.genreCatalogText,
      "",
      "可选推进模式列表：",
      input.storyModeCatalogText,
    ].join("\n")),
  ],
  postValidate: (output, input) => {
    const allowedGenreIds = new Set(input.allowedGenreIds);
    const allowedStoryModeIds = new Set(input.allowedStoryModeIds);

    if (!allowedGenreIds.has(output.genreId)) {
      throw new Error(`题材推荐结果包含非法 ID：${output.genreId}`);
    }

    if (!allowedStoryModeIds.has(output.primaryStoryModeId)) {
      throw new Error(`主推进模式推荐结果包含非法 ID：${output.primaryStoryModeId}`);
    }

    const secondaryId = output.secondaryStoryModeId?.trim() ?? "";
    if (secondaryId) {
      if (!allowedStoryModeIds.has(secondaryId)) {
        throw new Error(`副推进模式推荐结果包含非法 ID：${secondaryId}`);
      }
      if (secondaryId === output.primaryStoryModeId) {
        throw new Error("副推进模式不能与主推进模式相同。");
      }
      if (!(output.secondaryStoryModeReason?.trim())) {
        throw new Error("存在副推进模式时，必须返回对应的推荐理由。");
      }
    }

    return output;
  },
};
