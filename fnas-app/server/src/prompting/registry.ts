import type { PromptAsset } from "./core/promptTypes";
import { buildPromptAssetKey } from "./core/promptTypes";

type UnknownPromptAsset = PromptAsset<unknown, unknown, unknown>;
type PromptAssetLoader = () => UnknownPromptAsset;

interface PromptAssetLoaderEntry {
  key: string;
  load: PromptAssetLoader;
}

function createPromptAssetLoaderRegistry(entries: PromptAssetLoaderEntry[]): Map<string, PromptAssetLoader> {
  const registry = new Map<string, PromptAssetLoader>();
  for (const entry of entries) {
    if (registry.has(entry.key)) {
      throw new Error(`Duplicate prompt asset registration: ${entry.key}`);
    }
    registry.set(entry.key, entry.load);
  }
  return registry;
}

const promptAssetLoaderByKey = createPromptAssetLoaderRegistry([
  {
    key: "planner.intent.parse@v1",
    load: () => require("./prompts/agent/plannerIntent.prompt").plannerIntentPrompt as UnknownPromptAsset,
  },
  {
    key: "agent.runtime.fallback_answer@v1",
    load: () => require("./prompts/agent/runtime.prompts").runtimeFallbackAnswerPrompt as UnknownPromptAsset,
  },
  {
    key: "agent.runtime.setup_guidance@v1",
    load: () => require("./prompts/agent/runtime.prompts").runtimeSetupGuidancePrompt as UnknownPromptAsset,
  },
  {
    key: "agent.runtime.setup_ideation@v1",
    load: () => require("./prompts/agent/runtime.prompts").runtimeSetupIdeationPrompt as UnknownPromptAsset,
  },
  {
    key: "audit.chapter.full@v1",
    load: () => require("./prompts/audit/audit.prompts").auditChapterPrompt as UnknownPromptAsset,
  },
  {
    key: "bookAnalysis.source.note@v1",
    load: () => require("./prompts/bookAnalysis/bookAnalysis.prompts").bookAnalysisSourceNotePrompt as UnknownPromptAsset,
  },
  {
    key: "bookAnalysis.section.generate@v1",
    load: () => require("./prompts/bookAnalysis/bookAnalysis.prompts").bookAnalysisSectionPrompt as UnknownPromptAsset,
  },
  {
    key: "bookAnalysis.section.optimize@v1",
    load: () => require("./prompts/bookAnalysis/bookAnalysis.prompts").bookAnalysisOptimizedDraftPrompt as UnknownPromptAsset,
  },
  {
    key: "character.base.skeleton@v1",
    load: () => require("./prompts/character/character.prompts").baseCharacterSkeletonPrompt as UnknownPromptAsset,
  },
  {
    key: "character.base.final@v1",
    load: () => require("./prompts/character/character.prompts").baseCharacterFinalPrompt as UnknownPromptAsset,
  },
  {
    key: "genre.tree.generate@v1",
    load: () => require("./prompts/genre/genre.prompts").genreTreePrompt as UnknownPromptAsset,
  },
  {
    key: "planner.book.plan@v1",
    load: () => require("./prompts/planner/plannerPlan.prompts").plannerBookPlanPrompt as UnknownPromptAsset,
  },
  {
    key: "planner.arc.plan@v1",
    load: () => require("./prompts/planner/plannerPlan.prompts").plannerArcPlanPrompt as UnknownPromptAsset,
  },
  {
    key: "planner.chapter.plan@v1",
    load: () => require("./prompts/planner/plannerPlan.prompts").plannerChapterPlanPrompt as UnknownPromptAsset,
  },
  {
    key: "novel.director.candidates@v1",
    load: () => require("./prompts/novel/directorPlanning.prompts").directorCandidatePrompt as UnknownPromptAsset,
  },
  {
    key: "novel.director.candidate_patch@v1",
    load: () => require("./prompts/novel/directorPlanning.prompts").directorCandidatePatchPrompt as UnknownPromptAsset,
  },
  {
    key: "novel.director.book_contract@v1",
    load: () => require("./prompts/novel/directorPlanning.prompts").directorBookContractPrompt as UnknownPromptAsset,
  },
  {
    key: "novel.director.blueprint@v1",
    load: () => require("./prompts/novel/directorPlanning.prompts").directorBlueprintPrompt as UnknownPromptAsset,
  },
  {
    key: "novel.story_macro.decomposition@v1",
    load: () => require("./prompts/novel/storyMacro.prompts").storyMacroDecompositionPrompt as UnknownPromptAsset,
  },
  {
    key: "novel.story_macro.field_regeneration@v1",
    load: () => require("./prompts/novel/storyMacro.prompts").storyMacroFieldRegenerationPrompt as UnknownPromptAsset,
  },
  {
    key: "novel.outline.generate@v1",
    load: () => require("./prompts/novel/coreGeneration.prompts").novelOutlinePrompt as UnknownPromptAsset,
  },
  {
    key: "novel.structuredOutline.generate@v1",
    load: () => require("./prompts/novel/coreGeneration.prompts").novelStructuredOutlinePrompt as UnknownPromptAsset,
  },
  {
    key: "novel.structuredOutline.repair@v1",
    load: () => require("./prompts/novel/coreGeneration.prompts").novelStructuredOutlineRepairPrompt as UnknownPromptAsset,
  },
  {
    key: "novel.bible.generate@v1",
    load: () => require("./prompts/novel/coreGeneration.prompts").novelBiblePrompt as UnknownPromptAsset,
  },
  {
    key: "novel.beat.generate@v1",
    load: () => require("./prompts/novel/coreGeneration.prompts").novelBeatPrompt as UnknownPromptAsset,
  },
  {
    key: "novel.chapterHook.generate@v1",
    load: () => require("./prompts/novel/coreGeneration.prompts").novelChapterHookPrompt as UnknownPromptAsset,
  },
  {
    key: "title.generation@v1",
    load: () => require("./prompts/helper/titleGeneration.prompt").titleGenerationPrompt as UnknownPromptAsset,
  },
  {
    key: "novel.volume.strategy@v1",
    load: () => require("./prompts/novel/volume/strategy.prompts").createVolumeStrategyPrompt(12) as UnknownPromptAsset,
  },
  {
    key: "novel.volume.strategy.critique@v1",
    load: () => require("./prompts/novel/volume/strategy.prompts").volumeStrategyCritiquePrompt as UnknownPromptAsset,
  },
  {
    key: "novel.volume.skeleton@v2",
    load: () => require("./prompts/novel/volume/skeleton.prompts").createVolumeSkeletonPrompt(1) as UnknownPromptAsset,
  },
  {
    key: "novel.volume.beat_sheet@v1",
    load: () => require("./prompts/novel/volume/beatSheet.prompts").volumeBeatSheetPrompt as UnknownPromptAsset,
  },
  {
    key: "novel.volume.chapter_list@v4",
    load: () => require("./prompts/novel/volume/chapterList.prompts").createVolumeChapterListPrompt(1) as UnknownPromptAsset,
  },
  {
    key: "novel.volume.chapter_purpose@v1",
    load: () => require("./prompts/novel/volume/chapterDetail.prompts").volumeChapterPurposePrompt as UnknownPromptAsset,
  },
  {
    key: "novel.volume.chapter_boundary@v1",
    load: () => require("./prompts/novel/volume/chapterDetail.prompts").volumeChapterBoundaryPrompt as UnknownPromptAsset,
  },
  {
    key: "novel.volume.chapter_task_sheet@v1",
    load: () => require("./prompts/novel/volume/chapterDetail.prompts").volumeChapterTaskSheetPrompt as UnknownPromptAsset,
  },
  {
    key: "novel.volume.rebalance.adjacent@v1",
    load: () => require("./prompts/novel/volume/rebalance.prompts").volumeRebalancePrompt as UnknownPromptAsset,
  },
  {
    key: "novel.characterDynamics.chapterExtract@v1",
    load: () => require("./prompts/novel/characterDynamics.prompts").chapterDynamicsExtractionPrompt as UnknownPromptAsset,
  },
  {
    key: "novel.characterDynamics.volumeProjection@v1",
    load: () => require("./prompts/novel/characterDynamics.prompts").volumeDynamicsProjectionPrompt as UnknownPromptAsset,
  },
  {
    key: "novel.character.castOptions@v2",
    load: () => require("./prompts/novel/characterPreparation.prompts").characterCastOptionPrompt as UnknownPromptAsset,
  },
  {
    key: "novel.character.castOptions.repair@v1",
    load: () => require("./prompts/novel/characterPreparation.prompts").characterCastOptionRepairPrompt as UnknownPromptAsset,
  },
  {
    key: "novel.character.castOptions.zhNormalize@v1",
    load: () => require("./prompts/novel/characterPreparation.prompts").characterCastOptionNormalizePrompt as UnknownPromptAsset,
  },
  {
    key: "novel.character.supplemental@v1",
    load: () => require("./prompts/novel/characterPreparation.prompts").supplementalCharacterPrompt as UnknownPromptAsset,
  },
  {
    key: "novel.character.supplemental.zhNormalize@v1",
    load: () => require("./prompts/novel/characterPreparation.prompts").supplementalCharacterNormalizePrompt as UnknownPromptAsset,
  },
  {
    key: "novel.character.evolve@v1",
    load: () => require("./prompts/novel/coreCharacter.prompts").characterEvolutionPrompt as UnknownPromptAsset,
  },
  {
    key: "novel.character.worldCheck@v1",
    load: () => require("./prompts/novel/coreCharacter.prompts").characterWorldCheckPrompt as UnknownPromptAsset,
  },
  {
    key: "novel.chapter.summary@v1",
    load: () => require("./prompts/novel/review.prompts").chapterSummaryPrompt as UnknownPromptAsset,
  },
  {
    key: "novel.chapter.writer@v2",
    load: () => require("./prompts/novel/chapterWriter.prompts").chapterWriterPrompt as UnknownPromptAsset,
  },
  {
    key: "novel.review.chapter@v1",
    load: () => require("./prompts/novel/review.prompts").chapterReviewPrompt as UnknownPromptAsset,
  },
  {
    key: "novel.review.repair@v1",
    load: () => require("./prompts/novel/review.prompts").chapterRepairPrompt as UnknownPromptAsset,
  },
  {
    key: "novel.framing.suggest@v1",
    load: () => require("./prompts/novel/framing.prompts").novelFramingSuggestionPrompt as UnknownPromptAsset,
  },
  {
    key: "novel.continuation.rewrite_similarity@v1",
    load: () => require("./prompts/novel/continuation.prompts").novelContinuationRewritePrompt as UnknownPromptAsset,
  },
  {
    key: "novel.draft_optimize.selection@v1",
    load: () => require("./prompts/novel/draftOptimize.prompts").novelDraftOptimizeSelectionPrompt as UnknownPromptAsset,
  },
  {
    key: "novel.draft_optimize.full@v1",
    load: () => require("./prompts/novel/draftOptimize.prompts").novelDraftOptimizeFullPrompt as UnknownPromptAsset,
  },
  {
    key: "novel.production.characters@v1",
    load: () => require("./prompts/novel/production.prompts").novelProductionCharactersPrompt as UnknownPromptAsset,
  },
  {
    key: "state.snapshot.extract@v2",
    load: () => require("./prompts/state/state.prompts").stateSnapshotPrompt as UnknownPromptAsset,
  },
  {
    key: "storyMode.tree.generate@v1",
    load: () => require("./prompts/storyMode/storyMode.prompts").storyModeTreePrompt as UnknownPromptAsset,
  },
  {
    key: "storyMode.child.generate@v1",
    load: () => require("./prompts/storyMode/storyMode.prompts").storyModeChildPrompt as UnknownPromptAsset,
  },
  {
    key: "storyWorldSlice.generate@v1",
    load: () => require("./prompts/storyWorldSlice/storyWorldSlice.prompts").storyWorldSlicePrompt as UnknownPromptAsset,
  },
  {
    key: "style.detection@v1",
    load: () => require("./prompts/style/style.prompts").styleDetectionPrompt as UnknownPromptAsset,
  },
  {
    key: "style.recommendation@v1",
    load: () => require("./prompts/style/style.prompts").styleRecommendationPrompt as UnknownPromptAsset,
  },
  {
    key: "style.generate@v1",
    load: () => require("./prompts/style/style.prompts").styleGenerationPrompt as UnknownPromptAsset,
  },
  {
    key: "style.rewrite@v1",
    load: () => require("./prompts/style/style.prompts").styleRewritePrompt as UnknownPromptAsset,
  },
  {
    key: "style.profile.extract@v1",
    load: () => require("./prompts/style/style.prompts").styleProfileExtractionPrompt as UnknownPromptAsset,
  },
  {
    key: "style.profile.from_book_analysis@v1",
    load: () => require("./prompts/style/style.prompts").styleProfileFromBookAnalysisPrompt as UnknownPromptAsset,
  },
  {
    key: "world.reference.inspiration@v1",
    load: () => require("./prompts/world/world.prompts").worldReferenceInspirationPrompt as UnknownPromptAsset,
  },
  {
    key: "world.draft.generate@v1",
    load: () => require("./prompts/world/worldDraft.prompts").worldDraftGenerationPrompt as UnknownPromptAsset,
  },
  {
    key: "world.draft.refine@v1",
    load: () => require("./prompts/world/worldDraft.prompts").worldDraftRefinePrompt as UnknownPromptAsset,
  },
  {
    key: "world.draft.refine_alternatives@v1",
    load: () => require("./prompts/world/worldDraft.prompts").worldDraftRefineAlternativesPrompt as UnknownPromptAsset,
  },
  {
    key: "world.inspiration.concept_card@v1",
    load: () => require("./prompts/world/world.prompts").worldInspirationConceptCardPrompt as UnknownPromptAsset,
  },
  {
    key: "world.inspiration.localize_concept_card@v1",
    load: () => require("./prompts/world/world.prompts").worldInspirationConceptCardLocalizationPrompt as UnknownPromptAsset,
  },
  {
    key: "world.property_options.generate@v1",
    load: () => require("./prompts/world/world.prompts").worldPropertyOptionsPrompt as UnknownPromptAsset,
  },
  {
    key: "world.deepening.questions@v1",
    load: () => require("./prompts/world/world.prompts").worldDeepeningQuestionsPrompt as UnknownPromptAsset,
  },
  {
    key: "world.consistency.check@v1",
    load: () => require("./prompts/world/world.prompts").worldConsistencyPrompt as UnknownPromptAsset,
  },
  {
    key: "world.layer.generate@v1",
    load: () => require("./prompts/world/world.prompts").worldLayerGenerationPrompt as UnknownPromptAsset,
  },
  {
    key: "world.layer.localize@v1",
    load: () => require("./prompts/world/world.prompts").worldLayerLocalizationPrompt as UnknownPromptAsset,
  },
  {
    key: "world.import.extract@v1",
    load: () => require("./prompts/world/world.prompts").worldImportExtractionPrompt as UnknownPromptAsset,
  },
  {
    key: "world.visualization.generate@v1",
    load: () => require("./prompts/world/world.prompts").worldVisualizationPrompt as UnknownPromptAsset,
  },
  {
    key: "world.structure.backfill@v1",
    load: () => require("./prompts/world/world.prompts").worldStructureBackfillPrompt as UnknownPromptAsset,
  },
  {
    key: "world.structure.generate@v1",
    load: () => require("./prompts/world/world.prompts").worldStructureSectionPrompt as UnknownPromptAsset,
  },
  {
    key: "world.axioms.suggest@v1",
    load: () => require("./prompts/world/world.prompts").worldAxiomSuggestionPrompt as UnknownPromptAsset,
  },
]);

const promptAssetByKey = new Map<string, UnknownPromptAsset>();

function loadRegisteredPromptAsset(key: string): UnknownPromptAsset | null {
  const cached = promptAssetByKey.get(key);
  if (cached) {
    return cached;
  }

  const load = promptAssetLoaderByKey.get(key);
  if (!load) {
    return null;
  }

  const asset = load();
  const assetKey = buildPromptAssetKey(asset);
  if (assetKey !== key) {
    throw new Error(`Prompt asset registry key mismatch: expected ${key}, received ${assetKey}`);
  }

  promptAssetByKey.set(key, asset);
  return asset;
}

export function hasRegisteredPromptAsset(id: string, version: string): boolean {
  return promptAssetLoaderByKey.has(`${id}@${version}`);
}

export function listRegisteredPromptAssets(): UnknownPromptAsset[] {
  return [...promptAssetLoaderByKey.keys()]
    .map((key) => loadRegisteredPromptAsset(key))
    .filter((asset): asset is UnknownPromptAsset => Boolean(asset));
}

export function getRegisteredPromptAsset(id: string, version: string): UnknownPromptAsset | null {
  return loadRegisteredPromptAsset(`${id}@${version}`);
}
