import type {
  VolumeBeatSheet,
  VolumeCountGuidance,
  VolumeCritiqueReport,
  VolumePlan,
  VolumePlanDocument,
  VolumeRebalanceDecision,
  VolumeStrategyPlan,
} from "@ai-novel/shared/types/novel";
import { normalizeVolumeDraft } from "../volumePlan.utils";

export function serializeVolumeDraftSnapshot(volumes: VolumePlan[]): string {
  return JSON.stringify(normalizeVolumeDraft(volumes).map((volume) => ({
    sortOrder: volume.sortOrder,
    title: volume.title,
    summary: volume.summary ?? "",
    openingHook: volume.openingHook ?? "",
    mainPromise: volume.mainPromise ?? "",
    primaryPressureSource: volume.primaryPressureSource ?? "",
    coreSellingPoint: volume.coreSellingPoint ?? "",
    escalationMode: volume.escalationMode ?? "",
    protagonistChange: volume.protagonistChange ?? "",
    midVolumeRisk: volume.midVolumeRisk ?? "",
    climax: volume.climax ?? "",
    payoffType: volume.payoffType ?? "",
    nextVolumeHook: volume.nextVolumeHook ?? "",
    resetPoint: volume.resetPoint ?? "",
    openPayoffs: volume.openPayoffs,
    chapters: volume.chapters.map((chapter) => ({
      chapterOrder: chapter.chapterOrder,
      beatKey: chapter.beatKey ?? null,
      title: chapter.title,
      summary: chapter.summary,
      purpose: chapter.purpose ?? "",
      conflictLevel: chapter.conflictLevel ?? null,
      conflictLevelSource: chapter.conflictLevelSource ?? null,
      revealLevel: chapter.revealLevel ?? null,
      targetWordCount: chapter.targetWordCount ?? null,
      mustAvoid: chapter.mustAvoid ?? "",
      taskSheet: chapter.taskSheet ?? "",
      payoffRefs: chapter.payoffRefs,
    })),
  })));
}

function serializeBeatSheetsSnapshot(beatSheets: VolumeBeatSheet[]): Array<{
  volumeId: string;
  volumeSortOrder: number;
  status: string;
  beats: VolumeBeatSheet["beats"];
}> {
  return beatSheets
    .slice()
    .sort((left, right) => (
      left.volumeSortOrder - right.volumeSortOrder
      || left.volumeId.localeCompare(right.volumeId)
    ))
    .map((sheet) => ({
      volumeId: sheet.volumeId,
      volumeSortOrder: sheet.volumeSortOrder,
      status: sheet.status,
      beats: sheet.beats.map((beat) => ({
        key: beat.key,
        label: beat.label,
        title: beat.title ?? null,
        summary: beat.summary,
        chapterSpanHint: beat.chapterSpanHint,
        mustDeliver: [...beat.mustDeliver],
      })),
    }));
}

function serializeRebalanceDecisionsSnapshot(
  rebalanceDecisions: VolumeRebalanceDecision[],
): VolumeRebalanceDecision[] {
  return rebalanceDecisions
    .slice()
    .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
}

export function serializeVolumeWorkspaceSnapshot(input: {
  volumes?: VolumePlan[] | null;
  strategyPlan?: VolumeStrategyPlan | null;
  critiqueReport?: VolumeCritiqueReport | null;
  beatSheets?: VolumeBeatSheet[] | null;
  rebalanceDecisions?: VolumeRebalanceDecision[] | null;
} | VolumePlanDocument | null | undefined): string {
  return JSON.stringify({
    volumes: serializeVolumeDraftSnapshot(input?.volumes ?? []),
    strategyPlan: input?.strategyPlan ?? null,
    critiqueReport: input?.critiqueReport ?? null,
    beatSheets: serializeBeatSheetsSnapshot(input?.beatSheets ?? []),
    rebalanceDecisions: serializeRebalanceDecisionsSnapshot(input?.rebalanceDecisions ?? []),
  });
}

export function resolveCustomVolumeCountInput(
  input: string,
  volumeCountGuidance: VolumeCountGuidance,
): { value: number | null; message: string | null } {
  const parsed = Number.parseInt(input.trim(), 10);
  if (!Number.isFinite(parsed)) {
    return {
      value: null,
      message: "Please enter a valid fixed volume number first.",
    };
  }
  if (
    parsed < volumeCountGuidance.allowedVolumeCountRange.min
    || parsed > volumeCountGuidance.allowedVolumeCountRange.max
  ) {
    return {
      value: null,
      message: `固定卷数必须落在 ${volumeCountGuidance.allowedVolumeCountRange.min}-${volumeCountGuidance.allowedVolumeCountRange.max} 卷之间。`,
    };
  }
  return {
    value: parsed,
    message: null,
  };
}

export function buildGenerationNotice(strategyPlan: VolumeStrategyPlan | null): string {
  return strategyPlan
    ? "The current workspace has entered the second phase of the link: first review the volume strategy, then confirm the volume skeleton, and then generate a rhythm board and chapter list by volume."
    : "First, create volume strategy suggestions, let the system help you decide the number of volumes and hard/soft planning, and then enter the volume skeleton.";
}
