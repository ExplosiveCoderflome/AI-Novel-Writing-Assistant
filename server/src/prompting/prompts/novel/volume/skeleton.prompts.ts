import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { PromptAsset } from "../../../core/promptTypes";
import { renderSelectedContextBlocks } from "../../../core/renderContextBlocks";
import { createBookVolumeSkeletonSchema } from "../../../../services/novel/volume/volumeGenerationSchemas";
import { type VolumeSkeletonPromptInput } from "./shared";
import { buildVolumeSkeletonContextBlocks } from "./contextBlocks";
import { NOVEL_PROMPT_BUDGETS } from "../promptBudgetProfiles";

// export function createVolumeSkeletonPrompt(
//   targetVolumeCount: number,
// ): PromptAsset<
//   VolumeSkeletonPromptInput,
//   ReturnType<typeof createBookVolumeSkeletonSchema>["_output"]
// > {
//   return {
//     id: "novel.volume.skeleton",
//     version: "v2",
//     taskType: "planner",
//     mode: "structured",
//     language: "zh",
//     contextPolicy: {
//       maxTokensBudget: NOVEL_PROMPT_BUDGETS.volumeSkeleton,
//       requiredGroups: ["book_contract", "strategy_context", "chapter_budget"],
//       preferredGroups: ["macro_constraints", "existing_volume_window", "guidance"],
//     },
//     outputSchema: createBookVolumeSkeletonSchema(targetVolumeCount),
//     render: (_input, context) => [
//       new SystemMessage([
//         "你是长篇网文分卷骨架规划助手。",
//         "当前阶段只做卷级骨架，不展开章节。",
//         "",
//         `必须严格输出 ${targetVolumeCount} 卷。`,
//         "每卷必须包含 title、summary、openingHook、mainPromise、primaryPressureSource、coreSellingPoint、escalationMode、protagonistChange、midVolumeRisk、climax、payoffType、nextVolumeHook、resetPoint、openPayoffs。",
//         "骨架必须服从上游策略，特别是 hard/soft 规划分层。",
//       ].join("\n")),
//       new HumanMessage([
//         "分卷骨架上下文：",
//         renderSelectedContextBlocks(context),
//       ].join("\n")),
//     ],
//   };
// }
export function createVolumeSkeletonPrompt(
  targetVolumeCount: number,
): PromptAsset<
  VolumeSkeletonPromptInput,
  ReturnType<typeof createBookVolumeSkeletonSchema>["_output"]
> {
  return {
    id: "novel.volume.skeleton",
    version: "v2",
    taskType: "planner",
    mode: "structured",
    language: "zh",
    contextPolicy: {
      maxTokensBudget: NOVEL_PROMPT_BUDGETS.volumeSkeleton,
      requiredGroups: ["book_contract", "strategy_context", "chapter_budget"],
      preferredGroups: ["macro_constraints", "existing_volume_window", "guidance"],
    },
    outputSchema: createBookVolumeSkeletonSchema(targetVolumeCount),
    render: (_input, context) => [
      new SystemMessage([
        "你是长篇网文分卷骨架规划助手，负责把整本书的上游策略拆解为可执行的卷级骨架。",
        "",
        "【任务边界】",
        `必须严格输出 ${targetVolumeCount} 卷，数量不得多也不得少。`,
        "当前阶段只做“卷级骨架规划”，不得展开为章节大纲、场景细纲、人物小传或具体对话。",
        "每卷 summary 必须是卷级概括，不得写成详细剧情复述。",
        "",
        "【字段要求】",
        "每卷必须完整包含以下字段，不得缺漏、合并或改名：",
        "title、summary、openingHook、mainPromise、primaryPressureSource、coreSellingPoint、escalationMode、protagonistChange、midVolumeRisk、climax、payoffType、nextVolumeHook、resetPoint、openPayoffs。",
        "",
        "【规划原则】",
        "1. 骨架必须严格服从上游策略与书籍契约。",
        "2. hard 规划决定不可违背的主线推进、阶段目标、核心因果与关键兑现顺序。",
        "3. soft 规划决定每卷的节奏包装、冲突表现方式、情绪色彩与卖点呈现方式。",
        "4. 输出时必须体现：硬推进连续，软体验变化。",
        "",
        "【分卷质量要求】",
        "1. 每卷都要有独立成立的阅读承诺，不能只是过渡卷。",
        "2. 相邻两卷的 coreSellingPoint 不应重复，必须体现卖点差异。",
        "3. 相邻两卷的 primaryPressureSource 或 escalationMode 应尽量变化，避免同质化升级。",
        "4. 每卷都必须回答：这卷为什么值得单独存在。",
        "5. 分卷整体必须形成清晰递进：开局立钩子，中段抬代价，后段放大不可逆风险，临近结尾增强兑现密度。",
        "",
        "【节奏要求】",
        "1. 第一卷必须承担强开书职能，快速建立主卖点、核心困境和追更理由。",
        "2. 中段卷不能只承担搬运剧情，必须提供新的局面变化、新压力或新兑现。",
        "3. 后段卷必须加强不可回退感，避免只是重复前中期套路。",
        "4. nextVolumeHook 必须推动读者自然进入下一卷，不能只是泛泛留悬念。",
        "",
        "【禁止事项】",
        "禁止脱离上下文自行发明大设定。",
        "禁止提前透支上游未允许兑现的核心 payoff。",
        "禁止让多卷承担同一种冲突功能而缺乏层次变化。",
        "禁止把 resetPoint 写成“回归平静”式空话，必须说明卷末状态如何重组下一卷起点。",
        "",
        "你的目标不是把剧情写长，而是把整本书的分卷结构搭稳。",
      ].join("\n")),
      new HumanMessage([
        "请基于以下上下文，为整本书规划分卷骨架。",
        "",
        "【输出要求】",
        `- 严格输出 ${targetVolumeCount} 卷`,
        "- 不补充 schema 之外的字段",
        "- 每卷信息要简洁、明确、可执行",
        "- 优先保证分卷差异性、递进关系与商业可读性",
        "",
        "【分卷骨架上下文】",
        renderSelectedContextBlocks(context),
      ].join("\n")),
    ],
  };
}
export { buildVolumeSkeletonContextBlocks };
