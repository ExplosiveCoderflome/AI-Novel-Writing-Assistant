import type {
  ContentProvenance,
  StateChangeProposal,
} from "@ai-novel/shared/types/canonicalState";

export const DEBT_SOURCE_QUALITY_NOTE = "source_quality:debt";
export const DEBT_PENDING_REVIEW_NOTE = "quality debt source requires manual review";

export function normalizeContentProvenance(value: ContentProvenance | null | undefined): ContentProvenance {
  return value === "debt" ? "debt" : "confirmed";
}

export function appendUniqueValidationNotes(notes: string[], additions: string[]): string[] {
  const next = [...notes];
  const seen = new Set(next);
  for (const note of additions) {
    const normalized = note.replace(/\s+/g, " ").trim();
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    next.push(normalized);
  }
  return next;
}

export function resolveProposalSourceQuality(proposal: Pick<StateChangeProposal, "sourceQuality" | "validationNotes">): ContentProvenance {
  if (proposal.sourceQuality === "debt") {
    return "debt";
  }
  return proposal.validationNotes.some((note) => note === DEBT_SOURCE_QUALITY_NOTE)
    ? "debt"
    : "confirmed";
}

export function isDebtSourceProposal(proposal: Pick<StateChangeProposal, "sourceQuality" | "validationNotes">): boolean {
  return resolveProposalSourceQuality(proposal) === "debt";
}

export function attachProposalSourceQuality(
  proposal: StateChangeProposal,
  sourceQuality: ContentProvenance,
): StateChangeProposal {
  const resolvedQuality = sourceQuality === "debt" || isDebtSourceProposal(proposal)
    ? "debt"
    : "confirmed";
  if (resolvedQuality !== "debt") {
    return {
      ...proposal,
      sourceQuality: proposal.sourceQuality,
    };
  }
  return {
    ...proposal,
    sourceQuality: "debt",
    validationNotes: appendUniqueValidationNotes(proposal.validationNotes, [DEBT_SOURCE_QUALITY_NOTE]),
  };
}

export function markDebtSourcePendingReview(proposal: StateChangeProposal): StateChangeProposal {
  const withSourceQuality = attachProposalSourceQuality(proposal, "debt");
  return {
    ...withSourceQuality,
    status: "pending_review",
    validationNotes: appendUniqueValidationNotes(
      withSourceQuality.validationNotes,
      [DEBT_PENDING_REVIEW_NOTE],
    ),
  };
}
