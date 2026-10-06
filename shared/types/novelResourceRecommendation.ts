export type NovelResourceRecommendationSource = "user_selected" | "ai_recommended" | "market_recommended";

export type PowerSystemPreference = "ai_recommend" | "none" | "soft" | "ranked";
export type PowerSystemMode = Exclude<PowerSystemPreference, "ai_recommend">;

export interface NovelPowerSystemRecommendation {
  mode: PowerSystemMode;
  reason: string;
  source?: NovelResourceRecommendationSource;
}

export interface NovelResourceRecommendationOption {
  id: string;
  name: string;
  path: string;
  reason: string;
  source?: NovelResourceRecommendationSource;
}

export interface NovelCreateResourceRecommendation {
  summary: string;
  genre: NovelResourceRecommendationOption;
  primaryStoryMode: NovelResourceRecommendationOption;
  secondaryStoryMode?: NovelResourceRecommendationOption | null;
  powerSystem?: NovelPowerSystemRecommendation;
  caution?: string | null;
  recommendedAt: string;
}
