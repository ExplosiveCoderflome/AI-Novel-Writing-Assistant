import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";
import type { PromptAsset } from "../../core/promptTypes";
import {
  marketCreativeBriefSchema,
  marketPlatformDigestSchema,
  marketTrendReportSchema,
} from "./marketRadar.promptSchemas";

interface PlatformDigestInput {
  platformLabel: string;
  rankingText: string;
}

interface TrendReportInput {
  platformDigestsText: string;
  historyText: string;
  genreCatalogText: string;
  storyModeCatalogText: string;
  allowedGenreIds: string[];
  allowedStoryModeIds: string[];
  hasComparableHistory: boolean;
}

interface CreativeBriefInput {
  influenceMode: "follow_hot" | "differentiate" | "light";
  selectedSignalsText: string;
}

const analystSystem = [
  "你是中文网络文学市场分析师。只分析输入中的公开榜单元数据，不补写作品正文，不假装知道未提供的信息。",
  "语义分类、套路归纳和机会判断必须由你完成；不能只按标题关键词机械计数。",
  "只根据输入中的公开榜单元数据归纳热门题材和市场信号；对输入未提供的信息不要臆测。",
  "重点分析：热门题材组合、主角身份、金手指机制、开篇危机、关系卖点、标题句式、拥挤套路和差异化机会。",
  "输入有新书榜或新晋作者榜时只分析这些新书证据；成熟榜单只会在没有可用新书榜时作为回退数据。",
  "kind 只能使用 genre、protagonist、advantage、opening、relationship、title_pattern、opportunity、crowding；不得创造近义枚举值。",
  "榜单高频不等于适合照搬。机会建议必须说明读者满足点，同时避开直接复制具体作品。",
].join("\n");

export const marketPlatformDigestPrompt: PromptAsset<PlatformDigestInput, z.infer<typeof marketPlatformDigestSchema>> = {
  id: "market_radar.platform_digest",
  version: "v3",
  taskType: "planner",
  mode: "structured",
  language: "zh",
  contextPolicy: { maxTokensBudget: 0 },
  repairPolicy: { maxAttempts: 1 },
  outputSchema: marketPlatformDigestSchema,
  management: { productPrompt: true, editModes: ["readonly"] },
  render: (input) => [
    new SystemMessage(analystSystem),
    new HumanMessage([
      `平台：${input.platformLabel}`,
      "请归纳这个平台当前榜单的市场信号。首次横截面分析的 direction 一律使用 current。",
      "每类只保留有多条证据或商业意义明确的信号，总计输出5到10项；id 使用简短稳定的英文短横线格式。",
      "",
      input.rankingText,
    ].join("\n")),
  ],
  postValidate: (output) => output,
  semanticRetryPolicy: { maxAttempts: 1 },
};

export const marketTrendSynthesisPrompt: PromptAsset<TrendReportInput, z.infer<typeof marketTrendReportSchema>> = {
  id: "market_radar.cross_platform_synthesis",
  version: "v4",
  taskType: "planner",
  mode: "structured",
  language: "zh",
  contextPolicy: { maxTokensBudget: 0 },
  repairPolicy: { maxAttempts: 1 },
  outputSchema: marketTrendReportSchema,
  management: { productPrompt: true, editModes: ["readonly"] },
  render: (input) => [
    new SystemMessage(analystSystem),
    new HumanMessage([
      "请综合各平台归纳结果，保留平台差异，不要把男频、女频和免费阅读市场混成一个结论。",
      "输入是各平台已经压缩的新书信号；只做跨平台合并、取舍和差异判断，不要逐条复制平台结果。",
      input.hasComparableHistory
        ? "可根据历史比较判断 rising、stable、falling；证据不足时仍使用 current。"
        : "没有可比较历史，所有信号 direction 必须使用 current，禁止声称升温或退潮。",
      "总计输出8到12项。recommended=true 应优先给一项差异化机会和最多三项支撑信号；高度拥挤的套路通常不应推荐。",
      "同时输出 productionFoundation，把市场结论收束成一个题材基底、一个主要推进模式和可选的辅助推进模式。",
      "题材基底回答‘这是什么书’，推进模式回答‘这本书靠什么持续推进和兑现’，两者不能混用。",
      "如果资源库中已有语义等价项，必须填写对应 existingId 并沿用它的名称；只有确实缺少合适资产时 existingId 才能为 null，并输出可直接进入资源库的完整说明、模板和推进模式 profile。",
      "资源名称必须稳定、可复用，不能包含日期、热度、榜单或‘当前热门’等短期字样。",
      "",
      "平台归纳：",
      input.platformDigestsText,
      "",
      `历史比较：${input.historyText || "无"}`,
      "",
      "现有题材基底库：",
      input.genreCatalogText || "空",
      "",
      "现有推进模式库：",
      input.storyModeCatalogText || "空",
    ].join("\n")),
  ],
  postValidate: (output, input) => {
    if (!input.hasComparableHistory && output.signals.some((signal) => signal.direction !== "current")) {
      throw new Error("没有历史快照时不能声称趋势变化。");
    }
    if (
      output.productionFoundation.genre.existingId
      && !input.allowedGenreIds.includes(output.productionFoundation.genre.existingId)
    ) {
      throw new Error("生产底座引用了不存在的题材基底。");
    }
    if ([
      output.productionFoundation.primaryStoryMode.existingId,
      output.productionFoundation.secondaryStoryMode?.existingId,
    ].some((id) => id && !input.allowedStoryModeIds.includes(id))) {
      throw new Error("生产底座引用了不存在的推进模式。");
    }
    return output;
  },
  semanticRetryPolicy: { maxAttempts: 1 },
};

export const marketCreativeBriefPrompt: PromptAsset<CreativeBriefInput, z.infer<typeof marketCreativeBriefSchema>> = {
  id: "market_radar.creative_brief",
  version: "v3",
  taskType: "planner",
  mode: "structured",
  language: "zh",
  contextPolicy: { maxTokensBudget: 0 },
  repairPolicy: { maxAttempts: 1 },
  outputSchema: marketCreativeBriefSchema,
  management: { productPrompt: true, editModes: ["readonly"] },
  render: (input) => [
    new SystemMessage([
      "你是自动导演的开书市场简报编辑。把用户选择的市场信号整理成第一次创意生成可执行的约束。",
      "严禁复用榜单作品的人名、专有设定、简介句子和完整书名；只能提炼读者需求、爽点机制和结构机会。",
      "雷达阶段不得新造或输出任何具体人物姓名、艺名、笔名、作品名、组织名、学校名、城市名或门派名。summary、promptBlock 和 creativeSeed 全部使用身份、角色职能或通用场景称谓，例如“女经纪人”“当红演员”“商业对手”；具体命名留给后续角色与世界规划阶段。",
      "promptBlock 必须能直接指导题材推荐、金手指、首章爆点、整书方向和网文书名。",
      "creativeSeed.openingIdea 必须是一段可直接开书的中文起始想法，写清主角身份、金手指或核心优势、开局发生的具体事件和近期目标，不输出标题、大纲、Markdown 或过程说明。",
      "creativeSeed.coreAdvantage 必须说明主角能做什么，并至少包含触发条件、使用边界、成长方向或代价中的一项；现实题材可使用专业能力、信息差、身份资源或稀缺关系。",
      "creativeSeed.bookSellingPoint 要说明读者持续追读的核心满足点，不能只复述题材名称。",
      "creativeSeed.first30ChapterPromise 要写清前30章必须兑现的阶段结果、关系变化或能力成长。",
      "用户选中的 advantage、opening、protagonist、relationship 信号必须分别进入对应创作内容；若某类未选择，再结合其余信号补齐，不得用题材和推进模式代替具体设定。",
      "不要要求后续质量复审补救，目标是提高第一次生成质量。",
    ].join("\n")),
    new HumanMessage([
      `影响模式：${input.influenceMode}`,
      input.influenceMode === "follow_hot" ? "优先贴合当前热门满足点，但仍禁止复制具体作品。" : "",
      input.influenceMode === "differentiate" ? "保留热门读者满足点，同时至少替换主角身份、舞台或金手指机制中的一项。" : "",
      input.influenceMode === "light" ? "市场信号只作次要参考，用户自身想法和已选题材优先。" : "",
      "",
      input.selectedSignalsText,
    ].filter(Boolean).join("\n")),
  ],
};
