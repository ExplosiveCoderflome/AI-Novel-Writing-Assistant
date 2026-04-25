import type {
  CharacterResourceEventType,
  CharacterResourceUpdatePayload,
} from "@ai-novel/shared/types/characterResource";
import type { StateChangeProposal } from "@ai-novel/shared/types/canonicalState";
import { characterResourceUpdatePayloadSchema } from "@ai-novel/shared/types/characterResource";
import { compactText } from "./characterResourceShared";

const HIGH_RISK_EVENTS = new Set<CharacterResourceEventType>(["lost", "consumed", "destroyed", "damaged"]);
const AUTO_DIRECTOR_RESOURCE_SOURCE_TYPES = new Set(["chapter_background_sync"]);

function parsePayload(proposal: StateChangeProposal): CharacterResourceUpdatePayload | null {
  const parsed = characterResourceUpdatePayloadSchema.safeParse(proposal.payload);
  return parsed.success ? parsed.data : null;
}

export class CharacterResourceValidationService {
  validateProposal(proposal: StateChangeProposal): StateChangeProposal {
    const payload = parsePayload(proposal);
    if (!payload) {
      return {
        ...proposal,
        status: "rejected",
        validationNotes: proposal.validationNotes.concat("invalid character resource payload"),
      };
    }

    if (!compactText(payload.resourceName) || !compactText(payload.narrativeImpact)) {
      return {
        ...proposal,
        status: "rejected",
        validationNotes: proposal.validationNotes.concat("missing resourceName or narrativeImpact"),
      };
    }

    if (proposal.evidence.length === 0) {
      return {
        ...proposal,
        status: "rejected",
        validationNotes: proposal.validationNotes.concat("missing evidence"),
      };
    }

    const lowConfidence = typeof payload.confidence === "number" && payload.confidence < 0.55;
    const highImpact = HIGH_RISK_EVENTS.has(payload.updateType)
      || payload.narrativeFunction === "hidden_card"
      || payload.statusAfter === "destroyed"
      || payload.statusAfter === "lost";

    if (proposal.riskLevel === "high" || lowConfidence || highImpact) {
      return {
        ...proposal,
        status: "pending_review",
        validationNotes: proposal.validationNotes.concat(
          lowConfidence ? "low confidence resource update" : "resource update requires manual review",
        ),
      };
    }

    if (proposal.riskLevel === "medium" && !AUTO_DIRECTOR_RESOURCE_SOURCE_TYPES.has(proposal.sourceType)) {
      return {
        ...proposal,
        status: "pending_review",
        validationNotes: proposal.validationNotes.concat("medium risk resource update"),
      };
    }

    return {
      ...proposal,
      status: "committed",
      validationNotes: proposal.riskLevel === "medium"
        ? proposal.validationNotes.concat("auto-committed background resource update")
        : proposal.validationNotes,
    };
  }
}

export const characterResourceValidationService = new CharacterResourceValidationService();
