import { z } from "zod";

/**
 * 正文具体事实分类（桥接 Fact Ledger 的 NovelFactCategory）：
 * - completed：本章已完成的过程性目标/行动
 * - revealed：本章已揭示的信息/秘密
 * - state_changed：关系/状态/约定/交易条款的变化（如"与某村约定私下放映一场，收3块辛苦费"）
 */
export const chapterConcreteFactCategorySchema = z.enum([
  "completed",
  "revealed",
  "state_changed",
]);

export const chapterConcreteFactSchema = z.object({
  text: z.string().trim().min(1),
  category: chapterConcreteFactCategorySchema,
});

export const chapterSummaryOutputSchema = z.object({
  summary: z.string().trim().min(1),
  /**
   * 本章正文即兴产生、且后续章节必须保持一致的硬事实：
   * 主角做出的承诺、交易条款（金额/数量/时间/方式）、事件性质（私下/公开）、
   * 关键数字日期地点等。一旦设定不可在后文矛盾。
   */
  concreteFacts: z.array(chapterConcreteFactSchema).max(12).optional(),
});

export type ChapterConcreteFact = z.infer<typeof chapterConcreteFactSchema>;
export type ChapterSummaryOutput = z.infer<typeof chapterSummaryOutputSchema>;

