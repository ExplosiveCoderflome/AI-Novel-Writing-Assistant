import type { VolumePlanDocument } from "@ai-novel/shared/types/novel";
import { AppError } from "../../../../middleware/errorHandler";
import type { VolumeGenerateOptions } from "../volumeModels";
import {
  buildVolumeWorkspaceDocument,
  normalizeVolumeWorkspaceDocument,
  serializeVolumeWorkspaceDocument,
} from "../volumeWorkspaceDocument";
import {
  getActiveVersionRow,
  getLatestVersionRow,
  listActiveVolumeRows,
  runVolumeWorkspaceTransaction,
} from "../volumeWorkspacePersistence";

interface StrategyRecoveryService {
  getVolumes(novelId: string, options: { hydrateCanonical: false }): Promise<VolumePlanDocument>;
  generateVolumes(novelId: string, options: VolumeGenerateOptions): Promise<VolumePlanDocument>;
}

function planningSnapshot(document: VolumePlanDocument): string {
  return JSON.stringify({
    volumes: document.volumes,
    critiqueReport: document.critiqueReport,
    beatSheets: document.beatSheets,
    rebalanceDecisions: document.rebalanceDecisions,
  });
}

function serializeRecoveredMetadata(contentJson: string, document: VolumePlanDocument): string {
  let raw: unknown;
  try { raw = JSON.parse(contentJson); } catch {
    throw new AppError("已保存的卷规划无法读取，请先核对卷规划后再继续。", 422);
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new AppError("已保存的卷规划格式异常，请先核对卷规划后再继续。", 422);
  }
  const record = raw as Record<string, unknown>;
  // Preserve unknown legacy fields and author annotations, including nested planning data.
  return JSON.stringify({
    ...record,
    ...(Array.isArray(record.volumes) && record.volumes.length ? {} : document),
    strategyPlan: document.strategyPlan,
    readiness: document.readiness,
  });
}

/** Completes missing metadata; never regenerates or persists volume/chapter rows. */
export async function recoverMissingVolumeStrategy(
  novelId: string,
  service: StrategyRecoveryService,
  options: VolumeGenerateOptions = {},
): Promise<VolumePlanDocument | null> {
  const before = await service.getVolumes(novelId, { hydrateCanonical: false });
  if (!before.volumes.length) return null;
  if (before.strategyPlan) return before;
  const sourceSnapshot = planningSnapshot(before);
  const sourceVersionId = before.activeVersionId;

  // Model work stays outside the database transaction. Existing planning is its context.
  const generated = await service.generateVolumes(novelId, {
    ...options,
    scope: "strategy",
    draftWorkspace: before,
    respectExistingVolumeCount: true,
    userPreferredVolumeCount: before.volumes.length,
    persistIntermediateDocuments: false,
    onIntermediateDocument: undefined,
  });
  const strategyPlan = normalizeVolumeWorkspaceDocument(novelId, {
    ...before, strategyPlan: generated.strategyPlan,
  }).strategyPlan;
  if (!strategyPlan) throw new AppError("卷战略建议没有生成完整结果，请从保存进度继续重试。", 422);

  return runVolumeWorkspaceTransaction(async tx => {
    const version = await getActiveVersionRow(novelId, tx);
    const rows = await listActiveVolumeRows(novelId, tx);
    const parsed = version ? normalizeVolumeWorkspaceDocument(novelId, version.contentJson, {
      source: "volume", activeVersionId: version.id,
    }) : null;
    const current = parsed?.volumes.length ? parsed : buildVolumeWorkspaceDocument({
      novelId, volumes: rows, source: "volume", activeVersionId: version?.id ?? null,
    });
    // A concurrent author or recovery worker may have already supplied a strategy.
    if (current.strategyPlan) return current;
    if (current.activeVersionId !== sourceVersionId
      || planningSnapshot(current) !== sourceSnapshot) {
      throw new AppError("本书规划已更新，请从保存进度继续，按最新规划补齐卷战略。", 409);
    }
    const recovered = buildVolumeWorkspaceDocument({ ...current, strategyPlan });
    if (version) {
      const updated = await tx.volumePlanVersion.updateMany({
        where: { id: version.id, contentJson: version.contentJson },
        data: { contentJson: serializeRecoveredMetadata(version.contentJson, recovered) },
      });
      if (updated.count !== 1) throw new AppError("本书规划已更新，请从保存进度继续。", 409);
      return recovered;
    }
    const latest = await getLatestVersionRow(novelId, tx);
    const created = await tx.volumePlanVersion.create({ data: {
      novelId, version: (latest?.version ?? 0) + 1, status: "active",
      contentJson: serializeVolumeWorkspaceDocument(recovered),
      diffSummary: "补齐卷战略，保留已有分卷与章节。",
    } });
    const saved = { ...recovered, activeVersionId: created.id };
    await tx.volumePlanVersion.update({ where: { id: created.id }, data: {
      contentJson: serializeVolumeWorkspaceDocument(saved),
    } });
    return saved;
  });
}
