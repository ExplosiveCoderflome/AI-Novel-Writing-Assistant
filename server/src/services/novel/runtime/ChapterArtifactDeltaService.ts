import type {
  ContentProvenance,
  StateChangeProposal,
} from "@ai-novel/shared/types/canonicalState";
import { createHash } from "node:crypto";
import { prisma } from "../../../db/prisma";
import { runStructuredPrompt } from "../../../prompting/core/promptRunner";
import {
  chapterArtifactDeltaPrompt,
  type ChapterArtifactDeltaOutput,
} from "../../../prompting/prompts/novel/chapterArtifactDelta.prompts";
import { ragServices } from "../../rag";
import type { RagOwnerType } from "../../rag/types";
import type { SnapshotExtractionOutput } from "../../state/stateSnapshotExtraction";
import {
  resolveSnapshotChapterReference,
  stateService,
} from "../../state/StateService";
import {
  clearStaleRiskSignal,
  dedupeRiskSignals,
  serializeLedgerJson,
} from "../../payoff/payoffLedgerShared";
import { characterResourceLedgerService } from "../characterResource/CharacterResourceLedgerService";
import { characterResourceStaleScanService } from "../characterResource/CharacterResourceStaleScanService";
import {
  compactText,
  normalizeResourceKey,
} from "../characterResource/characterResourceShared";
import { novelFactService, type NovelFactWriteItem } from "../fact/NovelFactService";
import { extractFacts } from "../novelP0Utils";
import { stateCommitService } from "../state/StateCommitService";
import {
  attachProposalSourceQuality,
  normalizeContentProvenance,
} from "../state/stateProposalSourceQuality";

const ARTIFACT_DELTA_SOURCE_TYPE = "chapter_artifact_delta";
const ARTIFACT_DELTA_SOURCE_STAGE = "chapter_execution";

type CharacterLookupItem = {
  id: string;
  name: string;
  role: string;
  castRole: string | null;
  currentGoal: string | null;
  currentState: string | null;
};

type ChapterReference = {
  id: string;
  order: number;
  title: string;
};

type ChapterArtifactDeltaResourceUpdate = ChapterArtifactDeltaOutput["characterResourceDeltas"][number];
type ChapterArtifactPayoffDelta = ChapterArtifactDeltaOutput["payoffDeltas"][number];
type ChapterArtifactKnowledgeState = ChapterArtifactDeltaOutput["characterKnowledgeStates"][number];

export interface ChapterArtifactDeltaSyncInput {
  novelId: string;
  chapterId: string;
  content: string;
  sourceType?: string;
  sourceStage?: string | null;
  provider?: string;
  model?: string;
  temperature?: number;
  contentProvenance?: ContentProvenance;
}

export interface ChapterArtifactDeltaSyncResult {
  contentHash: string;
  output: ChapterArtifactDeltaOutput;
  stateSnapshotId: string | null;
  characterResourceProposalCount: number;
  characterDynamicsCount: number;
  characterKnowledgeStateCount: number;
  payoffDeltaCount: number;
  canonicalCommittedCount: number;
  concreteFactCount: number;
  staleMarkedCount: number;
  requiresFullReconcile: boolean;
}

export function buildContentHash(content: string): string {
  return createHash("sha256").update(compactText(content)).digest("hex").slice(0, 24);
}

function normalizeName(value: string | null | undefined): string {
  return compactText(value).replace(/\s+/g, "").toLowerCase();
}

function cleanOptionalText(value: string | null | undefined): string | undefined {
  const normalized = compactText(value);
  return normalized || undefined;
}

function cleanNullableText(value: string | null | undefined): string | null {
  return compactText(value) || null;
}

function clampConfidence(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.min(1, value))
    : null;
}

function resolveCharacter(
  characters: Array<{ id: string; name: string }>,
  name: string | null | undefined,
): { id: string; name: string } | null {
  const normalized = normalizeName(name);
  if (!normalized) {
    return null;
  }
  const exact = characters.find((item) => normalizeName(item.name) === normalized);
  if (exact) {
    return exact;
  }
  const fuzzy = characters.find((item) => {
    const itemName = normalizeName(item.name);
    return itemName && (normalized.includes(itemName) || itemName.includes(normalized));
  });
  return fuzzy ?? null;
}

function uniqueTextItems(items: string[] | null | undefined, maxItems: number): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const item of items ?? []) {
    const normalized = compactText(item);
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    result.push(normalized);
    if (result.length >= maxItems) {
      break;
    }
  }
  return result;
}

function joinFactContents(items: string[], maxItems = 3): string | null {
  const joined = uniqueTextItems(items, maxItems).join("；");
  return joined || null;
}

function buildKnowledgeBoundaryLine(state: ChapterArtifactKnowledgeState): string | null {
  const knownFacts = uniqueTextItems(state.knownFacts, 5);
  const hiddenFacts = uniqueTextItems(state.hiddenFacts, 5);
  if (knownFacts.length === 0 && hiddenFacts.length === 0) {
    return null;
  }
  return [
    "【信息边界】",
    knownFacts.length > 0 ? `已知：${knownFacts.join("；")}` : "已知：无新增",
    hiddenFacts.length > 0 ? `未知/不应超前知情：${hiddenFacts.join("；")}` : "未知/不应超前知情：无",
  ].join("");
}

export function mergeKnowledgeBoundaryState(
  currentState: string | null | undefined,
  boundaryLine: string,
): string {
  const base = String(currentState ?? "")
    .replace(/\n?【信息边界】[^\n]*/g, "")
    .trim();
  const cappedBoundary = boundaryLine.slice(0, 1200);
  const baseBudget = Math.max(0, 1200 - cappedBoundary.length - (base ? 1 : 0));
  const cappedBase = base.slice(0, baseBudget).trim();
  return [cappedBase, cappedBoundary].filter(Boolean).join("\n");
}

function normalizeLedgerKey(title: string, fallback: string): string {
  const base = compactText(title)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 96);
  return base || fallback;
}

function stringifyChapterResourceText(items: Awaited<ReturnType<typeof characterResourceLedgerService.listResources>>): string {
  return items.slice(0, 20).map((item) => [
    `- ${item.name}`,
    `holder=${item.holderCharacterName ?? "未知"}`,
    `status=${item.status}`,
    `function=${item.narrativeFunction}`,
    item.summary,
  ].filter(Boolean).join(" | ")).join("\n");
}

function stringifyPayoffText(items: Array<{
  ledgerKey: string;
  title: string;
  currentStatus: string;
  summary: string;
  targetStartChapterOrder: number | null;
  targetEndChapterOrder: number | null;
  lastTouchedChapterOrder: number | null;
}>): string {
  return items.slice(0, 20).map((item) => [
    `- ${item.ledgerKey} | ${item.title}`,
    `status=${item.currentStatus}`,
    item.targetStartChapterOrder || item.targetEndChapterOrder
      ? `target=${item.targetStartChapterOrder ?? "?"}-${item.targetEndChapterOrder ?? "?"}`
      : "",
    item.lastTouchedChapterOrder ? `lastTouched=${item.lastTouchedChapterOrder}` : "",
    item.summary,
  ].filter(Boolean).join(" | ")).join("\n");
}

function stringifyPreviousState(snapshot: Awaited<ReturnType<typeof stateService.getLatestSnapshotBeforeChapter>>): string {
  if (!snapshot) {
    return "";
  }
  const characterLines = snapshot.characterStates
    .map((item) => item.summary?.trim())
    .filter((item): item is string => Boolean(item))
    .slice(0, 6);
  const relationLines = snapshot.relationStates
    .map((item) => item.summary?.trim())
    .filter((item): item is string => Boolean(item))
    .slice(0, 5);
  const infoLines = snapshot.informationStates
    .map((item) => `${item.holderType}:${item.fact}`)
    .slice(0, 6);
  const foreshadowLines = snapshot.foreshadowStates
    .map((item) => `${item.title}(${item.status})`)
    .slice(0, 6);
  return [
    snapshot.summary ? `摘要：${snapshot.summary}` : "",
    characterLines.length > 0 ? `角色：\n${characterLines.map((item) => `- ${item}`).join("\n")}` : "",
    relationLines.length > 0 ? `关系：\n${relationLines.map((item) => `- ${item}`).join("\n")}` : "",
    infoLines.length > 0 ? `信息：\n${infoLines.map((item) => `- ${item}`).join("\n")}` : "",
    foreshadowLines.length > 0 ? `伏笔：\n${foreshadowLines.map((item) => `- ${item}`).join("\n")}` : "",
  ].filter(Boolean).join("\n\n");
}

export class ChapterArtifactDeltaService {
  async syncChapterArtifacts(input: ChapterArtifactDeltaSyncInput): Promise<ChapterArtifactDeltaSyncResult> {
    const content = compactText(input.content);
    if (!content) {
      throw new Error("章节正文为空，无法提取资产 delta。");
    }

    const [novel, chapter, chapters, characters, existingResources, payoffRows] = await Promise.all([
      prisma.novel.findUnique({
        where: { id: input.novelId },
        select: { title: true },
      }),
      prisma.chapter.findFirst({
        where: { id: input.chapterId, novelId: input.novelId },
        select: { id: true, order: true, title: true, expectation: true, taskSheet: true },
      }),
      prisma.chapter.findMany({
        where: { novelId: input.novelId },
        select: { id: true, order: true, title: true },
        orderBy: { order: "asc" },
      }),
      prisma.character.findMany({
        where: { novelId: input.novelId },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          name: true,
          role: true,
          castRole: true,
          currentGoal: true,
          currentState: true,
        },
      }),
      characterResourceLedgerService.listResources(input.novelId).catch(() => []),
      prisma.payoffLedgerItem.findMany({
        where: { novelId: input.novelId },
        orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
        select: {
          ledgerKey: true,
          title: true,
          currentStatus: true,
          summary: true,
          targetStartChapterOrder: true,
          targetEndChapterOrder: true,
          lastTouchedChapterOrder: true,
        },
        take: 30,
      }),
    ]);

    if (!novel || !chapter) {
      throw new Error("小说或章节不存在，无法提取资产 delta。");
    }

    const previousSnapshot = await stateService.getLatestSnapshotBeforeChapter(input.novelId, chapter.order);
    const contentHash = buildContentHash(content);
    const result = await runStructuredPrompt({
      asset: chapterArtifactDeltaPrompt,
      promptInput: {
        novelTitle: novel.title,
        chapterOrder: chapter.order,
        chapterTitle: chapter.title,
        chapterGoal: chapter.taskSheet?.trim() || chapter.expectation?.trim() || "无明确章节目标",
        characterRosterText: this.buildCharacterRosterText(characters),
        previousStateText: stringifyPreviousState(previousSnapshot),
        existingResourceText: stringifyChapterResourceText(existingResources),
        existingPayoffText: stringifyPayoffText(payoffRows),
        chapterContent: content,
      },
      options: {
        provider: input.provider,
        model: input.model,
        temperature: Math.min(input.temperature ?? 0.2, 0.4),
        novelId: input.novelId,
        chapterId: input.chapterId,
        stage: "chapter_artifact_delta",
      },
    });

    const output = result.output;
    const sourceType = input.sourceType?.trim() || ARTIFACT_DELTA_SOURCE_TYPE;
    const sourceStage = input.sourceStage ?? ARTIFACT_DELTA_SOURCE_STAGE;
    const sourceQuality = normalizeContentProvenance(input.contentProvenance);
    const concreteFactCount = await this.persistChapterSummaryAndFacts({
      novelId: input.novelId,
      chapterId: input.chapterId,
      chapterOrder: chapter.order,
      content,
      output,
    });
    const stateSnapshotId = output.syncPlan.stateSnapshot === "skip"
      ? null
      : await this.persistStateSnapshot({
        novelId: input.novelId,
        chapterId: input.chapterId,
        output,
      });

    const resourceProposals = output.syncPlan.characterResources === "skip"
      ? []
      : this.toCharacterResourceProposals({
        novelId: input.novelId,
        chapterId: input.chapterId,
        chapterOrder: chapter.order,
        sourceType,
        sourceStage,
        contentHash,
        sourceQuality,
        characters,
        updates: output.characterResourceDeltas,
      });

    const stateCommitResult = await stateCommitService.proposeAndCommit({
      novelId: input.novelId,
      chapterId: input.chapterId,
      chapterOrder: chapter.order,
      sourceType,
      sourceStage,
      contentProvenance: sourceQuality,
      proposals: resourceProposals,
    });
    const staleMarkedCount = await characterResourceStaleScanService.scanAfterChapter({
      novelId: input.novelId,
      chapterId: input.chapterId,
      chapterOrder: chapter.order,
    }).catch(() => 0);

    const [payoffDeltaCount, characterDynamicsCount, characterKnowledgeStateCount] = await Promise.all([
      output.syncPlan.payoffLedger === "skip"
        ? Promise.resolve(0)
        : this.applyPayoffDeltas({
          novelId: input.novelId,
          chapterId: input.chapterId,
          chapterOrder: chapter.order,
          chapterTitle: chapter.title,
          chapters,
          output,
          stateSnapshotId,
        }),
      output.syncPlan.characterDynamics === "skip"
        ? Promise.resolve(0)
        : this.applyCharacterDynamics({
          novelId: input.novelId,
          chapterId: input.chapterId,
          chapterOrder: chapter.order,
          characters,
          output,
        }),
      output.characterKnowledgeStates.length === 0
        ? Promise.resolve(0)
        : this.applyKnowledgeStates({
          characters,
          output,
        }),
    ]);

    return {
      contentHash,
      output,
      stateSnapshotId,
      characterResourceProposalCount: resourceProposals.length,
      characterDynamicsCount,
      characterKnowledgeStateCount,
      payoffDeltaCount,
      canonicalCommittedCount: stateCommitResult.committed.length,
      concreteFactCount,
      staleMarkedCount,
      requiresFullReconcile: output.requiresFullReconcile || output.syncPlan.payoffLedger === "full_reconcile",
    };
  }

  private buildCharacterRosterText(characters: CharacterLookupItem[]): string {
    return characters.map((character) => [
      `- ${character.id}`,
      character.name,
      character.role,
      character.castRole ? `cast=${character.castRole}` : "",
      character.currentGoal ? `goal=${character.currentGoal}` : "",
      character.currentState ? `state=${character.currentState}` : "",
    ].filter(Boolean).join(" | ")).join("\n");
  }

  private async persistChapterSummaryAndFacts(input: {
    novelId: string;
    chapterId: string;
    chapterOrder: number;
    content: string;
    output: ChapterArtifactDeltaOutput;
  }): Promise<number> {
    const summary = compactText(input.output.summary) || "暂无可总结正文";
    const extractedFacts = extractFacts(input.content || summary);
    const keyEvents = joinFactContents(
      extractedFacts.filter((item) => item.category === "plot").map((item) => item.content),
      3,
    );
    const characterStates = joinFactContents(
      extractedFacts.filter((item) => item.category === "character").map((item) => item.content),
      3,
    );
    await prisma.$transaction(async (tx) => {
      await tx.chapter.update({
        where: { id: input.chapterId },
        data: { expectation: summary },
      });
      await tx.chapterSummary.upsert({
        where: { chapterId: input.chapterId },
        update: {
          summary,
          keyEvents,
          characterStates,
        },
        create: {
          novelId: input.novelId,
          chapterId: input.chapterId,
          summary,
          keyEvents,
          characterStates,
        },
      });
    });

    const concreteFacts: NovelFactWriteItem[] = input.output.concreteFacts
      .map((fact) => ({
        text: compactText(fact.text),
        category: fact.category,
        source: "auto" as const,
      }))
      .filter((fact) => fact.text.length > 0);
    if (concreteFacts.length > 0) {
      await novelFactService.writeFacts(input.novelId, input.chapterOrder, concreteFacts);
    }

    this.queueRagUpsert("chapter", input.chapterId);
    this.queueRagUpsert("chapter_summary", input.chapterId);

    return concreteFacts.length;
  }

  private async persistStateSnapshot(input: {
    novelId: string;
    chapterId: string;
    output: ChapterArtifactDeltaOutput;
  }): Promise<string | null> {
    const state = input.output.stateDeltas;
    const extracted: SnapshotExtractionOutput = {
      summary: cleanOptionalText(state.summary) ?? input.output.summary,
      characterStates: state.characterStates.map((item) => ({
        characterId: cleanOptionalText(item.characterId),
        characterName: cleanOptionalText(item.characterName),
        currentGoal: cleanOptionalText(item.currentGoal),
        emotion: cleanOptionalText(item.emotion),
        stressLevel: typeof item.stressLevel === "number" ? item.stressLevel : undefined,
        secretExposure: cleanOptionalText(item.secretExposure),
        knownFacts: item.knownFacts,
        misbeliefs: item.misbeliefs,
        summary: cleanOptionalText(item.summary),
      })),
      relationStates: state.relationStates.map((item) => ({
        sourceCharacterId: cleanOptionalText(item.sourceCharacterId),
        sourceCharacterName: cleanOptionalText(item.sourceCharacterName),
        targetCharacterId: cleanOptionalText(item.targetCharacterId),
        targetCharacterName: cleanOptionalText(item.targetCharacterName),
        trustScore: typeof item.trustScore === "number" ? item.trustScore : undefined,
        intimacyScore: typeof item.intimacyScore === "number" ? item.intimacyScore : undefined,
        conflictScore: typeof item.conflictScore === "number" ? item.conflictScore : undefined,
        dependencyScore: typeof item.dependencyScore === "number" ? item.dependencyScore : undefined,
        summary: cleanOptionalText(item.summary),
      })),
      informationStates: state.informationStates.map((item) => ({
        holderType: item.holderType,
        holderRefId: cleanNullableText(item.holderRefId),
        holderRefName: cleanNullableText(item.holderRefName),
        fact: item.fact,
        status: item.status,
        summary: cleanOptionalText(item.summary),
      })),
      foreshadowStates: state.foreshadowStates.map((item) => ({
        title: item.title,
        summary: cleanOptionalText(item.summary),
        status: item.status,
        setupChapterId: cleanOptionalText(item.setupChapterId),
        payoffChapterId: cleanNullableText(item.payoffChapterId),
      })),
    };
    const snapshot = await stateService.persistExtractedChapterSnapshot({
      novelId: input.novelId,
      chapterId: input.chapterId,
      extracted,
      skipPayoffLedgerSync: true,
    });
    return snapshot?.id ?? null;
  }

  private toCharacterResourceProposals(input: {
    novelId: string;
    chapterId: string;
    chapterOrder: number;
    sourceType: string;
    sourceStage: string | null;
    contentHash: string;
    sourceQuality: ContentProvenance;
    characters: CharacterLookupItem[];
    updates: ChapterArtifactDeltaResourceUpdate[];
  }): StateChangeProposal[] {
    return input.updates.map((update) => {
      const holderCharacter = resolveCharacter(input.characters, update.holderCharacterName);
      const previousHolderCharacter = resolveCharacter(input.characters, update.previousHolderCharacterName);
      const knownByCharacterIds = update.knownByCharacterNames
        .map((name) => resolveCharacter(input.characters, name)?.id)
        .filter((id): id is string => Boolean(id));
      const ownerCharacter = update.ownerType === "character"
        ? resolveCharacter(input.characters, update.ownerName) ?? holderCharacter
        : null;
      const resourceKey = normalizeResourceKey({
        name: update.resourceName,
        holderCharacterId: holderCharacter?.id,
        ownerName: update.ownerName ?? null,
      });
      const proposal: StateChangeProposal = {
        novelId: input.novelId,
        chapterId: input.chapterId,
        sourceSnapshotId: null,
        sourceType: input.sourceType,
        sourceStage: input.sourceStage,
        proposalType: "character_resource_update",
        riskLevel: update.riskLevel,
        status: "validated",
        summary: `${update.resourceName} resource delta in chapter ${input.chapterOrder}`,
        payload: {
          resourceKey,
          resourceName: update.resourceName,
          chapterOrder: input.chapterOrder,
          resourceType: update.resourceType,
          narrativeFunction: update.narrativeFunction,
          updateType: update.updateType,
          ownerType: update.ownerType,
          ownerId: ownerCharacter?.id ?? null,
          ownerName: update.ownerName ?? update.holderCharacterName ?? null,
          holderCharacterId: holderCharacter?.id ?? null,
          holderCharacterName: holderCharacter?.name ?? update.holderCharacterName ?? null,
          previousHolderCharacterId: previousHolderCharacter?.id ?? null,
          statusAfter: update.statusAfter,
          visibilityAfter: {
            readerKnows: update.readerKnows,
            holderKnows: update.holderKnows,
            knownByCharacterIds,
          },
          summary: update.summary ?? undefined,
          narrativeImpact: update.narrativeImpact,
          expectedFutureUse: update.expectedFutureUse ?? null,
          expectedUseStartChapterOrder: update.expectedUseStartChapterOrder ?? null,
          expectedUseEndChapterOrder: update.expectedUseEndChapterOrder ?? null,
          constraints: update.constraints,
          confidence: update.confidence ?? null,
          syncContentHash: input.contentHash,
        },
        evidence: update.evidence,
        validationNotes: [update.riskReason ?? ""].filter(Boolean),
      };
      return attachProposalSourceQuality(proposal, input.sourceQuality);
    });
  }

  private async applyPayoffDeltas(input: {
    novelId: string;
    chapterId: string;
    chapterOrder: number;
    chapterTitle: string;
    chapters: ChapterReference[];
    output: ChapterArtifactDeltaOutput;
    stateSnapshotId: string | null;
  }): Promise<number> {
    if (input.output.payoffDeltas.length === 0) {
      return 0;
    }
    const now = new Date();
    await prisma.$transaction(async (tx) => {
      for (const item of input.output.payoffDeltas) {
        const ledgerKey = normalizeLedgerKey(item.ledgerKey, normalizeLedgerKey(item.title, `chapter_${input.chapterOrder}_payoff`));
        const previous = await tx.payoffLedgerItem.findUnique({
          where: {
            novelId_ledgerKey: {
              novelId: input.novelId,
              ledgerKey,
            },
          },
        });
        const setupChapterId = this.resolveChapterReference({
          value: item.setupChapterId ?? item.setupChapterOrder ?? item.firstSeenChapterOrder,
          chapters: input.chapters,
          currentChapterId: input.chapterId,
          fallbackToCurrentChapter: item.currentStatus === "setup" || item.currentStatus === "hinted",
        }) ?? previous?.setupChapterId ?? null;
        const payoffChapterId = this.resolveChapterReference({
          value: item.payoffChapterId ?? item.payoffChapterOrder,
          chapters: input.chapters,
          currentChapterId: input.chapterId,
          fallbackToCurrentChapter: item.currentStatus === "paid_off",
        }) ?? previous?.payoffChapterId ?? null;
        const lastTouchedChapterId = this.resolveChapterReference({
          value: item.lastTouchedChapterOrder,
          chapters: input.chapters,
          currentChapterId: input.chapterId,
          fallbackToCurrentChapter: true,
        }) ?? input.chapterId;
        const sourceRefs = item.sourceRefs.length > 0
          ? item.sourceRefs.map((ref) => ({
            ...ref,
            chapterId: ref.chapterId ?? lastTouchedChapterId,
            chapterOrder: ref.chapterOrder ?? input.chapterOrder,
          }))
          : [{
            kind: "chapter_payoff_ref" as const,
            refId: null,
            refLabel: `第${input.chapterOrder}章《${input.chapterTitle}》`,
            chapterId: input.chapterId,
            chapterOrder: input.chapterOrder,
            volumeId: null,
            volumeSortOrder: null,
          }];
        const evidence = item.evidence.length > 0
          ? item.evidence.map((evidenceItem) => ({
            ...evidenceItem,
            chapterId: evidenceItem.chapterId ?? input.chapterId,
            chapterOrder: evidenceItem.chapterOrder ?? input.chapterOrder,
          }))
          : [{
            summary: item.summary,
            chapterId: input.chapterId,
            chapterOrder: input.chapterOrder,
          }];
        const riskSignals = clearStaleRiskSignal(dedupeRiskSignals(item.riskSignals.map((signal) => ({
          code: signal.code,
          severity: signal.severity,
          summary: signal.summary,
        }))));
        await tx.payoffLedgerItem.upsert({
          where: {
            novelId_ledgerKey: {
              novelId: input.novelId,
              ledgerKey,
            },
          },
          create: {
            novelId: input.novelId,
            ledgerKey,
            title: item.title,
            summary: item.summary,
            scopeType: item.scopeType,
            currentStatus: item.currentStatus,
            targetStartChapterOrder: item.targetStartChapterOrder ?? null,
            targetEndChapterOrder: item.targetEndChapterOrder ?? null,
            firstSeenChapterOrder: item.firstSeenChapterOrder ?? input.chapterOrder,
            lastTouchedChapterOrder: item.lastTouchedChapterOrder ?? input.chapterOrder,
            lastTouchedChapterId,
            setupChapterId,
            payoffChapterId,
            lastSnapshotId: input.stateSnapshotId,
            sourceRefsJson: serializeLedgerJson(sourceRefs),
            evidenceJson: serializeLedgerJson(evidence),
            riskSignalsJson: serializeLedgerJson(riskSignals),
            statusReason: item.statusReason?.trim() || null,
            confidence: item.confidence ?? null,
            updatedAt: now,
          },
          update: {
            title: item.title,
            summary: item.summary,
            scopeType: item.scopeType,
            currentStatus: item.currentStatus,
            targetStartChapterOrder: item.targetStartChapterOrder ?? null,
            targetEndChapterOrder: item.targetEndChapterOrder ?? null,
            firstSeenChapterOrder: item.firstSeenChapterOrder ?? previous?.firstSeenChapterOrder ?? input.chapterOrder,
            lastTouchedChapterOrder: item.lastTouchedChapterOrder ?? input.chapterOrder,
            lastTouchedChapterId,
            setupChapterId,
            payoffChapterId,
            lastSnapshotId: input.stateSnapshotId ?? previous?.lastSnapshotId ?? null,
            sourceRefsJson: serializeLedgerJson(sourceRefs),
            evidenceJson: serializeLedgerJson(evidence),
            riskSignalsJson: serializeLedgerJson(riskSignals),
            statusReason: item.statusReason?.trim() || null,
            confidence: item.confidence ?? null,
            updatedAt: now,
          },
        });
      }
    });
    return input.output.payoffDeltas.length;
  }

  private resolveChapterReference(input: {
    value: unknown;
    chapters: ChapterReference[];
    currentChapterId: string;
    fallbackToCurrentChapter: boolean;
  }): string | null {
    return resolveSnapshotChapterReference(input);
  }

  private async applyCharacterDynamics(input: {
    novelId: string;
    chapterId: string;
    chapterOrder: number;
    characters: CharacterLookupItem[];
    output: ChapterArtifactDeltaOutput;
  }): Promise<number> {
    const characterByName = new Map(input.characters.map((item) => [normalizeName(item.name), item]));
    const [currentVolume, relations] = await Promise.all([
      prisma.volumePlan.findFirst({
        where: {
          novelId: input.novelId,
          chapters: {
            some: { chapterOrder: input.chapterOrder },
          },
        },
        select: { id: true },
      }),
      prisma.characterRelation.findMany({
        where: { novelId: input.novelId },
        select: {
          id: true,
          sourceCharacterId: true,
          targetCharacterId: true,
        },
      }),
    ]);
    const relationByPair = new Map(relations.map((relation) => [
      `${relation.sourceCharacterId}:${relation.targetCharacterId}`,
      relation,
    ]));

    let writeCount = 0;
    await prisma.$transaction(async (tx) => {
      await tx.characterCandidate.deleteMany({
        where: {
          novelId: input.novelId,
          sourceChapterId: input.chapterId,
          status: "pending",
        },
      });
      for (const candidate of input.output.characterCandidates) {
        const proposed = characterByName.get(normalizeName(candidate.proposedName));
        const matched = candidate.matchedCharacterName
          ? characterByName.get(normalizeName(candidate.matchedCharacterName))
          : proposed;
        if (matched) {
          continue;
        }
        await tx.characterCandidate.create({
          data: {
            novelId: input.novelId,
            sourceChapterId: input.chapterId,
            proposedName: candidate.proposedName,
            proposedRole: candidate.proposedRole || null,
            summary: candidate.summary || null,
            evidenceJson: JSON.stringify(Array.from(new Set(candidate.evidence))),
            matchedCharacterId: null,
            status: "pending",
            confidence: clampConfidence(candidate.confidence),
          },
        });
        writeCount += 1;
      }

      await tx.characterFactionTrack.deleteMany({
        where: {
          novelId: input.novelId,
          chapterId: input.chapterId,
          sourceType: ARTIFACT_DELTA_SOURCE_TYPE,
        },
      });
      for (const update of input.output.factionUpdates) {
        const character = characterByName.get(normalizeName(update.characterName));
        if (!character) {
          continue;
        }
        await tx.characterFactionTrack.create({
          data: {
            novelId: input.novelId,
            characterId: character.id,
            volumeId: currentVolume?.id ?? null,
            chapterId: input.chapterId,
            chapterOrder: input.chapterOrder,
            factionLabel: update.factionLabel,
            stanceLabel: update.stanceLabel || null,
            summary: update.summary || null,
            sourceType: ARTIFACT_DELTA_SOURCE_TYPE,
            confidence: clampConfidence(update.confidence),
          },
        });
        writeCount += 1;
      }

      await tx.characterRelationStage.deleteMany({
        where: {
          novelId: input.novelId,
          chapterId: input.chapterId,
          sourceType: ARTIFACT_DELTA_SOURCE_TYPE,
        },
      });
      for (const dynamic of input.output.relationDynamics) {
        const sourceCharacter = characterByName.get(normalizeName(dynamic.sourceCharacterName));
        const targetCharacter = characterByName.get(normalizeName(dynamic.targetCharacterName));
        if (!sourceCharacter || !targetCharacter || sourceCharacter.id === targetCharacter.id) {
          continue;
        }
        await tx.characterRelationStage.updateMany({
          where: {
            novelId: input.novelId,
            sourceCharacterId: sourceCharacter.id,
            targetCharacterId: targetCharacter.id,
            isCurrent: true,
          },
          data: { isCurrent: false },
        });
        const relation = relationByPair.get(`${sourceCharacter.id}:${targetCharacter.id}`) ?? null;
        await tx.characterRelationStage.create({
          data: {
            novelId: input.novelId,
            relationId: relation?.id ?? null,
            sourceCharacterId: sourceCharacter.id,
            targetCharacterId: targetCharacter.id,
            volumeId: currentVolume?.id ?? null,
            chapterId: input.chapterId,
            chapterOrder: input.chapterOrder,
            stageLabel: dynamic.stageLabel,
            stageSummary: dynamic.stageSummary,
            nextTurnPoint: dynamic.nextTurnPoint || null,
            sourceType: ARTIFACT_DELTA_SOURCE_TYPE,
            confidence: clampConfidence(dynamic.confidence),
            isCurrent: true,
          },
        });
        writeCount += 1;
      }
    });
    return writeCount;
  }

  private async applyKnowledgeStates(input: {
    characters: CharacterLookupItem[];
    output: ChapterArtifactDeltaOutput;
  }): Promise<number> {
    const characterByName = new Map(input.characters.map((item) => [normalizeName(item.name), item]));
    const updates = input.output.characterKnowledgeStates
      .map((state) => {
        const character = characterByName.get(normalizeName(state.characterName));
        const boundaryLine = buildKnowledgeBoundaryLine(state);
        if (!character || !boundaryLine) {
          return null;
        }
        const nextCurrentState = mergeKnowledgeBoundaryState(character.currentState, boundaryLine);
        if (nextCurrentState === (character.currentState ?? "")) {
          return null;
        }
        return {
          characterId: character.id,
          currentState: nextCurrentState,
        };
      })
      .filter((item): item is { characterId: string; currentState: string } => Boolean(item));
    if (updates.length === 0) {
      return 0;
    }

    await prisma.$transaction(async (tx) => {
      for (const update of updates) {
        await tx.character.update({
          where: { id: update.characterId },
          data: { currentState: update.currentState },
        });
      }
    });
    return updates.length;
  }

  private queueRagUpsert(ownerType: RagOwnerType, ownerId: string): void {
    void ragServices.ragIndexService.enqueueUpsert(ownerType, ownerId).catch(() => {
      // Keep artifact extraction resilient when RAG queueing fails.
    });
  }
}

export const chapterArtifactDeltaService = new ChapterArtifactDeltaService();
