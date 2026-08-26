import type {
  NovelCreateResourceRecommendation,
  NovelResourceRecommendationOption,
} from "./novelResourceRecommendation.js";

export const MARKET_RADAR_PLATFORMS = ["fanqie", "qidian", "jinjiang"] as const;
export type MarketRadarPlatform = typeof MARKET_RADAR_PLATFORMS[number];

export const MARKET_INFLUENCE_MODES = ["follow_hot", "differentiate", "light"] as const;
export type MarketInfluenceMode = typeof MARKET_INFLUENCE_MODES[number];

export type MarketScanStatus = "queued" | "running" | "ready" | "analyzing" | "succeeded" | "partial" | "failed" | "interrupted";
export type MarketTrendDirection = "current" | "rising" | "stable" | "falling";

export interface MarketRadarListSource {
  platform: MarketRadarPlatform;
  platformLabel: string;
  listKey: string;
  listLabel: string;
  channel: "male" | "female" | "general";
  sourceUrl: string;
}

export interface MarketRankingItem {
  id: string;
  platform: MarketRadarPlatform;
  listKey: string;
  rank: number;
  title: string;
  author?: string | null;
  category?: string | null;
  tags: string[];
  synopsis?: string | null;
  heatLabel?: string | null;
  serialStatus?: string | null;
  sourceUrl: string;
}

export interface MarketRadarSignal {
  id: string;
  kind: "genre" | "protagonist" | "advantage" | "opening" | "relationship" | "title_pattern" | "opportunity" | "crowding";
  label: string;
  summary: string;
  direction: MarketTrendDirection;
  heat: number;
  crowding: number;
  evidenceItemIds: string[];
  recommended: boolean;
}

export interface MarketPlatformStatus {
  platform: MarketRadarPlatform;
  status: "succeeded" | "failed" | "stale";
  itemCount: number;
  capturedAt?: string | null;
  error?: string | null;
}

export const MARKET_FOUNDATION_SYNC_TARGETS = ["genre", "story_modes"] as const;
export type MarketFoundationSyncTarget = typeof MARKET_FOUNDATION_SYNC_TARGETS[number];

export interface MarketFoundationCandidate {
  existingId: string | null;
  name: string;
  reason: string;
}

export interface MarketProductionFoundationCandidate {
  genre: MarketFoundationCandidate;
  primaryStoryMode: MarketFoundationCandidate;
  secondaryStoryMode?: MarketFoundationCandidate | null;
}

export interface MarketProductionFoundationSyncState {
  genre?: NovelResourceRecommendationOption | null;
  storyModes?: {
    primaryStoryMode: NovelResourceRecommendationOption;
    secondaryStoryMode?: NovelResourceRecommendationOption | null;
  } | null;
}

export interface MarketTrendReport {
  id: string;
  scanRunId: string;
  summary: string;
  signals: MarketRadarSignal[];
  analyzedLists?: MarketRadarAnalysisListSelection[];
  analyzedItemIds?: string[];
  platformStatuses: MarketPlatformStatus[];
  evidenceItems: MarketRankingItem[];
  productionFoundationCandidate?: MarketProductionFoundationCandidate | null;
  productionFoundationSync?: MarketProductionFoundationSyncState | null;
  createdAt: string;
}

export interface MarketScanRun {
  id: string;
  status: MarketScanStatus;
  progress: number;
  requestedPlatforms: MarketRadarPlatform[];
  platformStatuses: MarketPlatformStatus[];
  rankingItems: MarketRankingItem[];
  report?: MarketTrendReport | null;
  lastError?: string | null;
  createdAt: string;
  startedAt?: string | null;
  finishedAt?: string | null;
}

export interface MarketCreativeBrief {
  id: string;
  reportId: string;
  influenceMode: MarketInfluenceMode;
  selectedSignals: MarketRadarSignal[];
  summary: string;
  promptBlock: string;
  productionFoundation?: NovelCreateResourceRecommendation | null;
  createdAt: string;
}

export interface CreateMarketScanRequest {
  platforms?: MarketRadarPlatform[];
}

export interface MarketRadarAnalysisListSelection {
  platform: MarketRadarPlatform;
  listKey: string;
}

export interface StartMarketRadarAnalysisRequest {
  selectedLists?: MarketRadarAnalysisListSelection[];
  selectedItemIds?: string[];
}

export interface CreateMarketCreativeBriefRequest {
  reportId: string;
  signalIds: string[];
  influenceMode: MarketInfluenceMode;
}

export interface SyncMarketProductionFoundationRequest {
  target: MarketFoundationSyncTarget;
}
