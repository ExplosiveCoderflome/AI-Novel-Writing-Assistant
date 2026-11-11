import type { OutlinePayoffPlan } from "@ai-novel/shared/types/outlineOpenBook";
import type { PayoffLedgerSourceRef, PayoffLedgerEvidence } from "@ai-novel/shared/types/payoffLedger";
import { OutlineOpenBookError } from "../../../modules/planning/outline/openBook/domain/errors";
export interface OutlineLedgerCandidate {
  ledgerKey: string; currentStatus: string; sourceRefs: PayoffLedgerSourceRef[]; evidence: PayoffLedgerEvidence[];
  setupChapterId?: string | null; setupChapterOrder?: number | null; payoffChapterId?: string | null; payoffChapterOrder?: number | null;
}
export interface WrittenPayoffChapter {id: string; order: number; content: string | null}
/** Stable source identity plus literal prose evidence, never title similarity or planned chapter references. */
export function resolveOutlinePayoffSource(item: OutlineLedgerCandidate, plans: OutlinePayoffPlan[], chapters: WrittenPayoffChapter[], currentOrder?: number | null) {
  const refs = item.sourceRefs.filter(r => r.kind === "outline_plan");
  if (!refs.length) {
    if (item.ledgerKey.startsWith("outline:")) throw new OutlineOpenBookError("OUTLINE_PAYOFF_SOURCE_INVALID", "大纲伏笔需要明确的计划来源键。", 422);
    return null;
  }
  const keys = new Set(refs.map(r => r.refId));
  if (keys.size !== 1) throw new OutlineOpenBookError("OUTLINE_PAYOFF_SOURCE_INVALID", "一条实际伏笔不能合并多个计划身份。", 422);
  const plan = plans.find(p => p.ledgerKey === refs[0].refId);
  if (!plan) throw new OutlineOpenBookError("OUTLINE_PAYOFF_SOURCE_INVALID", "伏笔计划不属于本书来源。", 422);
  const written = chapters.filter(c => c.content?.trim() && (currentOrder == null || c.order <= currentOrder));
  const evidenceChapters = item.evidence.map(e => written.find(c => (!e.chapterId || c.id === e.chapterId) && (e.chapterOrder == null || c.order === e.chapterOrder) && Boolean(e.chapterId || e.chapterOrder != null) && e.quote?.trim() && c.content!.includes(e.quote.trim())));
  if (!evidenceChapters.length || evidenceChapters.some(c => !c)) throw new OutlineOpenBookError("OUTLINE_PAYOFF_EVIDENCE_REQUIRED", "计划伏笔只能依据已写正文的原文证据关联实际台账。", 422);
  for (const target of [{id: item.setupChapterId, order: item.setupChapterOrder}, {id: item.payoffChapterId, order: item.payoffChapterOrder}]) {
    if ((target.id || target.order != null) && !evidenceChapters.some(c => (!target.id || c!.id === target.id) && (target.order == null || c!.order === target.order)))
      throw new OutlineOpenBookError("OUTLINE_PAYOFF_EVIDENCE_REQUIRED", "实际埋设或兑现章节必须有对应正文证据。", 422);
  }
  if (item.currentStatus === "paid_off" && !item.payoffChapterId && item.payoffChapterOrder == null) throw new OutlineOpenBookError("OUTLINE_PAYOFF_EVIDENCE_REQUIRED", "兑现需要明确的实际章节。", 422);
  return plan;
}
