import type { Prisma } from "@prisma/client";
import type { VolumePlanDocument } from "@ai-novel/shared/types/novel";
import type { StyleBindingService } from "../../../styleEngine/StyleBindingService";
import type { StoryMacroPlanService } from "../../storyMacro/StoryMacroPlanService";
import type { VolumeGenerateOptions } from "../volumeModels";
import type { generateVolumePlanDocument } from "../volumeGenerationOrchestrator";
import type { reviewChapterExecutionContinuity } from "../chapterDetail";
export interface ChapterExecutionContractServiceDeps {
  storyMacroPlanService: Pick<StoryMacroPlanService, "getPlan">;
  styleBindingService: Pick<StyleBindingService, "resolveForGeneration">;
  ensureVolumeWorkspace: (novelId: string) => Promise<VolumePlanDocument>;
  findVolumeChapterMatch: (
    workspace: VolumePlanDocument,
    chapter: { order: number; title: string },
  ) => { volumeId: string; volumeChapterId: string };
  ensureActiveVersionRecord: (
    tx: Prisma.TransactionClient,
    novelId: string,
    document: VolumePlanDocument,
    diffSummary?: string,
  ) => Promise<{ versionId: string; version: number }>;
  emitVolumeUpdated: (novelId: string, reason: "chapter_execution_contract_refined") => void;
}

export type EnsureChapterExecutionContractOptions = Pick<
  VolumeGenerateOptions,
  "provider" | "model" | "temperature" | "guidance" | "chapterTaskSheetQualityMode" | "entrypoint" | "taskId" | "signal" | "chapterContractPorts"
> & {
  taskStyleProfileId?: string;
};


export interface ChapterContractPreparationPorts {
  db: Pick<Prisma.TransactionClient, "chapter" | "volumePlan" | "volumePlanVersion">;
  readWorkspace: (novelId: string) => Promise<VolumePlanDocument>;
  generateDocument: typeof generateVolumePlanDocument;
  reviewContinuity: typeof reviewChapterExecutionContinuity;
  resolveStyleContract: (novelId: string, chapterId: string, taskStyleProfileId?: string) => Promise<string | null>;
}
export type ContractTransactionFence = (tx: Prisma.TransactionClient, point: "before" | "after") => Promise<void>;
