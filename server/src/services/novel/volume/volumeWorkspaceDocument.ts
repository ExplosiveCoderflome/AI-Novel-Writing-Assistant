import type {
  VolumeBeat,
  VolumeBeatSheet,
  VolumeCritiqueIssue,
  VolumeCritiqueReport,
  VolumePlan,
  VolumePlanDocument,
  VolumePlanningReadiness,
  VolumeRebalanceDecision,
  VolumeStrategyPlan,
  VolumeStrategyVolume,
  VolumeUncertaintyMarker,
} from "@ai-novel/shared/types/novel";
import {
  buildDerivedOutlineFromVolumes,
  buildDerivedStructuredOutlineFromVolumes,
  normalizeVolumeDraftInput,
} from "./volumePlanUtils";

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeText(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(Math.round(value));
  }
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed || null;
}

function normalizeString(value: unknown, fallback: string): string {
  return normalizeText(value) ?? fallback;
}

function normalizeInteger(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.round(value);
  }
  if (typeof value === "string") {
    const parsed = Number.parseInt(value.trim(), 10);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return fallback;
}

function normalizeStringArray(value: unknown): string[] {
  if (typeof value === "string") {
    return value
      .split(/[\n,，；、]/g)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
}

function resolveVolumeReference(volumes: VolumePlan[], value: unknown): string | null {
  const normalized = normalizeText(value);
  if (!normalized) {
    return null;
  }
  const directMatch = volumes.find((volume) => volume.id === normalized);
  if (directMatch) {
    return directMatch.id;
  }

  const orderMatch = normalized.match(/(?:volume|卷|第)?\s*(\d+)(?:\s*卷)?$/i);
  if (!orderMatch) {
    return null;
  }

  const sortOrder = Number.parseInt(orderMatch[1], 10);
  if (!Number.isFinite(sortOrder)) {
    return null;
  }
  return volumes.find((volume) => volume.sortOrder === sortOrder)?.id ?? null;
}

function normalizeRebalanceDirection(value: unknown, actions: string[]): VolumeRebalanceDecision["direction"] {
  if (actions.length === 1 && actions[0].toLowerCase() === "hold") {
    return "hold";
  }

  const normalized = normalizeText(value)?.toLowerCase().replace(/[\s-]+/g, "_");
  switch (normalized) {
    case "pull_forward":
    case "pullforward":
    case "backward":
    case "back":
      return "pull_forward";
    case "push_back":
    case "pushback":
    case "forward":
    case "next":
      return "push_back";
    case "tighten_current":
    case "tighten":
    case "compress_current":
      return "tighten_current";
    case "expand_adjacent":
    case "expand":
    case "expand_neighbor":
    case "expand_neighbour":
    case "adjacent":
      return "expand_adjacent";
    default:
      return "hold";
  }
}

function normalizeStrategyVolume(raw: unknown, index: number): VolumeStrategyVolume | null {
  if (!isRecord(raw)) {
    return null;
  }
  const planningMode = raw.planningMode === "soft" ? "soft" : "hard";
  const uncertaintyLevel = raw.uncertaintyLevel === "low" || raw.uncertaintyLevel === "high"
    ? raw.uncertaintyLevel
    : "medium";
  return {
    sortOrder: Math.max(1, normalizeInteger(raw.sortOrder, index + 1)),
    planningMode,
    roleLabel: normalizeString(raw.roleLabel, `第${index + 1}卷定位`),
    coreReward: normalizeString(raw.coreReward, "待补全本卷读者回报。"),
    escalationFocus: normalizeString(raw.escalationFocus, "待补全本卷升级焦点。"),
    uncertaintyLevel,
  };
}

function normalizeUncertaintyMarker(raw: unknown): VolumeUncertaintyMarker | null {
  if (!isRecord(raw)) {
    return null;
  }
  const targetType = raw.targetType === "book" || raw.targetType === "beat_sheet" || raw.targetType === "chapter_list"
    ? raw.targetType
    : "volume";
  const level = raw.level === "low" || raw.level === "high" ? raw.level : "medium";
  const targetRef = normalizeText(raw.targetRef);
  const reason = normalizeText(raw.reason);
  if (!targetRef || !reason) {
    return null;
  }
  return {
    targetType,
    targetRef,
    level,
    reason,
  };
}

function normalizeStrategyPlan(raw: unknown, volumeCount: number): VolumeStrategyPlan | null {
  if (!isRecord(raw)) {
    return null;
  }
  const volumes = Array.isArray(raw.volumes)
    ? raw.volumes
      .map((item, index) => normalizeStrategyVolume(item, index))
      .filter((item): item is VolumeStrategyVolume => Boolean(item))
    : [];
  if (volumes.length === 0) {
    return null;
  }
  return {
    recommendedVolumeCount: Math.max(1, normalizeInteger(raw.recommendedVolumeCount, volumes.length || volumeCount || 1)),
    hardPlannedVolumeCount: Math.max(1, normalizeInteger(raw.hardPlannedVolumeCount, Math.min(volumes.length, 3))),
    readerRewardLadder: normalizeString(raw.readerRewardLadder, "待补全读者回报梯度。"),
    escalationLadder: normalizeString(raw.escalationLadder, "待补全升级梯度。"),
    midpointShift: normalizeString(raw.midpointShift, "待补全中盘转向。"),
    notes: normalizeString(raw.notes, "待补全卷战略备注。"),
    volumes,
    uncertainties: Array.isArray(raw.uncertainties)
      ? raw.uncertainties
        .map(normalizeUncertaintyMarker)
        .filter((item): item is VolumeUncertaintyMarker => Boolean(item))
      : [],
  };
}

function normalizeBeat(raw: unknown): VolumeBeat | null {
  if (!isRecord(raw)) {
    return null;
  }
  const key = normalizeText(raw.key);
  const label = normalizeText(raw.label);
  const summary = normalizeText(raw.summary);
  const chapterSpanHint = normalizeText(raw.chapterSpanHint);
  if (!key || !label || !summary || !chapterSpanHint) {
    return null;
  }
  const mustDeliver = normalizeStringArray(raw.mustDeliver);
  if (mustDeliver.length === 0) {
    return null;
  }
  return {
    key,
    label,
    summary,
    chapterSpanHint,
    mustDeliver,
  };
}

function normalizeBeatSheet(raw: unknown, volumes: VolumePlan[]): VolumeBeatSheet | null {
  if (!isRecord(raw)) {
    return null;
  }
  const volumeId = normalizeText(raw.volumeId);
  if (!volumeId) {
    return null;
  }
  const matchedVolume = volumes.find((volume) => volume.id === volumeId);
  if (!matchedVolume) {
    return null;
  }
  const status = raw.status === "not_started" || raw.status === "revised" ? raw.status : "generated";
  return {
    volumeId,
    volumeSortOrder: matchedVolume.sortOrder,
    status,
    beats: Array.isArray(raw.beats)
      ? raw.beats
        .map(normalizeBeat)
        .filter((item): item is VolumeBeat => Boolean(item))
      : [],
  };
}

function normalizeCritiqueIssue(raw: unknown): VolumeCritiqueIssue | null {
  if (!isRecord(raw)) {
    return null;
  }
  const targetRef = normalizeText(raw.targetRef);
  const title = normalizeText(raw.title);
  const detail = normalizeText(raw.detail);
  if (!targetRef || !title || !detail) {
    return null;
  }
  const severity = raw.severity === "low" || raw.severity === "high" ? raw.severity : "medium";
  return {
    targetRef,
    severity,
    title,
    detail,
  };
}

function normalizeCritiqueReport(raw: unknown): VolumeCritiqueReport | null {
  if (!isRecord(raw)) {
    return null;
  }
  const summary = normalizeText(raw.summary);
  if (!summary) {
    return null;
  }
  const overallRisk = raw.overallRisk === "low" || raw.overallRisk === "high" ? raw.overallRisk : "medium";
  return {
    overallRisk,
    summary,
    issues: Array.isArray(raw.issues)
      ? raw.issues
        .map(normalizeCritiqueIssue)
        .filter((item): item is VolumeCritiqueIssue => Boolean(item))
      : [],
    recommendedActions: normalizeStringArray(raw.recommendedActions),
  };
}

function normalizeRebalanceDecision(raw: unknown, volumes: VolumePlan[]): VolumeRebalanceDecision | null {
  if (!isRecord(raw)) {
    return null;
  }
  const anchorVolumeId = resolveVolumeReference(volumes, raw.anchorVolumeId);
  const affectedVolumeId = resolveVolumeReference(volumes, raw.affectedVolumeId);
  const summary = normalizeText(raw.summary);
  if (!anchorVolumeId || !affectedVolumeId || !summary) {
    return null;
  }
  const actions = normalizeStringArray(raw.actions);
  const direction = normalizeRebalanceDirection(raw.direction, actions);
  const rawSeverity = normalizeText(raw.severity)?.toLowerCase();
  const severity = rawSeverity === "low" || rawSeverity === "minor"
    ? "low"
    : rawSeverity === "high" || rawSeverity === "critical" || rawSeverity === "urgent"
      ? "high"
      : "medium";
  return {
    anchorVolumeId,
    affectedVolumeId,
    direction,
    severity,
    summary,
    actions: actions.length > 0 ? actions : direction === "hold" ? ["hold"] : [],
  };
}

function compareText(left: string | null | undefined, right: string | null | undefined): boolean {
  return (left ?? "").trim() === (right ?? "").trim();
}

function compareStringArray(left: string[], right: string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }
  return left.every((item, index) => item.trim() === (right[index] ?? "").trim());
}

function compareStrategyPlan(left: VolumeStrategyPlan | null, right: VolumeStrategyPlan | null): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function hasVolumeLevelStructureChanged(currentVolumes: VolumePlan[], nextVolumes: VolumePlan[]): boolean {
  if (currentVolumes.length !== nextVolumes.length) {
    return true;
  }

  return currentVolumes.some((currentVolume, index) => {
    const nextVolume = nextVolumes[index];
    if (!nextVolume) {
      return true;
    }
    return currentVolume.id !== nextVolume.id
      || currentVolume.sortOrder !== nextVolume.sortOrder
      || !compareText(currentVolume.title, nextVolume.title)
      || !compareText(currentVolume.summary, nextVolume.summary)
      || !compareText(currentVolume.openingHook, nextVolume.openingHook)
      || !compareText(currentVolume.mainPromise, nextVolume.mainPromise)
      || !compareText(currentVolume.primaryPressureSource, nextVolume.primaryPressureSource)
      || !compareText(currentVolume.coreSellingPoint, nextVolume.coreSellingPoint)
      || !compareText(currentVolume.escalationMode, nextVolume.escalationMode)
      || !compareText(currentVolume.protagonistChange, nextVolume.protagonistChange)
      || !compareText(currentVolume.midVolumeRisk, nextVolume.midVolumeRisk)
      || !compareText(currentVolume.climax, nextVolume.climax)
      || !compareText(currentVolume.payoffType, nextVolume.payoffType)
      || !compareText(currentVolume.nextVolumeHook, nextVolume.nextVolumeHook)
      || !compareText(currentVolume.resetPoint, nextVolume.resetPoint)
      || !compareStringArray(currentVolume.openPayoffs, nextVolume.openPayoffs);
  });
}

function hasChapterListChanged(currentVolumes: VolumePlan[], nextVolumes: VolumePlan[]): boolean {
  if (currentVolumes.length !== nextVolumes.length) {
    return true;
  }

  return currentVolumes.some((currentVolume, volumeIndex) => {
    const nextVolume = nextVolumes[volumeIndex];
    if (!nextVolume || currentVolume.chapters.length !== nextVolume.chapters.length) {
      return true;
    }

    return currentVolume.chapters.some((currentChapter, chapterIndex) => {
      const nextChapter = nextVolume.chapters[chapterIndex];
      if (!nextChapter) {
        return true;
      }
      return currentChapter.id !== nextChapter.id
        || currentChapter.chapterOrder !== nextChapter.chapterOrder
        || (currentChapter.beatKey ?? null) !== (nextChapter.beatKey ?? null)
        || !compareText(currentChapter.title, nextChapter.title)
        || !compareText(currentChapter.summary, nextChapter.summary);
    });
  });
}

export function buildVolumePlanningReadiness(input: {
  volumes: VolumePlan[];
  strategyPlan: VolumeStrategyPlan | null;
  beatSheets: VolumeBeatSheet[];
}): VolumePlanningReadiness {
  const { volumes, strategyPlan, beatSheets } = input;
  const blockingReasons: string[] = [];
  if (!strategyPlan) {
    blockingReasons.push("请先生成卷战略建议，再确认卷骨架。");
  }
  if (volumes.length === 0) {
    blockingReasons.push("当前还没有卷骨架。");
  }
  if (!beatSheets.some((sheet) => sheet.beats.length > 0)) {
    blockingReasons.push("当前卷还没有节奏板，默认不能直接拆章节列表。");
  }
  return {
    canGenerateStrategy: true,
    canGenerateSkeleton: Boolean(strategyPlan),
    canGenerateBeatSheet: Boolean(strategyPlan) && volumes.length > 0,
    canGenerateChapterList: Boolean(strategyPlan) && beatSheets.some((sheet) => sheet.beats.length > 0),
    blockingReasons,
  };
}

export function buildVolumeWorkspaceDocument(params: {
  novelId: string;
  volumes: VolumePlan[];
  strategyPlan?: VolumeStrategyPlan | null;
  critiqueReport?: VolumeCritiqueReport | null;
  beatSheets?: VolumeBeatSheet[];
  rebalanceDecisions?: VolumeRebalanceDecision[];
  source?: "volume" | "legacy" | "empty";
  activeVersionId?: string | null;
}): VolumePlanDocument {
  const volumes = normalizeVolumeDraftInput(params.novelId, params.volumes);
  const strategyPlan = params.strategyPlan ?? null;
  const critiqueReport = params.critiqueReport ?? null;
  const beatSheets = (params.beatSheets ?? [])
    .map((sheet) => normalizeBeatSheet(sheet, volumes))
    .filter((item): item is VolumeBeatSheet => Boolean(item));
  const rebalanceDecisions = (params.rebalanceDecisions ?? [])
    .map((decision) => normalizeRebalanceDecision(decision, volumes))
    .filter((item): item is VolumeRebalanceDecision => Boolean(item));
  return {
    novelId: params.novelId,
    workspaceVersion: "v2",
    volumes,
    strategyPlan,
    critiqueReport,
    beatSheets,
    rebalanceDecisions,
    readiness: buildVolumePlanningReadiness({
      volumes,
      strategyPlan,
      beatSheets,
    }),
    derivedOutline: buildDerivedOutlineFromVolumes(volumes),
    derivedStructuredOutline: buildDerivedStructuredOutlineFromVolumes(volumes),
    source: params.source ?? (volumes.length > 0 ? "volume" : "empty"),
    activeVersionId: params.activeVersionId ?? null,
  };
}

export function normalizeVolumeWorkspaceDocument(
  novelId: string,
  raw: unknown,
  options: {
    source?: "volume" | "legacy" | "empty";
    activeVersionId?: string | null;
  } = {},
): VolumePlanDocument {
  let parsedRaw = raw;
  if (typeof raw === "string") {
    try {
      parsedRaw = JSON.parse(raw) as unknown;
    } catch {
      parsedRaw = {};
    }
  }
  const record = isRecord(parsedRaw) ? parsedRaw : {};
  const volumes = normalizeVolumeDraftInput(novelId, Array.isArray(record.volumes) ? record.volumes : []);
  const strategyPlan = normalizeStrategyPlan(record.strategyPlan, volumes.length);
  const critiqueReport = normalizeCritiqueReport(record.critiqueReport);
  const beatSheets = Array.isArray(record.beatSheets)
    ? record.beatSheets
      .map((item) => normalizeBeatSheet(item, volumes))
      .filter((item): item is VolumeBeatSheet => Boolean(item))
    : [];
  const rebalanceDecisions = Array.isArray(record.rebalanceDecisions)
    ? record.rebalanceDecisions
      .map((item) => normalizeRebalanceDecision(item, volumes))
      .filter((item): item is VolumeRebalanceDecision => Boolean(item))
    : [];
  const source = record.source === "legacy" || record.source === "empty" || record.source === "volume"
    ? record.source
    : options.source ?? (volumes.length > 0 ? "volume" : "empty");
  const activeVersionId = normalizeText(record.activeVersionId) ?? options.activeVersionId ?? null;
  return buildVolumeWorkspaceDocument({
    novelId,
    volumes,
    strategyPlan,
    critiqueReport,
    beatSheets,
    rebalanceDecisions,
    source,
    activeVersionId,
  });
}

export function mergeVolumeWorkspaceInput(
  novelId: string,
  currentDocument: VolumePlanDocument,
  input: unknown,
): VolumePlanDocument {
  const record = isRecord(input) ? input : {};
  const nextVolumes = Array.isArray(record.volumes)
    ? normalizeVolumeDraftInput(novelId, record.volumes)
    : currentDocument.volumes;
  const nextStrategyPlan = record.strategyPlan !== undefined
    ? normalizeStrategyPlan(record.strategyPlan, nextVolumes.length)
    : currentDocument.strategyPlan;
  const strategyChanged = record.strategyPlan !== undefined
    && !compareStrategyPlan(currentDocument.strategyPlan, nextStrategyPlan);
  const volumeLevelStructureChanged = Array.isArray(record.volumes)
    && hasVolumeLevelStructureChanged(currentDocument.volumes, nextVolumes);
  const chapterListChanged = Array.isArray(record.volumes)
    && hasChapterListChanged(currentDocument.volumes, nextVolumes);
  const beatSheets = strategyChanged || volumeLevelStructureChanged
    ? []
    : record.beatSheets !== undefined
      ? record.beatSheets
      : currentDocument.beatSheets;
  const rebalanceDecisions = strategyChanged || volumeLevelStructureChanged || chapterListChanged
    ? []
    : record.rebalanceDecisions !== undefined
      ? record.rebalanceDecisions
      : currentDocument.rebalanceDecisions;

  return normalizeVolumeWorkspaceDocument(novelId, {
    workspaceVersion: "v2",
    novelId,
    volumes: nextVolumes,
    strategyPlan: nextStrategyPlan,
    critiqueReport: strategyChanged
      ? null
      : record.critiqueReport !== undefined
        ? record.critiqueReport
        : currentDocument.critiqueReport,
    beatSheets,
    rebalanceDecisions,
    source: currentDocument.source,
    activeVersionId: currentDocument.activeVersionId,
  }, {
    source: currentDocument.source,
    activeVersionId: currentDocument.activeVersionId,
  });
}

export function serializeVolumeWorkspaceDocument(document: VolumePlanDocument): string {
  return JSON.stringify(document);
}
