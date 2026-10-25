/*
 * @LastEditors: biz
 */
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";
import { normalizeCommercialTags, type BookFramingSuggestion } from "@ai-novel/shared/types/novelFraming";
import type { PromptAsset } from "../../core/promptTypes";
import {
  keepsWebSerialPromptDefaults,
  renderCreativeGuidanceSection,
  type CreativePromptGuidance,
} from "../creativeProfile/creativePromptGuidance";

export interface NovelFramingSuggestionPromptInput {
  inputSummary: string;
  analysisContext?: string;
  referenceIntent?: "continuation" | "adaptation";
  creativeGuidance?: CreativePromptGuidance | null;
}

/** 非网文取向下的字段解释；字段与 schema 不变，只是不再要求爽点与连载式兑现。 */
const ORIENTATION_FIELD_RULES = [
  "1. targetAudience：写清这本书主要是给谁看的，体现读者的阅读动机，例如想理解某种处境、关系或时代，不要只写“所有人都能看”。",
  "2. commercialTags：给 3-6 个短标签，每个标签不超过 20 个字符，优先写题材、主题、人物关系、叙述特点，不要写空泛大词。",
  "3. competingFeel：写成读者实际会感受到的阅读感，例如节奏、情绪基调、关系张力或叙述距离；不要直接模仿或点名具体作品。",
  "4. bookSellingPoint：说清这本书最不可替代的东西，可以是人物、关系、题材视角或叙述方式。",
  "5. first30ChapterPromise：写清前30章要让读者确实得到的东西，例如人物处境被看清、核心关系建立、主题问题被提出、类型疑问落地；不要写成抽象口号。",
] as const;

export const novelFramingSuggestionSchema = z.object({
  targetAudience: z.string().trim().min(1),
  commercialTags: z.array(z.string().trim().min(1).max(20)).min(3).max(6),
  competingFeel: z.string().trim().min(1),
  bookSellingPoint: z.string().trim().min(1),
  first30ChapterPromise: z.string().trim().min(1),
});

function normalizeSuggestion(
  suggestion: z.infer<typeof novelFramingSuggestionSchema>,
): BookFramingSuggestion {
  const commercialTags = normalizeCommercialTags(suggestion.commercialTags);
  if (commercialTags.length < 3) {
    throw new Error("书级 framing 建议中的商业标签数量不足。");
  }
  return {
    targetAudience: suggestion.targetAudience.trim(),
    commercialTags,
    competingFeel: suggestion.competingFeel.trim(),
    bookSellingPoint: suggestion.bookSellingPoint.trim(),
    first30ChapterPromise: suggestion.first30ChapterPromise.trim(),
  };
}

export const novelFramingSuggestionPrompt: PromptAsset<
  NovelFramingSuggestionPromptInput,
  BookFramingSuggestion,
  z.infer<typeof novelFramingSuggestionSchema>
> = {
  id: "novel.framing.suggest",
  version: "v2",
  taskType: "planner",
  mode: "structured",
  language: "zh",
  contextPolicy: {
    maxTokensBudget: 0,
  },
  semanticRetryPolicy: {
    maxAttempts: 1,
  },
  outputSchema: novelFramingSuggestionSchema,
  render: (input) => {
    const hasAnalysis = Boolean(input.analysisContext?.trim());
    const isContinuation = input.referenceIntent === "continuation";
    const isAdaptation = input.referenceIntent === "adaptation";
    const webDefaults = keepsWebSerialPromptDefaults(input.creativeGuidance);
    return [
      new SystemMessage([
        webDefaults
          ? "你是小说项目立项助手，服务对象是不懂策划、不会拆卖点、也不熟悉网文结构的小白作者。"
          : "你是小说项目立项助手，服务对象是不懂策划的新手作者。本书的创作取向由用户明确选择，立项建议必须服从它。",
        "你的任务是根据用户已填写的书名、故事概述和少量上下文，补全这本书的“书级 framing”，让用户可以直接回填表单继续往下走。",
        ...renderCreativeGuidanceSection(input.creativeGuidance),
        "",
        "只输出一个合法 JSON 对象，不要输出 Markdown、解释、注释、代码块或额外文本。",
        "固定输出字段必须且只能是：",
        "{\"targetAudience\":\"...\",\"commercialTags\":[\"...\"],\"competingFeel\":\"...\",\"bookSellingPoint\":\"...\",\"first30ChapterPromise\":\"...\"}",
        "",
        "全局硬规则：",
        "1. 所有内容必须使用简体中文。",
        "2. 输出必须直白、具体、易懂，像给普通作者直接看的表单建议，不要写专家术语，不要写空话。",
        "3. 只能基于用户已给信息进行归纳与谨慎补全，不得捏造具体世界规则、复杂角色名单、正文桥段或未提供的细节。",
        "4. 如果信息不足，可以做低风险、行业常见的合理推断，但必须保持保守，不能发散成另一套书。",
        "5. 各字段之间必须互相一致，不能 targetAudience 写一类读者，sellingPoint 又像另一类书。",
        hasAnalysis
          ? [
            "6. 若提供了拆书结论，必须以拆书结论为主要依据生成卖点与读者定位，不能只根据书名、标题关键词或“参考某某作品”这类元描述空猜。",
            isAdaptation
              ? "7. 当前是参考创作新书：只继承钩子、冲突循环、爽点节奏、结构与阅读体验；禁止把原作专名、角色、世界事实或具体剧情写进新书卖点。"
              : isContinuation
                ? "7. 当前是续写原作：卖点与前30章承诺必须承接终局人物状态、未完线索和原作读者期待，不能写成另一套无关题材。"
                : "",
          ].filter(Boolean).join("\n")
          : "",
        "",
        "字段要求：",
        ...(webDefaults ? [
          "1. targetAudience：必须写清这本书主要是给谁看的，尽量体现读者偏好、阅读动机或爽点需求，不要只写“所有人都能看”。",
          "2. commercialTags：给 3-6 个短标签，每个标签不超过 20 个字符。标签要能直接用于定位和展示，优先写题材、卖点、冲突类型、阅读体验，不要写空泛大词。",
          "3. competingFeel：必须写成“读者实际会感受到的阅读感”，例如节奏、情绪、关系牵引、压迫感、爽感来源；不要直接模仿或点名具体作品。",
          "4. bookSellingPoint：必须说清这本书最抓人的核心点是什么，优先回答“读者为什么愿意点开并继续看”。",
          "5. first30ChapterPromise：必须明确前30章一定要兑现给读者的内容，例如关系建立、主线启动、反击兑现、设定亮相、核心悬念落地等；不要写成抽象口号。",
        ] : ORIENTATION_FIELD_RULES),
        "",
        "质量要求：",
        "1. 不要写“人物鲜明”“剧情精彩”“节奏紧凑”这类空泛结论。",
        "2. 不要把几个字段写成同义重复，尤其是 commercialTags、competingFeel、bookSellingPoint、first30ChapterPromise 必须各自承担不同作用。",
        "3. 输出结果必须像一套可直接落表的立项建议，而不是分析报告。",
        "",
        "缺口处理规则：",
        hasAnalysis
          ? "1. 已有拆书结论时，优先从拆书里的定位、结构、节奏、卖点字段归纳；概述里的“参考某某作品”只是创作意图，不是题材本身。"
          : "1. 如果输入较少，优先围绕已知书名、故事概述和明显题材信号做保守归纳。",
        "2. 宁可写得稳一点，也不要为了显得完整而编造具体设定。",
        "3. 不允许留空，不允许 null。",
      ].filter(Boolean).join("\n")),
      new HumanMessage([
        "请根据下面这本小说的已知信息，生成可直接回填的书级 framing。",
        "",
        input.inputSummary,
        hasAnalysis
          ? [
            "",
            isContinuation ? "续写依据的拆书结论：" : isAdaptation ? "结构参考拆书结论：" : "拆书结论：",
            input.analysisContext,
          ].join("\n")
          : "",
      ].filter(Boolean).join("\n")),
    ];
  },
  postValidate: (output) => normalizeSuggestion(output),
};
