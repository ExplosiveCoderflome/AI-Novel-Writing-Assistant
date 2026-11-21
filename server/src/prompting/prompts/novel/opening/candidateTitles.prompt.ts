import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";
import type { PromptAsset } from "../../../core/promptTypes";
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

export const openingCandidateTitlesPrompt: PromptAsset<TitleGenerationPromptInput, Pick<TitleReview, "titles">, TitleReview> = {
  id: "novel.director.candidate_titles", version: "v1", taskType: "planner", mode: "structured", language: "zh",
  management: { productPrompt: true, editModes: ["readonly"] },
  contextPolicy: { maxTokensBudget: 0 },
  outputSchema: openingTitles,
  postValidate: ({ titles, coverTitle }) => {
    const selectedIndex = titles.findIndex((item) => item.title === coverTitle);
    if (selectedIndex < 0) {
      throw new Error("coverTitle 必须从本次给出的 titles 中原样选取。");
    }
    return { titles: [titles[selectedIndex], ...titles.filter((_, index) => index !== selectedIndex)] };
  },
  render: ({ context, retryReason }) => [
    new SystemMessage([
      "你为中文小说定封面书名。动笔前，在 namingMoment 写下一个属于本案的瞬间：谁对谁做了什么，这件小事在当时意味着什么。如果在另一案里也完全说得通，再往两案分开的地方找。另一案只作比较，不得借用它的情节。",
      "从故事内部找叫法：人物会怎样称呼或挤兑对方，一件小事落到他头上怎么变了味，一句寻常话放进他的处境怎么有了第二层意思。题材和时代会影响用词；不要求仿古或故作文艺。两三个字也可以。",
      "例如，同写一家三代经营的钟表铺：若孙女悄悄把祖父的钟每日拨慢一分钟，《慢一分钟》里有她舍不得祖父老去的心思；若兄妹只肯在钟停时交谈，《停了再说》里才有这两个人的关系。读者能听懂这几个字，读过故事又会想起那一幕。只学名字与细节的关系，不借用例子里的词和句式。",
      "先拟几种名字，再决定哪一个放在封面。设想读者只能看见书名、看不见简介和你的解释：这几个字本身能让人听出一句人话、看见一个场面，或冒出一个具体的问题吗？读完梗概再看，意味能更深一层吗？两点都做得到的优先。",
      "定稿前做换书检验：把首选放到另一案的封面，若一样成立，就回到本案的关键抉择再取名。淘汰由人物、地点或物证简单并列得到的名字，以及泛用的惊险成语、加冒号解释身份的标题、照抄题设或卖点的一句话。这些也不充作备选。",
      "兼顾作者明确指定的词、读者和语气。书名可以留白，但不能让读者误判类型。不要为凑书名虚构原稿没有的物件、亲属、生死或结局。",
      "避开其他方案已占用的书名。作者重做标题时，以这次的修正意见为准，给出与当前标题组有实质区别的新名字。",
      "先写完 titles，再做封面选择。把书名和起始想法并排读：若只是把谁做什么重复一遍，或套一句现成诗词，即使最直白也重新拟一个。coverReason 说出首选比本组另一个具体名字好在哪里，指出它独有的意味。最后把首选原样写入 coverTitle。clickRate 仅作主观估分。",
    ].join("\n")),
    new HumanMessage([
      context.genreName && `题材：${context.genreName}`,
      context.brief,
      `返回 JSON 对象，依次给出 namingMoment、titles、coverReason、coverTitle。titles 收录 ${context.count} 个书名，每项先用 4–72 字在 reason 写清原稿细节，再据此写 2–26 字的 title。style 从 ${titleSuggestionStyleSchema.options.join("、")} 中选一项英文原值，angle 用 2–20 字点明角度，clickRate 为 35–99 的整数。`,
      retryReason && `请修正上一组的问题：${retryReason}`,
    ].filter(Boolean).join("\n\n")),
  ],
};
