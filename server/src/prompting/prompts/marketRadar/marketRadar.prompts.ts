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
  evidenceItemIds: string[];
}

interface TrendReportInput {
  platformDigestsText: string;
  historyText: string;
  evidenceItemIds: string[];
  hasComparableHistory: boolean;
}

interface CreativeBriefInput {
  influenceMode: "follow_hot" | "differentiate" | "light";
  selectedSignalsText: string;
}

const analystSystem = [
  "你是中文网络文学市场分析师。只分析输入中的公开榜单元数据，不补写作品正文，不假装知道未提供的信息。",
  "语义分类、套路归纳和机会判断必须由你完成；不能只按标题关键词机械计数。",
  "所有结论都必须引用输入中存在的 evidenceItemIds。不得捏造作品、人名、数据或证据ID。",
  "重点分析：热门题材组合、主角身份、金手指机制、开篇危机、关系卖点、标题句式、拥挤套路和差异化机会。",
  "以新书榜和新晋作者榜作为判断当前开书机会的主要证据；阅读榜、畅销榜、月票榜、月度榜和季度榜只用于验证读者需求能否持续，不能压过新书信号。",
  "榜单高频不等于适合照搬。机会建议必须说明读者满足点，同时避开直接复制具体作品。",
].join("\n");

export const marketPlatformDigestPrompt: PromptAsset<PlatformDigestInput, z.infer<typeof marketPlatformDigestSchema>> = {
  id: "market_radar.platform_digest",
  version: "v2",
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
      "优先从标记为“主要”的新书或新晋证据形成结论，再用辅助榜单判断该满足点是否具有持续性。不要因为辅助榜单作品更多就改变主次关系。",
      "每类只保留有多条证据或商业意义明确的信号，id 使用简短稳定的英文短横线格式。",
      "",
      input.rankingText,
    ].join("\n")),
  ],
  postValidate: (output, input) => {
    const allowed = new Set(input.evidenceItemIds);
    if (output.signals.some((signal) => signal.evidenceItemIds.some((id) => !allowed.has(id)))) {
      throw new Error("平台榜单归纳引用了不存在的证据。");
    }
    return output;
  },
};

export const marketTrendSynthesisPrompt: PromptAsset<TrendReportInput, z.infer<typeof marketTrendReportSchema>> = {
  id: "market_radar.cross_platform_synthesis",
  version: "v2",
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
      "跨平台机会必须以各平台的新书 / 新晋信号为主，成熟榜单只能提供持续需求佐证。",
      input.hasComparableHistory
        ? "可根据历史比较判断 rising、stable、falling；证据不足时仍使用 current。"
        : "没有可比较历史，所有信号 direction 必须使用 current，禁止声称升温或退潮。",
      "recommended=true 应优先给一项差异化机会和最多三项支撑信号。高度拥挤的套路通常不应推荐。",
      "",
      "平台归纳：",
      input.platformDigestsText,
      "",
      `历史比较：${input.historyText || "无"}`,
    ].join("\n")),
  ],
  postValidate: (output, input) => {
    const allowed = new Set(input.evidenceItemIds);
    if (!input.hasComparableHistory && output.signals.some((signal) => signal.direction !== "current")) {
      throw new Error("没有历史快照时不能声称趋势变化。");
    }
    if (output.signals.some((signal) => signal.evidenceItemIds.some((id) => !allowed.has(id)))) {
      throw new Error("跨平台分析引用了不存在的证据。");
    }
    return output;
  },
};

export const marketCreativeBriefPrompt: PromptAsset<CreativeBriefInput, z.infer<typeof marketCreativeBriefSchema>> = {
  id: "market_radar.creative_brief",
  version: "v1",
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
      "promptBlock 必须能直接指导题材推荐、金手指、首章爆点、整书方向和网文书名。",
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
