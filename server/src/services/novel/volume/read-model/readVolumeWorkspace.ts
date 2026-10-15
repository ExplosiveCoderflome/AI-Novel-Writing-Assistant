import { getLegacyVolumeSource } from "../legacyVolumeSource";
import { buildFallbackVolumesFromLegacy } from "../volumePlanUtils";
import { buildVolumeWorkspaceDocument, normalizeVolumeWorkspaceDocument } from "../volumeWorkspaceDocument";
import { getActiveVersionRow, getLatestVersionRow, listActiveVolumeRows } from "../volumeWorkspacePersistence";

/** Read saved planning facts without restoring versions or synchronizing execution fields. */
export async function readVolumeWorkspace(novelId: string) {
  const [volumes, activeVersion] = await Promise.all([
    listActiveVolumeRows(novelId),
    getActiveVersionRow(novelId),
  ]);
  if (activeVersion) {
    const parsed = normalizeVolumeWorkspaceDocument(novelId, activeVersion.contentJson, {
      source: volumes.length > 0 ? "volume" : "empty",
      activeVersionId: activeVersion.id,
    });
    return parsed.volumes.length > 0 ? parsed : buildVolumeWorkspaceDocument({
      novelId, volumes, source: volumes.length > 0 ? "volume" : "empty", activeVersionId: activeVersion.id,
    });
  }
  if (volumes.length > 0) {
    return buildVolumeWorkspaceDocument({ novelId, volumes, source: "volume", activeVersionId: null });
  }
  const latestVersion = await getLatestVersionRow(novelId);
  if (latestVersion) {
    const parsed = normalizeVolumeWorkspaceDocument(novelId, latestVersion.contentJson, {
      source: "volume", activeVersionId: latestVersion.id,
    });
    if (parsed.volumes.length > 0) return parsed;
  }
  const source = await getLegacyVolumeSource(novelId);
  const legacyVolumes = buildFallbackVolumesFromLegacy(novelId, source);
  return buildVolumeWorkspaceDocument({
    novelId, volumes: legacyVolumes, source: legacyVolumes.length > 0 ? "legacy" : "empty", activeVersionId: null,
  });
}
