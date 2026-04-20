import type {
  CanonicalStateSnapshot,
  GenerationNextAction,
  NovelControlPolicy,
} from "@ai-novel/shared/types/canonicalState";

export interface GenerationDecisionInput {
  snapshot: CanonicalStateSnapshot;
  policy?: Partial<NovelControlPolicy> | null;
  pendingReviewProposalCount?: number;
  openAuditIssueCount?: number;
  hasRepairableDraft?: boolean;
}

export class GenerationDecisionEngine {
  decideNextAction(input: GenerationDecisionInput): GenerationNextAction {
    if ((input.pendingReviewProposalCount ?? 0) > 0) {
      return "hold_for_review";
    }

    if ((input.openAuditIssueCount ?? 0) > 0 && input.hasRepairableDraft) {
      return "repair_existing_chapter";
    }

    if (input.snapshot.narrative.overduePayoffs.length > 0) {
      return "replan";
    }

    if (
      input.snapshot.narrative.urgentPayoffs.length > 0
      && !input.snapshot.narrative.currentChapterGoal?.trim()
    ) {
      return "advance_payoff";
    }

    if (input.snapshot.characters.length === 0) {
      return "refresh_character_state";
    }

    if (
      input.snapshot.narrative.openConflicts.length > 0
      && !input.snapshot.narrative.currentChapterGoal?.trim()
    ) {
      return "repair_chapter_mission";
    }

    if (input.policy?.advanceMode === "stage_review" && input.snapshot.narrative.overduePayoffs.length > 0) {
      return "hold_for_review";
    }

    return "write_chapter";
  }
}

export const generationDecisionEngine = new GenerationDecisionEngine();
