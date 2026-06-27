import type {
  BookAnalysisCharacter,
  BookAnalysisCharacterAppearance,
  BookAnalysisCharacterAppearanceImage,
  BookAnalysisCharacterAppearanceSnapshot,
  BookAnalysisCharacterDepthMetadata,
  BookAnalysisCharacterDimension,
  BookAnalysisCharacterGenerationDepth,
  BookAnalysisCharacterProfileSection,
  BookAnalysisCharacterStatus,
} from "@ai-novel/shared/types/bookAnalysisCharacter";
import type { CharacterProfile } from "@ai-novel/shared/types/characterProfile";
import {
  decodeEvidence,
  safeParseJSON,
} from "../shared/bookAnalysis.utils";
import { toImageAsset } from "../../image/imageGenerationMappers";

export const DEFAULT_CHARACTER_DIMENSIONS: BookAnalysisCharacterDimension[] = [
  "basic",
  "appearance",
  "personality",
  "capability",
  "motivation",
  "arc",
  "relations",
  "scenes",
  "languageStyle",
  "thinkingPattern",
  "values",
  "secrets",
];

export function parseJsonObject(value: string | null): Record<string, unknown> | null {
  const parsed = safeParseJSON<Record<string, unknown> | null>(value, null);
  return parsed && typeof parsed === "object" ? parsed : null;
}

function parseDimensions(value: string | null): BookAnalysisCharacterDimension[] {
  const parsed = safeParseJSON<unknown[]>(value, []);
  const valid = new Set(DEFAULT_CHARACTER_DIMENSIONS);
  return parsed.filter((item): item is BookAnalysisCharacterDimension =>
    typeof item === "string" && valid.has(item as BookAnalysisCharacterDimension),
  );
}

export function parseStringArray(value: string | null): string[] {
  const parsed = safeParseJSON<unknown[]>(value, []);
  return parsed.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean);
}

export function normalizeDepth(value: unknown): BookAnalysisCharacterGenerationDepth {
  if (value === "quick" || value === "brief") {
    return "brief";
  }
  return value === "deep" || value === "exhaustive" ? value : "standard";
}

function normalizeStatus(value: unknown): BookAnalysisCharacterStatus {
  return value === "candidate" || value === "generating" || value === "failed"
    ? value
    : "generated";
}

export function normalizeCandidateName(value: string): string {
  return value
    .trim()
    .replace(/[\s"'“”‘’《》【】（）()，,。.!！?？:：;；、·]/g, "")
    .replace(/(同志|先生|小姐|姑娘|大人|老师|前辈)$/u, "")
    .toLowerCase();
}

export function normalizeDimensions(value: unknown): BookAnalysisCharacterDimension[] {
  if (!Array.isArray(value)) {
    return DEFAULT_CHARACTER_DIMENSIONS;
  }
  const valid = new Set(DEFAULT_CHARACTER_DIMENSIONS);
  const normalized = value.filter((item): item is BookAnalysisCharacterDimension =>
    typeof item === "string" && valid.has(item as BookAnalysisCharacterDimension),
  );
  return normalized.length > 0 ? normalized : DEFAULT_CHARACTER_DIMENSIONS;
}

export function normalizeProfile(input: Record<string, unknown>, fallbackName: string, fallbackRole: string): CharacterProfile {
  const readString = (key: string) => (typeof input[key] === "string" ? String(input[key]).trim() : "");
  const profile: CharacterProfile = {
    name: readString("name") || fallbackName,
    role: readString("role") || fallbackRole,
  };
  for (const key of [
    "age",
    "gender",
    "appearance",
    "physique",
    "attireStyle",
    "signatureDetail",
    "personality",
    "values",
    "speakingStyle",
    "outerGoal",
    "innerNeed",
    "fear",
    "wound",
    "misbelief",
    "growthTrajectory",
  ] as const) {
    const value = readString(key);
    if (value) {
      profile[key] = value;
    }
  }
  if (Array.isArray(input.aliases)) {
    profile.aliases = input.aliases.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean);
  }
  if (Array.isArray(input.arcStages)) {
    profile.arcStages = input.arcStages.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean);
  }
  if (Array.isArray(input.keyRelations)) {
    profile.keyRelations = input.keyRelations
      .map((item) => {
        if (!item || typeof item !== "object") {
          return null;
        }
        const row = item as Record<string, unknown>;
        const targetName = typeof row.targetName === "string" ? row.targetName.trim() : "";
        const relationType = typeof row.relationType === "string" ? row.relationType.trim() : "";
        if (!targetName || !relationType) {
          return null;
        }
        const relation: NonNullable<CharacterProfile["keyRelations"]>[number] = {
          targetName,
          relationType,
        };
        const description = typeof row.description === "string" ? row.description.trim() : "";
        if (description) {
          relation.description = description;
        }
        return relation;
      })
      .filter((item): item is NonNullable<CharacterProfile["keyRelations"]>[number] => Boolean(item));
  }
  if (Array.isArray(input.highlightScenes)) {
    profile.highlightScenes = input.highlightScenes
      .map((item) => {
        if (!item || typeof item !== "object") {
          return null;
        }
        const row = item as Record<string, unknown>;
        const sceneLabel = typeof row.sceneLabel === "string" ? row.sceneLabel.trim() : "";
        const performance = typeof row.performance === "string" ? row.performance.trim() : "";
        return sceneLabel && performance ? { sceneLabel, performance } : null;
      })
      .filter((item): item is NonNullable<CharacterProfile["highlightScenes"]>[number] => Boolean(item));
  }
  return profile;
}

function parseProfileSections(value: string | null): BookAnalysisCharacterProfileSection[] {
  const parsed = safeParseJSON<unknown[]>(value, []);
  const valid = new Set(DEFAULT_CHARACTER_DIMENSIONS);
  const sections: BookAnalysisCharacterProfileSection[] = [];
  for (const item of parsed) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const row = item as Record<string, unknown>;
    const dimension = typeof row.dimension === "string" && valid.has(row.dimension as BookAnalysisCharacterDimension)
      ? row.dimension as BookAnalysisCharacterDimension
      : null;
    const content = typeof row.content === "string" ? row.content.trim() : "";
    if (!dimension || !content) {
      continue;
    }
    sections.push({
      dimension,
      title: typeof row.title === "string" && row.title.trim() ? row.title.trim() : dimension,
      depth: normalizeDepth(row.depth),
      content,
      evidence: Array.isArray(row.evidence) ? row.evidence as any : [],
      ...(typeof row.updatedAt === "string" ? { updatedAt: row.updatedAt } : {}),
    });
  }
  return sections;
}

function parseDepthMetadata(value: string | null): BookAnalysisCharacterDepthMetadata | null {
  const parsed = parseJsonObject(value);
  if (!parsed || !parsed.dimensions || typeof parsed.dimensions !== "object" || Array.isArray(parsed.dimensions)) {
    return null;
  }
  return parsed as unknown as BookAnalysisCharacterDepthMetadata;
}

function serializeAppearanceImage(row: any): BookAnalysisCharacterAppearanceImage {
  return {
    id: row.id,
    snapshotId: row.snapshotId,
    generationTaskId: row.generationTaskId,
    imageAssetId: row.imageAssetId,
    imageAsset: row.imageAsset ? toImageAsset(row.imageAsset) : null,
    imagePrompt: parseJsonObject(row.imagePromptJson),
    referenceAssetIds: parseStringArray(row.referenceAssetIdsJson),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function serializeAppearanceSnapshot(row: any): BookAnalysisCharacterAppearanceSnapshot {
  return {
    id: row.id,
    characterId: row.characterId,
    chapterIndex: row.chapterIndex,
    chapterTitle: row.chapterTitle,
    appearance: parseJsonObject(row.appearanceJson),
    evidence: decodeEvidence(row.evidenceJson),
    summaryCaption: row.summaryCaption,
    contextSceneRefs: parseStringArray(row.contextSceneRefsJson),
    manuallyEdited: Boolean(row.manuallyEdited),
    images: (row.images ?? []).map(serializeAppearanceImage),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function serializeAppearance(row: any): BookAnalysisCharacterAppearance | null {
  if (!row) {
    return null;
  }
  return {
    id: row.id,
    characterId: row.characterId,
    coveragePercent: row.coveragePercent,
    consolidatedAppearance: parseJsonObject(row.consolidatedAppearanceJson),
    variantPolicy: parseJsonObject(row.variantPolicyJson),
    lastIndexedChapterIndex: row.lastIndexedChapterIndex,
    snapshots: (row.snapshots ?? []).map(serializeAppearanceSnapshot),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function serializeCharacter(row: any): BookAnalysisCharacter {
  const profile = normalizeProfile(parseJsonObject(row.profileJson) ?? {}, row.name, row.role);
  return {
    id: row.id,
    analysisId: row.analysisId,
    name: row.name,
    role: row.role,
    status: normalizeStatus(row.status),
    briefDescription: row.briefDescription,
    importance: row.importance,
    occurringChapters: parseStringArray(row.occurringChaptersJson),
    lastGenerationError: row.lastGenerationError,
    generationDepth: normalizeDepth(row.generationDepth),
    selectedDimensions: parseDimensions(row.selectedDimensionsJson),
    profile,
    evidence: decodeEvidence(row.evidenceJson),
    depthMetadata: parseDepthMetadata(row.depthMetadataJson),
    profileSections: parseProfileSections(row.profileSectionsJson),
    appearance: serializeAppearance(row.appearance),
    arcs: (row.arcs ?? []).map((arc: any) => ({
      id: arc.id,
      characterId: arc.characterId,
      chapterIndex: arc.chapterIndex,
      stageLabel: arc.stageLabel,
      stateSnapshot: parseJsonObject(arc.stateSnapshotJson),
      evidence: decodeEvidence(arc.evidenceJson),
      sortOrder: arc.sortOrder,
      createdAt: arc.createdAt.toISOString(),
      updatedAt: arc.updatedAt.toISOString(),
    })),
    scenes: (row.scenes ?? []).map((scene: any) => ({
      id: scene.id,
      characterId: scene.characterId,
      sceneLabel: scene.sceneLabel,
      sceneType: scene.sceneType,
      performance: parseJsonObject(scene.performanceJson),
      evidence: decodeEvidence(scene.evidenceJson),
      sortOrder: scene.sortOrder,
      createdAt: scene.createdAt.toISOString(),
      updatedAt: scene.updatedAt.toISOString(),
    })),
    sortOrder: row.sortOrder,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
