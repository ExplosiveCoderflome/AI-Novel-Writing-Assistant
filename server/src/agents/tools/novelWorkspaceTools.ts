import { prisma } from "../../db/prisma";
import { novelSetupStatusService } from "../../services/novel/NovelSetupStatusService";
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
    parserHints: {
      intent: "list_novels",
      aliases: ["小说列表", "书列表", "novels"],
      phrases: ["列出当前的小说列表", "当前有多少本小说", "查看小说工作区"],
      requiresNovelContext: false,
      whenToUse: "用户在查询全局小说列表、数量或可切换的工作区。",
      whenNotToUse: "用户已经锁定某本小说并在追问章节、角色或生产状态。",
    },
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
    parserHints: {
      intent: "create_novel",
      aliases: ["创建小说", "新建小说", "create novel"],
      phrases: ["创建一本小说《xxx》", "新建一本书", "创建新的小说工作区"],
      requiresNovelContext: false,
      whenToUse: "用户只是在创建一部新小说。",
      whenNotToUse: "用户要求创建后立刻开始整本生成，那更接近 produce_novel。",
    },
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
          emotionIntensity: input.emotionIntensity,
          aiFreedom: input.aiFreedom,
          defaultChapterLength: input.defaultChapterLength,
          projectStatus: input.projectStatus ?? "in_progress",
          outlineStatus: "not_started",
          storylineStatus: "not_started",
          projectMode: input.projectMode ?? "auto_pipeline",
        },
      });
      const setup = await novelSetupStatusService.getNovelSetupStatus(novel.id);
      if (!setup) {
        throw new AgentToolError("INTERNAL", "创建小说后未能读取初始化状态。");
      }
      return createNovelOutput.parse({
        novelId: novel.id,
        title: novel.title,
        status: novel.status,
        chapterCount: 0,
        summary: `已创建小说《${novel.title}》，当前进入初始化引导。`,
        setup,
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
    parserHints: {
      intent: "select_novel_workspace",
      aliases: ["切换小说", "选择工作区", "select workspace"],
      phrases: ["把《xxx》设为当前工作区", "切换到某本小说", "打开这本小说的工作区"],
      requiresNovelContext: false,
      whenToUse: "用户想把某本小说绑定为当前创作工作区。",
      whenNotToUse: "用户只是想查看所有小说，不是切换上下文。",
    },
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
      const setup = await novelSetupStatusService.getNovelSetupStatus(resolved.id);
      if (!setup) {
        throw new AgentToolError("INTERNAL", "切换工作区后未能读取初始化状态。");
      }
      return selectNovelWorkspaceOutput.parse({
        novelId: resolved.id,
        title: resolved.title,
        chapterCount: resolved._count.chapters,
        summary: `已切换到小说《${resolved.title}》的工作区。`,
        setup,
      });
    },
  },
};
