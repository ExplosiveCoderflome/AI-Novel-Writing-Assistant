/**
 * 项目级视觉资源协议。
 *
 * 资源库只索引文件与来源信息，不拥有或复制业务模块的原始事实与文件。
 * 调用方保存 assetId 以便追溯，url 则用于立即展示或作为生图参考图。
 */
export const VISUAL_ASSET_KINDS = [
  "character",
  "cover",
  "illustration",
  "comic_character_sheet",
  "comic_character_asset",
  "comic_scene",
  "comic_panel",
  "drama_character_sheet",
  "drama_shot_keyframe",
] as const;

export type VisualAssetKind = (typeof VISUAL_ASSET_KINDS)[number];

export const VISUAL_ASSET_SOURCES = ["image_asset", "comic", "drama"] as const;
export type VisualAssetSourceDomain = (typeof VISUAL_ASSET_SOURCES)[number];

export type VisualAssetOrigin = "generated" | "uploaded" | "imported" | "unknown";
export type VisualAssetScopeKind = "global" | "novel" | "book_analysis" | "comic_project" | "drama_project";

export interface VisualAssetSourceRef {
  domain: VisualAssetSourceDomain;
  resourceType: string;
  resourceId: string;
  version?: string | null;
  label: string;
}

export interface VisualAssetScopeRef {
  kind: VisualAssetScopeKind;
  id?: string | null;
  label?: string | null;
}

export interface VisualAssetSelection {
  assetId: string;
  url: string;
  thumbnailUrl: string;
  kind: VisualAssetKind;
  origin: VisualAssetOrigin;
  source: VisualAssetSourceRef;
  scope: VisualAssetScopeRef;
  mimeType?: string | null;
  width?: number | null;
  height?: number | null;
  prompt?: string | null;
  provider?: string | null;
  model?: string | null;
  createdAt: string;
}

export interface VisualAssetCatalogItem extends VisualAssetSelection {
  isPrimary: boolean;
}

export interface VisualAssetCatalogPage {
  items: VisualAssetCatalogItem[];
  nextCursor: string | null;
  total: number;
}

export interface VisualAssetCatalogFacets {
  kinds: Array<{ value: VisualAssetKind; count: number }>;
  sources: Array<{ value: VisualAssetSourceDomain; count: number }>;
  scopes: Array<{ kind: VisualAssetScopeKind; id: string | null; label: string | null; count: number }>;
}
