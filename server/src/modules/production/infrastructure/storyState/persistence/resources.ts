import type { Prisma } from "@prisma/client";
import type { StateChangeProposal } from "@ai-novel/shared/types/canonicalState";
import type { CharacterResourceUpdatePayload, CharacterResourceRiskSignal } from "@ai-novel/shared/types/characterResource";
import { characterResourceUpdatePayloadSchema } from "@ai-novel/shared/types/characterResource";
import { characterResourceValidationService } from "../../../../../services/novel/characterResource/CharacterResourceValidationService";
import { normalizeResourceKey, parseJsonArray } from "../../../../../services/novel/characterResource/characterResourceShared";
import { attachProposalSourceQuality } from "../../../../../services/novel/state/stateProposalSourceQuality";
import { buildChapterArtifactContentHash } from "../../../../../services/novel/runtime/artifactSync/ChapterArtifactContentVersion";
import { InvalidProductionRequestError } from "../../../application";
import { exactCharacter } from "./ownership";
import { compact, type ConsumerWriteInput, type ConsumerWriter } from "./types";

export interface ResourcePersistenceDependencies {
  /** Existing canonical snapshot + version service, bound to this transaction; never a partial snapshot. */
  recordVersion(tx: Prisma.TransactionClient, input: { novelId: string; chapterId: string; chapterOrder: number; acceptedProposalIds: string[] }): Promise<{ id: string }>;
}

async function conflicts(input: ConsumerWriteInput, payload: CharacterResourceUpdatePayload): Promise<string[]> {
  const existing = await input.tx.characterResourceLedgerItem.findUnique({ where: { novelId_resourceKey: { novelId: input.context.run.progress.unit.novelId, resourceKey: payload.resourceKey! } } });
  if (!existing) return [];
  const notes: string[] = [];
  if ((existing.lastTouchedChapterOrder ?? 0) > input.context.run.progress.unit.order) notes.push("resource has newer chapter state");
  if (payload.previousHolderCharacterId && payload.previousHolderCharacterId !== existing.holderCharacterId) notes.push("previous resource holder changed");
  if (payload.updateType === "transferred" && payload.holderCharacterId === existing.holderCharacterId) notes.push("transfer target is already the holder");
  if (payload.ownerType === "character" && existing.ownerCharacterId && payload.ownerId !== existing.ownerCharacterId) notes.push("resource ownership changed");
  if (["lost", "consumed", "destroyed"].includes(existing.status) && ["available", "borrowed", "transferred"].includes(payload.statusAfter) && payload.updateType !== "recovered") notes.push("resource recovery requires an explicit recovery event");
  if (existing.readerKnows && !payload.visibilityAfter.readerKnows || existing.holderKnows && !payload.visibilityAfter.holderKnows) notes.push("resource visibility cannot be erased");
  return notes;
}

async function applyLedger(input: ConsumerWriteInput, payload: CharacterResourceUpdatePayload, proposal: StateChangeProposal) {
  const { tx, context } = input; const { novelId, chapterId, order } = context.run.progress.unit;
  const key = { novelId, resourceKey: payload.resourceKey! };
  const existing = await tx.characterResourceLedgerItem.findUnique({ where: { novelId_resourceKey: key } });
  const riskSignals: CharacterResourceRiskSignal[] = proposal.riskLevel === "low" ? [] : [{ code: `resource_${proposal.riskLevel}_risk_commit`,
    severity: proposal.riskLevel === "high" ? "high" : "medium", summary: proposal.validationNotes[0] || `${payload.resourceName} 的资源变更需要后续写作谨慎处理。` }];
  const data = { name: payload.resourceName, summary: compact(payload.summary) || payload.narrativeImpact,
    resourceType: payload.resourceType, narrativeFunction: payload.narrativeFunction, ownerType: payload.ownerType,
    ownerId: payload.ownerId ?? (payload.ownerType === "character" ? payload.holderCharacterId ?? null : null),
    ownerName: payload.ownerName ?? payload.holderCharacterName ?? null,
    ownerCharacterId: payload.ownerType === "character" ? payload.ownerId ?? payload.holderCharacterId ?? null : null,
    holderCharacterId: payload.holderCharacterId ?? null, holderCharacterName: payload.holderCharacterName ?? null,
    status: payload.statusAfter, readerKnows: payload.visibilityAfter.readerKnows, holderKnows: payload.visibilityAfter.holderKnows,
    knownByCharacterIdsJson: JSON.stringify(payload.visibilityAfter.knownByCharacterIds),
    introducedChapterId: existing?.introducedChapterId ?? chapterId, introducedChapterOrder: existing?.introducedChapterOrder ?? order,
    lastTouchedChapterId: chapterId, lastTouchedChapterOrder: order,
    expectedUseStartChapterOrder: payload.expectedUseStartChapterOrder ?? null, expectedUseEndChapterOrder: payload.expectedUseEndChapterOrder ?? null,
    constraintsJson: JSON.stringify(payload.constraints), riskSignalsJson: JSON.stringify(riskSignals),
    sourceRefsJson: JSON.stringify([{ kind: "chapter_content", refId: chapterId, refLabel: `第${order}章`, chapterId, chapterOrder: order }]),
    evidenceJson: JSON.stringify(proposal.evidence.map(summary => ({ summary, chapterId, chapterOrder: order }))), confidence: payload.confidence ?? null };
  const row = await tx.characterResourceLedgerItem.upsert({ where: { novelId_resourceKey: key }, create: { ...key, ...data }, update: data });
  await tx.characterResourceEvent.create({ data: { novelId, resourceId: row.id, chapterId, chapterOrder: order, eventType: payload.updateType,
    actorCharacterId: payload.holderCharacterId ?? null, fromHolderCharacterId: payload.previousHolderCharacterId ?? null,
    toHolderCharacterId: payload.holderCharacterId ?? null, summary: payload.narrativeImpact, evidenceJson: JSON.stringify(proposal.evidence) } });
}

async function scanStale({ tx, context }: ConsumerWriteInput): Promise<number> {
  const { novelId, chapterId, order } = context.run.progress.unit;
  const rows = await tx.characterResourceLedgerItem.findMany({ where: { novelId, status: { in: ["available", "hidden", "borrowed"] } }, orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }], take: 80 });
  let count = 0;
  for (const row of rows) {
    const overdue = row.expectedUseEndChapterOrder != null && row.expectedUseEndChapterOrder < order;
    if (!overdue && !(row.lastTouchedChapterOrder != null && row.lastTouchedChapterOrder <= order - 10)) continue;
    const signals = parseJsonArray<CharacterResourceRiskSignal>(row.riskSignalsJson);
    const summary = overdue ? `资源已超过预计使用窗口（第${row.expectedUseEndChapterOrder}章）。` : "资源已超过 10 章未被触碰。";
    if (!signals.some(signal => signal.code === "resource_stale")) signals.push({ code: "resource_stale", severity: overdue ? "high" : "medium", summary, stale: true });
    await tx.characterResourceLedgerItem.update({ where: { id: row.id }, data: { status: "stale", riskSignalsJson: JSON.stringify(signals) } });
    await tx.characterResourceEvent.create({ data: { novelId, resourceId: row.id, chapterId, chapterOrder: order, eventType: "stale_marked", actorCharacterId: row.holderCharacterId,
      fromHolderCharacterId: row.holderCharacterId, toHolderCharacterId: row.holderCharacterId, summary, evidenceJson: JSON.stringify([summary]) } }); count++;
  }
  return count;
}

export function createResourceWriter(deps?: ResourcePersistenceDependencies): ConsumerWriter {
  return async input => {
    const { tx, context, output } = input; const { novelId, chapterId, order } = context.run.progress.unit;
    if (output.syncPlan.characterResources === "skip") return { characterResourceProposalCount: 0, committedCount: 0, pendingCount: 0, rejectedCount: 0, staleCount: 0 };
    const characters = await tx.character.findMany({ where: { novelId }, select: { id: true, name: true } });
    const committed: string[] = []; let pendingCount = 0; let rejectedCount = 0;
    for (const update of output.characterResourceDeltas) {
      const resolve = (name: string | null | undefined) => name ? exactCharacter(characters, { name }) : null;
      const holder = resolve(update.holderCharacterName); const previous = resolve(update.previousHolderCharacterName);
      const owner = update.ownerType === "character" ? resolve(update.ownerName || update.holderCharacterName) : null;
      const unknownIdentity = Boolean(update.holderCharacterName && !holder || update.previousHolderCharacterName && !previous
        || update.ownerType === "character" && !owner || update.knownByCharacterNames.some(name => !resolve(name)));
      const payload = characterResourceUpdatePayloadSchema.parse({ ...update, chapterOrder: order,
        summary: update.summary ?? undefined,
        resourceKey: normalizeResourceKey({ name: update.resourceName, holderCharacterId: holder, ownerName: update.ownerName }),
        ownerId: owner, holderCharacterId: holder, previousHolderCharacterId: previous,
        visibilityAfter: { readerKnows: update.readerKnows, holderKnows: update.holderKnows, knownByCharacterIds: update.knownByCharacterNames.map(resolve).filter(Boolean) } });
      let proposal = attachProposalSourceQuality({ novelId, chapterId, sourceSnapshotId: null, sourceType: "chapter_background_sync", sourceStage: "production_kernel",
        proposalType: "character_resource_update", riskLevel: update.riskLevel, status: "validated", summary: `${update.resourceName} resource delta in chapter ${order}`,
        payload: { ...payload, syncContentHash: buildChapterArtifactContentHash(context.content) }, evidence: update.evidence.map(compact).filter(Boolean), validationNotes: [update.riskReason || ""].filter(Boolean) },
      context.run.progress.debts?.length ? "debt" : "confirmed");
      const approved = update.reviewDecision === "commit" && proposal.evidence.some(evidence => compact(context.content).includes(evidence));
      proposal = characterResourceValidationService.validateProposal(proposal, { automaticReviewApproved: approved });
      const conflictNotes = await conflicts(input, payload);
      if (proposal.status !== "rejected" && (!approved || unknownIdentity || conflictNotes.length)) proposal = { ...proposal, status: "pending_review",
        validationNotes: [...proposal.validationNotes, "artifact_resource_review:hold", ...(unknownIdentity ? ["resource character identity is unresolved"] : []), ...conflictNotes] };
      const row = await tx.stateChangeProposal.create({ data: { novelId, chapterId, sourceType: proposal.sourceType, sourceStage: proposal.sourceStage,
        proposalType: proposal.proposalType, riskLevel: proposal.riskLevel, status: proposal.status, summary: proposal.summary,
        payloadJson: JSON.stringify(proposal.payload), evidenceJson: JSON.stringify(proposal.evidence), validationNotesJson: JSON.stringify(proposal.validationNotes) } });
      if (proposal.status === "committed") { await applyLedger(input, payload, proposal); committed.push(row.id); }
      else if (proposal.status === "pending_review") pendingCount++;
      else rejectedCount++;
    }
    const staleCount = await scanStale(input);
    if (committed.length) {
      if (!deps) throw new InvalidProductionRequestError("Resource commits require the transaction-bound canonical version service");
      // Serialize per-book canonical versions, including different chapter units.
      const novel = await tx.novel.findUniqueOrThrow({ where: { id: novelId }, select: { updatedAt: true } });
      await tx.novel.update({ where: { id: novelId }, data: { updatedAt: novel.updatedAt } });
      const version = await deps.recordVersion(tx, { novelId, chapterId, chapterOrder: order, acceptedProposalIds: committed });
      await tx.stateChangeProposal.updateMany({ where: { novelId, id: { in: committed } }, data: { committedVersionId: version.id } });
    }
    return { characterResourceProposalCount: output.characterResourceDeltas.length, committedCount: committed.length, pendingCount, rejectedCount, staleCount };
  };
}
