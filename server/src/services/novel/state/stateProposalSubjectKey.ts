import type { StateChangeProposal } from "@ai-novel/shared/types/canonicalState";
import type { PendingReviewAutoPromotionProposalType } from "./pendingReviewAutoPromotionPolicy";

function compactText(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function keyPart(value: unknown): string {
  return compactText(value).toLowerCase();
}

function isAutoPromotionProposalType(value: string): value is PendingReviewAutoPromotionProposalType {
  return value === "relation_state_update" || value === "information_disclosure";
}

export function buildStateProposalSubjectKey(
  proposal: Pick<StateChangeProposal, "proposalType" | "payload">,
): string | null {
  if (!isAutoPromotionProposalType(proposal.proposalType)) {
    return null;
  }
  if (proposal.proposalType === "relation_state_update") {
    const sourceCharacterId = keyPart(proposal.payload.sourceCharacterId);
    const targetCharacterId = keyPart(proposal.payload.targetCharacterId);
    if (!sourceCharacterId || !targetCharacterId) {
      return null;
    }
    return `relation_state_update:${sourceCharacterId}:${targetCharacterId}`;
  }

  const holderType = keyPart(proposal.payload.holderType);
  const holderRefId = keyPart(proposal.payload.holderRefId) || "global";
  const fact = keyPart(proposal.payload.fact);
  if (!holderType || !fact) {
    return null;
  }
  return `information_disclosure:${holderType}:${holderRefId}:${fact}`;
}

