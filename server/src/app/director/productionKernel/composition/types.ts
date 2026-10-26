import type { PrismaClient } from "@prisma/client";
import type { StepContext } from "../../../../modules/director";
import type { ChapterStageServices, UnitRun, UnitRef } from "../../../../modules/production";
import type { createKernelOwnership } from "../execution/ownership";
import type { createKernelChapterBudget } from "../execution/chapterBudget";
import type { createKernelPromptPreparer } from "../prompts/preflight";

export interface NativeStageDependencies {
  db: PrismaClient;
  unit: UnitRef;
  context: StepContext;
  ownership: ReturnType<typeof createKernelOwnership>;
  preflight: ReturnType<typeof createKernelPromptPreparer>;
  budget: ReturnType<typeof createKernelChapterBudget>;
  fence(run: UnitRun): Promise<void>;
  readBaseline: ChapterStageServices["readBaseline"];
}
