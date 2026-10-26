import type { Prisma, PrismaClient } from "@prisma/client";
import type { ChapterRuntimeRequestInput } from "../../../../services/novel/runtime/chapterRuntimeSchema";
import type { GenerationContextAssembler } from "../../../../services/novel/runtime/GenerationContextAssembler";
import { ChapterExecutionContractService, prepareChapterContractGeneration, executePreparedChapterContractGeneration,
  type ChapterContractPreparationPorts, type PreparedChapterExecutionContract, type PreparedChapterContractGeneration } from "../../../../services/novel/volume/ChapterExecutionContractService";
import { readWorkspaceFingerprint } from "../../../../services/novel/volume/executionContract";
import { reviewChapterExecutionContinuity } from "../../../../services/novel/volume/chapterDetail";
import { buildChapterTaskSheetQualityPromptRequest, type ChapterTaskSheetSemanticAssessor } from "../../../../services/novel/volume/ChapterTaskSheetQualityGateService";
import { executePreparedChapterPlan, projectChapterPlan, type PreparedChapterPlan } from "../../../../services/planner/chapter";
import { persistStoryPlanInTransaction, buildChapterExecutionContractHash, readPlanExecutionContractHash } from "../../../../services/planner/plannerPersistence";
import type { PlannerService } from "../../../../services/planner/PlannerService";
import type { ChapterPlanPreparationDependencies } from "../../../../services/planner/chapter";
import type { StoryMacroPlanService } from "../../../../services/novel/storyMacro/StoryMacroPlanService";
import type { runStructuredPrompt } from "../../../../prompting/core/promptRunner";
import { readPreparationTimeline, assertPreparationTimeline, ProductionSnapshotConflictError, hashProductionContent,
  type PreparationTimelineSource, type KernelPreparationStageDependencies, type PreparationSteps, type UnitRun } from "../../../../modules/production";
import { canonicalProductionJson, ProductionVersionConflictError, type ProductionJson } from "../../../../modules/production/common";

interface SavedPreparation {
  request: ChapterRuntimeRequestInput;
  timeline: PreparationTimelineSource[];
  contract: PreparedChapterExecutionContract;
  generation: PreparedChapterContractGeneration;
  contextInput?: ProductionJson;
}
type SavedPlan = { kind: "generate"; prepared: PreparedChapterPlan; workspaceFingerprint: string }
  | { kind: "reuse"; planId: string; planFingerprint: string; chapter: Awaited<ReturnType<typeof readPlanBaseline>>; workspaceFingerprint: string };
export interface NativePlanningPreparationDependencies {
  db: PrismaClient;
  contract: ChapterExecutionContractService;
  contractSources: Pick<ChapterContractPreparationPorts, "db" | "readWorkspace" | "resolveStyleContract">;
  storyMacroPlanService: Pick<StoryMacroPlanService, "getPlan">;
  planner: Pick<PlannerService, "prepareChapterPlan" | "getChapterPlan">;
  plannerSources: ChapterPlanPreparationDependencies;
  assembler: Pick<GenerationContextAssembler, "assemble">;
  request(run: UnitRun): Promise<ChapterRuntimeRequestInput>;
  sourceRoute(run: UnitRun): string;
  assertOwnership(tx: Prisma.TransactionClient, run: UnitRun): Promise<void>;
  /** Include this source fence in the physical retry scope, in addition to the caller lease fence. */
  invoke(run: UnitRun, steps: PreparationSteps, assertSources: () => Promise<void>): typeof runStructuredPrompt;
  readContextInput?(): Promise<ProductionJson>;
  withContextReadScope?<T>(run: UnitRun, steps: PreparationSteps, assertSources: () => Promise<void>,
    input: ProductionJson | undefined, operation: () => Promise<T>): Promise<T>;
}
const wire = (value: unknown): ProductionJson => JSON.parse(JSON.stringify(value));
const unavailable = async (): Promise<never> => { throw new Error("Model dispatch requires the prepared stage claim"); };
const planFingerprint = (plan: { id: string; rawPlanJson: string | null; updatedAt: Date | string; scenes: unknown[] }) =>
  hashProductionContent(canonicalProductionJson(wire({ id: plan.id, rawPlanJson: plan.rawPlanJson, updatedAt: plan.updatedAt, scenes: plan.scenes })));
function readPlanBaseline(db: Pick<Prisma.TransactionClient, "chapter">, run: UnitRun) {
  return db.chapter.findFirstOrThrow({ where: { id: run.progress.unit.chapterId, novelId: run.progress.unit.novelId },
    select: { content: true, updatedAt: true, expectation: true, targetWordCount: true, conflictLevel: true, revealLevel: true,
      mustAvoid: true, taskSheet: true, sceneCards: true, hook: true } });
}

export function createKernelNativePlanningPreparation(deps: NativePlanningPreparationDependencies):
  Pick<KernelPreparationStageDependencies, "readInput" | "execute"> {
  const sources: ChapterContractPreparationPorts = { ...deps.contractSources, generateDocument: unavailable, reviewContinuity: unavailable };
  async function assertSources(tx: Prisma.TransactionClient, run: UnitRun, saved: SavedPreparation) {
    await deps.assertOwnership(tx, run);
    await assertPreparationTimeline(tx, run.progress.unit, saved.timeline, deps.sourceRoute(run));
  }
  function contractOptions(request: ChapterRuntimeRequestInput) {
    return { provider: request.provider, model: request.model, temperature: request.temperature,
      taskId: request.workflowTaskId, taskStyleProfileId: request.taskStyleProfileId,
      entrypoint: "auto_director", chapterTaskSheetQualityMode: "full_book_autopilot" as const };
  }
  return {
    async readInput(run) {
      const unit = run.progress.unit, request = await deps.request(run);
      if (request.provider !== run.snapshots.model.provider || request.model !== run.snapshots.model.model) throw new ProductionSnapshotConflictError();
      const contextInput = await deps.readContextInput?.();
      const timeline = await readPreparationTimeline(deps.db, unit, deps.sourceRoute(run));
      const options = contractOptions(request);
      const contract = await deps.contract.prepareChapterExecutionContract(unit.novelId, unit.chapterId, options, sources);
      const generation = await prepareChapterContractGeneration({ novelId: unit.novelId, workspace: contract.workspace,
        targetVolumeId: contract.matched.volumeId, targetChapterId: contract.matched.volumeChapterId,
        options, db: deps.db, storyMacroPlanService: deps.storyMacroPlanService });
      return wire({ request, timeline, contract, generation, contextInput });
    },
    async execute(run, input, steps) {
      const saved = input as unknown as SavedPreparation, unit = run.progress.unit;
      if (saved.contract.novelId !== unit.novelId || saved.contract.chapterId !== unit.chapterId
        || saved.request.provider !== run.snapshots.model.provider || saved.request.model !== run.snapshots.model.model) throw new ProductionSnapshotConflictError();
      let expectedWorkspace = saved.contract.workspaceFingerprint;
      let expectedChapterVersion = new Date(saved.contract.chapter.updatedAt).toISOString();
      const assertModelSources = () => deps.db.$transaction(async tx => {
        await assertSources(tx, run, saved);
        if (await readWorkspaceFingerprint(tx, unit.novelId) !== expectedWorkspace) throw new ProductionVersionConflictError();
        const locked = await tx.chapter.updateMany({ where: { id: unit.chapterId, novelId: unit.novelId,
          content: saved.contract.chapter.content, updatedAt: new Date(expectedChapterVersion) },
          data: { updatedAt: new Date(expectedChapterVersion) } });
        if (locked.count !== 1) throw new ProductionVersionConflictError();
      });
      const scopedInvoke = deps.invoke(run, steps, assertModelSources);
      const invoke: typeof runStructuredPrompt = async request => {
        await assertModelSources();
        const result = await scopedInvoke(request);
        await assertModelSources();
        return result;
      };
      const semanticAssessor: ChapterTaskSheetSemanticAssessor = async assessment =>
        (await invoke(buildChapterTaskSheetQualityPromptRequest(assessment))).output;
      const ports: ChapterContractPreparationPorts = { ...sources,
        reviewContinuity: (candidate, options) => reviewChapterExecutionContinuity(candidate, options, { semanticAssessor }),
        generateDocument: params => executePreparedChapterContractGeneration(saved.generation, {
          ...params.options, chapterContractPorts: { invokePrompt: invoke, semanticAssessor } }),
      };
      let contractReceipt = await steps.committed("execution_contract");
      if (!contractReceipt) {
        const outcome = await deps.contract.evaluatePreparedChapterExecutionContract(saved.contract, contractOptions(saved.request), ports);
        contractReceipt = await steps.commit("execution_contract", async tx => {
          const chapter = await deps.contract.commitPreparedChapterExecutionContract(tx, saved.contract, outcome, () => assertSources(tx, run, saved));
          return wire({ chapterVersion: chapter.updatedAt, workspaceFingerprint: await readWorkspaceFingerprint(tx, unit.novelId) });
        });
      }
      const receipt = contractReceipt as unknown as { chapterVersion: string; workspaceFingerprint: string };
      if (!receipt.chapterVersion || !receipt.workspaceFingerprint) throw new ProductionSnapshotConflictError();
      expectedWorkspace = receipt.workspaceFingerprint;
      expectedChapterVersion = new Date(receipt.chapterVersion).toISOString();
      let planReceipt = await steps.committed("chapter_plan");
      if (!planReceipt) await assertModelSources();
      const plan = await steps.read("chapter_plan_input", async () => {
        const before = await readWorkspaceFingerprint(deps.db, unit.novelId);
        const chapter = await readPlanBaseline(deps.db, run);
        const existing = await deps.planner.getChapterPlan(unit.novelId, unit.chapterId);
        if (existing?.scenes.length && readPlanExecutionContractHash(existing.rawPlanJson) === buildChapterExecutionContractHash(chapter)) {
          if (before !== await readWorkspaceFingerprint(deps.db, unit.novelId)) throw new ProductionVersionConflictError();
          return wire({ kind: "reuse", planId: existing.id, planFingerprint: planFingerprint(existing), chapter, workspaceFingerprint: before });
        }
        const prepared = await deps.planner.prepareChapterPlan(unit.novelId, unit.chapterId, saved.request,
          { ...deps.plannerSources, strictSources: true });
        if (before !== await readWorkspaceFingerprint(deps.db, unit.novelId)) throw new ProductionVersionConflictError();
        return wire({ kind: "generate", prepared, workspaceFingerprint: before });
      }) as unknown as SavedPlan;
      const assertPlan = async (tx: Prisma.TransactionClient, point: "before" | "after") => {
        await assertSources(tx, run, saved);
        if (await readWorkspaceFingerprint(tx, unit.novelId) !== plan.workspaceFingerprint) throw new ProductionVersionConflictError();
        if (point === "before") {
          const expected = plan.kind === "generate" ? plan.prepared.projection.chapter : plan.chapter;
          const locked = await tx.chapter.updateMany({ where: { id: unit.chapterId, novelId: unit.novelId,
            content: expected.content, updatedAt: new Date(expected.updatedAt) }, data: { updatedAt: new Date(expected.updatedAt) } });
          if (locked.count !== 1) throw new ProductionVersionConflictError();
        }
      };
      if (planReceipt) {
        // The native planning transaction and its receipt already committed; do not evaluate its model again.
      } else if (plan.kind === "reuse") {
        planReceipt = await steps.commit("chapter_plan", async tx => {
          await assertPlan(tx, "before");
          const current = await tx.storyPlan.findFirst({ where: { id: plan.planId, novelId: unit.novelId, chapterId: unit.chapterId,
            level: "chapter", status: { not: "stale" } }, include: { scenes: { orderBy: { sortOrder: "asc" } } } });
          if (!current || planFingerprint(current) !== plan.planFingerprint) throw new ProductionVersionConflictError();
          await assertPlan(tx, "after");
          return wire({ planId: plan.planId, reused: true, chapterVersion: plan.chapter.updatedAt });
        });
      } else {
        const output = await executePreparedChapterPlan(plan.prepared, invoke);
        planReceipt = await steps.commit("chapter_plan", async tx => {
          const result = await persistStoryPlanInTransaction(tx, projectChapterPlan(plan.prepared, output), assertPlan);
          const chapter = await tx.chapter.findUniqueOrThrow({ where: { id: unit.chapterId }, select: { updatedAt: true } });
          return { planId: result.id, chapterVersion: chapter.updatedAt.toISOString() };
        });
      }
      const planVersion = planReceipt as unknown as { chapterVersion: string };
      if (!planVersion.chapterVersion) throw new ProductionSnapshotConflictError();
      expectedChapterVersion = new Date(planVersion.chapterVersion).toISOString();
      await assertModelSources();
      const assemble = () => steps.read("assembled_context", async () => {
        const assembled = await deps.assembler.assemble(unit.novelId, unit.chapterId, saved.request);
        if (assembled.novel.id !== unit.novelId || assembled.chapter.id !== unit.chapterId || assembled.chapter.order !== unit.order) throw new ProductionSnapshotConflictError();
        return wire({ novelTitle: assembled.novel.title, chapterTitle: assembled.chapter.title, contextPackage: assembled.contextPackage });
      });
      const assembled = deps.withContextReadScope
        ? await deps.withContextReadScope(run, steps, assertModelSources, saved.contextInput, assemble) : await assemble();
      await assertModelSources();
      return assembled as unknown as Awaited<ReturnType<KernelPreparationStageDependencies["execute"]>>;
    },
  };
}
