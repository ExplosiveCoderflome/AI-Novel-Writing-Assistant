/**
 * 短剧分集大纲 PromptAsset（P1-C）
 *
 * 输入：策略 + 内容节拍 + 赛道钩子库 + 卡点集号 → 输出每集大纲。
 * 每集 = 黄金3秒钩子 + 主钩子类型 + 核心冲突 + 集尾卡点 + 情绪净值 + 源映射。
 */
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";
import type { PromptAsset } from "../../../prompting/core/promptTypes";

export const dramaEpisodeOutlineItemSchema = z.object({
  order: z.number().int().min(1),
  title: z.string().trim().min(1),
  // 黄金3秒钩子开场
  hookOpening: z.string().trim().min(1),
  // 主钩子类型 id（取自钩子库）
  hookType: z.string().trim().min(1),
  // 本集核心冲突
  conflict: z.string().trim().min(1),
  // 集尾卡点
  cliffhanger: z.string().trim().min(1),
  // 情绪净值 -5(最憋屈) ~ 5(最释放)
  emotionNet: z.number().int().min(-5).max(5),
  // 源节拍 order 引用（改编映射，原创可空）
  sourceBeatRefs: z.array(z.number().int()).optional(),
});

export const dramaEpisodeOutlineOutputSchema = z.object({
  episodes: z.array(dramaEpisodeOutlineItemSchema).min(1).max(40),
});

export type DramaEpisodeOutlineOutput = z.infer<typeof dramaEpisodeOutlineOutputSchema>;

export interface DramaEpisodeOutlinePromptInput {
  synopsis: string;
  strategyJson: string;
  beatsDigest: string;
  trackLabel: string;
  hookLibrary: string;
  startOrder: number;
  count: number;
  paywallEpisodes: string;
}

export const dramaEpisodeOutlinePrompt: PromptAsset<
  DramaEpisodeOutlinePromptInput,
  DramaEpisodeOutlineOutput
> = {
  id: "drama.episodeOutline",
  version: "v1",
  taskType: "outline_planning",
  mode: "structured",
  language: "zh",
  contextPolicy: {
    maxTokensBudget: 8000,
  },
  outputSchema: dramaEpisodeOutlineOutputSchema,
  render: (input) => [
    new SystemMessage([
      "你是顶尖的竖屏付费短剧编剧，擅长把故事切成强钩子、强卡点的分集结构。",
      "你的任务是基于改编策略与内容节拍，产出指定区间的分集大纲。",
      "",
      "【每集结构铁律】",
      "1. 开场(0-3s)：必须是冲突/悬念/反差，写进 hookOpening。",
      "2. 主钩子：从钩子库选 1 个最合适的，hookType 填其 id。",
      "3. 冲突升级：conflict 写清本集谁挡路、如何升级。",
      "4. 集尾卡点：cliffhanger 必须留强悬念/反转，付费卡点集尤其要狠。",
      "5. 情绪净值：emotionNet 反映本集是憋屈蓄势(负)还是反转释放(正)，",
      "   每 1-2 集要有一次正向释放，付费点前可深度蓄势。",
      "",
      "【任务边界】",
      "只输出符合 schema 的严格 JSON，不要 Markdown、解释或代码块。",
      "order 必须连续且落在要求区间；hookType 必须是钩子库中的 id。",
      "若有源节拍，sourceBeatRefs 填对应节拍 order，保证改编可回溯。",
    ].join("\n")),
    new HumanMessage([
      `【内容梗概】\n${input.synopsis}`,
      "",
      `【改编策略】\n${input.strategyJson}`,
      "",
      `【赛道】${input.trackLabel}`,
      `【钩子库（id：说明）】\n${input.hookLibrary}`,
      "",
      `【内容节拍摘要（order：内容）】\n${input.beatsDigest}`,
      "",
      `【本次生成区间】第 ${input.startOrder} 集起，共 ${input.count} 集`,
      `【其中的付费卡点集号】${input.paywallEpisodes || "无"}`,
      "",
      "请输出该区间的分集大纲 JSON。",
    ].join("\n")),
  ],
};
