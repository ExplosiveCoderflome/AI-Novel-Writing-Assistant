import type { DirectorPlanBlueprint } from "@ai-novel/shared/types/novelDirector";
import { prisma } from "../../../db/prisma";

function buildOutlineText(blueprint: DirectorPlanBlueprint): string {
  return [
    `全书目标：${blueprint.bookPlan.objective}`,
    blueprint.bookPlan.hookTarget ? `总钩子：${blueprint.bookPlan.hookTarget}` : "",
    ...blueprint.arcs.map((arc, arcIndex) => [
      `第 ${arcIndex + 1} 幕：${arc.title}`,
      `阶段作用：${arc.summary}`,
      ...arc.chapters.map((chapter, chapterIndex) => `  ${chapterIndex + 1}. ${chapter.title}：${chapter.expectation}`),
    ].join("\n")),
  ].filter(Boolean).join("\n\n");
}

export async function persistDirectorBlueprint(novelId: string, blueprint: DirectorPlanBlueprint) {
  const outline = buildOutlineText(blueprint);
  return prisma.$transaction(async (tx) => {
    const book = await tx.storyPlan.create({
      data: {
        novelId,
        level: "book",
        title: blueprint.bookPlan.title,
        objective: blueprint.bookPlan.objective,
        participantsJson: JSON.stringify(blueprint.bookPlan.participants),
        revealsJson: JSON.stringify(blueprint.bookPlan.reveals),
        riskNotesJson: JSON.stringify(blueprint.bookPlan.riskNotes),
        hookTarget: blueprint.bookPlan.hookTarget ?? null,
        status: "seeded",
        rawPlanJson: JSON.stringify({
          source: "director_confirm",
          level: "book",
          ...blueprint.bookPlan,
        }),
      },
      include: {
        scenes: {
          orderBy: { sortOrder: "asc" },
        },
      },
    });

    const arcs = [];
    const chapters = [];
    let order = 1;

    for (const [arcIndex, arc] of blueprint.arcs.entries()) {
      const arcPlan = await tx.storyPlan.create({
        data: {
          novelId,
          parentId: book.id,
          level: "arc",
          title: arc.title,
          objective: arc.objective,
          participantsJson: JSON.stringify(arc.participants),
          revealsJson: JSON.stringify(arc.reveals),
          riskNotesJson: JSON.stringify(arc.riskNotes),
          hookTarget: arc.hookTarget ?? null,
          status: "seeded",
          externalRef: `director-arc-${arcIndex + 1}`,
          rawPlanJson: JSON.stringify({
            source: "director_confirm",
            level: "arc",
            summary: arc.summary,
            phaseLabel: arc.phaseLabel,
          }),
        },
        include: {
          scenes: {
            orderBy: { sortOrder: "asc" },
          },
        },
      });
      arcs.push(arcPlan);

      for (const chapter of arc.chapters) {
        const createdChapter = await tx.chapter.create({
          data: {
            novelId,
            order,
            title: chapter.title,
            content: "",
            expectation: chapter.expectation,
            hook: chapter.hookTarget ?? null,
            chapterStatus: "unplanned",
          },
          select: {
            id: true,
          },
        });

        const chapterPlan = await tx.storyPlan.create({
          data: {
            novelId,
            chapterId: createdChapter.id,
            parentId: arcPlan.id,
            level: "chapter",
            title: chapter.title,
            objective: chapter.objective,
            participantsJson: JSON.stringify(chapter.participants),
            revealsJson: JSON.stringify(chapter.reveals),
            riskNotesJson: JSON.stringify(chapter.riskNotes),
            hookTarget: chapter.hookTarget ?? null,
            status: "seeded",
            rawPlanJson: JSON.stringify({
              source: "director_confirm",
              level: "chapter",
              phaseLabel: arc.phaseLabel,
              planRole: chapter.planRole,
              expectation: chapter.expectation,
            }),
          },
          include: {
            scenes: {
              orderBy: { sortOrder: "asc" },
            },
          },
        });

        if (chapter.scenes.length > 0) {
          await tx.chapterPlanScene.createMany({
            data: chapter.scenes.map((scene, index) => ({
              planId: chapterPlan.id,
              sortOrder: index + 1,
              title: scene.title,
              objective: scene.objective,
              conflict: scene.conflict ?? null,
              reveal: scene.reveal ?? null,
              emotionBeat: scene.emotionBeat ?? null,
            })),
          });
        }

        const refreshedChapterPlan = await tx.storyPlan.findUniqueOrThrow({
          where: { id: chapterPlan.id },
          include: {
            scenes: {
              orderBy: { sortOrder: "asc" },
            },
          },
        });
        chapters.push(refreshedChapterPlan);
        order += 1;
      }
    }

    await tx.novel.update({
      where: { id: novelId },
      data: {
        outline,
        storylineStatus: "in_progress",
        outlineStatus: "in_progress",
        projectStatus: "in_progress",
      },
    });

    return {
      book,
      arcs,
      chapters,
      outline,
    };
  });
}

export function toDirectorPlanDigest(plan: {
  id: string;
  level: string;
  title: string;
  objective: string;
  chapterId?: string | null;
  externalRef?: string | null;
  rawPlanJson?: string | null;
}) {
  return {
    level: plan.level as "book" | "arc" | "chapter",
    id: plan.id,
    title: plan.title,
    objective: plan.objective,
    chapterId: plan.chapterId ?? null,
    externalRef: plan.externalRef ?? null,
    rawPlanJson: plan.rawPlanJson ?? null,
  };
}
