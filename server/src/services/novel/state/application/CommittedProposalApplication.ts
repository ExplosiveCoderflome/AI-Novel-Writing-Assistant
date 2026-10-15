import type { StateChangeProposal } from "@ai-novel/shared/types/canonicalState";
import { characterResourceUpdatePayloadSchema } from "@ai-novel/shared/types/characterResource";
import type { Prisma } from "@prisma/client";
import { characterResourceLedgerService } from "../../characterResource/CharacterResourceLedgerService";
import { stateProposalStore } from "../persistence/StateProposalStore";
import { compactText, parseJsonRecord } from "../domain/StateProposalPolicy";

export async function applyCommittedProposal(
  tx: Prisma.TransactionClient,
  proposal: StateChangeProposal,
): Promise<void> {
  if (proposal.proposalType === "character_resource_update") {
    const payload = characterResourceUpdatePayloadSchema.safeParse(proposal.payload);
    if (!payload.success) {
      return;
    }
    await characterResourceLedgerService.applyCommittedUpdate(tx, {
      novelId: proposal.novelId,
      chapterId: proposal.chapterId ?? null,
      chapterOrder: typeof payload.data.chapterOrder === "number" ? payload.data.chapterOrder : null,
      payload: payload.data,
      evidence: proposal.evidence,
      validationNotes: proposal.validationNotes,
      riskLevel: proposal.riskLevel,
    });
    return;
  }

  if (proposal.proposalType !== "character_state_update") {
    return;
  }

  const payload = parseJsonRecord(proposal.payload);
  const characterId = typeof payload.characterId === "string" ? payload.characterId : "";
  if (!characterId) {
    return;
  }

  await stateProposalStore.updateCharacterState(characterId, {
    currentState: typeof payload.currentState === "string" ? compactText(payload.currentState) || null : null,
    currentGoal: typeof payload.currentGoal === "string" ? compactText(payload.currentGoal) || null : null,
  }, tx);
}
