import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";
import type { PromptAsset } from "../../../core/promptTypes";
import { renderSelectedContextBlocks } from "../../../core/renderContextBlocks";

export const compactBookStructureSchema = z.object({
  opening: z.object({ startChapter: z.number().int().min(1), endChapter: z.number().int().min(1), purpose: z.string().trim().min(1) }),
  middle: z.object({ startChapter: z.number().int().min(1), endChapter: z.number().int().min(1), purpose: z.string().trim().min(1) }),
  closing: z.object({ startChapter: z.number().int().min(1), endChapter: z.number().int().min(1), purpose: z.string().trim().min(1) }),
  endingContract: z.object({
    conflictResolution: z.string().trim().min(1),
    protagonistGoal: z.string().trim().min(1),
    finalState: z.string().trim().min(1),
    payoffItems: z.array(z.string().trim().min(1)).min(1).max(8),
    themeLanding: z.string().trim().min(1),
    allowedAftertaste: z.string().trim().min(1),
    forbiddenNewThreads: z.array(z.string().trim().min(1)).max(8),
  }),
});

export type CompactBookStructure = z.infer<typeof compactBookStructureSchema>;

export interface CompactBookStructurePromptInput {
  targetChapterCount: number;
}

export const compactBookStructurePrompt: PromptAsset<CompactBookStructurePromptInput, CompactBookStructure> = {
  id: "novel.compact_book.structure",
  version: "v1",
  taskType: "planner",
  mode: "structured",
  language: "zh",
  contextPolicy: {
    maxTokensBudget: 2200,
    requiredGroups: ["book_contract", "story_macro"],
    preferredGroups: ["volume_window", "payoff_directives"],
    dropOrder: ["payoff_directives"],
  },
  outputSchema: compactBookStructureSchema,
  render: (input, context) => [
    new SystemMessage([
      "你是紧凑篇幅网文的结构规划助手。",
      `全书目标为 ${input.targetChapterCount} 章，必须在有限篇幅内完成完整故事。`,
      "将故事分为建立承诺、升级转向、解决兑现三段，分段连续且不得留下一条必须续写的新主线。",
      "结局合同必须可被章节规划、正文和审校直接引用，避免抽象口号。",
      "只输出符合 JSON Schema 的对象。",
    ].join("\n")),
    new HumanMessage([
      "请基于以下书级上下文生成紧凑全书结构和结局合同。",
      renderSelectedContextBlocks(context),
    ].join("\n\n")),
  ],
};

export const compactBookEndingAuditSchema = z.object({
  completed: z.boolean(),
  unresolvedItems: z.array(z.string().trim().min(1)).max(12),
  nextAction: z.enum(["complete", "append_closing_chapters", "replan_required"]),
  explanation: z.string().trim().min(1),
});

export type CompactBookEndingAudit = z.infer<typeof compactBookEndingAuditSchema>;

export const compactBookEndingAuditPrompt: PromptAsset<Record<string, never>, CompactBookEndingAudit> = {
  id: "novel.compact_book.ending_audit",
  version: "v1",
  taskType: "review",
  mode: "structured",
  language: "zh",
  contextPolicy: {
    maxTokensBudget: 1800,
    requiredGroups: ["book_contract", "recent_chapters"],
    preferredGroups: ["payoff_directives", "local_state"],
    dropOrder: ["local_state"],
  },
  outputSchema: compactBookEndingAuditSchema,
  render: (_input, context) => [
    new SystemMessage([
      "你是全书结局审校助手。",
      "只依据提供的结局合同、已保存正文、事实账本和回报项判断是否完成。",
      "主冲突、主角核心目标、关键关系变化和核心回报仍未完成时，不能判定 completed。",
      "如果已有内容可通过 1-5 章收束，选择 append_closing_chapters；只有缺少关键合同或事实冲突无法修复时才选择 replan_required。",
      "不得因为普通文风问题阻断全书完成。只输出符合 JSON Schema 的对象。",
    ].join("\n")),
    new HumanMessage(renderSelectedContextBlocks(context)),
  ],
};
