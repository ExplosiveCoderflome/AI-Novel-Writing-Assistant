import { prisma } from "../../db/prisma";
import { createProductionStepRegistry, directorProductionPlan, createStoryMacroStepHandler, createBookContractStepHandler,
  createWorldSetupStepHandler, createCharacterSetupStepHandler, createVolumeStrategyStepHandler, createVolumeBeatSheetStepHandler,
  createVolumeChapterListStepHandler, createChapterDetailBundleStepHandler, createExecutionContractSyncStepHandler, createChapterBatchStepHandler,
  resolveChapterQualityReports, PrismaEventLog, artifactContentHash, inferExistingAssets, type DirectorNextServiceOptions } from "../../modules/director";
import { StoryMacroPlanService } from "../../services/novel/storyMacro/StoryMacroPlanService";
import { BookContractGenerationService } from "../../services/novel/bookContract";
import { BookContractService } from "../../services/novel/BookContractService";
import { WorldContextGateway } from "../../services/novel/worldContext/WorldContextGateway";
import { NovelVolumeService } from "../../services/novel/volume/NovelVolumeService";
import { ChapterService } from "../../services/novel/ChapterService";
import { CharacterPreparationService } from "../../services/novel/characterPrep/CharacterPreparationService";
import { generateAutoCharacterCastDraft, appendCharacterCastOptionsDraft } from "../../services/novel/characterPrep/characterCastGeneration";
import { NovelCorePipelineService } from "../../services/novel/novelCorePipelineService";
import { DIRECTOR_ISSUE_POLICY_PRESETS, directorIssuePolicySchema } from "@ai-novel/shared/types/directorIssue";
import { requireLaunch, modelOptions, bookContractInput, targetVolume, executionWindow } from "./productionInputs";
import { readBatchOutcome } from "./batchOutcome";
import {readEditedArtifact, resumeBusiness, cancelBusiness} from "./savedContent";
import {readExistingAssets} from "./existingAssets";
import {isCurrentChapterProductionCompleted} from "../../services/novel/production/completion";
import {CHAPTER_ARTIFACT_BOUNDARY_TYPE} from "../../services/novel/runtime/artifactSync";

/** Composition only: business generation remains owned by existing novel services. Not enabled by importing this module. */
export function createDirectorProductionOptions(): DirectorNextServiceOptions {
  const macro = new StoryMacroPlanService(), book = new BookContractService(), volumes = new NovelVolumeService();
  const characters = new CharacterPreparationService(), pipeline = new NovelCorePipelineService(), events = new PrismaEventLog();
  const contentHash = artifactContentHash;
  const stepRegistry = createProductionStepRegistry({
    story_macro: createStoryMacroStepHandler({storyMacroService: macro, inputProvider: async context => ({...modelOptions(context), storyInput: requireLaunch(context.contract).storyInput}), contentHash}),
    book_contract: createBookContractStepHandler({generationService: new BookContractGenerationService(), bookContractService: book,
      inputProvider: async context => ({novelId: context.contract.novelId, ...modelOptions(context), promptInput: await bookContractInput(context, macro)}), contentHash}),
    world_setup: createWorldSetupStepHandler({worldService: new WorldContextGateway(), inputProvider: async context => ({...modelOptions(context),
      storyInput: requireLaunch(context.contract).storyInput, worldMode: requireLaunch(context.contract).worldMode, openingOnly: true,
      storyMacroContext: JSON.stringify(await macro.getPlan(context.contract.novelId)), bookContractContext: JSON.stringify(await book.getByNovelId(context.contract.novelId))}), contentHash}),
    character_setup: createCharacterSetupStepHandler({inputProvider: async context => ({...modelOptions(context), storyInput: requireLaunch(context.contract).storyInput,
      useWorldContext: requireLaunch(context.contract).worldMode !== "skip", taskId: context.runId, entrypoint: "director_next"}),
      characterService: {readCast: async novelId => ({characters: await prisma.character.findMany({where: {novelId}}), relations: await characters.listCharacterRelations(novelId)}),
        prepareEmptyCast: async (novelId, input) => {
          const generated = await generateAutoCharacterCastDraft(novelId, input);
          const ids = await appendCharacterCastOptionsDraft(novelId, generated.storyInput, {options: [generated.parsed.option]});
          if (ids.length !== 1) throw new Error("角色候选保存结果无效。");
          return characters.applyCharacterCastOption(novelId, ids[0], {requireEmptyCast: true, postApplyMode: "deferred"});
        }}, contentHash}),
    volume_strategy: createVolumeStrategyStepHandler({volumeService: volumes, inputProvider: async context => ({...modelOptions(context), estimatedChapterCount: requireLaunch(context.contract).estimatedChapterCount}), contentHash}),
    volume_beat_sheet: createVolumeBeatSheetStepHandler({volumeService: volumes, inputProvider: async context => {
      const workspace = await volumes.getVolumes(context.contract.novelId);return {...modelOptions(context), workspace, targetVolumeId: targetVolume(context, workspace)};
    }, contentHash}),
    volume_chapter_list: createVolumeChapterListStepHandler({volumeService: volumes, inputProvider: async context => {
      const workspace = await volumes.getVolumes(context.contract.novelId);return {...modelOptions(context), workspace, targetVolumeId: targetVolume(context, workspace)};
    }, contentHash}),
    chapter_detail_bundle: createChapterDetailBundleStepHandler({volumeService: volumes, inputProvider: async context => {
      const workspace = await volumes.getVolumes(context.contract.novelId);return {...modelOptions(context), workspace, targets: executionWindow(context, workspace).targets};
    }, resolveIssues: async (_context, reports) => resolveChapterQualityReports(reports), contentHash}),
    execution_contract_sync: createExecutionContractSyncStepHandler({volumeService: volumes, chapterService: new ChapterService(), inputProvider: async context => {
      const workspace = await volumes.getVolumes(context.contract.novelId);return {workspace, executionRange: executionWindow(context, workspace).executionRange};
    }, contentHash}),
    chapter_batch: createChapterBatchStepHandler({pipelineService: pipeline, inputProvider: async context => {
      const input = requireLaunch(context.contract), range = context.contract.chapterRange;
      if (!range) throw new Error("正文生成缺少章节授权范围。");
      const binding = (await events.list(context.runId)).some(event => event.type === "chapter_batch_job");
      if (!binding) {
        const saved = await prisma.chapter.findMany({where: {novelId: context.contract.novelId, order: {gte: range.from, lte: range.to}},
          include: {artifactSyncCheckpoints: {where: {artifactType: CHAPTER_ARTIFACT_BOUNDARY_TYPE, status: "succeeded"}, select: {contentHash: true, metadataJson: true}, orderBy: {updatedAt: "desc"}, take: 6}}});
        if (saved.some(chapter => chapter.content?.trim() && !isCurrentChapterProductionCompleted(chapter))) throw new Error("授权范围包含已有正文，请选择尚未写作的章节；已有正文可从章节页面查看和调整。");
      }
      const policy = directorIssuePolicySchema.parse(context.contract.issuePolicy.pipelinePolicy);
      return {...modelOptions(context), startOrder: range.from, endOrder: range.to, directorNext: {runId: context.runId, decisions: []},
        issueGovernanceVersion: 1 as const, issuePolicySnapshot: policy, autoReview: true, autoRepair: true,
        controlPolicy: {kickoffMode: "director_start" as const, advanceMode: range.to === input.estimatedChapterCount ? "full_book_autopilot" as const : "auto_to_execution" as const,
          reviewCheckpoints: [], autoExecutionRange: {mode: "chapter_range" as const, start: range.from, end: range.to}}};
    }, jobBinding: {get: async runId => {
      const event = (await events.list(runId)).find(event => event.type === "chapter_batch_job");
      if (!event) return null;
      const payload = event.payload as {jobId?: unknown};if (typeof payload?.jobId !== "string" || !payload.jobId) throw new Error("正文作业绑定损坏。");return payload.jobId;
    }, save: async (runId, jobId) => events.append({runId, type: "chapter_batch_job", payload: {jobId}})},
      readOutcome: readBatchOutcome, waitForPoll: () => new Promise(resolve => setTimeout(resolve, 1000)),
      isRunActive: async runId => (await prisma.directorNextRunControl.findUnique({where: {runId}, select: {status: true}}))?.status === "running", contentHash}),
  });
  const labels: Record<string, string> = {story_macro: "故事规划", book_contract: "创作约定", world_skeleton: "世界设定", character_cast: "角色阵容", volume_strategy: "卷纲", volume_beat_sheet: "节奏段", volume_chapter_list: "章节路线", chapter_task_sheet: "章节任务与场景", chapter_execution_contract: "正文执行计划", chapter_batch_closed: "本批次正文"};
  return {plan: directorProductionPlan, stepRegistry, readEditedArtifact, resumeBusiness, cancelBusiness,
    sourceRoute: novelId => `/lab/director/${encodeURIComponent(novelId)}`,
    artifactTypes: Object.fromEntries(Object.entries(labels).map(([type,label]) => [type,{label,reviewRoute: ""}])), contractFactory: input => {
    const launch = input.launchInput;
    if (!launch) throw new Error("启动创作需要故事、模型与范围快照。");
    if (!launch.targetVolumeId && launch.targetMode !== "opening") throw new Error("启动创作需要明确选择开篇或目标卷。");
    const mode = launch.issuePolicyMode ?? "completion_first";
    const preset = DIRECTOR_ISSUE_POLICY_PRESETS.find(item => item.id === (mode === "quality_first" ? "quality_first" : "finish_full_book"));
    if (!preset) throw new Error("缺少质量策略预设。");
    const requestedSteps = input.stepIdsInScope ?? (launch.executionRange ? null : directorProductionPlan.steps.filter(step => !["chapter_detail_bundle", "execution_contract_sync", "chapter_batch"].includes(step.id)).map(step => step.id));
    if (requestedSteps?.some(id => !directorProductionPlan.steps.some(step => step.id === id))) throw new Error("创作步骤范围无效。");
    if (!launch.executionRange && requestedSteps?.some(id => ["chapter_detail_bundle", "execution_contract_sync", "chapter_batch"].includes(id))) throw new Error("正文准备与生成需要明确授权范围。");
    const scope = launch.executionRange ? `chapters:${launch.executionRange.from}-${launch.executionRange.to}${launch.targetVolumeId ? `:volume:${launch.targetVolumeId}` : ""}` : launch.targetVolumeId ? `volume:${launch.targetVolumeId}` : "book";
    const contract = {runId: input.runId, novelId: input.novelId, driver: input.driver, planVersion: directorProductionPlan.version, scope,
      stepIdsInScope: requestedSteps, chapterRange: launch.executionRange ?? null,
      issuePolicy: {mode, version: "director-next-policy-v1", pipelinePolicy: {...preset.policy, issueActions: {...preset.policy.issueActions}}},
      modelConfig: {route: launch.provider ?? "default", model: launch.model ?? "default", version: "director-next-model-v1"},
      launchInput: launch, tokenBudget: null, rejectionBudget: 3};
    requireLaunch(contract);return contract;
  }, prepareOpen: async contract => {
    const novel = await prisma.novel.findUniqueOrThrow({where: {id: contract.novelId}, select: {id: true, title: true, description: true}});
    return [{type: "novel_seed", scope: contract.scope, status: "confirmed", protectedUserContent: true, contentRef: `novel:${novel.id}`, contentHash: contentHash({novel, launchInput: contract.launchInput})},
      ...await inferExistingAssets(contract, {read: readExistingAssets, contentHash})];
  }};
}
