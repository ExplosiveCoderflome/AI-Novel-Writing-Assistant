import { compact, type ConsumerWriter } from "./types";

export const writeDialogue: ConsumerWriter = async ({ tx, context, output }) => {
  const { novelId, chapterId, order } = context.run.progress.unit;
  const expired = await tx.characterDialogueInfluence.updateMany({ where: { novelId, status: "active", targetEndChapterOrder: { lt: order } }, data: { status: "expired" } });
  let count = 0;
  for (const update of output.characterDialogueInfluenceResolutions) {
    if (update.status !== "applied" || !update.evidence.some(evidence => compact(context.content).includes(compact(evidence)))) continue;
    const changed = await tx.characterDialogueInfluence.updateMany({ where: { id: update.influenceId, novelId, status: "active",
      targetStartChapterOrder: { lte: order }, targetEndChapterOrder: { gte: order } },
      data: { status: "applied", appliedAt: new Date(), resolvedChapterId: chapterId, resolutionEvidenceJson: JSON.stringify([...new Set(update.evidence)].slice(0, 3)) } });
    count += changed.count;
  }
  return { characterDialogueInfluenceExpiredCount: expired.count, characterDialogueInfluenceAppliedCount: count };
};
