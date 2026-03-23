import { prisma } from "../../db/prisma";
import { enrichStoryPlan } from "./plannerPlanMetadata";

interface PersistPlanInput {
  novelId: string;
  chapterId?: string;
  sourceStateSnapshotId?: string | null;
  level: "book" | "arc" | "chapter";
  planRole?: string | null;
  phaseLabel?: string | null;
  title: string;
  objective: string;
  participants: string[];
  reveals: string[];
  riskNotes: string[];
  mustAdvance: string[];
  mustPreserve: string[];
  sourceIssueIds: string[];
  replannedFromPlanId: string | null;
  hookTarget: string | null;
  scenes: Array<{
    title?: string;
    objective?: string;
    conflict?: string;
    reveal?: string;
    emotionBeat?: string;
  }>;
  externalRef?: string;
}

export async function persistStoryPlan(input: PersistPlanInput) {
  const existing = input.level === "chapter" && input.chapterId
    ? await prisma.storyPlan.findFirst({
        where: { novelId: input.novelId, chapterId: input.chapterId, level: "chapter" },
        select: { id: true },
      })
    : input.level === "arc" && input.externalRef
      ? await prisma.storyPlan.findFirst({
          where: { novelId: input.novelId, level: "arc", externalRef: input.externalRef },
          select: { id: true },
        })
      : input.level === "book"
        ? await prisma.storyPlan.findFirst({
            where: { novelId: input.novelId, level: "book" },
            select: { id: true },
            orderBy: { updatedAt: "desc" },
          })
        : null;

  const serializedRawPlan = JSON.stringify({
    ...input,
    mustAdvance: input.mustAdvance,
    mustPreserve: input.mustPreserve,
    sourceIssueIds: input.sourceIssueIds,
    replannedFromPlanId: input.replannedFromPlanId,
    planRole: input.planRole,
    phaseLabel: input.phaseLabel,
  });

  const planId = await prisma.$transaction(async (tx) => {
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
            mustAdvanceJson: JSON.stringify(input.mustAdvance),
            mustPreserveJson: JSON.stringify(input.mustPreserve),
            sourceIssueIdsJson: JSON.stringify(input.sourceIssueIds),
            replannedFromPlanId: input.replannedFromPlanId,
            hookTarget: input.hookTarget,
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
            mustAdvanceJson: JSON.stringify(input.mustAdvance),
            mustPreserveJson: JSON.stringify(input.mustPreserve),
            sourceIssueIdsJson: JSON.stringify(input.sourceIssueIds),
            replannedFromPlanId: input.replannedFromPlanId,
            hookTarget: input.hookTarget,
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
    return plan.id;
  });

  const persistedPlan = await prisma.storyPlan.findUnique({
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
