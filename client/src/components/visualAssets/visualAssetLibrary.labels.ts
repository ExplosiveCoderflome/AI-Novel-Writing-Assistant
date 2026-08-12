import i18next from "i18next";
import type {
  VisualAssetKind,
  VisualAssetOrigin,
  VisualAssetScopeKind,
  VisualAssetSourceDomain,
} from "@ai-novel/shared/types/visualAsset";

const KIND_LABELS: Record<VisualAssetKind, string> = {
  character: i18next.t("characters.characterCard.hxd927"),
  cover: i18next.t("visualAssets.visualAssetLibrary.labels.c6yk1y"),
  illustration: i18next.t("visualAssets.visualAssetLibrary.labels.hgfg"),
  comic_character_sheet: i18next.t("visualAssets.visualAssetLibrary.labels.su1mgc"),
  comic_character_asset: i18next.t("visualAssets.visualAssetLibrary.labels.stz79c"),
  comic_scene: i18next.t("visualAssets.visualAssetLibrary.labels.eidbl1"),
  comic_panel: i18next.t("visualAssets.visualAssetLibrary.labels.eicozq"),
  drama_character_sheet: i18next.t("visualAssets.visualAssetLibrary.labels.us7yc6"),
  drama_shot_keyframe: i18next.t("visualAssets.visualAssetLibrary.labels.g0kau"),
};

const SOURCE_LABELS: Record<VisualAssetSourceDomain, string> = {
  image_asset: i18next.t("visualAssets.visualAssetLibrary.labels.bg4x9m"),
  comic: i18next.t("visualAssets.visualAssetLibrary.labels.eicbo1"),
  drama: i18next.t("visualAssets.visualAssetLibrary.labels.fh08xn"),
};

const ORIGIN_LABELS: Record<VisualAssetOrigin, string> = {
  generated: "AI 生成",
  uploaded: i18next.t("dict.gen_ba7f57c5"),
  imported: i18next.t("visualAssets.visualAssetLibrary.labels.e7gpn"),
  unknown: i18next.t("visualAssets.visualAssetLibrary.labels.7kcc4w"),
};

const SCOPE_LABELS: Record<VisualAssetScopeKind, string> = {
  global: i18next.t("visualAssets.visualAssetLibrary.labels.av8wh1"),
  novel: i18next.t("dict.gen_1fb52965"),
  book_analysis: i18next.t("tasks.filterKindBookAnalysis"),
  comic_project: i18next.t("visualAssets.visualAssetLibrary.labels.eioidh"),
  drama_project: i18next.t("dict.gen_10f4511a"),
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
    return i18next.t("visualAssets.visualAssetLibrary.labels.ec2dor");
  }
  return new Intl.DateTimeFormat("zh-CN", { month: "short", day: "numeric", year: "numeric" }).format(date);
}
