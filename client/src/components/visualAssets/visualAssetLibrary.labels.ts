import type {
  VisualAssetKind,
  VisualAssetOrigin,
  VisualAssetScopeKind,
  VisualAssetSourceDomain,
} from "@ai-novel/shared/types/visualAsset";

const KIND_LABELS: Record<VisualAssetKind, string> = {
  character: "Character image",
  cover: "novel cover",
  illustration: "illustration",
  comic_character_sheet: "漫画角色设定",
  comic_character_asset: "Comic character material",
  comic_scene: "comic scene",
  comic_panel: "comic storyboard",
  drama_character_sheet: "Short drama character setting",
  drama_shot_keyframe: "Key frames of skit shots",
};

const SOURCE_LABELS: Record<VisualAssetSourceDomain, string> = { image_asset: "Image creation", comic: "Comic creation", drama: "Short drama creation", }; const ORIGIN_LABELS: Record<VisualAssetOrigin, string> = { generated: "AI generated", uploaded: "Uploaded", imported: "Imported", unknown: "Source to be confirmed", }; const SCOPE_LABELS: Record<VisualAssetScopeKind, string> = {
  global: "All works",
  novel: "novel",
  book_analysis: "Book split analysis",
  comic_project: "comic project",
  drama_project: "Short play project",
};

export function getVisualAssetKindLabel(kind: VisualAssetKind) {
  return KIND_LABELS[kind];
}

export function getVisualAssetSourceLabel(source: VisualAssetSourceDomain) {
  return SOURCE_LABELS[source];
}

export function getVisualAssetOriginLabel(origin: VisualAssetOrigin) {
  return ORIGIN_LABELS[origin];
}

export function getVisualAssetScopeLabel(kind: VisualAssetScopeKind) {
  return SCOPE_LABELS[kind];
}

export function formatVisualAssetDate(createdAt: string) {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) {
    return "Date not recorded";
  }
  return new Intl.DateTimeFormat("zh-CN", { month: "short", day: "numeric", year: "numeric" }).format(date);
}
