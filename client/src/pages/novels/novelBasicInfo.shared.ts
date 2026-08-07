import type { BookAnalysisSectionKey } from "@ai-novel/shared/types/bookAnalysis";
import { formatCommercialTagsInput, normalizeCommercialTags } from "@ai-novel/shared/types/novelFraming";

export interface NovelBasicFormState {
  title: string;
  description: string;
  targetAudience: string;
  bookSellingPoint: string;
  competingFeel: string;
  first30ChapterPromise: string;
  commercialTagsText: string;
  genreId: string;
  primaryStoryModeId: string;
  secondaryStoryModeId: string;
  worldId: string;
  status: "draft" | "published";
  writingMode: "original" | "continuation";
  projectMode: "ai_led" | "co_pilot" | "draft_mode" | "auto_pipeline";
  readerChannelPreference: "ai_judge" | "male_oriented" | "female_oriented" | "general";
  narrativePov: "first_person" | "third_person" | "mixed";
  pacePreference: "slow" | "balanced" | "fast";
  styleTone: string;
  emotionIntensity: "low" | "medium" | "high";
  aiFreedom: "low" | "medium" | "high";
  postGenerationStyleReviewEnabled: boolean;
  defaultChapterLength: number;
  estimatedChapterCount: number;
  projectStatus: "not_started" | "in_progress" | "completed" | "rework" | "blocked";
  storylineStatus: "not_started" | "in_progress" | "completed" | "rework" | "blocked";
  outlineStatus: "not_started" | "in_progress" | "completed" | "rework" | "blocked";
  resourceReadyScore: number;
  continuationSourceType: "novel" | "knowledge_document";
  sourceNovelId: string;
  sourceKnowledgeDocumentId: string;
  continuationBookAnalysisId: string;
  continuationBookAnalysisSections: BookAnalysisSectionKey[];
}

export interface BasicInfoOption<T extends string> {
  value: T;
  label: string;
  summary: string;
  recommended?: boolean;
}

export const DEFAULT_ESTIMATED_CHAPTER_COUNT = 80;

export const WRITING_MODE_OPTIONS: BasicInfoOption<NovelBasicFormState["writingMode"]>[] = [ { value: "original", label: "Original", summary: "Create the world, characters, and main storyline from scratch, suitable for most new projects.", recommended: true, }, { value: "continuation", label: "Continuation", summary: "Continue the creation based on an existing novel or knowledge document, and will prioritize the injection of existing settings and book-breaking content.", }, ]; export const PROJECT_MODE_OPTIONS: BasicInfoOption<NovelBasicFormState["projectMode"]>[] = [ { value: "co_pilot", label: "AI Co-pilot", summary: "You set the direction, AI provides solutions and drafts, suitable for early polishing and high-frequency human decision-making.", recommended: true, }, { value: "ai_led", label: "AI Takes Over", summary: "AI is responsible for the main drive, you review at key nodes, suitable for projects with clear goals.", }, { value: "draft_mode", label: "draft priority", summary: "Quickly produce text and direction first, with weaker structural constraints, suitable for testing stories and getting a feel for the project.", }, { value: "auto_pipeline", label: "pipeline priority", summary: "Suitable for continuous progress according to planning, generation, auditing, and repair after a relatively complete setup.", }, ]; export const READER_CHANNEL_OPTIONS: BasicInfoOption<NovelBasicFormState["readerChannelPreference"]>[] = [ { value: "ai_judge", label: "AI Judgment", summary: "Let AI judge the default reader channel preference based on the theme, selling points, and initial idea, suitable as the default selection.", recommended: true, }, { value: "male_oriented", label: "Male-oriented", summary: "Emphasis on goals, upgrades, competition, fulfillment of satisfying moments, and external event progression.", }, { value: "female_oriented", label: "Female-oriented", summary: "Emphasis on relationship lines, emotional pull, character selection, and subtle stage-by-stage feedback.", }, { value: "general", label: "General Readers/Unrestricted", summary: "Unrestricted channel preference, let AI prioritize planning based on the story itself and the target reader description.", }, ]; export const POV_OPTIONS: BasicInfoOption<NovelBasicFormState["narrativePov"]>[] = [ { value: "third_person", label: "Third-person perspective", summary: "Most stable, suitable for multiple characters and complex storylines.", recommended: true, }, { value: "first_person", label: "First-person perspective", summary: "Strong sense of immersion, but limited information, suitable for strong protagonist-centric narratives.", }, { value: "mixed", label: "Mixed perspective", summary: "More flexible, but more prone to loss of control, suitable for mature projects.", }, ]; export const PACE_OPTIONS: BasicInfoOption<NovelBasicFormState["pacePreference"]>[] = [ { value: "balanced", label: "Balanced", summary: "Balances both progression and setup, suitable as the default choice.", recommended: true, }, { value: "slow", label: "Slow pace", summary: "Emphasis on setup, atmosphere, and emotional build-up.", }, { value: "fast", label: "Fast pace", summary: "Emphasis on event-driven, hook-based, and continuous progression.", }, ]; export const EMOTION_OPTIONS: BasicInfoOption<NovelBasicFormState["emotionIntensity"]>[] = [ { value: "medium", label: "Medium emotional intensity", summary: "Retains fluctuations but is not overloaded, suitable as a default value.", recommended: true, }, { value: "low", label: "Low emotional intensity", summary: "More restrained, suitable for calm narratives or more rational works.", }, { value: "high", label: "High emotional intensity", summary: "Emphasis on explosions, conflicts, and highly stimulating scenes.", }, ]; export const AI_FREEDOM_OPTIONS: BasicInfoOption<NovelBasicFormState["aiFreedom"]>[] = [ { value: "medium", label: "Medium freedom", summary: "Allows AI to supplement details and make local progress within the settings, suitable as the default value.", recommended: true, }, { value: "low", label: "Low freedom", summary: "Strictly follows the settings and plans, suitable for early-stage control.", }, { value: "high", label: "High freedom", summary: "Allows AI to actively expand the plot and details, suitable for mid-to-late-stage stable projects.", }, ]; export const PUBLICATION_STATUS_OPTIONS: BasicInfoOption<NovelBasicFormState["status"]>[] = [ { value: "draft", label: "draft", summary: "Still under development and polishing, suitable for most projects.", recommended: true, }, { value: "published", label: "published", summary: "Used to mark completed or publicly released works.", }, ]; export const PROJECT_STATUS_OPTIONS: Array<{ value: NovelBasicFormState["projectStatus"]; label: string }> = [
  { value: "not_started", label: "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know." },
  { value: "in_progress", label: "in progress" },
  { value: "completed", label: "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know." },
  { value: "rework", label: "Rework" },
  { value: "blocked", label: "block" },
];

export const BASIC_INFO_FIELD_HINTS = {
  writingMode: "Decide whether to start the project from scratch or build on existing work. It directly affects which contextual sources are prioritized for subsequent use.",
  targetAudience: "Explain who this book is primarily written for. It doesn’t matter if you don’t know how to write portraits of professional people, just describe them intuitively.",
  bookSellingPoint: "Write down clearly the most gripping points of the book, such as the relationship pull, the excitement of counterattack, the suspense advancement, or the freshness of the setting.",
  competingFeel: "Writing to create a reading experience that readers will relate to does not require you to imitate specific works.",
  first30ChapterPromise: "Write clearly what the readers will see, feel happy, and believe in the first 30 chapters.",
  commercialTagsText: "Just use commas to separate 3-6 tags, such as counterattack, strong conflict, suspense, and workplace game.",
  projectMode: "Decide how you and AI work together. It will affect which subsequent steps are automatically advanced and which steps rely more on manual confirmation.",
  readerChannelPreference: "Help AI judgment to default to cool points, emotional focus and relationship line weights. Maintain AI judgment when in doubt.",
  narrativePov: "Deciding which narrative perspective to use by default for chapter generation also affects how information is distributed.",
  pacePreference: "Deciding whether to focus on foreshadowing or advancement when planning chapters will affect scene density and hook strength.",
  emotionIntensity: "Determining the frequency of emotional outbursts and conflicts during subsequent generation, higher is not better.",
  aiFreedom: "Determine how far the AI ​​can deviate from established plans and settings. It is recommended to keep it low or medium in the early stage.",
  postGenerationStyleReviewEnabled: "Control AI deodorization detection and automatic correction after text generation. The writing method and anti-AI prompts before generation are still executed according to the rule base.",
  defaultChapterLength: "This is a reference word count when planning and generating chapters, not a hard limit. Common recommendations are 2500 to 3500.",
  estimatedChapterCount: "This is the estimated total number of chapters for the project, which will be used as a reference for the structured outline, plot points, and the default scope of the pipeline. It is not a hard limit.",
  resourceReadyScore: "Used to mark whether settings, characters, and main story information are sufficient. The higher the value, the more suitable it is to enter the automated production stage.",
  styleTone: "Just write a few keywords, such as coldness, restraint, and black humor. It affects the generated language style.",
  genreId: "Answer \"What kind of book is this\" based on the subject matter, such as cultivating immortality, city, and historical fiction. It will affect the planning, title and overall selling point tendency, so it is recommended to determine it as early as possible.",
  primaryStoryModeId: "The main promotion mode answers \"What does this book rely on to continue to promote and realize its fulfillment\", such as system flow, invincible flow, and farming flow. Subsequent planning and generation will obey it first.",
  secondaryStoryModeId: "The secondary promotion mode is only responsible for supplementing the flavor, such as superimposing the sense of shop management in daily healing, and superimposing the sense of vest in invincible flow, and cannot cover the boundaries of the main mode.",
  worldId: "Only a reference sample is recorded here to facilitate initializing the world of this book. The novel generation will give priority to reading the content in the \"Book World\" card at the top of the page.",
  status: "It is just a work life cycle mark and does not affect basic creative capabilities, but will affect the list and project management status.",
  continuationSourceType: "When continuing, choose whether to cite the novel on the site or the document version in the knowledge base.",
  continuationBookAnalysis: "The content of the split book will serve as a high-weight structured context, suitable for continued projects to maintain a consistent style and setting.",
} satisfies Record<string, string>;

export function createDefaultNovelBasicFormState(): NovelBasicFormState {
  return {
    title: "",
    description: "",
    targetAudience: "",
    bookSellingPoint: "",
    competingFeel: "",
    first30ChapterPromise: "",
    commercialTagsText: "",
    genreId: "",
    primaryStoryModeId: "",
    secondaryStoryModeId: "",
    worldId: "",
    status: "draft",
    writingMode: "original",
    projectMode: "co_pilot",
    readerChannelPreference: "ai_judge",
    narrativePov: "third_person",
    pacePreference: "balanced",
    styleTone: "",
    emotionIntensity: "medium",
    aiFreedom: "medium",
    postGenerationStyleReviewEnabled: true,
    defaultChapterLength: 2800,
    estimatedChapterCount: DEFAULT_ESTIMATED_CHAPTER_COUNT,
    projectStatus: "not_started",
    storylineStatus: "not_started",
    outlineStatus: "not_started",
    resourceReadyScore: 0,
    continuationSourceType: "novel",
    sourceNovelId: "",
    sourceKnowledgeDocumentId: "",
    continuationBookAnalysisId: "",
    continuationBookAnalysisSections: [],
  };
}

export function patchNovelBasicForm(
  previous: NovelBasicFormState,
  patch: Partial<NovelBasicFormState>,
): NovelBasicFormState {
  const next = { ...previous, ...patch };
  if (
    next.primaryStoryModeId
    && next.secondaryStoryModeId
    && next.primaryStoryModeId === next.secondaryStoryModeId
  ) {
    next.secondaryStoryModeId = "";
  }
  if (next.writingMode === "original") {
    next.sourceNovelId = "";
    next.sourceKnowledgeDocumentId = "";
    next.continuationBookAnalysisId = "";
    next.continuationBookAnalysisSections = [];
  } else if (next.continuationSourceType === "novel") {
    next.sourceKnowledgeDocumentId = "";
  } else if (next.continuationSourceType === "knowledge_document") {
    next.sourceNovelId = "";
  }
  if (
    patch.continuationSourceType !== undefined
    && patch.continuationSourceType !== previous.continuationSourceType
  ) {
    next.continuationBookAnalysisId = "";
    next.continuationBookAnalysisSections = [];
  }
  if (
    next.continuationSourceType === "novel"
    && patch.sourceNovelId !== undefined
    && patch.sourceNovelId !== previous.sourceNovelId
  ) {
    next.continuationBookAnalysisId = "";
    next.continuationBookAnalysisSections = [];
  }
  if (
    next.continuationSourceType === "knowledge_document"
    && patch.sourceKnowledgeDocumentId !== undefined
    && patch.sourceKnowledgeDocumentId !== previous.sourceKnowledgeDocumentId
  ) {
    next.continuationBookAnalysisId = "";
    next.continuationBookAnalysisSections = [];
  }
  if (patch.continuationBookAnalysisId !== undefined && !patch.continuationBookAnalysisId) {
    next.continuationBookAnalysisSections = [];
  }
  return next;
}

export function buildNovelCreatePayload(basicForm: NovelBasicFormState) {
  const commercialTags = normalizeCommercialTags(basicForm.commercialTagsText);
  return {
    title: basicForm.title.trim(),
    description: basicForm.description.trim() || undefined,
    targetAudience: basicForm.targetAudience.trim() || undefined,
    bookSellingPoint: basicForm.bookSellingPoint.trim() || undefined,
    competingFeel: basicForm.competingFeel.trim() || undefined,
    first30ChapterPromise: basicForm.first30ChapterPromise.trim() || undefined,
    commercialTags: commercialTags.length > 0 ? commercialTags : undefined,
    genreId: basicForm.genreId || undefined,
    primaryStoryModeId: basicForm.primaryStoryModeId || undefined,
    secondaryStoryModeId: basicForm.secondaryStoryModeId || undefined,
    worldId: basicForm.worldId || undefined,
    writingMode: basicForm.writingMode,
    projectMode: basicForm.projectMode,
    narrativePov: basicForm.narrativePov,
    pacePreference: basicForm.pacePreference,
    styleTone: basicForm.styleTone.trim() || undefined,
    emotionIntensity: basicForm.emotionIntensity,
    aiFreedom: basicForm.aiFreedom,
    postGenerationStyleReviewEnabled: basicForm.postGenerationStyleReviewEnabled,
    defaultChapterLength: basicForm.defaultChapterLength,
    estimatedChapterCount: basicForm.estimatedChapterCount,
    projectStatus: basicForm.projectStatus,
    storylineStatus: basicForm.storylineStatus,
    outlineStatus: basicForm.outlineStatus,
    resourceReadyScore: basicForm.resourceReadyScore,
    sourceNovelId: basicForm.writingMode === "continuation" && basicForm.continuationSourceType === "novel"
      ? (basicForm.sourceNovelId || undefined)
      : undefined,
    sourceKnowledgeDocumentId: basicForm.writingMode === "continuation" && basicForm.continuationSourceType === "knowledge_document"
      ? (basicForm.sourceKnowledgeDocumentId || undefined)
      : undefined,
    continuationBookAnalysisId: basicForm.writingMode === "continuation"
      && (
        (basicForm.continuationSourceType === "novel" && Boolean(basicForm.sourceNovelId))
        || (basicForm.continuationSourceType === "knowledge_document" && Boolean(basicForm.sourceKnowledgeDocumentId))
      )
      ? (basicForm.continuationBookAnalysisId || undefined)
      : undefined,
    continuationBookAnalysisSections:
      basicForm.writingMode === "continuation"
        && (
          (basicForm.continuationSourceType === "novel" && Boolean(basicForm.sourceNovelId))
          || (basicForm.continuationSourceType === "knowledge_document" && Boolean(basicForm.sourceKnowledgeDocumentId))
        )
        && basicForm.continuationBookAnalysisId
        ? (basicForm.continuationBookAnalysisSections.length > 0 ? basicForm.continuationBookAnalysisSections : undefined)
        : undefined,
  };
}

export function buildNovelUpdatePayload(basicForm: NovelBasicFormState) {
  const commercialTags = normalizeCommercialTags(basicForm.commercialTagsText);
  return {
    title: basicForm.title,
    description: basicForm.description,
    targetAudience: basicForm.targetAudience.trim() || null,
    bookSellingPoint: basicForm.bookSellingPoint.trim() || null,
    competingFeel: basicForm.competingFeel.trim() || null,
    first30ChapterPromise: basicForm.first30ChapterPromise.trim() || null,
    commercialTags: commercialTags.length > 0 ? commercialTags : null,
    genreId: basicForm.genreId || null,
    primaryStoryModeId: basicForm.primaryStoryModeId || null,
    secondaryStoryModeId: basicForm.secondaryStoryModeId || null,
    worldId: basicForm.worldId || null,
    status: basicForm.status,
    writingMode: basicForm.writingMode,
    projectMode: basicForm.projectMode,
    narrativePov: basicForm.narrativePov,
    pacePreference: basicForm.pacePreference,
    styleTone: basicForm.styleTone || null,
    emotionIntensity: basicForm.emotionIntensity,
    aiFreedom: basicForm.aiFreedom,
    postGenerationStyleReviewEnabled: basicForm.postGenerationStyleReviewEnabled,
    defaultChapterLength: basicForm.defaultChapterLength,
    estimatedChapterCount: basicForm.estimatedChapterCount,
    projectStatus: basicForm.projectStatus,
    storylineStatus: basicForm.storylineStatus,
    outlineStatus: basicForm.outlineStatus,
    resourceReadyScore: basicForm.resourceReadyScore,
    sourceNovelId: basicForm.writingMode === "continuation" && basicForm.continuationSourceType === "novel"
      ? (basicForm.sourceNovelId || null)
      : null,
    sourceKnowledgeDocumentId: basicForm.writingMode === "continuation" && basicForm.continuationSourceType === "knowledge_document"
      ? (basicForm.sourceKnowledgeDocumentId || null)
      : null,
    continuationBookAnalysisId: basicForm.writingMode === "continuation"
      && (
        (basicForm.continuationSourceType === "novel" && Boolean(basicForm.sourceNovelId))
        || (basicForm.continuationSourceType === "knowledge_document" && Boolean(basicForm.sourceKnowledgeDocumentId))
      )
      ? (basicForm.continuationBookAnalysisId || null)
      : null,
    continuationBookAnalysisSections:
      basicForm.writingMode === "continuation"
        && (
          (basicForm.continuationSourceType === "novel" && Boolean(basicForm.sourceNovelId))
          || (basicForm.continuationSourceType === "knowledge_document" && Boolean(basicForm.sourceKnowledgeDocumentId))
        )
        && basicForm.continuationBookAnalysisId
        ? (basicForm.continuationBookAnalysisSections.length > 0 ? basicForm.continuationBookAnalysisSections : null)
        : null,
  };
}

export { formatCommercialTagsInput };
