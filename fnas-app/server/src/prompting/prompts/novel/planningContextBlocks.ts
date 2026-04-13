import type {
  DirectorCandidate,
  DirectorCandidateBatch,
  DirectorProjectContextInput,
} from "@ai-novel/shared/types/novelDirector";
import type { StoryMacroPlan } from "@ai-novel/shared/types/storyMacro";
import { createContextBlock } from "../../core/contextBudget";
import type { PromptContextBlock } from "../../core/promptTypes";

function compactText(value: string | null | undefined, fallback = "none"): string {
  return value?.replace(/\s+/g, " ").trim() || fallback;
}

function takeUnique(items: Array<string | null | undefined>, limit = items.length): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of items) {
    const normalized = compactText(item, "");
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    result.push(normalized);
    if (result.length >= limit) {
      break;
    }
  }
  return result;
}

export function formatProjectContext(input: DirectorProjectContextInput): string {
  const lines = [
    input.title?.trim() ? `current title: ${input.title.trim()}` : "",
    input.description?.trim() ? `current description: ${input.description.trim()}` : "",
    input.targetAudience?.trim() ? `target audience: ${input.targetAudience.trim()}` : "",
    input.bookSellingPoint?.trim() ? `book selling point: ${input.bookSellingPoint.trim()}` : "",
    input.competingFeel?.trim() ? `competing feel: ${input.competingFeel.trim()}` : "",
    input.first30ChapterPromise?.trim() ? `first 30 chapter promise: ${input.first30ChapterPromise.trim()}` : "",
    input.commercialTags && input.commercialTags.length > 0
      ? `commercial tags: ${input.commercialTags.join(", ")}`
      : "",
    input.genreId?.trim() ? `genre id: ${input.genreId.trim()}` : "",
    input.worldId?.trim() ? `world id: ${input.worldId.trim()}` : "",
    input.writingMode ? `writing mode: ${input.writingMode}` : "",
    input.projectMode ? `project mode: ${input.projectMode}` : "",
    input.narrativePov ? `narrative pov: ${input.narrativePov}` : "",
    input.pacePreference ? `pace: ${input.pacePreference}` : "",
    input.styleTone?.trim() ? `style tone: ${input.styleTone.trim()}` : "",
    input.emotionIntensity ? `emotion intensity: ${input.emotionIntensity}` : "",
    input.aiFreedom ? `ai freedom: ${input.aiFreedom}` : "",
    typeof input.defaultChapterLength === "number" ? `default chapter length: ${input.defaultChapterLength}` : "",
    typeof input.estimatedChapterCount === "number" ? `estimated chapters: ${input.estimatedChapterCount}` : "",
  ].filter(Boolean);
  return lines.join("\n");
}

function formatCandidateDigest(candidate: DirectorCandidate): string {
  return [
    `title: ${candidate.workingTitle}`,
    `logline: ${candidate.logline}`,
    `positioning: ${candidate.positioning}`,
    `selling point: ${candidate.sellingPoint}`,
    `core conflict: ${candidate.coreConflict}`,
    `protagonist path: ${candidate.protagonistPath}`,
    `hook strategy: ${candidate.hookStrategy}`,
    `progression loop: ${candidate.progressionLoop}`,
    `ending direction: ${candidate.endingDirection}`,
  ].join("\n");
}

function formatLatestBatchDigest(batch: DirectorCandidateBatch | undefined): string {
  if (!batch) {
    return "No previous batch.";
  }
  return [
    `${batch.roundLabel}: ${compactText(batch.refinementSummary, "latest candidate round")}`,
    ...batch.candidates.map((candidate, index) => (
      [`option ${index + 1}`, formatCandidateDigest(candidate)].join("\n")
    )),
  ].join("\n\n");
}

function formatStoryMacroSummary(plan: StoryMacroPlan | null | undefined): string {
  if (!plan) {
    return "No story macro plan.";
  }
  return [
    plan.expansion?.expanded_premise ? `expanded premise: ${plan.expansion.expanded_premise}` : "",
    plan.expansion?.conflict_engine ? `conflict engine: ${plan.expansion.conflict_engine}` : "",
    plan.expansion?.mystery_box ? `mystery box: ${plan.expansion.mystery_box}` : "",
    plan.decomposition?.selling_point ? `selling point: ${plan.decomposition.selling_point}` : "",
    plan.decomposition?.core_conflict ? `core conflict: ${plan.decomposition.core_conflict}` : "",
    plan.decomposition?.progression_loop ? `progression loop: ${plan.decomposition.progression_loop}` : "",
    plan.decomposition?.growth_path ? `growth path: ${plan.decomposition.growth_path}` : "",
    plan.decomposition?.ending_flavor ? `ending flavor: ${plan.decomposition.ending_flavor}` : "",
    plan.constraints.length > 0 ? `constraints: ${plan.constraints.join(" | ")}` : "",
  ].filter(Boolean).join("\n");
}

export function buildDirectorCandidateContextBlocks(input: {
  idea: string;
  context: DirectorProjectContextInput;
  latestBatch?: DirectorCandidateBatch;
  presets: string[];
  feedback?: string;
}): PromptContextBlock[] {
  return [
    createContextBlock({
      id: "idea_seed",
      group: "idea_seed",
      priority: 100,
      required: true,
      content: `Idea seed:\n${compactText(input.idea)}`,
    }),
    createContextBlock({
      id: "project_context",
      group: "project_context",
      priority: 90,
      content: `Project context:\n${formatProjectContext(input.context) || "none"}`,
    }),
    createContextBlock({
      id: "latest_batch",
      group: "latest_batch",
      priority: 70,
      content: `Latest batch digest:\n${formatLatestBatchDigest(input.latestBatch)}`,
    }),
    createContextBlock({
      id: "preset_hints",
      group: "preset_hints",
      priority: 80,
      content: `Preset correction hints:\n${input.presets.join("\n") || "none"}`,
    }),
    createContextBlock({
      id: "freeform_feedback",
      group: "freeform_feedback",
      priority: 76,
      content: `Freeform correction hint:\n${compactText(input.feedback) || "none"}`,
    }),
  ].filter((block) => block.content.trim().length > 0);
}

export function buildDirectorBlueprintContextBlocks(input: {
  idea: string;
  context: DirectorProjectContextInput;
  candidate: DirectorCandidate;
  storyMacroPlan: StoryMacroPlan;
  targetChapterCount: number;
}): PromptContextBlock[] {
  return [
    createContextBlock({
      id: "book_contract",
      group: "book_contract",
      priority: 100,
      required: true,
      content: [
        "Book contract:",
        formatCandidateDigest(input.candidate),
        `target chapters: ${input.targetChapterCount}`,
      ].join("\n"),
    }),
    createContextBlock({
      id: "idea_seed",
      group: "idea_seed",
      priority: 96,
      required: true,
      content: `Idea seed:\n${compactText(input.idea)}`,
    }),
    createContextBlock({
      id: "project_context",
      group: "project_context",
      priority: 86,
      content: `Project context:\n${formatProjectContext(input.context) || "none"}`,
    }),
    createContextBlock({
      id: "macro_constraints",
      group: "macro_constraints",
      priority: 92,
      required: true,
      content: `Story macro summary:\n${formatStoryMacroSummary(input.storyMacroPlan)}`,
    }),
  ];
}

export function buildDirectorBookContractContextBlocks(input: {
  idea: string;
  context: DirectorProjectContextInput;
  candidate: DirectorCandidate;
  storyMacroPlan: StoryMacroPlan | null | undefined;
  targetChapterCount: number;
}): PromptContextBlock[] {
  return [
    createContextBlock({
      id: "book_direction",
      group: "book_contract",
      priority: 100,
      required: true,
      content: [
        "Director book direction:",
        formatCandidateDigest(input.candidate),
        `target chapters: ${input.targetChapterCount}`,
      ].join("\n"),
    }),
    createContextBlock({
      id: "idea_seed",
      group: "idea_seed",
      priority: 96,
      required: true,
      content: `Idea seed:\n${compactText(input.idea)}`,
    }),
    createContextBlock({
      id: "project_context",
      group: "project_context",
      priority: 88,
      content: `Project context:\n${formatProjectContext(input.context) || "none"}`,
    }),
    createContextBlock({
      id: "macro_constraints",
      group: "macro_constraints",
      priority: 92,
      content: `Story macro summary:\n${formatStoryMacroSummary(input.storyMacroPlan)}`,
    }),
  ].filter((block) => block.content.trim().length > 0);
}

export function buildStoryMacroDecompositionContextBlocks(input: {
  storyInput: string;
  projectContext: string;
}): PromptContextBlock[] {
  return [
    createContextBlock({
      id: "story_input",
      group: "story_input",
      priority: 100,
      required: true,
      content: `Story input:\n${compactText(input.storyInput)}`,
    }),
    createContextBlock({
      id: "project_context",
      group: "project_context",
      priority: 92,
      content: `Project context:\n${compactText(input.projectContext)}`,
    }),
  ];
}

export function buildStoryMacroFieldRegenerationContextBlocks(input: {
  field: string;
  storyInput: string;
  projectContext: string;
  expansionSummary: string;
  decompositionSummary: string;
  constraints: string[];
  lockedFields: string[];
}): PromptContextBlock[] {
  return [
    createContextBlock({
      id: "story_input",
      group: "story_input",
      priority: 100,
      required: true,
      content: `Story input:\n${compactText(input.storyInput)}`,
    }),
    createContextBlock({
      id: "target_field",
      group: "target_field",
      priority: 98,
      required: true,
      content: `Target field: ${input.field}`,
    }),
    createContextBlock({
      id: "project_context",
      group: "project_context",
      priority: 90,
      content: `Project context:\n${compactText(input.projectContext)}`,
    }),
    createContextBlock({
      id: "expansion_summary",
      group: "expansion_summary",
      priority: 88,
      content: `Expansion summary:\n${compactText(input.expansionSummary)}`,
    }),
    createContextBlock({
      id: "decomposition_summary",
      group: "decomposition_summary",
      priority: 94,
      required: true,
      content: `Decomposition summary:\n${compactText(input.decompositionSummary)}`,
    }),
    createContextBlock({
      id: "constraints",
      group: "constraints",
      priority: 96,
      required: true,
      content: `Constraints:\n${takeUnique(input.constraints, 8).join("\n") || "none"}`,
    }),
    createContextBlock({
      id: "locked_fields",
      group: "locked_fields",
      priority: 82,
      content: `Locked fields:\n${takeUnique(input.lockedFields, 12).join("\n") || "none"}`,
    }),
  ].filter((block) => block.content.trim().length > 0);
}
