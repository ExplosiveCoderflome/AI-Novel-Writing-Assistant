import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";
import type {
  CreationIntentInterpretation,
  NarrativeForm,
} from "@ai-novel/shared/types/creationStudio";
import type { PromptAsset } from "../../core/promptTypes";
import type { WritingPlatformPreference } from "@ai-novel/shared/types/writingPlatform";
import { supportsWritingPlatformForm } from "../../../modules/novel/writing-platform";

export interface CreationIntentPromptInput {
  idea: string;
  preferredNarrativeForm?: NarrativeForm;
  targetWordCount?: number;
  feedback?: string;
  writingPlatformPreference?: WritingPlatformPreference;
}

const directionSchema = z.object({
  id: z.string().min(1).max(80),
  title: z.string().min(1).max(100),
  premise: z.string().min(10).max(1000),
  coreExperience: z.string().min(4).max(500),
  protagonist: z.string().min(4).max(500),
  centralConflict: z.string().min(4).max(500),
  endingPromise: z.string().min(4).max(500),
  styleKeywords: z.array(z.string().min(1).max(30)).min(2).max(8),
}).strict();

const creationIntentSchema = z.object({
  understanding: z.string().min(10).max(1000),
  recommendedNarrativeForm: z.enum(["short_story", "long_novel"]),
  recommendedTargetWordCount: z.number().int().min(3000).max(3_000_000),
  confidence: z.number().min(0).max(1),
  recommendationReason: z.string().min(10).max(800),
  recommendedWritingPlatform: z.enum(["fanqie_free", "qidian_male", "jinjiang_female", "zhihu_story"]),
  writingPlatformConfidence: z.number().min(0).max(1),
  writingPlatformReason: z.string().min(10).max(800),
  directions: z.tuple([directionSchema, directionSchema]),
}).strict();

function validateInterpretation(output: z.output<typeof creationIntentSchema>): CreationIntentInterpretation {
  const [first, second] = output.directions;
  if (first.id === second.id || first.title === second.title || first.premise === second.premise) {
    throw new Error("两个创作方向必须具有不同标识、标题和故事前提。");
  }
  if (
    output.recommendedNarrativeForm === "short_story"
    && (output.recommendedTargetWordCount < 3000 || output.recommendedTargetWordCount > 30000)
  ) {
    throw new Error("短篇推荐字数必须在 3000 到 30000 字之间。");
  }
  if (output.recommendedNarrativeForm === "long_novel" && output.recommendedTargetWordCount <= 30000) {
    throw new Error("长篇推荐字数必须高于 30000 字。");
  }
  if (!supportsWritingPlatformForm(output.recommendedWritingPlatform, output.recommendedNarrativeForm)) {
    throw new Error("推荐平台必须支持推荐的作品规模。");
  }
  return output;
}

export const creationIntentInterpretPrompt: PromptAsset<
  CreationIntentPromptInput,
  z.output<typeof creationIntentSchema>,
  CreationIntentInterpretation
> = {
  id: "creation.intent.interpret",
  version: "v3",
  taskType: "planner",
  mode: "structured",
  language: "zh",
  contextPolicy: { maxTokensBudget: 0 },
  outputSchema: creationIntentSchema,
  repairPolicy: { maxAttempts: 1 },
  semanticRetryPolicy: { maxAttempts: 1 },
  render: (input) => [
    new SystemMessage([
      "你是面向零写作经验用户的创作意图导演。",
      "你的任务是理解用户真正想写的体验，并推荐适合一次完成的短篇或适合长期发展的长篇。",
      "不得用关键词、题材名称或固定规则机械判断体量；要根据冲突容量、人物变化跨度、世界展开需要和结尾兑现成本综合判断。",
      "短篇范围是 3000～30000 字；长篇必须高于 30000 字。",
      "同时从番茄免费网文、起点男频、晋江女频、知乎短故事中推荐目标平台，并说明依据。番茄支持长短篇，起点和晋江只支持长篇，知乎短故事只支持短篇。",
      "短篇需要完整而有叙事作用的小说，不是剧本梗概或故事摘要。文学取向可以由人物认识、关系、主题或处境组织，不因包含内省、氛围或议论就排除为非小说；文学取向与故事年代无关。",
      "必须守住用户原始想法的核心体验、核心资源或核心困境。可以补足冲突和结局，但不得为了显得宏大而把“囤粮、交换、复仇、恋爱”等用户明确主题偷换成未铺垫的核战阴谋、救世任务或另一套故事。",
      "短篇方向应有可进入正文的具体处境、可信人物和可收束的叙事弧线；阅读吸引力与结尾方式服从用户体验，人物/关系/主题驱动同样成立，不统一要求升级与爽点。",
      "回报可以是破局、反击、真相揭晓、身份变化、关系兑现或强烈情绪释放，不要把所有题材机械写成打脸爽文。",
      "输出两个差异明确、都能落地的创作方向。差异要体现在核心体验、冲突推进或结尾回报，而不只是换标题和人名。",
      "服务对象是新手，表达必须清楚、具体、少术语。",
      "只输出严格 JSON，不要输出 Markdown、解释、注释或额外字段。",
    ].join("\n")),
    new HumanMessage([
      `用户想法：${input.idea.trim()}`,
      `用户偏好的作品规模：${input.preferredNarrativeForm ?? "未指定，由你推荐"}`,
      `用户调整的目标字数：${input.targetWordCount ?? "未指定，由你推荐"}`,
      `补充反馈：${input.feedback?.trim() || "无"}`,
      `用户的平台选择：${input.writingPlatformPreference ?? "ai_recommend"}`,
      "",
      "请返回：简明理解、推荐规模、目标字数、0～1 置信度、推荐理由、推荐平台、平台置信度、平台理由，以及两个完整方向。",
      "每个方向必须包含 id、title、premise、coreExperience、protagonist、centralConflict、endingPromise、styleKeywords。",
      "styleKeywords 要把阅读体验转成可执行的视角、节奏、意象和对白要求，结合题材气质；既不只堆抽象标签，也不强制网文节奏。平台推荐是发布参考，不能覆盖明确的文学取向。",
      "若用户明确调整了规模或字数，两个方向必须重新适配该选择，但 recommendationReason 仍应诚实说明取舍。",
      "若用户明确选择平台，recommendedWritingPlatform 必须采用该平台，并让两个方向匹配该平台；若该平台不支持作品规模，应在方向中按用户指定的作品规模重新给出相容推荐，不得静默硬套。",
    ].join("\n")),
  ],
  postValidate: validateInterpretation,
};
