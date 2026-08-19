export type TitleFactoryMode = "brief" | "adapt";

export type TitleSuggestionStyle = "literary" | "conflict" | "suspense" | "high_concept";

export interface TitleFactorySuggestion {
  title: string;
  clickRate: number;
  style: TitleSuggestionStyle;
  angle?: string | null;
  reason?: string | null;
}

export interface TitleLibraryEntry {
  id: string;
  title: string;
  description?: string | null;
  clickRate?: number | null;
  keywords?: string | null;
  genreId?: string | null;
  usedCount: number;
  createdAt: string;
  updatedAt: string;
  genre?: {
    id: string;
    name: string;
  } | null;
}

export interface TitleLibraryListResult {
  items: TitleLibraryEntry[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}
