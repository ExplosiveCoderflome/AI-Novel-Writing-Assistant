import type { StateChangeProposal } from "@ai-novel/shared/types/canonicalState";
import { buildChapterArtifactContentHash } from "../../runtime/artifactSync/contracts";
import { characterResourceValidationService } from "../../characterResource/CharacterResourceValidationService";
import { attachProposalSourceQuality, isDebtSourceProposal, markDebtSourcePendingReview, resolveProposalSourceQuality } from "../stateProposalSourceQuality";

const AUTO_COMMIT_TYPES = new Set<StateChangeProposal["proposalType"]>([
  "event_record",
  "character_state_update",
  "payoff_progression",
  "conflict_update",
  "character_resource_update",
]);

const ALWAYS_REVIEW_TYPES = new Set<StateChangeProposal["proposalType"]>([
  "relation_state_update",
  "information_disclosure",
  "world_rule_change",
  "book_contract_change",
]);

export function compactText(value: string | null | undefined): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

export function parseJsonRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export function buildVersionSummary(
  chapterOrder: number | undefined,
  committed: StateChangeProposal[],
): string {
  const label = typeof chapterOrder === "number" ? `chapter ${chapterOrder}` : "novel";
  const typeSummary = Array.from(
    committed.reduce((accumulator, proposal) => {
      accumulator.set(
        proposal.proposalType,
        (accumulator.get(proposal.proposalType) ?? 0) + 1,
      );
      return accumulator;
    }, new Map<string, number>()),
  )
    .map(([proposalType, count]) => `${proposalType} x${count}`)
    .join(", ");
  return typeSummary ? `${label} committed ${typeSummary}` : `${label} canonical state refreshed`;
}

export function validateStateProposals(proposals: StateChangeProposal[], artifactReview?: {
  review: { approvedResourceKeys: readonly string[]; pendingResourceKeys: readonly string[] };
  novelId: string; chapterId?: string | null; content?: string;
}): {
  accepted: StateChangeProposal[];
  pendingReview: StateChangeProposal[];
  rejected: StateChangeProposal[];
} {
  const accepted: StateChangeProposal[] = [];
  const pendingReview: StateChangeProposal[] = [];
  const rejected: StateChangeProposal[] = [];

  for (const proposal of proposals) {
    const normalized = {
      ...proposal,
      summary: compactText(proposal.summary),
      evidence: proposal.evidence.map((item) => compactText(item)).filter(Boolean),
      validationNotes: proposal.validationNotes.map((item) => compactText(item)).filter(Boolean),
    } satisfies StateChangeProposal;
    const sourceNormalized = attachProposalSourceQuality(
      normalized,
      resolveProposalSourceQuality(normalized),
    );

    if (!sourceNormalized.summary) {
      rejected.push({
        ...sourceNormalized,
        status: "rejected",
        validationNotes: sourceNormalized.validationNotes.concat("missing summary"),
      });
      continue;
    }

    if (sourceNormalized.proposalType === "character_resource_update") {
      const key = String(sourceNormalized.payload.resourceKey ?? "");
      const currentVersion = artifactReview && artifactReview.content !== undefined
        && sourceNormalized.novelId === artifactReview.novelId && sourceNormalized.chapterId === artifactReview.chapterId
        && sourceNormalized.payload.syncContentHash === buildChapterArtifactContentHash(artifactReview.content);
      if (artifactReview && !currentVersion) {
        rejected.push({...sourceNormalized, status: "rejected", validationNotes: sourceNormalized.validationNotes.concat("artifact_resource_review:stale_or_foreign_source")});
        continue;
      }
      const evidenceSupported = artifactReview?.content !== undefined && sourceNormalized.evidence.some(
        evidence => compactText(artifactReview.content).includes(evidence),
      );
      const approved = Boolean(currentVersion && evidenceSupported && artifactReview?.review.approvedResourceKeys.includes(key));
      let resourceValidation = characterResourceValidationService.validateProposal(sourceNormalized, {automaticReviewApproved: approved});
      if (artifactReview && resourceValidation.status !== "rejected"
        && (artifactReview.review.pendingResourceKeys.includes(key) || !approved)) {
        resourceValidation = {...resourceValidation, status: "pending_review", validationNotes: resourceValidation.validationNotes.concat("artifact_resource_review:hold")};
      }
      if (resourceValidation.status === "committed") {
        accepted.push(resourceValidation);
      } else if (resourceValidation.status === "pending_review") {
        pendingReview.push(resourceValidation);
      } else {
        rejected.push(resourceValidation);
      }
      continue;
    }

    if (sourceNormalized.proposalType === "character_state_update") {
      const payload = parseJsonRecord(sourceNormalized.payload);
      if (typeof payload.characterId !== "string" || !compactText(payload.characterId)) {
        rejected.push({
          ...sourceNormalized,
          status: "rejected",
          validationNotes: sourceNormalized.validationNotes.concat("missing characterId"),
        });
        continue;
      }
    }

    const supportedProposalType = AUTO_COMMIT_TYPES.has(sourceNormalized.proposalType)
      || ALWAYS_REVIEW_TYPES.has(sourceNormalized.proposalType);
    if (!supportedProposalType) {
      rejected.push({
        ...sourceNormalized,
        status: "rejected",
        validationNotes: sourceNormalized.validationNotes.concat("unsupported proposal type"),
      });
      continue;
    }

    if (isDebtSourceProposal(sourceNormalized)) {
      pendingReview.push(markDebtSourcePendingReview(sourceNormalized));
      continue;
    }

    if (ALWAYS_REVIEW_TYPES.has(sourceNormalized.proposalType) || sourceNormalized.riskLevel === "high") {
      pendingReview.push({
        ...sourceNormalized,
        status: "pending_review",
        validationNotes: sourceNormalized.validationNotes.concat("requires manual review"),
      });
      continue;
    }

    accepted.push({
      ...sourceNormalized,
      status: "committed",
    });
  }

  return { accepted, pendingReview, rejected };
}
