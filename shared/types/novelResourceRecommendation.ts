export type NovelResourceRecommendationSource = "user_selected" | "ai_recommended" | "market_recommended";

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
  caution?: string | null;
  recommendedAt: string;
}
