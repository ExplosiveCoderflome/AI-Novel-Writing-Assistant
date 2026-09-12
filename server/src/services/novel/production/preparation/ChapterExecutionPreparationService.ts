import { buildDirectorCompletionProfile } from "@ai-novel/shared/types/directorCompletion";
import { prisma } from "../../../../db/prisma";
import { plannerService } from "../../../planner/PlannerService";
import { ChapterPlanJITService, type ChapterPlanJITDeps } from "../../planning/ChapterPlanJITService";
import { ChapterRouteWindowService } from "../../planning/ChapterRouteWindowService";
import type { ChapterRuntimeRequestInput } from "../../runtime/chapterRuntimeSchema";
import { NovelVolumeService } from "../../volume/NovelVolumeService";

export interface ChapterExecutionPreparationResult {
  status: "ready";
  mode: "manual" | "full_book_autopilot";
  planId: string;
  preparedArtifacts: Array<"chapter_execution_contract" | "chapter_plan">;
}

export interface ChapterExecutionPreparationServiceDeps {
  chapterPlanJITService: Pick<ChapterPlanJITService, "ensureExecutionReady">;
  planner: Pick<typeof plannerService, "ensureChapterPlan">;
  loadEstimatedChapterCount: (novelId: string) => Promise<number | null>;
}

/** Owns every planning write that must finish before context assembly starts. */
export class ChapterExecutionPreparationService {
  constructor(private readonly deps: ChapterExecutionPreparationServiceDeps) {}

  async prepare(
    novelId: string,
    chapterId: string,
    request: ChapterRuntimeRequestInput,
  ): Promise<ChapterExecutionPreparationResult> {
    const isAutopilot = request.controlPolicy?.advanceMode === "full_book_autopilot";
    const preparedArtifacts: ChapterExecutionPreparationResult["preparedArtifacts"] = [];
    if (isAutopilot) {
      const estimatedChapterCount = await this.deps.loadEstimatedChapterCount(novelId);
      await this.deps.chapterPlanJITService.ensureExecutionReady(novelId, chapterId, {
        min: 3,
        target: 5,
        provider: request.provider,
        model: request.model,
        temperature: request.temperature,
        taskId: request.workflowTaskId,
        completionProfile: buildDirectorCompletionProfile(estimatedChapterCount ?? 80),
      });
      preparedArtifacts.push("chapter_execution_contract");
    }
    const plan = await this.deps.planner.ensureChapterPlan(novelId, chapterId, request);
    preparedArtifacts.push("chapter_plan");
    return {
      status: "ready",
      mode: isAutopilot ? "full_book_autopilot" : "manual",
      planId: plan.id,
      preparedArtifacts,
    };
  }
}

export function createChapterExecutionPreparationService(input: {
  ensureChapterExecutionContract?: ChapterPlanJITDeps["ensureChapterExecutionContract"];
} = {}): ChapterExecutionPreparationService {
  const volumeService = new NovelVolumeService();
  const routeWindowService = new ChapterRouteWindowService(volumeService);
  const chapterPlanJITService = new ChapterPlanJITService({
    ensureChapterExecutionContract: input.ensureChapterExecutionContract ?? ((novelId, chapterId, options) => (
      volumeService.ensureChapterExecutionContract(novelId, chapterId, options)
    )),
    ensureRouteWindow: (novelId, fromChapterOrder, options) => (
      routeWindowService.ensureRouteWindow(novelId, fromChapterOrder, options)
    ),
  });
  return new ChapterExecutionPreparationService({
    chapterPlanJITService,
    planner: plannerService,
    loadEstimatedChapterCount: async (novelId) => {
      const novel = await prisma.novel.findUnique({
        where: { id: novelId },
        select: { estimatedChapterCount: true },
      });
      return novel?.estimatedChapterCount ?? null;
    },
  });
}
