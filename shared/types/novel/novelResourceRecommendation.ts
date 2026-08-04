export interface NovelResourceRecommendationOption {
  id: string;
  name: string;
  path: string;
  reason: string;
}

export interface NovelCreateResourceRecommendation {
  summary: string;
  genre: NovelResourceRecommendationOption;
  primaryStoryMode: NovelResourceRecommendationOption;
  secondaryStoryMode?: NovelResourceRecommendationOption | null;
  caution?: string | null;
  recommendedAt: string;
}
