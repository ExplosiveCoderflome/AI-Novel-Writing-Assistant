import type {
  StorylineDiff,
  StorylineVersion,
  VolumeImpactResult,
  VolumePlan,
  VolumePlanDiff,
  VolumePlanVersion,
} from "@ai-novel/shared/types/novel";
import {
  buildDerivedOutlineFromVolumes,
  buildFallbackVolumesFromLegacy,
  type LegacyVolumeSource,
} from "./volumePlanUtils";

interface StorylineCompatDependencies {
  novelId: string;
  listVolumeVersions: () => Promise<VolumePlanVersion[]>;
  parseVersionContent: (contentJson: string) => VolumePlan[];
  getLegacySource: () => Promise<LegacyVolumeSource>;
  createVolumeDraft: (input: { volumes: VolumePlan[]; diffSummary?: string; baseVersion?: number }) => Promise<VolumePlanVersion>;
  activateVolumeVersion: (versionId: string) => Promise<VolumePlanVersion>;
  freezeVolumeVersion: (versionId: string) => Promise<VolumePlanVersion>;
  getVolumeDiff: (versionId: string, compareVersion?: number) => Promise<VolumePlanDiff>;
  analyzeVolumeImpact: (input: { volumes?: VolumePlan[]; versionId?: string }) => Promise<VolumeImpactResult>;
}

function toStorylineVersion(
  novelId: string,
  version: VolumePlanVersion,
  content: string,
): StorylineVersion {
  return {
    id: version.id,
    novelId,
    version: version.version,
    status: version.status,
    content,
    diffSummary: version.diffSummary,
    createdAt: version.createdAt,
    updatedAt: version.updatedAt,
  };
}

export async function listStorylineVersionsCompat(
  deps: Pick<StorylineCompatDependencies, "novelId" | "listVolumeVersions" | "parseVersionContent">,
): Promise<StorylineVersion[]> {
  const versions = await deps.listVolumeVersions();
  return versions.map((version) => toStorylineVersion(
    deps.novelId,
    version,
    buildDerivedOutlineFromVolumes(deps.parseVersionContent(version.contentJson)),
  ));
}

export async function createStorylineDraftCompat(
  deps: Pick<StorylineCompatDependencies, "novelId" | "getLegacySource" | "createVolumeDraft">,
  input: { content: string; diffSummary?: string; baseVersion?: number },
): Promise<StorylineVersion> {
  const legacySource = await deps.getLegacySource();
  const volumes = buildFallbackVolumesFromLegacy(deps.novelId, {
    ...legacySource,
    outline: input.content,
  });
  const version = await deps.createVolumeDraft({
    volumes,
    diffSummary: input.diffSummary,
    baseVersion: input.baseVersion,
  });
  return toStorylineVersion(deps.novelId, version, buildDerivedOutlineFromVolumes(volumes));
}

export async function activateStorylineVersionCompat(
  deps: Pick<StorylineCompatDependencies, "novelId" | "activateVolumeVersion" | "parseVersionContent">,
  versionId: string,
): Promise<StorylineVersion> {
  const version = await deps.activateVolumeVersion(versionId);
  return toStorylineVersion(
    deps.novelId,
    version,
    buildDerivedOutlineFromVolumes(deps.parseVersionContent(version.contentJson)),
  );
}

export async function freezeStorylineVersionCompat(
  deps: Pick<StorylineCompatDependencies, "novelId" | "freezeVolumeVersion" | "parseVersionContent">,
  versionId: string,
): Promise<StorylineVersion> {
  const version = await deps.freezeVolumeVersion(versionId);
  return toStorylineVersion(
    deps.novelId,
    version,
    buildDerivedOutlineFromVolumes(deps.parseVersionContent(version.contentJson)),
  );
}

export async function getStorylineDiffCompat(
  deps: Pick<StorylineCompatDependencies, "getVolumeDiff">,
  novelId: string,
  versionId: string,
  compareVersion?: number,
): Promise<StorylineDiff> {
  const diff = await deps.getVolumeDiff(versionId, compareVersion);
  return {
    id: diff.id,
    novelId,
    version: diff.version,
    status: diff.status,
    diffSummary: diff.diffSummary,
    changedLines: diff.changedLines,
    affectedCharacters: diff.changedVolumes.filter((volume) => volume.changedFields.includes("主角变化")).length,
    affectedChapters: diff.changedChapterCount,
  };
}

export async function analyzeStorylineImpactCompat(
  deps: Pick<StorylineCompatDependencies, "novelId" | "getLegacySource" | "analyzeVolumeImpact">,
  input: { content?: string; versionId?: string },
) {
  const result = input.content
    ? await deps.analyzeVolumeImpact({
      volumes: buildFallbackVolumesFromLegacy(deps.novelId, {
        ...(await deps.getLegacySource()),
        outline: input.content,
      }),
    })
    : await deps.analyzeVolumeImpact({ versionId: input.versionId });

  return {
    novelId: result.novelId,
    sourceVersion: result.sourceVersion,
    changedLines: result.changedLines,
    affectedCharacters: result.requiresCharacterReview ? result.affectedVolumeCount : 0,
    affectedChapters: result.affectedChapterCount,
    requiresOutlineRebuild: result.requiresChapterSync,
    recommendations: {
      shouldSyncOutline: result.requiresChapterSync,
      shouldRecheckCharacters: result.requiresCharacterReview,
      suggestedStrategy: result.changedLines >= 12 ? "rebuild_outline" : "incremental_sync",
    },
  };
}
