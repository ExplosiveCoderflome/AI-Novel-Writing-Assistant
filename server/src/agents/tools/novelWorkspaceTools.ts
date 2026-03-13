import { prisma } from "../../db/prisma";
import { AgentToolError, type AgentToolName } from "../types";
import type { AgentToolDefinition } from "./toolTypes";
import {
  createNovelInput,
  createNovelOutput,
  listNovelsInput,
  listNovelsOutput,
  selectNovelWorkspaceInput,
  selectNovelWorkspaceOutput,
  toNovelListItem,
} from "./novelToolShared";

async function resolveGenreIdByName(name: string | undefined): Promise<string | null> {
  if (!name?.trim()) {
    return null;
  }
  const candidates = await prisma.novelGenre.findMany({
    where: {
      name: {
        contains: name.trim(),
      },
    },
    orderBy: { updatedAt: "desc" },
    take: 8,
    select: {
      id: true,
      name: true,
    },
  });
  return candidates.find((item) => item.name.trim() === name.trim())?.id
    ?? candidates[0]?.id
    ?? null;
}

export const novelWorkspaceToolDefinitions: Partial<
  Record<AgentToolName, AgentToolDefinition<Record<string, unknown>, Record<string, unknown>>>
> = {
  list_novels: {
    name: "list_novels",
    title: "列出小说",
    description: "列出当前系统中的小说列表，可按标题和项目状态筛选。",
    category: "read",
    riskLevel: "low",
    domainAgent: "NovelAgent",
    resourceScopes: ["global", "novel"],
    inputSchema: listNovelsInput,
    outputSchema: listNovelsOutput,
    execute: async (_context, rawInput) => {
      const input = listNovelsInput.parse(rawInput);
      const where = {
        ...(input.query
          ? {
            title: {
              contains: input.query,
            },
          }
          : {}),
        ...(input.projectStatus
          ? {
            projectStatus: input.projectStatus,
          }
          : {}),
      };
      const [total, rows] = await Promise.all([
        prisma.novel.count({ where }),
        prisma.novel.findMany({
          where,
          orderBy: { updatedAt: "desc" },
          take: input.limit ?? 10,
          include: {
            _count: {
              select: {
                chapters: true,
              },
            },
          },
        }),
      ]);
      return listNovelsOutput.parse({
        total,
        items: rows.map(toNovelListItem),
      });
    },
  },
  create_novel: {
    name: "create_novel",
    title: "创建小说",
    description: "创建一本新小说并返回基础工作区信息。",
    category: "mutate",
    riskLevel: "medium",
    domainAgent: "NovelAgent",
    resourceScopes: ["global", "novel"],
    inputSchema: createNovelInput,
    outputSchema: createNovelOutput,
    execute: async (_context, rawInput) => {
      const input = createNovelInput.parse(rawInput);
      const genreId = await resolveGenreIdByName(input.genre);
      const novel = await prisma.novel.create({
        data: {
          title: input.title,
          description: input.description ?? null,
          genreId,
          narrativePov: input.narrativePov,
          pacePreference: input.pacePreference,
          styleTone: input.styleTone ?? null,
          projectStatus: input.projectStatus ?? "in_progress",
          outlineStatus: "not_started",
          storylineStatus: "not_started",
          projectMode: input.projectMode ?? "auto_pipeline",
        },
      });
      return createNovelOutput.parse({
        novelId: novel.id,
        title: novel.title,
        status: novel.status,
        chapterCount: 0,
        summary: `已创建小说《${novel.title}》。`,
      });
    },
  },
  select_novel_workspace: {
    name: "select_novel_workspace",
    title: "选择小说工作区",
    description: "按标题或 ID 选择小说，用于绑定创作中枢当前工作区。",
    category: "mutate",
    riskLevel: "low",
    domainAgent: "NovelAgent",
    resourceScopes: ["global", "novel"],
    inputSchema: selectNovelWorkspaceInput,
    outputSchema: selectNovelWorkspaceOutput,
    execute: async (_context, rawInput) => {
      const input = selectNovelWorkspaceInput.parse(rawInput);
      const novel = input.novelId
        ? await prisma.novel.findUnique({
          where: { id: input.novelId },
          include: {
            _count: {
              select: {
                chapters: true,
              },
            },
          },
        })
        : null;
      let resolved = novel ?? null;
      if (!resolved && input.title) {
        const candidates = await prisma.novel.findMany({
          where: {
            title: {
              contains: input.title,
            },
          },
          orderBy: { updatedAt: "desc" },
          take: 8,
          include: {
            _count: {
              select: {
                chapters: true,
              },
            },
          },
        });
        resolved = candidates.find((item) => item.title.trim() === input.title?.trim()) ?? candidates[0] ?? null;
      }
      if (!resolved) {
        throw new AgentToolError("NOT_FOUND", "未找到要绑定的小说。");
      }
      return selectNovelWorkspaceOutput.parse({
        novelId: resolved.id,
        title: resolved.title,
        chapterCount: resolved._count.chapters,
        summary: `已定位到小说《${resolved.title}》。`,
      });
    },
  },
};
