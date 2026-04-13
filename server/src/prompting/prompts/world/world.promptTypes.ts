import type { WorldLayerKey, WorldStructureSectionKey } from "@ai-novel/shared/types/world";
import type { WorldReferenceAnchor, WorldReferenceMode } from "@ai-novel/shared/types/worldWizard";

export interface WorldReferenceInspirationPromptInput {
  userPrompt: string;
  isRetry: boolean;
}

export interface WorldVisualizationPromptInput {
  worldPromptSource: string;
}

export interface WorldStructureBackfillPromptInput {
  promptSource: string;
}

export interface WorldStructureSectionPromptInput {
  section: WorldStructureSectionKey;
  promptSource: string;
  currentStructure: unknown;
  currentBindingSupport: unknown;
}

export interface WorldAxiomSuggestionPromptInput {
  worldName: string;
  worldType: string;
  templateName: string;
  templateDescription: string;
  description: string;
  blueprintPromptBlock: string;
}

export interface WorldInspirationConceptCardPromptInput {
  mode: "free" | "reference" | "random";
  worldTypeHint: string;
  promptText: string;
  extracted: boolean;
  originalLength: number;
  ragContext: string;
  templateKeysText: string;
}

export interface WorldInspirationConceptCardLocalizationPromptInput {
  conceptCardJson: string;
}

export interface WorldPropertyOptionsPromptInput {
  referenceMode?: WorldReferenceMode | null;
  retryStrict?: boolean;
  optionsCount: number;
  worldType: string;
  templateName: string;
  templateDescription: string;
  classicElements: string[];
  pitfalls: string[];
  conceptSummary: string;
  coreImagery: string[];
  keywords: string[];
  tone: string;
  sourcePrompt: string;
  ragContext?: string;
  referenceAnchors?: WorldReferenceAnchor[];
  preserveElements?: string[];
  allowedChanges?: string[];
  forbiddenElements?: string[];
}

export interface WorldDeepeningQuestionsPromptInput {
  worldName: string;
  description: string;
  dataJson: string;
  ragContext: string;
}

export interface WorldConsistencyPromptInput {
  worldName: string;
  axioms: string;
  coreSettingsJson: string;
  ragContext: string;
}

export interface WorldLayerGenerationPromptInput {
  layerKey: WorldLayerKey;
  targetFields: string[];
  worldName: string;
  worldType: string;
  templateName: string;
  templateDescription: string;
  classicElements: string[];
  pitfalls: string[];
  axioms: string;
  summary: string;
  blueprintPromptBlock: string;
  existingJson: string;
  ragContext: string;
}

export interface WorldLayerLocalizationPromptInput {
  layerKey: WorldLayerKey;
  layerFields: string[];
  sourcePayloadJson: string;
}

export interface WorldImportExtractionPromptInput {
  content: string;
}
