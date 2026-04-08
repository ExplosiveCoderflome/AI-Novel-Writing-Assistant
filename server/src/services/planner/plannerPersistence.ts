import { prisma } from "../../db/prisma";
import { enrichStoryPlan } from "./plannerPlanMetadata";

interface PersistPlanInput {
  novelId: string;
  chapterId?: string;
  sourceStateSnapshotId?: string | null;
  level: "book" | "arc" | "chapter";
  status?: string | null;
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

function sanitizePlanText(value?: string | null): string {
  return (value ?? "").trim();
}

function buildPlanTaskSheet(input: PersistPlanInput): string | undefined {
  const lines: string[] = [];
  const objective = sanitizePlanText(input.objective);
  const hookTarget = sanitizePlanText(input.hookTarget);
  const participants = input.participants.map((item) => sanitizePlanText(item)).filter(Boolean);
  const mustAdvance = input.mustAdvance.map((item) => sanitizePlanText(item)).filter(Boolean);
  const mustPreserve = input.mustPreserve.map((item) => sanitizePlanText(item)).filter(Boolean);
  const riskNotes = input.riskNotes.map((item) => sanitizePlanText(item)).filter(Boolean);

  if (objective) {
    lines.push(`章节目标：${objective}`);
  }
  if (participants.length > 0) {
    lines.push(`关键角色：${participants.join("、")}`);
  }
  if (mustAdvance.length > 0) {
    lines.push("必须推进：");
    lines.push(...mustAdvance.map((item) => `- ${item}`));
  }
  if (mustPreserve.length > 0) {
    lines.push("必须保留：");
    lines.push(...mustPreserve.map((item) => `- ${item}`));
  }
  if (riskNotes.length > 0) {
    lines.push("风险提醒：");
    lines.push(...riskNotes.map((item) => `- ${item}`));
  }
  if (hookTarget) {
    lines.push(`收尾钩子：${hookTarget}`);
  }

  return lines.length > 0 ? lines.join("\n") : undefined;
}

function buildPlanSceneCards(input: PersistPlanInput): string | undefined {
  const blocks = input.scenes
    .map((scene, index) => {
      const title = sanitizePlanText(scene.title) || `Scene ${index + 1}`;
      const objective = sanitizePlanText(scene.objective);
      const conflict = sanitizePlanText(scene.conflict);
      const reveal = sanitizePlanText(scene.reveal);
      const emotionBeat = sanitizePlanText(scene.emotionBeat);
      return [
        `场景${index + 1}：${title}`,
        objective ? `目标：${objective}` : "",
        conflict ? `冲突：${conflict}` : "",
        reveal ? `揭示：${reveal}` : "",
        emotionBeat ? `情绪：${emotionBeat}` : "",
      ].filter(Boolean).join("\n");
    })
    .filter(Boolean);

  return blocks.length > 0 ? blocks.join("\n\n") : undefined;
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
    status: input.status ?? "draft",
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
            mustAdvanceJson: JSON.stringify(input.mustAdvance),
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
            taskSheet: buildPlanTaskSheet(input),
            sceneCards: buildPlanSceneCards(input),
            hook: sanitizePlanText(input.hookTarget) || undefined,
            chapterStatus: nextChapterStatus,
          },
        });
      }
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
