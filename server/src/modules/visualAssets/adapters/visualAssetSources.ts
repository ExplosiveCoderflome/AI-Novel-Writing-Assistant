import type {
  VisualAssetKind,
  VisualAssetOrigin,
  VisualAssetScopeKind,
  VisualAssetSourceDomain,
} from "@ai-novel/shared/types/visualAsset";
import { prisma } from "../../../db/prisma";
import { buildImageAssetPublicUrl } from "../../../services/image/imageAssetStorage";

export interface VisualAssetSourceItem {
  sourceDomain: VisualAssetSourceDomain;
  sourceType: string;
  sourceId: string;
  sourceVersion: string;
  sourceLabel: string;
  scopeKind: VisualAssetScopeKind;
  scopeId: string | null;
  scopeLabel: string | null;
  kind: VisualAssetKind;
  origin: VisualAssetOrigin;
  url: string;
  thumbnailUrl: string;
  mimeType: string | null;
  width: number | null;
  height: number | null;
  prompt: string | null;
  provider: string | null;
  model: string | null;
  isPrimary: boolean;
  sourceCreatedAt: Date;
  metadata: Record<string, unknown>;
}

interface ImageState {
  status?: unknown;
  version?: unknown;
  url?: unknown;
  prompt?: unknown;
  provider?: unknown;
  model?: unknown;
  generatedAt?: unknown;
  origin?: unknown;
  history?: unknown;
  assets?: unknown;
}

interface SourceItemBase {
  sourceDomain: VisualAssetSourceDomain;
  sourceType: string;
  sourceId: string;
  sourceLabel: string;
  scopeKind: VisualAssetScopeKind;
  scopeId: string | null;
  scopeLabel: string | null;
  kind: VisualAssetKind;
  fallbackCreatedAt: Date;
  metadata?: Record<string, unknown>;
}

function parseImageState(raw: string | null | undefined): ImageState | null {
  if (!raw?.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as ImageState : null;
  } catch {
    return null;
  }
}

function asText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asPositiveInteger(value: unknown): number | null {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? Math.round(numeric) : null;
}

function asDate(value: unknown, fallback: Date): Date {
  const date = typeof value === "string" ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date : fallback;
}

function asOrigin(value: unknown): VisualAssetOrigin {
  const origin = asText(value);
  if (origin === "generated" || origin === "uploaded" || origin === "imported") return origin;
  return "unknown";
}

function hasUsableImage(state: ImageState): boolean {
  const url = asText(state.url);
  const status = asText(state.status);
  return Boolean(url && (!status || status === "done"));
}

function fromState(base: SourceItemBase, state: ImageState, sourceVersion: string, isPrimary = false): VisualAssetSourceItem | null {
  if (!hasUsableImage(state)) return null;
  const url = asText(state.url);
  if (!url) return null;
  return {
    sourceDomain: base.sourceDomain,
    sourceType: base.sourceType,
    sourceId: base.sourceId,
    sourceVersion,
    sourceLabel: base.sourceLabel,
    scopeKind: base.scopeKind,
    scopeId: base.scopeId,
    scopeLabel: base.scopeLabel,
    kind: base.kind,
    origin: asOrigin(state.origin),
    url,
    thumbnailUrl: url,
    mimeType: null,
    width: null,
    height: null,
    prompt: asText(state.prompt),
    provider: asText(state.provider),
    model: asText(state.model),
    isPrimary,
    sourceCreatedAt: asDate(state.generatedAt, base.fallbackCreatedAt),
    metadata: base.metadata ?? {},
  };
}

function readVersionedState(base: SourceItemBase, raw: string | null | undefined): VisualAssetSourceItem[] {
  const state = parseImageState(raw);
  if (!state) return [];
  const currentVersion = asPositiveInteger(state.version) ?? 1;
  const entries = [fromState(base, state, `current:${currentVersion}`, true)].filter((item): item is VisualAssetSourceItem => Boolean(item));
  if (!Array.isArray(state.history)) return entries;
  for (const historyItem of state.history) {
    if (!historyItem || typeof historyItem !== "object" || Array.isArray(historyItem)) continue;
    const history = historyItem as ImageState;
    const version = asPositiveInteger(history.version);
    const entry = version ? fromState(base, { ...history, status: "done" }, `history:${version}`) : null;
    if (entry) entries.push(entry);
  }
  return entries;
}

function readImageArray(base: SourceItemBase, raw: string | null | undefined): VisualAssetSourceItem[] {
  if (!raw?.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item, index) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return [];
      const state = item as ImageState & { view?: unknown };
      const label = asText(state.view) || `版本 ${index + 1}`;
      const entry = fromState({ ...base, sourceLabel: `${base.sourceLabel} · ${label}` }, state, `item:${label}:${asPositiveInteger(state.version) ?? index + 1}`);
      return entry ? [entry] : [];
    });
  } catch {
    return [];
  }
}

function sceneKind(sceneType: string): VisualAssetKind {
  if (sceneType === "novel_cover") return "cover";
  if (sceneType === "chapter_illustration") return "illustration";
  return "character";
}

async function readImageAssetSources(): Promise<VisualAssetSourceItem[]> {
  const rows = await prisma.imageAsset.findMany({
    include: {
      baseCharacter: { select: { name: true } },
      novel: { select: { title: true } },
      bookAnalysisCharacter: {
        select: {
          name: true,
          analysis: { select: { id: true } },
        },
      },
    },
  });
  return rows.map((asset) => {
    const isNovelCover = asset.sceneType === "novel_cover";
    const isBookCharacter = asset.sceneType === "book_analysis_character";
    const scopeKind: VisualAssetScopeKind = isNovelCover ? "novel" : isBookCharacter ? "book_analysis" : "global";
    const scopeId = isNovelCover ? asset.novelId : isBookCharacter ? asset.bookAnalysisCharacter?.analysis.id ?? null : null;
    const scopeLabel = isNovelCover ? asset.novel?.title ?? "小说" : isBookCharacter ? "拆书分析" : "基础角色库";
    const sourceLabel = isNovelCover
      ? `${asset.novel?.title ?? "小说"} · 封面`
      : isBookCharacter
        ? `${asset.bookAnalysisCharacter?.name ?? "拆书角色"} · 角色形象`
        : `${asset.baseCharacter?.name ?? "基础角色"} · 角色形象`;
    return {
      sourceDomain: "image_asset" as const,
      sourceType: "image_asset",
      sourceId: asset.id,
      sourceVersion: "current",
      sourceLabel,
      scopeKind,
      scopeId,
      scopeLabel,
      kind: sceneKind(asset.sceneType),
      origin: "generated" as const,
      url: buildImageAssetPublicUrl(asset.id),
      thumbnailUrl: buildImageAssetPublicUrl(asset.id),
      mimeType: asset.mimeType,
      width: asset.width,
      height: asset.height,
      prompt: asset.prompt,
      provider: asset.provider,
      model: asset.model,
      isPrimary: asset.isPrimary,
      sourceCreatedAt: asset.createdAt,
      metadata: { sceneType: asset.sceneType },
    };
  });
}

async function readComicSources(): Promise<VisualAssetSourceItem[]> {
  const [characters, characterAssets, scenes, panels] = await Promise.all([
    prisma.comicCharacter.findMany({ include: { project: { select: { id: true, title: true } } } }),
    prisma.comicCharacterAsset.findMany({ include: { project: { select: { id: true, title: true } }, character: { select: { name: true } } } }),
    prisma.comicScene.findMany({ include: { project: { select: { id: true, title: true } } } }),
    prisma.comicPanel.findMany({ include: { episode: { include: { project: { select: { id: true, title: true } } } } } }),
  ]);
  const output: VisualAssetSourceItem[] = [];
  for (const character of characters) {
    const base: SourceItemBase = {
      sourceDomain: "comic", sourceType: "character_sheet", sourceId: character.id,
      sourceLabel: `${character.name} · 角色设计稿`, scopeKind: "comic_project", scopeId: character.project.id,
      scopeLabel: character.project.title, kind: "comic_character_sheet", fallbackCreatedAt: character.createdAt,
    };
    output.push(...readVersionedState(base, character.sheetData));
    const sheet = parseImageState(character.sheetData);
    const expression = sheet?.assets && typeof sheet.assets === "object" && !Array.isArray(sheet.assets)
      ? (sheet.assets as { expression?: ImageState }).expression
      : undefined;
    const expressionEntry = expression ? fromState({ ...base, sourceType: "character_expression", sourceLabel: `${character.name} · 表情稿` }, expression, "current:expression") : null;
    if (expressionEntry) output.push(expressionEntry);
  }
  for (const asset of characterAssets) {
    output.push(...readVersionedState({
      sourceDomain: "comic", sourceType: "character_asset", sourceId: asset.id,
      sourceLabel: `${asset.character.name} · ${asset.name}`, scopeKind: "comic_project", scopeId: asset.project.id,
      scopeLabel: asset.project.title, kind: "comic_character_asset", fallbackCreatedAt: asset.createdAt,
      metadata: { assetType: asset.assetType },
    }, asset.imageData));
  }
  for (const scene of scenes) {
    output.push(...readVersionedState({
      sourceDomain: "comic", sourceType: "scene_sheet", sourceId: scene.id,
      sourceLabel: `场景 · ${scene.name}`, scopeKind: "comic_project", scopeId: scene.project.id,
      scopeLabel: scene.project.title, kind: "comic_scene", fallbackCreatedAt: scene.createdAt,
    }, scene.sheetData));
  }
  for (const panel of panels) {
    const scope = panel.episode.project;
    const base: SourceItemBase = {
      sourceDomain: "comic", sourceType: "panel", sourceId: panel.id,
      sourceLabel: `第 ${panel.episode.order} 话 · 第 ${panel.order} 格`, scopeKind: "comic_project", scopeId: scope.id,
      scopeLabel: scope.title, kind: "comic_panel", fallbackCreatedAt: panel.createdAt,
    };
    output.push(...readVersionedState(base, panel.imageData));
    output.push(...readVersionedState({ ...base, sourceType: "panel_lettered", sourceLabel: `${base.sourceLabel} · 成品` }, panel.letteredData));
  }
  return output;
}

async function readDramaSources(): Promise<VisualAssetSourceItem[]> {
  const [characters, shots] = await Promise.all([
    prisma.dramaCharacter.findMany({ include: { project: { select: { id: true, title: true } } } }),
    prisma.dramaShot.findMany({ include: { storyboard: { include: { project: { select: { id: true, title: true } }, episode: { select: { order: true } } } } } }),
  ]);
  const output: VisualAssetSourceItem[] = [];
  for (const character of characters) {
    const base: SourceItemBase = {
      sourceDomain: "drama", sourceType: "character_sheet", sourceId: character.id,
      sourceLabel: `${character.name} · 角色设计稿`, scopeKind: "drama_project", scopeId: character.project.id,
      scopeLabel: character.project.title, kind: "drama_character_sheet", fallbackCreatedAt: character.createdAt,
    };
    output.push(...readVersionedState(base, character.portraitData));
    output.push(...readImageArray({ ...base, sourceType: "character_view", sourceLabel: `${character.name} · 角色视图` }, character.threeViewData));
  }
  for (const shot of shots) {
    const project = shot.storyboard.project;
    output.push(...readVersionedState({
      sourceDomain: "drama", sourceType: "shot_keyframe", sourceId: shot.id,
      sourceLabel: `第 ${shot.storyboard.episode.order} 集 · 镜头 ${shot.order}`, scopeKind: "drama_project", scopeId: project.id,
      scopeLabel: project.title, kind: "drama_shot_keyframe", fallbackCreatedAt: shot.createdAt,
    }, shot.keyframeData));
  }
  return output;
}

export async function collectVisualAssetSources(): Promise<VisualAssetSourceItem[]> {
  const groups = await Promise.all([readImageAssetSources(), readComicSources(), readDramaSources()]);
  return groups.flat();
}
