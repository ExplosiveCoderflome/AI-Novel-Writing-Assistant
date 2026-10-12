import type { BookContractDraft } from "@ai-novel/shared/types/novelWorkflow";

export function normalizeBookContract(parsed: BookContractDraft): BookContractDraft {
  return {
    readingPromise: parsed.readingPromise.trim(),
    protagonistFantasy: parsed.protagonistFantasy.trim(),
    coreSellingPoint: parsed.coreSellingPoint.trim(),
    chapter3Payoff: parsed.chapter3Payoff.trim(),
    chapter10Payoff: parsed.chapter10Payoff.trim(),
    chapter30Payoff: parsed.chapter30Payoff.trim(),
    escalationLadder: parsed.escalationLadder.trim(),
    relationshipMainline: parsed.relationshipMainline.trim(),
    absoluteRedLines: Array.from(
      new Set(parsed.absoluteRedLines.map((item) => item.trim()).filter(Boolean)),
    ).slice(0, 6),
  };
}
