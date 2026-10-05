import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { ChapterPatchRepairPlan } from "@ai-novel/shared/types/chapterPatchRepair";
import { chapterPatchRepairPlanSchema } from "@ai-novel/shared/types/chapterPatchRepair";
import { CHAPTER_PROSE_QUALITY_RULES } from "@ai-novel/shared/types/chapterProseContract";
import type { PromptAsset } from "../../core/promptTypes";
import { renderCacheContextSections } from "../../core/cache";
import { NOVEL_PROMPT_BUDGETS } from "./promptBudgetProfiles";

export interface ChapterPatchRepairPromptInput {
  novelTitle: string;
  chapterTitle: string;
  chapterContent: string;
  issuesJson: string;
  modeHint?: string;
}

export const chapterPatchRepairPrompt: PromptAsset<
  ChapterPatchRepairPromptInput,
  ChapterPatchRepairPlan
> = {
  id: "novel.review.patch",
  version: "v7",
  taskType: "repair",
  mode: "structured",
  language: "zh",
  contextPolicy: {
    maxTokensBudget: NOVEL_PROMPT_BUDGETS.chapterRepair,
    preferredGroups: [
      "repair_issues",
      "chapter_mission",
      "reader_experience",
      "repair_boundaries",
      "world_rules",
    ],
    dropOrder: [
      "recent_chapters",
      "participant_subset",
      "continuation_constraints",
    ],
  },
  outputSchema: chapterPatchRepairPlanSchema,
  cacheBoundary: { messageIndex: 0, contentBlockIndex: 0 },
  structuredOutputHint: { compact: true, placement: "stable_prefix" },
  slots: [
    {
      kind: "append" as const,
      key: "patch.customConstraints",
      label: "自定义补丁补充要求",
      description: "追加对局部补丁生成的额外约束，作为上下文块注入。留空则不追加。",
      anchor: "repair_issues",
      default: "",
      maxLength: 2000,
      placeholderHint: "例如：每个补丁块不得超过 3 句；优先修复节奏问题，结构问题标记但不修……",
    },
  ],
  render: (input, context) => {
    const sections = renderCacheContextSections(context);
    return [
      new SystemMessage([
        "你是网络小说局部修文编辑。",
        "当前任务不是整章重写，而是输出可以被程序安全应用的局部补丁计划。",
        "只输出严格 JSON，不要 Markdown、解释或正文全文。",
        "",
        "【补丁原则】",
        "1. strategy 默认必须是 patch_first。",
        "2. patches 中每个 targetExcerpt 必须逐字摘自当前正文，并且应足够长，确保在正文里只出现一次。",
        "2a. 所有 targetExcerpt 都定位于同一份当前正文，片段之间不得重叠或相互包含。多个问题落在同一片段时，合并为一条补丁，在 replacement 中一次完成全部修复，并合并 issueIds；不得假设前一条补丁的替换结果是后一条的目标。",
        "3. replacement 只替换 targetExcerpt 对应片段，不要改写无关段落；如果修复目标是删除重复片段，replacement 可以是空字符串。",
        "4. 优先修复问题清单中影响主线推进、连续性、人物动机、节奏和结尾钩子的关键问题。",
        "4b. 最多输出 4 个最高价值补丁；每个补丁保持 targetExcerpt、replacement、reason 简洁，避免重复描述问题。",
        "4a. 若问题涉及读者体验合同，只修改能补齐 promisedReward、主角主动性、关键转折、净变化或旧钩子承接的必要片段，并保留已经有效的读者回报。",
        "5. 不得新增重大设定、核心角色或与章节任务冲突的剧情转向。",
        "6. 局部补丁只处理正文中能定位到完整句段的问题；审校系统不可用、结构化判断缺失、评分不足等系统风险不属于正文片段修复。",
        "7. targetExcerpt 必须是正文里的完整短句或段落，不得是单个词语、称谓、标点或过短短语。",
        "8. 如果找不到至少 6 个字符且在正文中唯一出现的原文片段，不要输出 patch；requiresFullRewrite 设为 true，并说明 escalationReason。",
        "9. 如果确实无法用局部补丁安全修复，requiresFullRewrite 设为 true，并说明 escalationReason。",
        "10. 问题清单包含 repairDirectives 时，只执行 mode=patch 的指令；mode=rewrite/manual 保留为未处理说明，不得用局部补丁强行完成。",
        "11. 未出场角色的目标变化不得靠新增场景、视角、远程消息或泄露秘密补齐。书级规则、文风、世界规则和保密约束均须保留；只修有正文证据且本章合同要求的缺口。",
        "12. 每条 patches 必须包含 id、targetExcerpt、replacement、reason、issueIds；reason 用一句话说明修复的具体缺口，不得省略。replacement 与 targetExcerpt 相同时不要输出该补丁；无必要改动时返回空 patches。",
        "13. 不要用一个短句作为锚点插入整场新戏。若缺口必须新增完整场景、跨越当前章结尾或大幅扩写才能兑现，返回 requiresFullRewrite=true 并说明原因，不能把整章重写伪装为局部补丁。",
        "【替换正文的表达约束】",
        "以下约束只用于 replacement；targetExcerpt 必须保留原文，不能为满足表达约束修改定位片段。",
        ...CHAPTER_PROSE_QUALITY_RULES,
      ].join("\n")),
      new HumanMessage([
        `小说：${input.novelTitle}`,
        sections.stable,
      ].filter(Boolean).join("\n\n")),
      ...(input.modeHint ? [new SystemMessage(`修复重点：${input.modeHint}`)] : []),
      new HumanMessage([
        `章节：${input.chapterTitle}`,
        "",
        "【分层上下文】",
        sections.dynamic || "none",
        "",
        "【当前正文】",
        input.chapterContent,
        "",
        "【问题清单】",
        input.issuesJson,
        "",
        "请输出局部补丁 JSON。",
      ].join("\n")),
    ];
  },
};
