import type { TitleLibraryEntry, TitleLibraryListResult } from "@ai-novel/shared/types/title";
import { prisma } from "../../db/prisma";
import { AppError } from "../../middleware/errorHandler";

export interface ListTitleLibraryInput {
  search?: string;
  genreId?: string | null;
  page?: number;
  pageSize?: number;
  sort?: "newest" | "hot" | "clickRate";
}

export interface CreateTitleLibraryInput {
  title: string;
  description?: string | null;
  clickRate?: number | null;
  keywords?: string | null;
  genreId?: string | null;
}

function normalizeOptionalText(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed ? trimmed : null;
}

function normalizeTitle(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new AppError("标题不能为空。", 400);
  }
  if (trimmed.length > 40) {
    throw new AppError("标题不能超过 40 个字符。", 400);
  }
  return trimmed;
}

function normalizeClickRate(value: number | null | undefined): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (!Number.isFinite(value)) {
    return null;
  }
  return Math.min(100, Math.max(0, Math.round(value)));
}

function mapTitleEntry(
  row: {
    id: string;
    title: string;
    description: string | null;
    clickRate: number | null;
    keywords: string | null;
    genreId: string | null;
    usedCount: number;
    createdAt: Date;
    updatedAt: Date;
  },
  genreMap: Map<string, { id: string; name: string }>,
): TitleLibraryEntry {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    clickRate: row.clickRate,
    keywords: row.keywords,
    genreId: row.genreId,
    usedCount: row.usedCount,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    genre: row.genreId ? genreMap.get(row.genreId) ?? null : null,
  };
}

export class TitleLibraryService {
  async list(input: ListTitleLibraryInput = {}): Promise<TitleLibraryListResult> {
    const page = Math.max(1, Math.floor(input.page ?? 1));
    const pageSize = Math.min(100, Math.max(1, Math.floor(input.pageSize ?? 24)));
    const search = normalizeOptionalText(input.search);
    const genreId = normalizeOptionalText(input.genreId);

    const where = {
      ...(genreId ? { genreId } : {}),
      ...(search
        ? {
          OR: [
            { title: { contains: search } },
            { description: { contains: search } },
            { keywords: { contains: search } },
          ],
        }
        : {}),
    };

    const orderBy = input.sort === "hot"
      ? [{ usedCount: "desc" as const }, { updatedAt: "desc" as const }]
      : input.sort === "clickRate"
        ? [{ clickRate: "desc" as const }, { usedCount: "desc" as const }, { updatedAt: "desc" as const }]
        : [{ createdAt: "desc" as const }];

    const [rows, total] = await Promise.all([
      prisma.titleLibrary.findMany({
        where,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.titleLibrary.count({ where }),
    ]);

    const genreIds = Array.from(new Set(rows.map((row) => row.genreId).filter((value): value is string => Boolean(value))));
    const genres = genreIds.length > 0
      ? await prisma.novelGenre.findMany({
        where: { id: { in: genreIds } },
        select: { id: true, name: true },
      })
      : [];
    const genreMap = new Map(genres.map((genre) => [genre.id, genre] as const));

    return {
      items: rows.map((row) => mapTitleEntry(row, genreMap)),
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  async create(input: CreateTitleLibraryInput): Promise<TitleLibraryEntry> {
    const title = normalizeTitle(input.title);
    const description = normalizeOptionalText(input.description);
    const keywords = normalizeOptionalText(input.keywords);
    const genreId = normalizeOptionalText(input.genreId);
    const clickRate = normalizeClickRate(input.clickRate);

    if (genreId) {
      const genre = await prisma.novelGenre.findUnique({
        where: { id: genreId },
        select: { id: true },
      });
      if (!genre) {
        throw new AppError("指定的类型不存在。", 400);
      }
    }

    const existing = await prisma.titleLibrary.findFirst({
      where: { title },
      select: { id: true },
    });
    if (existing) {
      throw new AppError("标题库中已存在同名标题。", 400);
    }

    const created = await prisma.titleLibrary.create({
      data: {
        title,
        description,
        clickRate,
        keywords,
        genreId,
      },
    });

    const genreMap = genreId
      ? new Map([[genreId, (await prisma.novelGenre.findUnique({
        where: { id: genreId },
        select: { id: true, name: true },
      })) ?? { id: genreId, name: "" }]])
      : new Map<string, { id: string; name: string }>();
    return mapTitleEntry(created, genreMap);
  }

  async markUsed(id: string): Promise<TitleLibraryEntry> {
    const updated = await prisma.titleLibrary.update({
      where: { id },
      data: {
        usedCount: {
          increment: 1,
        },
      },
    }).catch(() => null);

    if (!updated) {
      throw new AppError("标题不存在。", 404);
    }

    const genreMap = updated.genreId
      ? new Map([[updated.genreId, (await prisma.novelGenre.findUnique({
        where: { id: updated.genreId },
        select: { id: true, name: true },
      })) ?? { id: updated.genreId, name: "" }]])
      : new Map<string, { id: string; name: string }>();
    return mapTitleEntry(updated, genreMap);
  }

  async delete(id: string): Promise<void> {
    const existing = await prisma.titleLibrary.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) {
      throw new AppError("标题不存在。", 404);
    }
    await prisma.titleLibrary.delete({
      where: { id },
    });
  }
}
