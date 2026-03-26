import type { LLMProvider } from "@ai-novel/shared/types/llm";
import type {
  VolumeChapterPlan,
  VolumePlan,
  VolumePlanVersion,
} from "@ai-novel/shared/types/novel";
import type { Prisma } from "@prisma/client";
import { prisma } from "../../../db/prisma";

export type ChapterDetailMode = "purpose" | "boundary" | "task_sheet";

export interface VolumeWorkspace {
  volumes: VolumePlan[];
  activeVersionId: string | null;
}

export interface VolumeGenerationNovel {
  title: string;
  description: string | null;
  targetAudience: string | null;
  bookSellingPoint: string | null;
  competingFeel: string | null;
  first30ChapterPromise: string | null;
  commercialTagsJson: string | null;
  estimatedChapterCount: number | null;
  narrativePov: string | null;
  pacePreference: string | null;
  emotionIntensity: string | null;
  storyModePromptBlock?: string | null;
  genre: {
    name: string;
  } | null;
  characters: Array<{
    name: string;
    role: string;
    currentGoal: string | null;
    currentState: string | null;
  }>;
}

export interface VolumeGenerateOptions {
  provider?: LLMProvider;
  model?: string;
  temperature?: number;
  guidance?: string;
  scope?: "book" | "volume" | "chapter_detail";
  targetVolumeId?: string;
  targetChapterId?: string;
  detailMode?: "purpose" | "boundary" | "task_sheet";
  estimatedChapterCount?: number;
  respectExistingVolumeCount?: boolean;
  draftVolumes?: unknown;
}

export interface VolumeDraftInput {
  volumes?: unknown;
  diffSummary?: string;
  baseVersion?: number;
}

export interface VolumeImpactInput {
  volumes?: unknown;
  versionId?: string;
}

export interface VolumeSyncInput {
  volumes: unknown;
  preserveContent?: boolean;
  applyDeletes?: boolean;
}

export type DbClient = Prisma.TransactionClient | typeof prisma;

export type VolumeRow = Prisma.VolumePlanGetPayload<{
  include: {
    chapters: {
      orderBy: { chapterOrder: "asc" };
    };
  };
}>;

export type VolumeVersionRow = Prisma.VolumePlanVersionGetPayload<Record<string, never>>;

export function mapVolumeRow(row: VolumeRow): VolumePlan {
  return {
    id: row.id,
    novelId: row.novelId,
    sortOrder: row.sortOrder,
    title: row.title,
    summary: row.summary,
    mainPromise: row.mainPromise,
    escalationMode: row.escalationMode,
    protagonistChange: row.protagonistChange,
    climax: row.climax,
    nextVolumeHook: row.nextVolumeHook,
    resetPoint: row.resetPoint,
    openPayoffs: row.openPayoffsJson ? JSON.parse(row.openPayoffsJson) as string[] : [],
    status: row.status,
    sourceVersionId: row.sourceVersionId,
    chapters: row.chapters.map((chapter) => ({
      id: chapter.id,
      volumeId: chapter.volumeId,
      chapterOrder: chapter.chapterOrder,
      title: chapter.title,
      summary: chapter.summary,
      purpose: chapter.purpose,
      conflictLevel: chapter.conflictLevel,
      revealLevel: chapter.revealLevel,
      targetWordCount: chapter.targetWordCount,
      mustAvoid: chapter.mustAvoid,
      taskSheet: chapter.taskSheet,
      payoffRefs: chapter.payoffRefsJson ? JSON.parse(chapter.payoffRefsJson) as string[] : [],
      createdAt: chapter.createdAt.toISOString(),
      updatedAt: chapter.updatedAt.toISOString(),
    })),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function mapVersionRow(row: VolumeVersionRow): VolumePlanVersion {
  return {
    id: row.id,
    novelId: row.novelId,
    version: row.version,
    status: row.status,
    contentJson: row.contentJson,
    diffSummary: row.diffSummary,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
