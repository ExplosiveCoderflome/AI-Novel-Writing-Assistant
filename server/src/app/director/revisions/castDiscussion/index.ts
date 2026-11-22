import type { Prisma } from "@prisma/client";
import { castDraftSchema, castReplySchema, castProposalChanges } from "@ai-novel/shared/types/director/castReview/discussion";
import { prisma } from "../../../../db/prisma";
import { AppError } from "../../../../middleware/errorHandler";
import { runStructuredPrompt } from "../../../../prompting/core/promptRunner";
import { castReviewDialoguePrompt } from "../../../../prompting/prompts/novel/character/castReviewDialogue.prompt";
import { reviewConversationRouter, type Address } from "../discussion";

export { confirmedCastForPlanning } from "./planningContext";

async function read(db: Prisma.TransactionClient, {novelId, resourceId}: Address) {
  const character = await db.character.findFirst({ where: { novelId, id: resourceId },
    select: { name: true, role: true, background: true, personality: true, storyFunction: true, currentGoal: true } });
  if (!character) throw new AppError("在本书阵容中找不到这位角色。", 404);
  const {personality, currentGoal, storyFunction} = character;
  return {novelId, resourceId, character, base: {personality: personality ?? "", currentGoal: currentGoal ?? "", storyFunction: storyFunction ?? ""}};
}

export function castConversationRouter() {
  return reviewConversationRouter("/novels/:novelId/runs/:runId/cast-review/:version/characters/:resourceId/conversation", {
    artifact: "character_cast", scope: "director-cast", stage: "character_setup", progress: "正在读角色设定和你的想法…",
    draft: castDraftSchema, reply: castReplySchema, changes: castProposalChanges, read,
    async generate({novelId, resourceId, character}, draft, context, options) {
      const [cast, links] = await Promise.all([
        prisma.character.findMany({ where: { novelId }, orderBy: { id: "asc" }, select: { name: true, role: true, storyFunction: true } }),
        prisma.characterRelation.findMany({ where: { novelId, OR: [{sourceCharacterId: resourceId}, {targetCharacterId: resourceId}] },
          select: { sourceCharacter: { select: { name: true } }, targetCharacter: { select: { name: true } }, surfaceRelation: true, hiddenTension: true } }),
      ]);
      const relations = links.map(row => ({ source: row.sourceCharacter.name, target: row.targetCharacter.name, relation: row.surfaceRelation, tension: row.hiddenTension }));
      return (await runStructuredPrompt({ asset: castReviewDialoguePrompt, promptInput: {...context, character: {...character, ...draft}, cast, relations}, options })).output;
    },
  });
}
