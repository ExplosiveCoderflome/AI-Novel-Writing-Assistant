import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";
import type { PromptAsset } from "../../../core/promptTypes";
import type { PromptSlotDefReplace } from "../../../slots/slotTypes";
import type { TitleGenerationPromptInput } from "../../helper/titleGeneration.prompt";
import { titleSuggestionStyleSchema } from "../../helper/titleGeneration.promptSchemas";

const openingTitles = z.object({
  namingMoment: z.string().trim().min(1),
  titles: z.array(z.object({
    reason: z.string().trim().min(4).max(72),
    title: z.string().trim().min(2).max(26),
    style: titleSuggestionStyleSchema,
    clickRate: z.number().int().min(35).max(99),
    angle: z.string().trim().min(2).max(20),
  })),
  coverReason: z.string().trim().min(1),
  coverTitle: z.string().trim().min(2).max(26),
});

type TitleReview = z.infer<typeof openingTitles>;

const namingRules: PromptSlotDefReplace[] = [
  {
    key: "titles.namingApproach", label: "取名方法", kind: "replace", maxLength: 3000,
    description: "告诉 AI 从哪些人物、动作或场面里找书名。",
    default: [
      "设想目标读者在推荐书单里头一回刷到这本连载。根据作者的偏好、题材、发布平台和本案走向，找出一个足以让他点开第一章、又能持续追下去的看点。可以是主角的特别本事、棘手买卖、一对人物的关系，或一个越想越蹊跷的谜面。",
      "同一组尝试不同叫法。可以用圈内人熟悉的短语、人物脱口而出的话，也可以用一句直白的话亮出身份和反常处境。用故事里的人会说的词，把策划稿里的抽象概括还原成读者能想象的事。长短随题材和作者语气决定。",
    ].join("\n"),
  },
  {
    key: "titles.styleExamples", label: "书名风格示例", kind: "replace", maxLength: 3000,
    description: "写下你喜欢的书名和理由，让 AI 掌握你想要的语感。",
    default: "例如，县衙刚给死者办完丧事，死者亲自上堂告状，《死者来报案》五个字就有了谜面。若写小裁缝专给妖怪改衣，第一单是给蛇妖做裤子，《我给妖怪开裁缝铺》一眼能看懂是哪门生意，也让人想看下一位客人。示例说明书名怎样带出各自的故事，另起书名时从本案取材。",
  },
  {
    key: "titles.coverCriteria", label: "首选书名标准", kind: "replace", maxLength: 3000,
    description: "告诉 AI 几个名字中优先选哪一种，以及哪些写法容易落选。",
    default: [
      "只看书名，遮住简介、标签和取名理由，替目标读者说出他以为自己会追到什么。题材用语、人物关系、反差、悬念都能传递这个期待；未必需要把题材名写在封面。首选取那个读者一眼能懂、有兴趣点开、读了几章仍觉得贴切的名字。",
      "把首选放到同轮另一案或另一个题材试读。若同样贴切，或只剩一句必须读完简介才听得懂的对白，回到本案最有意思的选择再拟。保留有辨识度的短名，也允许把本案最吸引人的设定直接写进书名。",
    ].join("\n"),
  },
];

export const openingCandidateTitlesPrompt: PromptAsset<TitleGenerationPromptInput, Pick<TitleReview, "titles">, TitleReview> = {
  id: "novel.director.candidate_titles", version: "v1", taskType: "planner", mode: "structured", language: "zh",
  management: { productPrompt: true, editModes: ["slots"], slotScope: "global" },
  slots: namingRules,
  contextPolicy: { maxTokensBudget: 0 },
  outputSchema: openingTitles,
  postValidate: ({ titles, coverTitle }) => {
    const selectedIndex = titles.findIndex((item) => item.title === coverTitle);
    if (selectedIndex < 0) {
      throw new Error("coverTitle 必须从本次给出的 titles 中原样选取。");
    }
    return { titles: [titles[selectedIndex], ...titles.filter((_, index) => index !== selectedIndex)] };
  },
  render: ({ context, retryReason }, { slots }) => [
    new SystemMessage([
      "你是中文网文编辑，为即将上架连载的小说拟书名。先在 namingMoment 写明本案已有的故事依据，以及目标读者会想追看的事。同轮另一案只用于核对方向归属。",
      ...namingRules.map((rule) => slots?.text(rule.key) ?? rule.default),
      "优先遵循作者明确指定的词、读者和语气。书名和取名理由都只用原稿已有的设定。不要为解释一个标题编造原稿没有的对白、道具、战绩或结局。",
      "避开其他方案已占用的书名。作者重做标题时，以这次的修正意见为准，给出与当前标题组有实质区别的新名字。",
      "先写完 titles，再做封面选择。coverReason 指出首选里的哪个词让读者产生什么具体期待，与本组另一个名字比较，再用本案情节核对这个期待能否兑现。最后把首选原样写入 coverTitle。clickRate 仅作主观估分。",
    ].join("\n")),
    new HumanMessage([
      context.genreName && `题材：${context.genreName}`,
      context.brief,
      `返回 JSON 对象，依次给出 namingMoment、titles、coverReason、coverTitle。titles 收录 ${context.count} 个书名，每项先用 4–72 字在 reason 写清原稿细节，再据此写 2–26 字的 title。style 从 ${titleSuggestionStyleSchema.options.join("、")} 中选一项英文原值，angle 用 2–20 字点明角度，clickRate 为 35–99 的整数。`,
      retryReason && `请修正上一组的问题：${retryReason}`,
    ].filter(Boolean).join("\n\n")),
  ],
};
