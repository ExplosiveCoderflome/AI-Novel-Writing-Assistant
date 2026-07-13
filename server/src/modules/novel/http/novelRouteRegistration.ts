import type { Router } from "express";
import { AppError } from "../../../middleware/errorHandler";
import { registerNovelBaseRoutes } from "../setup/http/novelBaseRoutes";
import { registerNovelChapterEditorRoutes } from "../production/http/novelChapterEditorRoutes";
import { registerNovelChapterRoutes } from "../production/http/novelChapterRoutes";
import { registerNovelChapterGenerationRoutes } from "../production/http/novelChapterGeneration";
import { registerNovelCharacterDynamicsRoutes } from "../characters/http/novelCharacterDynamicsRoutes";
import { registerNovelCharacterInfluenceRoutes } from "../characters/http/novelCharacterInfluenceRoutes";
import { registerNovelCharacterMindRoutes } from "../characters/http/novelCharacterMindRoutes";
import { registerNovelCharacterPreparationRoutes } from "../characters/http/novelCharacterPreparationRoutes";
import { registerNovelCharacterResourceRoutes } from "../characters/http/novelCharacterResourceRoutes";
import { registerNovelCharacterSyncRoutes } from "../characters/http/novelCharacterSyncRoutes";
import { registerNovelCharacterVisibleProfileRoutes } from "../characters/http/novelCharacterVisibleProfileRoutes";
import { registerNovelFramingRoutes } from "../setup/http/novelFramingRoutes";
import { registerNovelPlanningRoutes } from "../planning/http/novelPlanningRoutes";
import { registerNovelProductionRoutes } from "../production/http/novelProductionRoutes";
import { registerNovelReviewRoutes } from "../production/http/novelReviewRoutes";
import { registerNovelSnapshotCharacterRoutes } from "../characters/http/novelSnapshotCharacterRoutes";
import { registerNovelStoryMacroRoutes } from "../planning/http/novelStoryMacroRoutes";
import { registerNovelStorylineRoutes } from "../planning/http/novelStorylineRoutes";
import { registerNovelVolumeRoutes } from "../planning/http/novelVolumeRoutes";
import { registerNovelWorldSliceRoutes } from "../setup/http/novelWorldSliceRoutes";
import novelChapterSummaryRouter from "../production/http/novelChapterSummary";
import novelDecisionsRouter from "../state/http/novelDecisions";
import type { NovelHttpServices } from "./novelHttpServices";
import {
  aiRevisionPreviewSchema,
  arcPlanParamsSchema,
  auditIssueParamsSchema,
  beatGenerateSchema,
  chapterExecutionContractSchema,
  chapterParamsSchema,
  chapterSchema,
  characterParamsSchema,
  characterSchema,
  characterTimelineSyncSchema,
  draftOptimizeSchema,
  hookGenerateSchema,
  idParamsSchema,
  llmGenerateSchema,
  outlineGenerateSchema,
  pipelineJobParamsSchema,
  pipelineRunSchema,
  repairSchema,
  replanSchema,
  reviewSchema,
  rewritePreviewSchema,
  storylineDiffQuerySchema,
  storylineDraftSchema,
  storylineImpactSchema,
  storylineVersionParamsSchema,
  structuredOutlineSchema,
  titleGenerateSchema,
  updateChapterSchema,
  updateCharacterSchema,
  volumeDiffQuerySchema,
  volumeDocumentSchema,
  volumeDraftSchema,
  volumeGenerateSchema,
  volumeImpactSchema,
  volumeSyncSchema,
  volumeVersionParamsSchema,
} from "./novelHttpSchemas";

function forwardBusinessError(error: unknown, next: (err?: unknown) => void): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  const isBusiness = /请先在本小说中至少添加|基础角色不存在|请先生成小说发展走向|指定区间内没有可生成的章节|当前小说还没有章节/.test(error.message);
  if (!isBusiness) {
    return false;
  }
  next(new AppError(error.message, 400));
  return true;
}

export function registerNovelHttpRoutes(router: Router, services: NovelHttpServices): void {
  const { novelService, novelDraftOptimizeService } = services;

  registerNovelBaseRoutes({
    router,
    novelService,
  });

  registerNovelFramingRoutes({
    router,
  });

  registerNovelChapterRoutes({
    router,
    novelService,
    idParamsSchema,
    chapterParamsSchema,
    chapterSchema,
    updateChapterSchema,
    chapterExecutionContractSchema,
  });

  registerNovelChapterEditorRoutes({
    router,
    novelService,
    chapterParamsSchema,
    rewritePreviewSchema,
    aiRevisionPreviewSchema,
    forwardBusinessError,
  });

  registerNovelSnapshotCharacterRoutes({
    router,
    novelService,
    idParamsSchema,
    characterParamsSchema,
    characterSchema,
    updateCharacterSchema,
    characterTimelineSyncSchema,
    llmGenerateSchema,
    forwardBusinessError,
  });

  registerNovelCharacterDynamicsRoutes({
    router,
    novelService,
    idParamsSchema,
  });

  registerNovelCharacterMindRoutes({
    router,
    novelService,
  });

  registerNovelCharacterInfluenceRoutes({
    router,
    novelService,
  });

  registerNovelCharacterPreparationRoutes({
    router,
    novelService,
    idParamsSchema,
  });

  registerNovelCharacterResourceRoutes({
    router,
    idParamsSchema,
  });

  registerNovelCharacterSyncRoutes({
    router,
    idParamsSchema,
  });

  registerNovelCharacterVisibleProfileRoutes({
    router,
    novelService,
    idParamsSchema,
    characterParamsSchema,
  });

  registerNovelStorylineRoutes({
    router,
    novelService,
    idParamsSchema,
    storylineVersionParamsSchema,
    storylineDiffQuerySchema,
    storylineDraftSchema,
    storylineImpactSchema,
  });

  registerNovelVolumeRoutes({
    router,
    novelService,
    idParamsSchema,
    volumeVersionParamsSchema,
    volumeDiffQuerySchema,
    volumeDocumentSchema,
    volumeDraftSchema,
    volumeImpactSchema,
    volumeGenerateSchema,
    volumeSyncSchema,
  });

  registerNovelStoryMacroRoutes({
    router,
    idParamsSchema,
  });

  registerNovelWorldSliceRoutes({
    router,
    idParamsSchema,
    novelService,
  });

  registerNovelChapterGenerationRoutes({
    router,
    chapterParamsSchema,
    forwardBusinessError,
  });

  registerNovelPlanningRoutes({
    router,
    novelService,
    idParamsSchema,
    chapterParamsSchema,
    arcPlanParamsSchema,
    llmGenerateSchema,
    replanSchema,
  });

  registerNovelReviewRoutes({
    router,
    novelService,
    idParamsSchema,
    chapterParamsSchema,
    auditIssueParamsSchema,
    reviewSchema,
    repairSchema,
  });

  registerNovelProductionRoutes({
    router,
    novelService,
    novelDraftOptimizeService,
    idParamsSchema,
    pipelineJobParamsSchema,
    titleGenerateSchema,
    beatGenerateSchema,
    pipelineRunSchema,
    hookGenerateSchema,
    outlineGenerateSchema,
    structuredOutlineSchema,
    draftOptimizeSchema,
    forwardBusinessError,
  });

  router.use(novelDecisionsRouter);
  router.use(novelChapterSummaryRouter);
}
