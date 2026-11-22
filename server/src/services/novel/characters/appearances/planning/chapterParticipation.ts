import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { initialScheduleByOrder, readInitialScheduleDocument } from "./InitialScheduleDocument";

export async function readChapterAppearancePlans(novelId: string, db: Prisma.TransactionClient) {
  const [plans, initialSnapshot] = await Promise.all([
    db.storyPlan.findMany({
      where: { novelId, level: "chapter", status: { not: "stale" }, participantsJson: { not: null }, chapter: { novelId } },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      select: { chapterId: true, participantsJson: true, updatedAt: true },
    }),
    readInitialScheduleDocument(novelId, db),
  ]);
  const participants = new Map<string, { names: string[]; updatedAt: Date }>();
  for (const plan of plans) {
    if (!plan.chapterId || participants.has(plan.chapterId)) continue;
    try {
      const names = z.array(z.string()).parse(JSON.parse(plan.participantsJson ?? "[]"));
      participants.set(plan.chapterId, { names, updatedAt: plan.updatedAt });
    } catch { /* An invalid detailed plan does not erase the initial schedule. */ }
  }
  const initialPlans = initialScheduleByOrder(initialSnapshot?.document ?? null);
  return { participants, initialPlans };
}
