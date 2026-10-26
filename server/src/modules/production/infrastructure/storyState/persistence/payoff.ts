import { clearStaleRiskSignal, dedupeRiskSignals, appendStaleRiskSignal, mapPayoffLedgerRow, buildSyntheticPayoffIssues,
  resolvePayoffLedgerSyncLedgerKey, sanitizePayoffLedgerSyncItem } from "../../../../../services/payoff/payoffLedgerShared";
import { createNovelChapterReferenceLookup, normalizePayoffLedgerPromptChapterRefs } from "../../../../../services/payoff/payoffLedgerChapterRefs";
import { resolveSupersededBookContractLedgerKeys } from "../../../../../services/payoff/domain/payoffLedgerSourceLifecycle";
import { buildBookContractPayoffSources } from "../../../../../services/payoff/sources/bookContractPayoffSources";
import { payoffLedgerSyncPrompt } from "../../../../../prompting/prompts/payoff/payoffLedgerSync.prompts";
import { payoffLedgerSyncOutputSchema } from "../../../../../prompting/prompts/payoff/payoffLedgerSync.promptSchemas";
import type { ArtifactConsumerPort } from "../consumerPorts";
import type { PrismaArtifactCheckpointStore } from "../checkpointStore";
import { requireConsumerClaim } from "./ownership";
import { type ConsumerWriter } from "./types";

export const writePayoff: ConsumerWriter = async ({ tx, context, output, previous }) => {
  if (output.syncPlan.payoffLedger === "skip") return { payoffDeltaCount: 0 };
  const { novelId, chapterId, order } = context.run.progress.unit;
  const chapters = await tx.chapter.findMany({ where: { novelId }, select: { id: true, order: true, title: true } });
  const reference = (value: string | number | null | undefined, fallback: string | null) => value == null ? fallback
    : chapters.find(chapter => chapter.id === String(value) || String(chapter.order) === String(value))?.id ?? null;
  const snapshotId = (previous.state_snapshot as { stateSnapshotId?: string } | undefined)?.stateSnapshotId ?? null;
  for (const item of output.payoffDeltas) {
    const ledgerKey = item.ledgerKey.trim();
    const existing = await tx.payoffLedgerItem.findUnique({ where: { novelId_ledgerKey: { novelId, ledgerKey } } });
    const lastTouchedChapterId = reference(item.lastTouchedChapterOrder, chapterId) ?? chapterId;
    const data = { title: item.title, summary: item.summary, scopeType: item.scopeType, currentStatus: item.currentStatus,
      targetStartChapterOrder: item.targetStartChapterOrder ?? null, targetEndChapterOrder: item.targetEndChapterOrder ?? null,
      firstSeenChapterOrder: existing?.firstSeenChapterOrder ?? item.firstSeenChapterOrder ?? order,
      lastTouchedChapterOrder: item.lastTouchedChapterOrder ?? order, lastTouchedChapterId,
      setupChapterId: reference(item.setupChapterId ?? item.setupChapterOrder ?? item.firstSeenChapterOrder,
        item.currentStatus === "setup" || item.currentStatus === "hinted" ? chapterId : null) ?? existing?.setupChapterId ?? null,
      payoffChapterId: reference(item.payoffChapterId ?? item.payoffChapterOrder, item.currentStatus === "paid_off" ? chapterId : null) ?? existing?.payoffChapterId ?? null,
      lastSnapshotId: snapshotId ?? existing?.lastSnapshotId ?? null,
      sourceRefsJson: JSON.stringify(item.sourceRefs.length ? item.sourceRefs.map(ref => ({ ...ref, chapterId: ref.chapterId ?? lastTouchedChapterId,
        chapterOrder: ref.chapterOrder ?? order })) : [{ kind: "chapter_payoff_ref", refId: null, refLabel: `第${order}章`, chapterId, chapterOrder: order, volumeId: null, volumeSortOrder: null }]),
      evidenceJson: JSON.stringify(item.evidence.length ? item.evidence.map(ref => ({ ...ref, chapterId: ref.chapterId ?? chapterId, chapterOrder: ref.chapterOrder ?? order }))
        : [{ summary: item.summary, chapterId, chapterOrder: order }]),
      riskSignalsJson: JSON.stringify(clearStaleRiskSignal(dedupeRiskSignals(item.riskSignals))), statusReason: item.statusReason?.trim() || null, confidence: item.confidence ?? null };
    await tx.payoffLedgerItem.upsert({ where: { novelId_ledgerKey: { novelId, ledgerKey } }, create: { novelId, ledgerKey, ...data }, update: data });
  }
  return { payoffDeltaCount: output.payoffDeltas.length };
};

/** Apply only a saved full-reconcile response; no legacy model invocation or independent transaction. */
export function createFullPayoffConsumer(deps: { checkpoints: Pick<PrismaArtifactCheckpointStore, "applyConsumer"> }): ArtifactConsumerPort {
  return { async apply(input) {
    const claim = requireConsumerClaim("payoff_full_commit", input);
    return deps.checkpoints.applyConsumer(claim, async tx => {
      const { novelId, chapterId, order } = input.context.run.progress.unit;
      const output = payoffLedgerSyncOutputSchema.parse(input.output);
      const bookContract = await tx.bookContract.findUnique({ where: { novelId } });
      const bookContractPayoffs = buildBookContractPayoffSources(bookContract);
      await payoffLedgerSyncPrompt.postValidate?.(output, { bookContractPayoffs } as Parameters<NonNullable<typeof payoffLedgerSyncPrompt.postValidate>>[1],
        { blocks: [], selectedBlockIds: [], droppedBlockIds: [], summarizedBlockIds: [], estimatedInputTokens: 0 });
      const existing = (await tx.payoffLedgerItem.findMany({ where: { novelId } })).map(mapPayoffLedgerRow);
      const lookup = createNovelChapterReferenceLookup(await tx.chapter.findMany({ where: { novelId }, select: { id: true, order: true } }));
      const resolved = new Map<string, typeof output.items[number]>();
      for (const raw of output.items) {
        const item = sanitizePayoffLedgerSyncItem(raw);
        const ledgerKey = resolvePayoffLedgerSyncLedgerKey(item, existing.map(row => ({ ...row,
          targetEndChapterOrder: row.targetEndChapterOrder ?? null, lastTouchedChapterOrder: row.lastTouchedChapterOrder ?? null })));
        resolved.set(ledgerKey, { ...item, ledgerKey });
      }
      const superseded = resolveSupersededBookContractLedgerKeys({ activeBookContractRefIds: bookContractPayoffs.map(source => source.refId),
        existingItems: existing, resolvedItems: [...resolved.values()] });
      const snapshotId = (input.previous as { state_snapshot?: { stateSnapshotId?: string } }).state_snapshot?.stateSnapshotId;
      for (const item of resolved.values()) {
        const previous = existing.find(row => row.ledgerKey === item.ledgerKey);
        const refs = normalizePayoffLedgerPromptChapterRefs({ item, previous, lookup, currentChapterOrder: order, sourceChapterId: chapterId });
        const data = { title: item.title, summary: item.summary, scopeType: item.scopeType, currentStatus: item.currentStatus,
          targetStartChapterOrder: item.targetStartChapterOrder ?? null, targetEndChapterOrder: item.targetEndChapterOrder ?? null,
          firstSeenChapterOrder: item.firstSeenChapterOrder ?? previous?.firstSeenChapterOrder ?? null,
          lastTouchedChapterOrder: item.lastTouchedChapterOrder ?? previous?.lastTouchedChapterOrder ?? null,
          lastTouchedChapterId: refs.lastTouchedChapterId, setupChapterId: refs.setupChapterId, payoffChapterId: refs.payoffChapterId,
          lastSnapshotId: snapshotId ?? previous?.lastSnapshotId ?? null, sourceRefsJson: JSON.stringify(refs.sourceRefs), evidenceJson: JSON.stringify(refs.evidence),
          riskSignalsJson: JSON.stringify(clearStaleRiskSignal(dedupeRiskSignals(item.riskSignals))), statusReason: item.statusReason?.trim() || null, confidence: item.confidence ?? null };
        await tx.payoffLedgerItem.upsert({ where: { novelId_ledgerKey: { novelId, ledgerKey: item.ledgerKey } }, create: { novelId, ledgerKey: item.ledgerKey, ...data }, update: data });
      }
      for (const row of existing) {
        if (superseded.has(row.ledgerKey)) {
          await tx.payoffLedgerItem.update({ where: { id: row.id }, data: { currentStatus: "failed",
            riskSignalsJson: JSON.stringify(dedupeRiskSignals([...clearStaleRiskSignal(row.riskSignals), { code: "source_superseded", severity: "low", summary: "Book Contract 阶段回报已修改或移除，这条旧承诺已退出当前执行义务。", stale: true }])),
            statusReason: "Book Contract 来源已被新的阶段回报替换或移除。" } });
        } else if (!resolved.has(row.ledgerKey) && row.currentStatus !== "paid_off" && row.currentStatus !== "failed") {
          await tx.payoffLedgerItem.update({ where: { id: row.id }, data: { riskSignalsJson: JSON.stringify(appendStaleRiskSignal(row.riskSignals, "本轮 AI 对账没有再次命中这条伏笔，已保留旧账本并标记为 stale，等待下一次同步确认。")) } });
        }
      }
      const items = (await tx.payoffLedgerItem.findMany({ where: { novelId } })).map(mapPayoffLedgerRow);
      const issues = buildSyntheticPayoffIssues(items);
      const active = issues.map(issue => `payoff:${issue.ledgerKey}:${issue.code}`);
      await tx.openConflict.updateMany({ where: { novelId, sourceType: "payoff_ledger", status: "open", conflictKey: { notIn: active } }, data: { status: "resolved" } });
      for (const issue of issues) {
        const item = items.find(row => row.ledgerKey === issue.ledgerKey)!;
        const conflictKey = `payoff:${issue.ledgerKey}:${issue.code}`;
        const data = { chapterId: item.lastTouchedChapterId ?? item.setupChapterId ?? item.payoffChapterId ?? null,
          sourceSnapshotId: item.lastSnapshotId ?? null, sourceIssueId: null, conflictType: issue.code, title: `payoff/${issue.code}`,
          summary: issue.description, severity: issue.severity, status: "open", evidenceJson: JSON.stringify([issue.evidence]), affectedCharacterIdsJson: "[]",
          resolutionHint: issue.fixSuggestion, lastSeenChapterOrder: item.lastTouchedChapterOrder ?? item.targetEndChapterOrder ?? null };
        const changed = await tx.openConflict.updateMany({ where: { novelId, sourceType: "payoff_ledger", conflictKey }, data });
        if (!changed.count) await tx.openConflict.create({ data: { novelId, sourceType: "payoff_ledger", conflictKey, ...data } });
      }
      return { payoffDeltaCount: resolved.size };
    });
  } };
}
