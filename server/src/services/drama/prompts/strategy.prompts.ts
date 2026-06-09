/**
 * 短剧策略规划 PromptAsset（P1-B）
 *
 * 输入：标准化内容包梗概 + 赛道模板 + 卡点策略 → 输出短剧改编策略。
 * 自包含于 drama 模块（仅依赖 prompting 基础设施），便于整体拆分。
 */
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";
import type { PromptAsset } from "../../../prompting/core/promptTypes";

export const dramaStrategyOutputSchema = z.object({
  // 定位：一句话说清这部短剧卖什么爽点给谁看
  positioning: z.string().trim().min(1),
  // 主爽点线：贯穿全剧的核心爽感主线
  mainPleasureLine: z.string().trim().min(1),
  // 付费卡点策略说明
  paywallNote: z.string().trim().min(1),
  // 情绪曲线目标
  emotionCurveNote: z.string().trim().min(1),
  // 改编偏离声明：为节奏可对原著做哪些受控改动（原创/文本源可写"无原著约束"）
  deviationDeclaration: z.string().trim().min(1),
});

export type DramaStrategyOutput = z.infer<typeof dramaStrategyOutputSchema>;

export interface DramaStrategyPromptInput {
  synopsis: string;
  trackLabel: string;
  trackDescription: string;
  rhythmNote: string;
  taboos: string;
  preferredHooks: string;
  targetEpisodes: number;
  freeEpisodes: number;
  firstPaywallAt: number;
}

export const dramaStrategyPrompt: PromptAsset<
  DramaStrategyPromptInput,
  DramaStrategyOutput
> = {
  id: "drama.strategy",
  version: "v1",
  taskType: "outline_planning",
  mode: "structured",
  language: "zh",
  contextPolicy: {
    maxTokensBudget: 4000,
  },
  outputSchema: dramaStrategyOutputSchema,
  render: (input) => [
    new SystemMessage([
      "你是顶尖的竖屏付费短剧操盘人，擅长把一个故事改编成高完播、高付费转化的短剧。",
      "你的任务是基于内容梗概与赛道法则，产出这部短剧的改编策略。",
      "",
      "【竖屏付费短剧铁律】",
      "1. 黄金3秒：每集开场3秒必须有冲突/悬念/反差。",
      "2. 高信息密度：几乎无环境描写，全靠对白+动作+冲突推进。",
      "3. 爽感循环：憋屈蓄势→反转释放→新钩子，高频循环。",
      `4. 付费节奏：前${input.freeEpisodes}集免费引流，第${input.firstPaywallAt}集设首付费点（卡在第一个大反转），之后每集集尾强卡点。`,
      "",
      "【任务边界】",
      "只输出符合 schema 的严格 JSON，不要 Markdown、解释或代码块。",
      "策略要具体、可执行，不能写空泛套话。",
    ].join("\n")),
    new HumanMessage([
      `【内容梗概】\n${input.synopsis}`,
      "",
      `【赛道】${input.trackLabel}：${input.trackDescription}`,
      `【该赛道爽点节奏】${input.rhythmNote}`,
      `【该赛道偏好钩子】${input.preferredHooks}`,
      `【赛道禁忌（务必规避）】${input.taboos}`,
      "",
      `【总集数】${input.targetEpisodes}`,
      "",
      "请输出这部竖屏付费短剧的改编策略 JSON。",
    ].join("\n")),
  ],
};
