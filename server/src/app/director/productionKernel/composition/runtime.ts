import type { PrismaClient } from "@prisma/client";
import { directorIssuePolicySchema } from "@ai-novel/shared/types/directorIssue";
import type { StepContext } from "../../../../modules/director";
import { createLongChapterProfile, hashProductionContent, PrismaUnitProgressStore, ProductionChapterLifecycleService,
  type UnitRun, type PreparedChapter, type UnitPorts, type ProductionProfile } from "../../../../modules/production";
import { canonicalProductionJson, ProductionVersionConflictError } from "../../../../modules/production/common";
import { MANUAL_CHAPTER_SYNC_TYPE } from "../../../../services/novel/chapterEditor/synchronization/ManualChapterSyncStore";
import { buildChapterArtifactContentHash } from "../../../../services/novel/runtime/artifactSync/ChapterArtifactContentVersion";
import type { KernelBatchRuntime } from "../batch/step";
import { createKernelOwnership, productionBatchOwnerKey } from "../execution/ownership";
import { createKernelChapterBudget } from "../execution/chapterBudget";
import { bindKernelModelPolicy } from "../modelPolicy/binding";
import { captureKernelModelPolicy, createKernelFrozenModelPolicy, type KernelModelPolicySources } from "../modelPolicy/source";
import { createKernelPromptPreparer } from "../prompts/preflight";
import { createNativeKernelStages } from "./stages";
import {resolveLLMClientOptions} from "../../../../llm/factory";
import {withoutLlmTaskOutputBudgets, resolveScopedTaskOutputTokens} from "../../../../platform/llm/execution";
import {captureKernelTaskOutputBudgets, createConfiguredKernelProfile, withKernelTaskOutputStages} from "../modelPolicy/outputBudgets";
import {configureManualChapterProfile, readManualChapterRequest} from "../manual/contract";

export interface NativeKernelRuntimeOptions { modelSources?: KernelModelPolicySources }

/** Captures one batch contract and worker lease. Construction performs no model request. */
export async function createNativeKernelRuntime(db: PrismaClient, context: StepContext,
  options: NativeKernelRuntimeOptions = {}): Promise<KernelBatchRuntime> {
  context = { ...context, contract: structuredClone(context.contract), control: structuredClone(context.control),
    execution: context.execution ? { ...context.execution } : undefined, step: { ...context.step } };
  const contract = context.contract, ownership = createKernelOwnership(context), manual = readManualChapterRequest(contract);
  const policySource = directorIssuePolicySchema.parse(contract.issuePolicy.pipelinePolicy);
  const capture = () => withoutLlmTaskOutputBudgets(() => captureKernelModelPolicy(contract, options.modelSources));
  const modelPolicy = await bindKernelModelPolicy(db, context, capture);
  const frozen = createKernelFrozenModelPolicy(modelPolicy, capture);
  const outputBudgets = await captureKernelTaskOutputBudgets(modelPolicy, options.modelSources);
  const profile = configureManualChapterProfile(createConfiguredKernelProfile(outputBudgets), manual?.operation);
  if (manual?.options.artifactSyncMode) profile.reconcile = manual.options.artifactSyncMode;
  const existingProfiles = new Map((await db.productionUnitRun.findMany({where: {ownerKey: productionBatchOwnerKey(contract.runId), novelId: contract.novelId},
    select: {chapterId: true, profileSnapshotJson: true}})).map(row => [row.chapterId, JSON.parse(row.profileSnapshotJson) as ProductionProfile]));
  const preflight = createKernelPromptPreparer({ ...frozen, resolveModel: async (...args) => {
    const current = await (options.modelSources?.resolveModel ?? resolveLLMClientOptions)(...args);
    return {...current, maxTokens: resolveScopedTaskOutputTokens(current.provider, current.model, current.modelRoute ?? current.taskType, current.maxTokens)};
  } });
  const budget = createKernelChapterBudget(db, context), lifecycle = new ProductionChapterLifecycleService();
  const store = new PrismaUnitProgressStore(db, { assertOwnership: ownership,
    writeChapter: lifecycle.commit.bind(lifecycle), finalizeChapter: lifecycle.finalizeSelected.bind(lifecycle) });
  const modelIdentity = hashProductionContent(canonicalProductionJson(modelPolicy));
  async function fence(run: UnitRun) {
    await db.$transaction(async tx => {
      await ownership(tx, { ...run.progress, ownerKey: run.ownerKey });
      const claim = await tx.productionUnitRun.findUnique({ where: { id: run.id },
        select: { ownerKey: true, novelId: true, chapterId: true, version: true, activeStage: true, activeRequestKey: true } });
      if (!claim || claim.ownerKey !== run.ownerKey || claim.novelId !== run.progress.unit.novelId
        || claim.chapterId !== run.progress.unit.chapterId || claim.version !== run.version
        || claim.activeStage !== run.activeStage || claim.activeRequestKey !== run.activeRequestKey) throw new ProductionVersionConflictError();
      const chapter = await tx.chapter.findFirst({ where: { id: run.progress.unit.chapterId,
        novelId: contract.novelId, order: run.progress.unit.order }, select: { content: true, updatedAt: true } });
      if (!chapter) throw new ProductionVersionConflictError();
      if (run.progress.committedContentHash) {
        if (hashProductionContent(chapter.content ?? "") !== run.progress.committedContentHash) throw new ProductionVersionConflictError();
      } else {
        const prepared = run.artifacts.prepared as unknown as PreparedChapter | undefined;
        const preparing = run.artifacts.activeDescriptor?.input as { baseline?: PreparedChapter["baseline"] } | undefined;
        const baseline = prepared?.baseline ?? preparing?.baseline;
        if (baseline && (chapter.content !== baseline.content || (prepared && chapter.updatedAt.toISOString() !== baseline.updatedAt))) {
          throw new ProductionVersionConflictError();
        }
      }
    });
    await frozen.assertCurrent();
  }
  const readBaseline: Parameters<typeof createNativeKernelStages>[0]["readBaseline"] = async unit => {
    if (manual && unit.chapterId !== manual.chapterId) throw new ProductionVersionConflictError();
    await db.$transaction(tx => ownership(tx, { unit }));
    const chapter = await db.chapter.findFirstOrThrow({ where: { id: unit.chapterId, novelId: unit.novelId, order: unit.order },
      select: { content: true, updatedAt: true, artifactSyncCheckpoints: { where: { artifactType: MANUAL_CHAPTER_SYNC_TYPE },
        select: { contentHash: true } } } });
    if (manual && chapter.content !== manual.baseline.content) throw new ProductionVersionConflictError();
    return { content: chapter.content, updatedAt: chapter.updatedAt.toISOString(),
      protectedUserContent: chapter.artifactSyncCheckpoints.some(row => row.contentHash === buildChapterArtifactContentHash(chapter.content ?? "")) };
  };
  return {
    request: unit => ({ ownerKey: productionBatchOwnerKey(contract.runId), unit: { ...unit }, profile: structuredClone(existingProfiles.get(unit.chapterId) ?? profile),
      policy: { blockingAction: contract.issuePolicy.mode === "quality_first" ? "pause_for_manual" : "continue_with_warning" },
      policySource: JSON.parse(JSON.stringify(policySource)), model: { provider: modelPolicy.provider, model: modelPolicy.model,
        promptVersion: "native-kernel@1", configVersion: modelIdentity, inputFingerprint: hashProductionContent(canonicalProductionJson(contract)) } }),
    ports(unit): UnitPorts {
      unit = { ...unit };
      return { store, fence, budget: { reserve: async input => ({ reservationKey: input.requestKey,
        accepted: await budget.preflight(unit, input.requestKey, input.outputTokens) }) },
        stages: withKernelTaskOutputStages(createNativeKernelStages({ db, context, ownership, preflight, budget, fence, readBaseline, unit }), outputBudgets) };
    },
  };
}
