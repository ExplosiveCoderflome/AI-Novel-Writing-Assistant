import { prisma } from "../../../db/prisma";
import { parseJsonStringArray } from "../../novel/novelP0Utils";
import { enrichStoryPlan } from "../plannerPlanMetadata";

export class PlannerPlanQueryService {
  async getChapterPlan(novelId: string, chapterId: string) {
    const plan = await prisma.storyPlan.findFirst({
      where: { novelId, chapterId, level: "chapter", status: { not: "stale" } },
      include: {
        scenes: {
          orderBy: { sortOrder: "asc" },
        },
      },
      orderBy: { updatedAt: "desc" },
    });
    return plan ? enrichStoryPlan(plan as any) : null;
  }

  async getBookPlan(novelId: string) {
    const plan = await prisma.storyPlan.findFirst({
      where: { novelId, level: "book" },
      include: {
        scenes: {
          orderBy: { sortOrder: "asc" },
        },
      },
      orderBy: { updatedAt: "desc" },
    });
    return plan ? enrichStoryPlan(plan as any) : null;
  }

  async listArcPlans(novelId: string) {
    const plans = await prisma.storyPlan.findMany({
      where: { novelId, level: "arc" },
      include: {
        scenes: {
          orderBy: { sortOrder: "asc" },
        },
      },
      orderBy: [
        { updatedAt: "desc" },
        { createdAt: "desc" },
      ],
      take: 6,
    });
    return plans.map((plan) => enrichStoryPlan(plan as any));
  }

  async buildPlanPromptBlock(novelId: string, chapterId: string): Promise<string> {
    const plan = await this.getChapterPlan(novelId, chapterId);
    if (!plan) {
      return "";
    }
    const participants = parseJsonStringArray(plan.participantsJson);
    const reveals = parseJsonStringArray(plan.revealsJson);
    const riskNotes = parseJsonStringArray(plan.riskNotesJson);
    const sceneLines = plan.scenes
      .map((scene: (typeof plan.scenes)[number]) => `${scene.sortOrder}. ${scene.title}${scene.objective ? ` | 目标:${scene.objective}` : ""}${scene.conflict ? ` | 冲突:${scene.conflict}` : ""}${scene.reveal ? ` | 揭露:${scene.reveal}` : ""}${scene.emotionBeat ? ` | 情绪:${scene.emotionBeat}` : ""}`)
      .join("\n");
    return [
      `Plan title: ${plan.title}`,
      plan.planRole ? `Plan role: ${plan.planRole}` : "",
      plan.phaseLabel ? `Phase: ${plan.phaseLabel}` : "",
      `Objective: ${plan.objective}`,
      participants.length > 0 ? `Participants: ${participants.join("、")}` : "",
      reveals.length > 0 ? `Key reveals: ${reveals.join("；")}` : "",
      riskNotes.length > 0 ? `Risk notes: ${riskNotes.join("；")}` : "",
      plan.mustAdvanceJson ? `Must advance: ${parseJsonStringArray(plan.mustAdvanceJson).join("；")}` : "",
      plan.mustPreserveJson ? `Must preserve: ${parseJsonStringArray(plan.mustPreserveJson).join("；")}` : "",
      plan.hookTarget ? `Hook target: ${plan.hookTarget}` : "",
      sceneLines ? `Scenes:\n${sceneLines}` : "",
    ].filter(Boolean).join("\n");
  }
}

export const plannerPlanQueryService = new PlannerPlanQueryService();
