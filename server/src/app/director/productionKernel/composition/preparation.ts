import type { LLMProvider } from "@ai-novel/shared/types/llm";
import { NovelVolumeService } from "../../../../services/novel/volume/NovelVolumeService";
import { readExecutionContractWorkspace } from "../../../../services/novel/volume/ChapterExecutionContractService";
import { PlannerService } from "../../../../services/planner/PlannerService";
import { buildPlannerStyleEngineSummary } from "../../../../services/planner/plannerContextHelpers";
import { StoryMacroPlanService } from "../../../../services/novel/storyMacro/StoryMacroPlanService";
import { StyleBindingService } from "../../../../services/styleEngine/StyleBindingService";
import { buildWriterStyleContractText } from "../../../../services/styleEngine/styleContractText";
import { payoffLedgerSyncService } from "../../../../services/payoff/PayoffLedgerSyncService";
import {withPayoffLedgerReadScope} from "../../../../services/payoff/readScope";
import { characterDynamicsQueryService } from "../../../../services/novel/dynamics/CharacterDynamicsQueryService";
import { contextAssemblyService } from "../../../../services/novel/production/ContextAssemblyService";
import { GenerationContextAssembler } from "../../../../services/novel/runtime/GenerationContextAssembler";
import { PrismaTimelineRepository, TimelineContextService } from "../../../../modules/timeline";
import { createKernelPreparationStage, PrismaPreparationCheckpointStore, type UnitRun } from "../../../../modules/production";
import { createKernelNativePlanningPreparation } from "../preparation/nativePlanning";
import { createKernelPreparationPromptInvoker } from "../preparation/modelRequests";
import type { ChapterRuntimeRequestInput } from "../../../../services/novel/runtime/chapterRuntimeSchema";
import type { NativeStageDependencies } from "./types";
import { withModelRequestBudget } from "../../../../platform/llm/retries";
import {withRagExecutionScope} from "../../../../services/rag/execution";
import {PrismaInvocationUsageRepository} from "../../../../platform/llm/usage";
import {readKernelRagConfiguration, assertKernelRagIndex, readKernelRagSources, withKernelRagContext, type KernelRagConfiguration} from "../rag";
import type {ProductionJson} from "../../../../modules/production/common";
import {readManualChapterRequest} from "../manual/contract";

export function nativeRuntimeRequest(deps: NativeStageDependencies, run: UnitRun): ChapterRuntimeRequestInput {
  const { contract, runId } = deps.context, range = contract.chapterRange!;
  const manual = readManualChapterRequest(contract);
  if (manual) return {...manual.options, provider: run.snapshots.model.provider as LLMProvider, model: run.snapshots.model.model,
    temperature: contract.launchInput?.temperature, workflowTaskId: runId, artifactSyncMode: run.snapshots.profile.reconcile,
    controlPolicy: {kickoffMode: "manual_start", advanceMode: "manual", reviewCheckpoints: [],
      autoExecutionRange: {mode: "chapter_range", start: range.from, end: range.to}}};
  return { provider: run.snapshots.model.provider as LLMProvider, model: run.snapshots.model.model,
    temperature: contract.launchInput?.temperature, workflowTaskId: runId, artifactSyncMode: run.snapshots.profile.reconcile,
    controlPolicy: { kickoffMode: "director_start", advanceMode: range.to === contract.launchInput?.estimatedChapterCount ? "full_book_autopilot" : "auto_to_execution",
      reviewCheckpoints: [], autoExecutionRange: { mode: "chapter_range", start: range.from, end: range.to } } };
}

export function nativePreparation(deps: NativeStageDependencies) {
  const { db, context } = deps, planner = new PlannerService(), style = new StyleBindingService();
  const timeline = new TimelineContextService(new PrismaTimelineRepository(db));
  const assembler = new GenerationContextAssembler();
  const usage = new PrismaInvocationUsageRepository(db.llmInvocationUsageRecord);
  const planning = createKernelNativePlanningPreparation({ db,
    contract: new NovelVolumeService().createChapterExecutionContractService(), storyMacroPlanService: new StoryMacroPlanService(), planner,
    contractSources: { db, readWorkspace: id => readExecutionContractWorkspace(db, id),
      resolveStyleContract: async (novelId, chapterId, taskStyleProfileId) => buildWriterStyleContractText(
        (await style.resolveForGeneration({ novelId, chapterId, taskStyleProfileId })).compiledBlocks?.contract ?? null) },
    plannerSources: { db, readBookPlan: id => planner.getBookPlan(id), listArcPlans: id => planner.listArcPlans(id),
      resolveStyleSummary: async (novelId, chapterId, taskStyleProfileId) => buildPlannerStyleEngineSummary(await style.resolveForGeneration({ novelId, chapterId, taskStyleProfileId })),
      readPayoff: (novelId, options) => payoffLedgerSyncService.getPayoffLedger(novelId, { ...options, syncIfMissing: false }),
      readDynamics: (...args) => characterDynamicsQueryService.getOverview(...args), buildStateContext: input => contextAssemblyService.build(input), strictSources: true },
    request: async run => nativeRuntimeRequest(deps, run), sourceRoute: () => `/lab/director/${encodeURIComponent(context.contract.novelId)}`,
    readContextInput: async () => {
      const configuration = await readKernelRagConfiguration();
      await assertKernelRagIndex();
      return JSON.parse(JSON.stringify(configuration)) as ProductionJson;
    },
    withContextReadScope: (run, steps, assertSources, input, operation) => {
      if (!input) throw new Error("正文准备缺少检索配置快照。");
      return withKernelRagContext({run, runId: context.runId, steps, configuration: input as unknown as KernelRagConfiguration,
        readConfiguration: readKernelRagConfiguration, readSources: readKernelRagSources, assertIndex: assertKernelRagIndex,
        fence: async () => {await deps.fence(run); await assertSources();}, budget: deps.budget, recordUsage: record => usage.record(record)}, operation);
    },
    assertOwnership: (tx, run) => deps.ownership(tx, run.progress),
    invoke: (run, steps, assertSources) => createKernelPreparationPromptInvoker({ preflight: deps.preflight, budget: deps.budget,
      requestLimit: () => 32, fence: async current => { await deps.fence(current); await assertSources(); } }, run, steps),
    assembler: { assemble: async (...args) => {
      const assembled = await assembler.assemble(...args);
      // Native assembly no longer builds this read-only source; reconciliation requires the saved version.
      assembled.contextPackage.timelineContext = await timeline.buildForChapter({ novelId: args[0], chapterId: args[1], chapterIndex: assembled.chapter.order });
      return assembled;
    } },
  });
  async function guarded<T>(operation: () => Promise<T>): Promise<T> {
    let rejected = false;
    const unregistered = async (): Promise<never> => {throw new Error("正文准备包含未登记的检索请求。");};
    const result = await withRagExecutionScope({retrieve: unregistered, request: unregistered}, () => withModelRequestBudget({ remaining: () => 0, beforeRequest: async () => {
      rejected = true; throw new Error("正文准备包含未登记的模型请求。");
    } }, () => withPayoffLedgerReadScope(operation)));
    if (rejected) throw new Error("正文准备包含未登记的模型请求。");
    return result;
  }
  return createKernelPreparationStage({ ...planning, readInput: run => guarded(() => planning.readInput(run)),
    execute: (run, input, steps) => guarded(() => planning.execute(run, input, steps)),
    purpose: readManualChapterRequest(context.contract) ? "user_requested" : "automatic", checkpoints: new PrismaPreparationCheckpointStore(db, deps.ownership),
    executionToken: () => context.execution!.leaseOwner, readBaseline: deps.readBaseline, fence: deps.fence });
}
