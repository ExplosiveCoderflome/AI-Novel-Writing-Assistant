import {
  DIRECTOR_RUN_MODES,
  type DirectorRunMode,
  type DirectorWorldSetupMode,
} from "@ai-novel/shared/types/novelDirector";
import type { NovelBasicFormState } from "../../novelBasicInfo.shared";
import type { AutoDirectorCreateStageKey } from "../directorCreateStages";

const DRAFT_VERSION = 1;
const DRAFT_STORAGE_PREFIX = `ai-novel.auto-director-create.draft.v${DRAFT_VERSION}`;
const RECOVERABLE_STAGES = ["idea", "basic", "world_style", "model_run"] as const;

type RecoverableStage = typeof RECOVERABLE_STAGES[number];

interface StorageLike {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
}

export interface AutoDirectorCreateDraftScopeInput {
  marketBriefId?: string;
  referenceMode?: string;
  referenceBookAnalysisId?: string;
  referenceDocumentId?: string;
  initialStyleProfileId?: string;
}

export interface AutoDirectorCreateDraft {
  version: typeof DRAFT_VERSION;
  scopeKey: string;
  idea: string;
  basicForm: Partial<NovelBasicFormState>;
  activeStage: RecoverableStage;
  completedStages: RecoverableStage[];
  runMode: DirectorRunMode;
  worldSetupMode: DirectorWorldSetupMode;
  selectedStyleProfileId: string;
  savedAt: string;
}

export interface AutoDirectorCreateDraftInput {
  idea: string;
  basicForm: NovelBasicFormState;
  activeStage: AutoDirectorCreateStageKey;
  completedStages: Iterable<AutoDirectorCreateStageKey>;
  runMode: DirectorRunMode;
  worldSetupMode: DirectorWorldSetupMode;
  selectedStyleProfileId: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isRecoverableStage(value: unknown): value is RecoverableStage {
  return typeof value === "string" && (RECOVERABLE_STAGES as readonly string[]).includes(value);
}

function draftStorageKey(scopeKey: string): string {
  return `${DRAFT_STORAGE_PREFIX}:${scopeKey}`;
}

export function buildAutoDirectorCreateDraftScope(input: AutoDirectorCreateDraftScopeInput): string {
  return [
    input.marketBriefId,
    input.referenceMode,
    input.referenceBookAnalysisId,
    input.referenceDocumentId,
    input.initialStyleProfileId,
  ].map((value) => encodeURIComponent(value?.trim() || "none")).join("|");
}

export function toRecoverableAutoDirectorCreateStage(
  stage: AutoDirectorCreateStageKey,
): RecoverableStage {
  return stage === "candidates" ? "model_run" : stage;
}

export function saveAutoDirectorCreateDraft(
  storage: StorageLike,
  scopeKey: string,
  input: AutoDirectorCreateDraftInput,
): boolean {
  const draft: AutoDirectorCreateDraft = {
    version: DRAFT_VERSION,
    scopeKey,
    idea: input.idea,
    basicForm: input.basicForm,
    activeStage: toRecoverableAutoDirectorCreateStage(input.activeStage),
    completedStages: Array.from(new Set(
      Array.from(input.completedStages)
        .map(toRecoverableAutoDirectorCreateStage)
        .filter(isRecoverableStage),
    )),
    runMode: input.runMode,
    worldSetupMode: input.worldSetupMode,
    selectedStyleProfileId: input.selectedStyleProfileId,
    savedAt: new Date().toISOString(),
  };

  try {
    storage.setItem(draftStorageKey(scopeKey), JSON.stringify(draft));
    return true;
  } catch {
    return false;
  }
}

export function loadAutoDirectorCreateDraft(
  storage: StorageLike,
  scopeKey: string,
): AutoDirectorCreateDraft | null {
  try {
    const raw = storage.getItem(draftStorageKey(scopeKey));
    if (!raw) {
      return null;
    }
    const value = JSON.parse(raw) as unknown;
    if (
      !isRecord(value)
      || value.version !== DRAFT_VERSION
      || value.scopeKey !== scopeKey
      || typeof value.idea !== "string"
      || !isRecord(value.basicForm)
      || !isRecoverableStage(value.activeStage)
      || !Array.isArray(value.completedStages)
      || typeof value.runMode !== "string"
      || !(DIRECTOR_RUN_MODES as readonly string[]).includes(value.runMode)
      || (value.worldSetupMode !== "auto_generate" && value.worldSetupMode !== "skip")
      || typeof value.selectedStyleProfileId !== "string"
      || typeof value.savedAt !== "string"
    ) {
      return null;
    }

    return {
      version: DRAFT_VERSION,
      scopeKey,
      idea: value.idea,
      basicForm: value.basicForm as Partial<NovelBasicFormState>,
      activeStage: value.activeStage,
      completedStages: Array.from(new Set(value.completedStages.filter(isRecoverableStage))),
      runMode: value.runMode as DirectorRunMode,
      worldSetupMode: value.worldSetupMode,
      selectedStyleProfileId: value.selectedStyleProfileId,
      savedAt: value.savedAt,
    };
  } catch {
    return null;
  }
}

export function clearAutoDirectorCreateDraft(storage: StorageLike, scopeKey: string): boolean {
  try {
    storage.removeItem(draftStorageKey(scopeKey));
    return true;
  } catch {
    return false;
  }
}
