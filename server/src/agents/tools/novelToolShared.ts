import { z } from "zod";

export const novelProjectStatusSchema = z.enum([
  "not_started",
  "in_progress",
  "completed",
  "rework",
  "blocked",
]);

export const narrativePovSchema = z.enum(["first_person", "third_person", "mixed"]);
export const pacePreferenceSchema = z.enum(["slow", "balanced", "fast"]);
export const projectModeSchema = z.enum(["ai_led", "co_pilot", "draft_mode", "auto_pipeline"]);

export const novelListItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  status: z.string(),
  projectStatus: novelProjectStatusSchema.nullable(),
  chapterCount: z.number().int(),
  updatedAt: z.string(),
});

export const listNovelsInput = z.object({
  query: z.string().trim().min(1).optional(),
  projectStatus: novelProjectStatusSchema.optional(),
  limit: z.number().int().min(1).max(50).optional(),
});

export const listNovelsOutput = z.object({
  total: z.number().int(),
  items: z.array(novelListItemSchema),
});

export const createNovelInput = z.object({
  title: z.string().trim().min(1),
  description: z.string().trim().optional(),
  genre: z.string().trim().optional(),
  narrativePov: narrativePovSchema.optional(),
  pacePreference: pacePreferenceSchema.optional(),
  styleTone: z.string().trim().optional(),
  projectStatus: novelProjectStatusSchema.optional(),
  projectMode: projectModeSchema.optional(),
});

export const createNovelOutput = z.object({
  novelId: z.string(),
  title: z.string(),
  status: z.string(),
  chapterCount: z.number().int(),
  summary: z.string(),
});

export const selectNovelWorkspaceInput = z
  .object({
    novelId: z.string().trim().min(1).optional(),
    title: z.string().trim().min(1).optional(),
  })
  .refine((input) => Boolean(input.novelId || input.title), {
    message: "novelId or title is required.",
  });

export const selectNovelWorkspaceOutput = z.object({
  novelId: z.string(),
  title: z.string(),
  chapterCount: z.number().int(),
  summary: z.string(),
});

export const getNovelContextInput = z.object({
  novelId: z.string().trim().min(1),
});

export const chapterOverviewSchema = z.object({
  id: z.string(),
  order: z.number().int(),
  title: z.string(),
  excerpt: z.string(),
});

export const getNovelContextOutput = z.object({
  novelId: z.string(),
  title: z.string(),
  outline: z.string().nullable(),
  structuredOutline: z.string().nullable(),
  chapterCount: z.number().int(),
  completedChapterCount: z.number().int(),
  latestCompletedChapterOrder: z.number().int().nullable(),
  chapterSummary: z.array(chapterOverviewSchema),
});

export const listChaptersInput = z.object({
  novelId: z.string().trim().min(1),
});

export const chapterMetaSchema = z.object({
  id: z.string(),
  order: z.number().int(),
  title: z.string(),
  hasContent: z.boolean(),
  contentLength: z.number().int(),
});

export const listChaptersOutput = z.object({
  novelId: z.string(),
  items: z.array(chapterMetaSchema),
});

export const getChapterByOrderInput = z.object({
  novelId: z.string().trim().min(1),
  chapterOrder: z.number().int().min(1),
});

export const getChapterByOrderOutput = z.object({
  novelId: z.string(),
  chapterId: z.string(),
  order: z.number().int(),
  title: z.string(),
  hasContent: z.boolean(),
  contentLength: z.number().int(),
});

export const getChapterContentInput = z
  .object({
    novelId: z.string().trim().min(1),
    chapterId: z.string().trim().min(1).optional(),
    chapterOrder: z.number().int().min(1).optional(),
  })
  .refine((input) => Boolean(input.chapterId || input.chapterOrder), {
    message: "chapterId or chapterOrder is required.",
  });

export const getChapterContentOutput = z.object({
  novelId: z.string(),
  chapterId: z.string(),
  title: z.string(),
  order: z.number().int(),
  content: z.string(),
  contentLength: z.number().int(),
});

export const summarizeChapterRangeInput = z.object({
  novelId: z.string().trim().min(1),
  startOrder: z.number().int().min(1),
  endOrder: z.number().int().min(1),
  mode: z.enum(["summary", "excerpt"]).default("summary"),
});

export const summarizeChapterRangeOutput = z.object({
  novelId: z.string(),
  startOrder: z.number().int(),
  endOrder: z.number().int(),
  chapterCount: z.number().int(),
  summaryMode: z.enum(["chapter_summary", "content_excerpt"]),
  summary: z.string(),
  chapters: z.array(chapterOverviewSchema),
});

export const getStoryBibleInput = z.object({
  novelId: z.string().trim().min(1),
});

export const getStoryBibleOutput = z.object({
  novelId: z.string(),
  exists: z.boolean(),
  coreSetting: z.string().nullable(),
  forbiddenRules: z.string().nullable(),
  mainPromise: z.string().nullable(),
  characterArcs: z.string().nullable(),
  worldRules: z.string().nullable(),
});

export const getCharacterStatesInput = z.object({
  novelId: z.string().trim().min(1),
});

export const getCharacterStatesOutput = z.object({
  novelId: z.string(),
  count: z.number().int(),
  items: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      role: z.string(),
      currentState: z.string().nullable(),
      currentGoal: z.string().nullable(),
    }),
  ),
});

export const getTimelineFactsInput = z.object({
  novelId: z.string().trim().min(1),
  limit: z.number().int().min(1).max(100).optional(),
});

export const getTimelineFactsOutput = z.object({
  novelId: z.string(),
  count: z.number().int(),
  items: z.array(
    z.object({
      id: z.string(),
      chapterId: z.string().nullable(),
      category: z.string(),
      content: z.string(),
    }),
  ),
});

export const getWorldConstraintsInput = z.object({
  worldId: z.string().trim().min(1).optional(),
  novelId: z.string().trim().min(1).optional(),
});

export const getWorldConstraintsOutput = z.object({
  worldId: z.string().nullable(),
  novelId: z.string().nullable(),
  worldName: z.string().nullable(),
  constraints: z.object({
    axioms: z.string().nullable(),
    magicSystem: z.string().nullable(),
    conflicts: z.string().nullable(),
    consistencyReport: z.string().nullable(),
  }),
});

export const searchKnowledgeInput = z.object({
  query: z.string().trim().min(1),
  novelId: z.string().trim().min(1).optional(),
  worldId: z.string().trim().min(1).optional(),
  topK: z.number().int().min(1).max(20).optional(),
});

export const searchKnowledgeOutput = z.object({
  query: z.string(),
  contextBlock: z.string(),
  hitCount: z.number().int(),
});

export const generateWorldForNovelInput = z.object({
  novelId: z.string().trim().min(1).optional(),
  description: z.string().trim().optional(),
  worldType: z.string().trim().optional(),
});

export const generateWorldForNovelOutput = z.object({
  novelId: z.string(),
  worldId: z.string(),
  worldName: z.string(),
  reused: z.boolean(),
  summary: z.string(),
});

export const productionCharacterSchema = z.object({
  id: z.string(),
  name: z.string(),
  role: z.string(),
});

export const generateNovelCharactersInput = z.object({
  novelId: z.string().trim().min(1).optional(),
  description: z.string().trim().optional(),
  genre: z.string().trim().optional(),
  styleTone: z.string().trim().optional(),
  narrativePov: narrativePovSchema.optional(),
  count: z.number().int().min(3).max(8).optional(),
});

export const generateNovelCharactersOutput = z.object({
  novelId: z.string(),
  reused: z.boolean(),
  characterCount: z.number().int(),
  items: z.array(productionCharacterSchema),
  summary: z.string(),
});

export const generateStoryBibleInput = z.object({
  novelId: z.string().trim().min(1).optional(),
});

export const generateStoryBibleOutput = z.object({
  novelId: z.string(),
  exists: z.boolean(),
  coreSetting: z.string().nullable(),
  mainPromise: z.string().nullable(),
  summary: z.string(),
});

export const generateNovelOutlineInput = z.object({
  novelId: z.string().trim().min(1).optional(),
  description: z.string().trim().optional(),
});

export const generateNovelOutlineOutput = z.object({
  novelId: z.string(),
  outline: z.string(),
  outlineLength: z.number().int(),
  summary: z.string(),
});

export const generateStructuredOutlineInput = z.object({
  novelId: z.string().trim().min(1).optional(),
  targetChapterCount: z.number().int().min(1).max(200).default(20),
});

export const generateStructuredOutlineOutput = z.object({
  novelId: z.string(),
  chapterCount: z.number().int(),
  targetChapterCount: z.number().int(),
  structuredOutline: z.string(),
  summary: z.string(),
});

export const syncChaptersFromStructuredOutlineInput = z.object({
  novelId: z.string().trim().min(1).optional(),
});

export const syncChaptersFromStructuredOutlineOutput = z.object({
  novelId: z.string(),
  chapterCount: z.number().int(),
  createdCount: z.number().int(),
  updatedCount: z.number().int(),
  summary: z.string(),
});

export const startFullNovelPipelineInput = z.object({
  novelId: z.string().trim().min(1).optional(),
  startOrder: z.number().int().min(1).optional(),
  endOrder: z.number().int().min(1).optional(),
  maxRetries: z.number().int().min(0).max(5).optional(),
  targetChapterCount: z.number().int().min(1).max(200).optional(),
  dryRun: z.boolean().optional(),
});

export const startFullNovelPipelineOutput = z.object({
  novelId: z.string(),
  jobId: z.string().nullable(),
  status: z.string(),
  startOrder: z.number().int(),
  endOrder: z.number().int(),
  dryRun: z.boolean(),
  summary: z.string(),
});

export const productionStageSchema = z.object({
  key: z.string(),
  label: z.string(),
  status: z.enum(["pending", "completed", "running", "blocked"]),
  detail: z.string().nullable(),
});

export const getNovelProductionStatusInput = z
  .object({
    novelId: z.string().trim().min(1).optional(),
    title: z.string().trim().min(1).optional(),
    targetChapterCount: z.number().int().min(1).max(200).optional(),
  })
  .refine((input) => Boolean(input.novelId || input.title), {
    message: "novelId or title is required.",
  });

export const getNovelProductionStatusOutput = z.object({
  novelId: z.string(),
  title: z.string(),
  worldId: z.string().nullable(),
  worldName: z.string().nullable(),
  chapterCount: z.number().int(),
  targetChapterCount: z.number().int(),
  assetStages: z.array(productionStageSchema),
  assetsReady: z.boolean(),
  pipelineReady: z.boolean(),
  pipelineJobId: z.string().nullable(),
  pipelineStatus: z.string().nullable(),
  failureSummary: z.string().nullable(),
  recoveryHint: z.string().nullable(),
  currentStage: z.string(),
  summary: z.string(),
});

export function toChapterOverview(chapter: {
  id: string;
  order: number;
  title: string;
  content?: string | null;
  chapterSummary?: { summary: string } | null;
}) {
  const excerpt = (chapter.chapterSummary?.summary?.trim() || chapter.content || "").slice(0, 300);
  return {
    id: chapter.id,
    order: chapter.order,
    title: chapter.title,
    excerpt,
  };
}

export function toNovelListItem(novel: {
  id: string;
  title: string;
  description: string | null;
  status: string;
  projectStatus: "not_started" | "in_progress" | "completed" | "rework" | "blocked" | null;
  updatedAt: Date;
  _count?: {
    chapters?: number;
  };
}) {
  return {
    id: novel.id,
    title: novel.title,
    description: novel.description ?? null,
    status: novel.status,
    projectStatus: novel.projectStatus ?? null,
    chapterCount: novel._count?.chapters ?? 0,
    updatedAt: novel.updatedAt.toISOString(),
  };
}
