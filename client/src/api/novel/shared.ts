import { NOVEL_LIST_PAGE_LIMIT_DEFAULT, NOVEL_LIST_PAGE_LIMIT_MAX } from "@ai-novel/shared/types/pagination";
import type {
  Chapter,
  Character,
  Novel,
  NovelAutoDirectorTaskSummary,
  NovelBible,
  NovelStoryMode,
  PlotBeat,
} from "@ai-novel/shared/types/novel";

export interface NovelListResponse {
  items: Array<
    Novel & {
      _count: {
        chapters: number;
        characters: number;
      };
      genre?: {
        id: string;
        name: string;
      } | null;
      primaryStoryMode?: NovelStoryMode | null;
      secondaryStoryMode?: NovelStoryMode | null;
      world?: {
        id: string;
        name: string;
        worldType?: string | null;
      } | null;
      latestAutoDirectorTask?: NovelAutoDirectorTaskSummary | null;
    }
  >;
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface NovelDetailResponse extends Novel {
  chapters: Chapter[];
  characters: Character[];
  bible?: NovelBible | null;
  plotBeats?: PlotBeat[];
  genre?: {
    id: string;
    name: string;
  } | null;
  primaryStoryMode?: NovelStoryMode | null;
  secondaryStoryMode?: NovelStoryMode | null;
  world?: {
    id: string;
    name: string;
    worldType?: string | null;
    description?: string | null;
    overviewSummary?: string | null;
    axioms?: string | null;
    magicSystem?: string | null;
    conflicts?: string | null;
  } | null;
}

export interface DraftOptimizePreview {
  optimizedDraft: string;
  mode: "full" | "selection";
  selectedText?: string | null;
}

export function normalizeNovelListLimit(limit: number | undefined): number {
  if (typeof limit !== "number" || !Number.isFinite(limit)) {
    return NOVEL_LIST_PAGE_LIMIT_DEFAULT;
  }
  return Math.max(1, Math.min(NOVEL_LIST_PAGE_LIMIT_MAX, Math.floor(limit)));
}

export function extractFileName(contentDisposition: string | undefined, fallback: string): string {
  if (!contentDisposition) {
    return fallback;
  }
  const match = contentDisposition.match(/filename="?([^"]+)"?/i);
  if (!match?.[1]) {
    return fallback;
  }
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}
