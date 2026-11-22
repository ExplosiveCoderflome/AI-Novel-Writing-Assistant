import type { Prisma } from "@prisma/client";
import type { CharacterForwardPlanNotice } from "@ai-novel/shared/types/characterForwardAdjustment";
import { isCurrentV2ChapterProductionCompleted } from "../../production/completion";
import { CHAPTER_ARTIFACT_BOUNDARY_TYPE } from "../../runtime/artifactSync/ChapterArtifactSyncBoundary";
import { directorVolumeChapterPlanFilter } from "../../volume/directorVolumeChapterPlanScope";
import { readChapterAppearancePlans } from "../appearances/planning/chapterParticipation";

export async function readForwardChapterBoundary(db: Prisma.TransactionClient, novelId: string) {
  const chapters = await db.chapter.findMany({
    where: { novelId },
    select: {
      id: true, order: true, content: true, chapterStatus: true, generationState: true, riskFlags: true,
      artifactSyncCheckpoints: {
        where: { artifactType: CHAPTER_ARTIFACT_BOUNDARY_TYPE, status: "succeeded" },
        select: { contentHash: true, metadataJson: true },
      },
    },
  });
  const completed = new Set(chapters.filter(isCurrentV2ChapterProductionCompleted).map(chapter => chapter.order));
  let next = 1;
  while (completed.has(next)) next++;
  return { next, completed, chapters };
}

interface ForwardPlan extends CharacterForwardPlanNotice {
  updatedAt: Date;
}

async function readForwardPlans(
  db: Prisma.TransactionClient, novelId: string, boundary: Awaited<ReturnType<typeof readForwardChapterBoundary>>,
  from: number, characters: Array<{ id: string; name: string }>,
): Promise<ForwardPlan[]> {
  const [plans, { participants, initialPlans }] = await Promise.all([
    db.volumeChapterPlan.findMany({
      where: { volume: directorVolumeChapterPlanFilter(novelId), chapterOrder: { gte: from } },
      select: { id: true, chapterId: true, chapterOrder: true, title: true, updatedAt: true },
      orderBy: [{ chapterOrder: "asc" }, { id: "asc" }],
    }),
    readChapterAppearancePlans(novelId, db),
  ]);
  const chaptersByOrder = new Map(boundary.chapters.map(chapter => [chapter.order, chapter.id]));
  return plans.filter(plan => !boundary.completed.has(plan.chapterOrder)).flatMap(plan => {
    const chapterId = plan.chapterId ?? chaptersByOrder.get(plan.chapterOrder);
    const detailed = chapterId ? participants.get(chapterId) : null;
    const names = new Set(detailed?.names ?? []);
    const scheduled = new Set(initialPlans.get(plan.chapterOrder) ?? []);
    const characterIds = characters.filter(character => detailed ? names.has(character.name) : scheduled.has(character.id)).map(character => character.id);
    if (!characterIds.length) return [];
    const updatedAt = detailed && detailed.updatedAt > plan.updatedAt ? detailed.updatedAt : plan.updatedAt;
    return [{ planId: plan.id, chapterOrder: plan.chapterOrder, title: plan.title, characterIds, updatedAt }];
  });
}

function publicNotice({ planId, chapterOrder, title, characterIds }: ForwardPlan): CharacterForwardPlanNotice {
  return { planId, chapterOrder, title, characterIds };
}

export async function previewForwardPlans(
  db: Prisma.TransactionClient, novelId: string, boundary: Awaited<ReturnType<typeof readForwardChapterBoundary>>,
  character: { id: string; name: string },
) {
  return (await readForwardPlans(db, novelId, boundary, boundary.next, [character])).map(publicNotice);
}

export async function readCharacterForwardPlanNotices(db: Prisma.TransactionClient, novelId: string): Promise<CharacterForwardPlanNotice[]> {
  const changes = await db.characterForwardAdjustment.findMany({
    where: { novelId },
    select: { characterId: true, effectiveFromChapterOrder: true, createdAt: true, character: { select: { id: true, name: true } } },
  });
  if (!changes.length) return [];
  const characters = [...new Map(changes.map(change => [change.characterId, change.character])).values()];
  const byCharacter = new Map<string, typeof changes>();
  let from = Infinity;
  for (const change of changes) {
    const items = byCharacter.get(change.characterId) ?? [];
    items.push(change);
    byCharacter.set(change.characterId, items);
    from = Math.min(from, change.effectiveFromChapterOrder);
  }
  const boundary = await readForwardChapterBoundary(db, novelId);
  const plans = await readForwardPlans(db, novelId, boundary, from, characters);
  return plans.flatMap(plan => {
    const characterIds = plan.characterIds.filter(id => byCharacter.get(id)?.some(change => (
      change.effectiveFromChapterOrder <= plan.chapterOrder && change.createdAt > plan.updatedAt
    )));
    return characterIds.length ? [publicNotice({ ...plan, characterIds })] : [];
  });
}
