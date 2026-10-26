import type { Prisma } from "@prisma/client";
import type { VolumePlanDocument } from "@ai-novel/shared/types/novel";
import type { StoryMacroPlanService } from "../../storyMacro/StoryMacroPlanService";
import type { VolumeGenerateOptions } from "../volumeModels";
import { loadGenerationContext, prepareChapterDetailPrompt } from "../generation";
import { buildVolumeWorkspaceDocument } from "../volumeWorkspaceDocument";
import { assertScopeReadiness, getTargetChapter, getTargetVolume, mergeChapterDetail } from "../volumeGenerationHelpers";
import { generateChapterTaskSheetDetail } from "../chapterDetail";

export async function prepareChapterContractGeneration(input: {
  novelId: string; workspace: VolumePlanDocument; targetVolumeId: string; targetChapterId: string;
  options: VolumeGenerateOptions;
  db: Pick<Prisma.TransactionClient, "novel" | "chapter" | "chapterSummary">;
  storyMacroPlanService: Pick<StoryMacroPlanService, "getPlan">;
}) {
  const { novelId, workspace, options } = input;
  const document = buildVolumeWorkspaceDocument({ novelId, volumes: workspace.volumes, strategyPlan: workspace.strategyPlan,
    critiqueReport: workspace.critiqueReport, beatSheets: workspace.beatSheets, rebalanceDecisions: workspace.rebalanceDecisions,
    source: workspace.source, activeVersionId: workspace.activeVersionId });
  assertScopeReadiness(document, "chapter_detail", input.targetVolumeId);
  const { novel, storyMacroPlan } = await loadGenerationContext({ novelId, workspace, db: input.db,
    storyMacroPlanService: input.storyMacroPlanService, strictSources: true });
  const targetVolume = getTargetVolume(document, input.targetVolumeId);
  const targetChapter = getTargetChapter(targetVolume, input.targetChapterId);
  const promptInput = await prepareChapterDetailPrompt({ document, novel, workspace: { ...workspace, ...document },
    storyMacroPlan, options, targetVolume, targetChapter, detailMode: "task_sheet", db: input.db });
  return { document, promptInput, options: { provider: options.provider, model: options.model, temperature: options.temperature,
    guidance: options.guidance, taskId: options.taskId, entrypoint: options.entrypoint,
    chapterTaskSheetQualityMode: options.chapterTaskSheetQualityMode, forceRegenerate: options.forceRegenerate } };
}
export type PreparedChapterContractGeneration = Awaited<ReturnType<typeof prepareChapterContractGeneration>>;

export async function executePreparedChapterContractGeneration(prepared: PreparedChapterContractGeneration, options: VolumeGenerateOptions) {
  for (const key of ["provider", "model", "temperature"] as const) {
    if (options[key] !== undefined && options[key] !== prepared.options[key]) throw new Error("Prepared chapter contract model changed");
  }
  const actual = { ...prepared.options, ...options };
  const generated = await generateChapterTaskSheetDetail({
    promptInput: { ...prepared.promptInput, guidance: actual.guidance, detailMode: "task_sheet" }, options: actual,
  });
  return mergeChapterDetail({ document: prepared.document, targetVolumeId: prepared.promptInput.targetVolume.id,
    targetChapterId: prepared.promptInput.targetChapter.id, detailMode: "task_sheet", generatedDetail: generated });
}
