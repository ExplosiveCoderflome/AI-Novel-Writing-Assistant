import type { Prisma } from "@prisma/client";
import { sanitizeCreativeMustAdvanceItems } from "@ai-novel/shared/types/chapterCreativeContract";
import { enrichStoryPlan } from "../plannerPlanMetadata";
import { buildPlanTaskSheet,buildPlanSceneCards,buildChapterExecutionContractHash,sanitizePlanText,type PersistPlanInput } from "./contract";

type Reader=Pick<Prisma.TransactionClient,"storyPlan">;
export function prepareStoryPlanRecord(input:PersistPlanInput) {
  const taskSheet = buildPlanTaskSheet(input);
  const sceneCards = buildPlanSceneCards(input);
  const executionContractHash = input.level === "chapter"
    ? buildChapterExecutionContractHash({
      ...(input.baseExecutionContract ?? {}),
      expectation: sanitizePlanText(input.objective) || null,
      targetWordCount: input.targetWordCount ?? input.baseExecutionContract?.targetWordCount ?? null,
      taskSheet: taskSheet ?? input.baseExecutionContract?.taskSheet ?? null,
      sceneCards: sceneCards ?? input.baseExecutionContract?.sceneCards ?? null,
      hook: sanitizePlanText(input.hookTarget) || null,
    })
    : null;
  const serializedRawPlan = JSON.stringify({
    ...input,
    status: input.status ?? "draft",
    mustAdvance: sanitizeCreativeMustAdvanceItems(input.mustAdvance),
    mustPreserve: input.mustPreserve,
    sourceIssueIds: input.sourceIssueIds,
    replannedFromPlanId: input.replannedFromPlanId,
    planRole: input.planRole,
    phaseLabel: input.phaseLabel,
    executionContractHash,
  });

  return {taskSheet,sceneCards,serializedRawPlan};
}

export async function findExistingStoryPlan(db:Reader,input:PersistPlanInput) {
  return input.level === "chapter" && input.chapterId
    ? await db.storyPlan.findFirst({
        where: { novelId: input.novelId, chapterId: input.chapterId, level: "chapter" },
        select: { id: true },
      })
    : input.level === "arc" && input.externalRef
      ? await db.storyPlan.findFirst({
          where: { novelId: input.novelId, level: "arc", externalRef: input.externalRef },
          select: { id: true },
        })
      : input.level === "book"
        ? await db.storyPlan.findFirst({
            where: { novelId: input.novelId, level: "book" },
            select: { id: true },
            orderBy: { updatedAt: "desc" },
          })
        : null;

}

export async function writePreparedStoryPlan(tx:Prisma.TransactionClient,input:PersistPlanInput,record:ReturnType<typeof prepareStoryPlanRecord>,existing:{id:string}|null) {
  const {taskSheet,sceneCards,serializedRawPlan}=record;
  const plan = existing
    ? await tx.storyPlan.update({
        where: { id: existing.id },
        data: {
          chapterId: input.chapterId ?? null,
          sourceStateSnapshotId: input.sourceStateSnapshotId ?? null,
          planRole: input.planRole ?? null,
          phaseLabel: input.phaseLabel ?? null,
          title: input.title,
          objective: input.objective,
          participantsJson: JSON.stringify(input.participants),
          revealsJson: JSON.stringify(input.reveals),
          riskNotesJson: JSON.stringify(input.riskNotes),
          mustAdvanceJson: JSON.stringify(sanitizeCreativeMustAdvanceItems(input.mustAdvance)),
          mustPreserveJson: JSON.stringify(input.mustPreserve),
          sourceIssueIdsJson: JSON.stringify(input.sourceIssueIds),
          replannedFromPlanId: input.replannedFromPlanId,
          hookTarget: input.hookTarget,
          status: input.status ?? "draft",
          externalRef: input.externalRef ?? null,
          rawPlanJson: serializedRawPlan,
        } as any,
        select: { id: true },
      })
    : await tx.storyPlan.create({
        data: {
          novelId: input.novelId,
          chapterId: input.chapterId ?? null,
          sourceStateSnapshotId: input.sourceStateSnapshotId ?? null,
          level: input.level,
          planRole: input.planRole ?? null,
          phaseLabel: input.phaseLabel ?? null,
          title: input.title,
          objective: input.objective,
          participantsJson: JSON.stringify(input.participants),
          revealsJson: JSON.stringify(input.reveals),
          riskNotesJson: JSON.stringify(input.riskNotes),
          mustAdvanceJson: JSON.stringify(sanitizeCreativeMustAdvanceItems(input.mustAdvance)),
          mustPreserveJson: JSON.stringify(input.mustPreserve),
          sourceIssueIdsJson: JSON.stringify(input.sourceIssueIds),
          replannedFromPlanId: input.replannedFromPlanId,
          hookTarget: input.hookTarget,
          status: input.status ?? "draft",
          externalRef: input.externalRef ?? null,
          rawPlanJson: serializedRawPlan,
        } as any,
        select: { id: true },
      });

  await tx.chapterPlanScene.deleteMany({ where: { planId: plan.id } });
  if (input.scenes.length > 0) {
    await tx.chapterPlanScene.createMany({
      data: input.scenes.map((scene, index) => ({
        planId: plan.id,
        sortOrder: index + 1,
        title: scene.title?.trim() || `Scene ${index + 1}`,
        objective: scene.objective?.trim() || null,
        conflict: scene.conflict?.trim() || null,
        reveal: scene.reveal?.trim() || null,
        emotionBeat: scene.emotionBeat?.trim() || null,
      })),
    });
  }

  if (input.level === "chapter" && input.chapterId) {
    const chapter = await tx.chapter.findUnique({
      where: { id: input.chapterId },
      select: {
        content: true,
        chapterStatus: true,
      },
    });
    if (chapter) {
      const hasContent = Boolean(chapter.content?.trim());
      const nextChapterStatus = !hasContent && (!chapter.chapterStatus || chapter.chapterStatus === "unplanned")
        ? "pending_generation"
        : undefined;
      await tx.chapter.update({
        where: { id: input.chapterId },
        data: {
          expectation: sanitizePlanText(input.objective) || undefined,
          taskSheet,
          sceneCards,
          hook: sanitizePlanText(input.hookTarget) || undefined,
          chapterStatus: nextChapterStatus,
        },
      });
    }
  }

  return plan.id;
}

export async function readSavedStoryPlan(db:Reader,planId:string) {
  const persistedPlan = await db.storyPlan.findUnique({
    where: { id: planId },
    include: {
      scenes: {
        orderBy: { sortOrder: "asc" },
      },
    },
  });
  if (!persistedPlan) {
    throw new Error("章节规划持久化失败。");
  }
  return enrichStoryPlan(persistedPlan as any);

}
