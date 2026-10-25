import type { BaseMessage } from "@langchain/core/messages";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { PromptAsset } from "../../core/promptTypes";
import type { TitlePromptContext } from "../../../services/title/titleGeneration.shared";
import {
  maximumFrameClusterSize,
  minimumStructuralVariety,
  minimumStyleVariety,
} from "../../../services/title/titleGeneration.shared";
import { titleGenerationRawOutputSchema } from "./titleGeneration.promptSchemas";
import {
  keepsWebSerialPromptDefaults,
  renderCreativeGuidanceSection,
  type CreativePromptGuidance,
} from "../creativeProfile/creativePromptGuidance";

export interface TitleGenerationPromptInput {
  context: TitlePromptContext;
  forceJson: boolean;
  retryReason: string | null;
  /** 书的创作取向；未设置时提示词与 v2 逐字一致。 */
  creativeGuidance?: CreativePromptGuidance | null;
}

/** 非网文取向：按作品取向选标题标准；clickRate 只为兼容旧格式，表示贴合度估计。 */
const ORIENTATION_TITLE_RULES = {
  identity: "你是中文小说书名策划。本书的创作取向由用户明确选择，书名标准服从这一取向：可以是文学化、意象化或朴素的书名，只要贴合作品、可读可记。",
  titleField: "2. title 必须像这本书的书名，贴合作品取向与题材，适合封面展示，不要写成简介句、栏目名或世界观说明。",
  clickRateField: "4. clickRate 使用 35-99 的整数，为兼容旧格式保留，表示书名与本书取向和目标读者的贴合度估计，不是点击率预测。",
  reasonField: "8. reason 用 8-40 个字说明这个书名为什么贴合这本书，不要复述剧情。",
  primaryQuality: `1. 主书名要让目标读者感到这本书的气质与关注点，并与作品内容相符。
2. 优先从输入中已经存在的具体人物、关系、地点、物象或核心问题里取材；避免可套在任何故事上的空泛大词。
3. 如果一个标题换到多数同类故事上仍然成立，它就不够具体，必须重写。
4. 平台只影响发布呈现；文学化、意象化的书名可以作为主书名。
5. 先确定主书名，再生成备选；不要用 clickRate 高低代替主书名决策。`,
  poolQuality: `1. 每个标题都要和作品的人物、关系、处境或主题有可辨认的联系。
2. 标题之间在取材角度上拉开：人物、关系、地点、物象、核心问题各有侧重。
3. 至少 2 个标题不要机械复用用户原始关键词，换一个更贴切的切入角度。
4. 不要求反差、异常规则或稀缺资源感；只有作品本身具备时才使用。`,
  modeNovel: "你要围绕当前项目的题材基底、简介和现有标题，生成一组贴合作品取向的书名候选。当前标题只能作为避重参考，不能做同义改写。",
  modeBrief: "你要围绕创作简报产出可供筛选的书名池，贴合作品取向与气质，而不是复述剧情。",
} as const;

function resolveModeLabel(mode: TitlePromptContext["mode"]): string {
  switch (mode) {
    case "adapt":
      return "参考标题改写";
    case "novel":
      return "基于项目上下文生成";
    default:
      return "自由标题工坊";
  }
}

function buildModeInstruction(input: TitlePromptContext, webDefaults: boolean): string {
  if (input.selectionMode === "primary") {
    return "你要围绕当前方案做一次主书名决策：第一条是可直接采用的最终推荐，其余条目只是不同具体卖点角度的备选。";
  }
  switch (input.mode) {
    case "adapt":
      return "你要学习参考标题的信息密度、节奏和钩子组织方式，但绝不能照抄词组、句式骨架或核心设定。";
    case "novel":
      return webDefaults
        ? "你要围绕当前项目的题材基底、简介和现有标题，生成一组更适合点击测试的候选。当前标题只能作为避重参考，不能做同义改写。"
        : ORIENTATION_TITLE_RULES.modeNovel;
    default:
      return webDefaults
        ? "你要围绕创作简报直接产出可用于筛选的标题池，突出题材卖点和点击冲动，而不是复述剧情。"
        : ORIENTATION_TITLE_RULES.modeBrief;
  }
}

function buildDiversityInstruction(input: TitlePromptContext): string {
  if (input.selectionMode === "primary") {
    return "第 1 条是唯一主书名；其余标题只需从不同的具体卖点角度提供备选，不强制平均覆盖 style。";
  }
  return [
    `至少覆盖 ${minimumStyleVariety(input.count)} 种 style。`,
    `至少覆盖 ${minimumStructuralVariety(input.count)} 种句式框架。`,
    `同一种句式框架最多出现 ${maximumFrameClusterSize(input.count)} 个标题。`,
    "句式框架要主动拉开，例如：X，我Y / 在X，我Y / X：Y / 当X / 我X，Y / 纯陈述句。",
  ].join("");
}

function buildRetryInstruction(retryReason: string | null | undefined): string {
  if (!retryReason) {
    return "";
  }
  return `\n上一次输出存在问题：${retryReason}。这一次必须先修正问题，再返回最终 JSON。`;
}

function buildTitleGenerationMessages(
  input: TitlePromptContext,
  options: {
    forceJson?: boolean;
    retryReason?: string | null;
    creativeGuidance?: CreativePromptGuidance | null;
  } = {},
): BaseMessage[] {
  const primarySelection = input.selectionMode === "primary";
  const forceJsonInstruction = options.forceJson
    ? "\n当前模型支持稳定 JSON 输出，请直接返回 JSON 对象本体。"
    : "";
  const webDefaults = keepsWebSerialPromptDefaults(options.creativeGuidance);
  const identity = webDefaults
    ? `你是中文网文平台的资深标题策划。${primarySelection
      ? "你的任务是为一套已经确定的长篇网文方向，直接确定最适合当前平台与读者的主书名，并给出少量备选。"
      : "你的目标不是写“文艺名字”，而是输出一组适合封面展示、点击测试和投放筛选的小说标题候选。"}`
    : `${ORIENTATION_TITLE_RULES.identity}${primarySelection
      ? "你的任务是为一套已经确定的长篇小说方向确定主书名，并给出少量备选。"
      : "你的目标是输出一组可供作者筛选的书名候选。"}${renderCreativeGuidanceSection(options.creativeGuidance).join("\n")}`;
  const titleField = webDefaults
    ? "2. title 必须像中文网文书名，适合封面展示，不要写成简介句、栏目名或世界观说明。"
    : ORIENTATION_TITLE_RULES.titleField;
  const clickRateField = webDefaults
    ? "4. clickRate 使用 35-99 的整数，表示主观点击预估分。"
    : ORIENTATION_TITLE_RULES.clickRateField;
  const reasonField = webDefaults
    ? "8. reason 用 8-40 个字说明标题为什么能成立，重点说“点击理由”，不要复述剧情。"
    : ORIENTATION_TITLE_RULES.reasonField;

  return [
    new SystemMessage(`${identity}

【唯一任务】
${primarySelection
      ? "titles[0] 必须是你综合题材、平台、读者、核心卖点和长篇承诺后选定的唯一主书名；后续条目是次级备选。不要另做复审，也不要把选择责任交回用户。"
      : "只返回高质量标题池，不解释创作过程，不输出 Markdown，不输出代码块。"}

【输出格式】
只能返回一个 JSON 对象，结构固定如下：
{
  "titles": [
    {
      "title": "标题",
      "clickRate": 83,
      "style": "literary|conflict|suspense|high_concept",
      "hookType": "identity_gap|abnormal_situation|power_mutation|rule_hook|direct_conflict|high_concept",
      "angle": "8字内卖点角度",
      "reason": "一句话说明为什么有人会点开"
    }
  ]
}

【字段要求】
1. 必须恰好输出 ${input.count} 个标题，不多不少。
${titleField}
${webDefaults ? "3. 标题建议 6-16 个汉字，最长不超过 20 个字符。" : "3. 书名可以简短、意象化或朴素，建议 2-20 字，具体服从作品与语言文化。"}
${clickRateField}
5. style 只允许使用：literary / conflict / suspense / high_concept。
${webDefaults ? "6. hookType 表示标题主钩子机制，只允许使用：identity_gap / abnormal_situation / power_mutation / rule_hook / direct_conflict / high_concept。" : "6. hookType 为兼容旧格式保留上述枚举；意象或主题标题可用 high_concept，不据此强造悬念、规则、身份反差或外部冲突。"}
7. angle 用 4-20 个字概括这一条标题主打的唯一切入角度。
${reasonField}
9. 禁止输出任何额外字段。

【质量要求】
${!webDefaults
      ? (primarySelection ? ORIENTATION_TITLE_RULES.primaryQuality : ORIENTATION_TITLE_RULES.poolQuality)
      : primarySelection
      ? `1. 主书名必须让目标读者快速识别这是什么类型的故事，以及最值得点开的独有承诺。
2. 主书名至少清楚承载以下四类信息中的两类：主角身份或处境、题材场景或具体事件、独有机制或优势、必须付出的具体代价。
3. 优先使用输入中已经存在的具体人物关系、职业场景、关键行动、异常规则和稀缺资源；不要把它们抽象成“成功、失败、失去、命运、真相、抉择”等可套在任何故事上的情绪词。
4. 如果一个标题换到多数同类故事上仍然成立，它就不够具体，必须重写。
5. 平台适配服从输入中的推荐平台和读者频道，不为了凑风格而生成不适配的文学化标题。
6. 文艺感只能服务于题材识别和故事钩子，不能替代具体卖点。
7. 先确定主书名，再生成备选；不要用 clickRate 高低代替主书名决策。`
      : `1. 每个标题都要让读者一眼看出题材方向和主卖点。
2. 至少 30% 的标题要有明显反差、优势、异常规则或稀缺资源感。
3. 至少 2 个标题不要机械复用用户原始关键词，要换一个更强的切入角度。
4. 如果输入卖点不够锐利，你必须主动放大“主角优势 / 规则异常 / 稀缺资源 / 倒计时压力”，再生成标题。
5. 不要把所有标题都写成单一“求生困境”，必须同时覆盖“压力型”和“掌控型”标题。`}

【多样性规则】
1. ${webDefaults ? buildDiversityInstruction(input) : "按取材与意义拉开候选；允许同为 literary 的不同短书名，不强制固定句式框架或 style 配额。"}
2. 严禁只换近义词、只换一个名词，或在同一标题骨架上做轻微改写。
3. 不允许连续多个标题使用同一开头、同一标点骨架或同一反差结构。
4. 冒号标题可以有，但不能刷屏；逗号反差句也不能刷屏。

【模式理解】
${buildModeInstruction(input, webDefaults)}
${buildRetryInstruction(options.retryReason)}${forceJsonInstruction}`),
    new HumanMessage(`任务输入
- 模式：${resolveModeLabel(input.mode)}
- 选择目标：${primarySelection ? "为当前方案确定唯一主书名，titles[0] 即最终推荐" : "生成用于筛选的标题池"}
- 目标数量：${input.count}
- 当前项目名：${input.novelTitle || "未提供"}
- 当前工作标题：${input.currentTitle || "无"}
- 创作简报：
${input.brief || "未提供"}
- 参考标题：${input.referenceTitle || "无"}
- 题材基底：${input.genreName || "未指定"}
- 题材说明：${input.genreDescription || "无"}

额外提醒：
- 如果提供了参考标题，只能学习其信息组织和节奏，不能照抄词组、不能复刻句式骨架。
- 如果材料不完整，宁可保守，也不要输出题材明显错位的标题。`),
  ];
}

export const titleGenerationPrompt: PromptAsset<
  TitleGenerationPromptInput,
  typeof titleGenerationRawOutputSchema._output
> = {
  id: "title.generation",
  version: "v3",
  taskType: "planner",
  mode: "structured",
  language: "zh",
  contextPolicy: {
    maxTokensBudget: 0,
  },
  outputSchema: titleGenerationRawOutputSchema,
  render: (input) => buildTitleGenerationMessages(input.context, {
    forceJson: input.forceJson,
    retryReason: input.retryReason,
    creativeGuidance: input.creativeGuidance,
  }),
};
