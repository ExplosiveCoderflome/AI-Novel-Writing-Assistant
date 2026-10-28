import type { LLMProvider } from "@ai-novel/shared/types/llm";
import { createReconcileStage, createArtifactExtractionPort, createArtifactSourceReader, createArtifactConsumers,
  PrismaArtifactCheckpointStore, createResourceVersionRecorder, createTimelineArtifactPorts, createTimelineConsumer,
  createFullPayoffConsumer, createPayoffExtractionPort, createPayoffSourceReader,
  type ArtifactExtractionPort, type UnitRun } from "../../../../modules/production";
import { TimelineExtractorService, TimelineCheckerService, PrismaTimelineRepository, StoryTimelineService, timelinePromptAdapter,
  type TimelineExtractorServiceInput } from "../../../../modules/timeline";
import { runStructuredPrompt } from "../../../../prompting/core/promptRunner";
import type { PromptAsset, PromptExecutionOptions } from "../../../../prompting/core/promptTypes";
import { chapterArtifactDeltaPrompt } from "../../../../prompting/prompts/novel/chapterArtifactDelta.prompts";
import { payoffLedgerSyncPrompt } from "../../../../prompting/prompts/payoff/payoffLedgerSync.prompts";
import { timelineExtractorPrompt } from "../../../../prompting/prompts/novel/timelineExtractor.prompts";
import { characterResourceLedgerService } from "../../../../services/novel/characterResource/CharacterResourceLedgerService";
import { characterLocationService, formatCharacterLocationContext } from "../../../../services/novel/characters/locations";
import { canonicalStateService } from "../../../../services/novel/state/CanonicalStateService";
import { stateVersionLog } from "../../../../services/novel/state/StateVersionLog";
import { runKernelRequestScope } from "../execution/requestScope";
import { nativeCandidates } from "./candidates";
import type { NativeStageDependencies } from "./types";

export function nativeTimelineRequest(input: TimelineExtractorServiceInput) {
  return { asset: timelineExtractorPrompt, promptInput: { novelTitle: input.novelTitle, chapterOrder: input.chapterIndex,
    chapterTitle: input.chapterTitle, chapterGoal: input.chapterGoal, chapterContent: input.chapterContent,
    timelineContextText: timelinePromptAdapter.toPromptBlock(input.timelineContext, { maxPreviousEvents: 40, maxSoftHooks: 20, maxAddressedHooks: 12 }) },
    options: { provider: input.provider, model: input.model, temperature: Math.min(input.temperature ?? 0.2, 0.4),
      novelId: input.novelId, chapterId: input.chapterId, stage: "timeline_extraction" } };
}

export function nativeReconcile(deps: NativeStageDependencies) {
  const { db, context, preflight } = deps, checkpoints = new PrismaArtifactCheckpointStore(db, deps.ownership);
  const optionsFor = (stage: string, run?: UnitRun): PromptExecutionOptions => ({ provider: (run?.snapshots.model.provider ?? context.contract.modelConfig.route) as LLMProvider,
    model: run?.snapshots.model.model ?? context.contract.modelConfig.model, novelId: context.contract.novelId, chapterId: deps.unit.chapterId, stage });
  // All physical retries remain inside the saved extraction claim. Native validation/finalization stays in its service.
  function scoped<I, O, R>(port: ArtifactExtractionPort, request: (input: unknown, run: UnitRun) => {
    asset: PromptAsset<I, O, R>; promptInput: I; options: PromptExecutionOptions }): ArtifactExtractionPort {
    return { ...port, async invoke(ctx, prepared, key) {
      const native = request(prepared.input, ctx.run), ready = await preflight.prepare(native);
      return ready.execute(() => runKernelRequestScope({ unit: ctx.run.progress.unit, requestKey: key, maxRequests: 32,
        reserveTokens: ready.reserveTokens, budget: deps.budget, fence: () => deps.fence(ctx.run) }, () => port.invoke(ctx, prepared, key)));
    } };
  }
  function storedRequest<I, O, R>(asset: PromptAsset<I, O, R>, stage: string) {
    return (value: unknown, run: UnitRun) => {
      const stored = value as { promptInput: I; outputTokens: number };
      return { asset, promptInput: stored.promptInput, options: { ...optionsFor(stage, run),
        chapterId: run.progress.unit.chapterId, maxTokens: stored.outputTokens } };
    };
  }
  const extraction = createArtifactExtractionPort({ read: createArtifactSourceReader(db, {
    listResources: novelId => characterResourceLedgerService.listResources(novelId, db),
    readPreviousSnapshot: (novelId, order) => db.storyStateSnapshot.findFirst({ where: { novelId, sourceChapter: { order: { lt: order } } },
      orderBy: { createdAt: "desc" }, include: { characterStates: true, relationStates: true, informationStates: true, foreshadowStates: true } }),
    readLocationContext: async input => formatCharacterLocationContext(input.characters,
      await characterLocationService.readBeforeChapter(input)),
  }), describePrompt: async promptInput => (await preflight.prepare({ asset: chapterArtifactDeltaPrompt, promptInput,
    options: optionsFor("chapter_artifact_delta") })).description, invokePrompt: runStructuredPrompt });
  const full = createPayoffExtractionPort({ read: createPayoffSourceReader(db), describePrompt: async promptInput =>
    (await preflight.prepare({ asset: payoffLedgerSyncPrompt, promptInput, options: optionsFor("payoff_ledger_reconcile") })).description,
    invokePrompt: runStructuredPrompt });
  const timeline = createTimelineArtifactPorts({ extractor: new TimelineExtractorService(), checker: new TimelineCheckerService(),
    describePrompt: async input => (await preflight.prepare(nativeTimelineRequest(input))).description,
    consumer: createTimelineConsumer({ checkpoints, forTransaction: tx => { const repository = new PrismaTimelineRepository(tx);
      return { repository, service: new StoryTimelineService(repository) }; } }) });
  timeline.extraction = scoped(timeline.extraction, value => nativeTimelineRequest(value as TimelineExtractorServiceInput));
  return createReconcileStage({ executionToken: () => context.execution!.leaseOwner, ports: { checkpoints,
    extraction: scoped(extraction, storedRequest(chapterArtifactDeltaPrompt, "chapter_artifact_delta")), timeline,
    fullReconcile: scoped(full, storedRequest(payoffLedgerSyncPrompt, "payoff_ledger_reconcile")),
    fullReconcileConsumer: createFullPayoffConsumer({ checkpoints }),
    consumers: createArtifactConsumers({ checkpoints, resources: createResourceVersionRecorder({ canonical: canonicalStateService, versions: stateVersionLog }) }),
    prepareCandidates: nativeCandidates(deps), fence: ctx => deps.fence(ctx.run),
    reserve: (ctx, key, tokens) => deps.budget.preflight(ctx.run.progress.unit, key, tokens) } });
}
