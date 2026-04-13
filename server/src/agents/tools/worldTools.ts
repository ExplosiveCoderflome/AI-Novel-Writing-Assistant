import { prisma } from "../../db/prisma";
import { AgentToolError, type AgentToolName } from "../types";
import type { AgentToolDefinition } from "./toolTypes";
import {
  bindWorldToNovelInputSchema,
  bindWorldToNovelOutputSchema,
  explainWorldConflictInputSchema,
  explainWorldConflictOutputSchema,
  getWorldDetailOutputSchema,
  listWorldsInputSchema,
  listWorldsOutputSchema,
  unbindWorldFromNovelInputSchema,
  unbindWorldFromNovelOutputSchema,
  worldIdInputSchema,
} from "./worldToolSchemas";

export const worldToolDefinitions: Partial<
  Record<AgentToolName, AgentToolDefinition<Record<string, unknown>, Record<string, unknown>>>
> = {
  list_worlds: {
    name: "list_worlds",
    title: "列出世界观",
    description: "读取世界观列表、版本和概览状态。",
    category: "read",
    riskLevel: "low",
    domainAgent: "WorldAgent",
    resourceScopes: ["world"],
    parserHints: {
      intent: "list_worlds",
      aliases: ["世界观列表", "世界观库", "worlds"],
      phrases: ["列出世界观列表", "当前有哪些世界观", "查看世界观列表"],
      requiresNovelContext: false,
      whenToUse: "用户想查看全局世界观资源。",
      whenNotToUse: "用户是在为当前小说绑定或检查某个具体世界观。",
    },
    inputSchema: listWorldsInputSchema,
    outputSchema: listWorldsOutputSchema,
    execute: async (_context, rawInput) => {
      const input = listWorldsInputSchema.parse(rawInput);
      const rows = await prisma.world.findMany({
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        take: input.limit ?? 20,
      });
      return listWorldsOutputSchema.parse({
        items: rows.map((row) => ({
          id: row.id,
          name: row.name,
          worldType: row.worldType ?? null,
          status: row.status,
          version: row.version,
          overviewSummary: row.overviewSummary ?? null,
          updatedAt: row.updatedAt.toISOString(),
        })),
        summary: `已读取 ${rows.length} 个世界观。`,
      });
    },
  },
  bind_world_to_novel: {
    name: "bind_world_to_novel",
    title: "绑定小说世界观",
    description: "将指定世界观绑定为当前小说的世界观。",
    category: "mutate",
    riskLevel: "medium",
    domainAgent: "WorldAgent",
    resourceScopes: ["world", "novel"],
    parserHints: {
      intent: "bind_world_to_novel",
      aliases: ["绑定世界观", "设置小说世界观"],
      phrases: ["将某个世界观设为当前小说的世界观", "把世界观绑定为当前小说世界观"],
      requiresNovelContext: true,
      whenToUse: "用户要把某个世界观绑定到当前小说。",
      whenNotToUse: "用户只是想查看世界观列表或详情。",
    },
    inputSchema: bindWorldToNovelInputSchema,
    outputSchema: bindWorldToNovelOutputSchema,
    execute: async (_context, rawInput) => {
      const input = bindWorldToNovelInputSchema.parse(rawInput);
      const novel = await prisma.novel.findUnique({
        where: { id: input.novelId },
        select: {
          id: true,
          title: true,
        },
      });
      if (!novel) {
        throw new AgentToolError("NOT_FOUND", "未找到当前小说。");
      }

      const resolvedWorld = input.worldId
        ? await prisma.world.findUnique({
          where: { id: input.worldId },
          select: { id: true, name: true },
        })
        : (() => undefined)();
      let world = resolvedWorld ?? null;
      if (!world && input.worldName) {
        const candidates = await prisma.world.findMany({
          where: {
            name: {
              contains: input.worldName,
            },
          },
          orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
          take: 8,
          select: {
            id: true,
            name: true,
          },
        });
        world = candidates.find((item) => item.name.trim() === input.worldName?.trim()) ?? candidates[0] ?? null;
      }

      if (!world) {
        throw new AgentToolError("NOT_FOUND", "未找到要绑定的世界观。");
      }

      await prisma.novel.update({
        where: { id: novel.id },
        data: {
          worldId: world.id,
        },
      });

      return bindWorldToNovelOutputSchema.parse({
        novelId: novel.id,
        novelTitle: novel.title,
        worldId: world.id,
        worldName: world.name,
        summary: `已将世界观《${world.name}》绑定到小说《${novel.title}》。`,
      });
    },
  },
  unbind_world_from_novel: {
    name: "unbind_world_from_novel",
    title: "解除小说世界观绑定",
    description: "解除当前小说与已绑定世界观之间的关联。",
    category: "mutate",
    riskLevel: "medium",
    domainAgent: "WorldAgent",
    resourceScopes: ["world", "novel"],
    parserHints: {
      intent: "unbind_world_from_novel",
      aliases: ["解绑世界观", "取消世界观绑定", "不使用当前世界观", "remove world binding"],
      phrases: ["不要这个世界观了", "先不用这个世界观", "把当前小说的世界观解绑", "取消当前世界观"],
      requiresNovelContext: true,
      whenToUse: "用户要取消当前小说已绑定的世界观，或明确表示先不用某个世界观。",
      whenNotToUse: "用户是在为当前小说指定一个新的世界观，或只是想查看世界观详情。",
    },
    inputSchema: unbindWorldFromNovelInputSchema,
    outputSchema: unbindWorldFromNovelOutputSchema,
    execute: async (_context, rawInput) => {
      const input = unbindWorldFromNovelInputSchema.parse(rawInput);
      const novel = await prisma.novel.findUnique({
        where: { id: input.novelId },
        select: {
          id: true,
          title: true,
          world: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });
      if (!novel) {
        throw new AgentToolError("NOT_FOUND", "未找到当前小说。");
      }

      const previousWorld = novel.world ?? null;
      if (previousWorld) {
        await prisma.novel.update({
          where: { id: novel.id },
          data: {
            worldId: null,
          },
        });
      }

      return unbindWorldFromNovelOutputSchema.parse({
        novelId: novel.id,
        novelTitle: novel.title,
        previousWorldId: previousWorld?.id ?? null,
        previousWorldName: previousWorld?.name ?? null,
        worldId: null,
        worldName: null,
        summary: previousWorld
          ? `已将世界观《${previousWorld.name}》从小说《${novel.title}》解绑。`
          : `当前小说《${novel.title}》还没有绑定世界观。`,
      });
    },
  },
  get_world_detail: {
    name: "get_world_detail",
    title: "读取世界观详情",
    description: "读取世界观详情、概览摘要和未解决冲突数。",
    category: "read",
    riskLevel: "low",
    domainAgent: "WorldAgent",
    resourceScopes: ["world", "novel"],
    inputSchema: worldIdInputSchema,
    outputSchema: getWorldDetailOutputSchema,
    execute: async (_context, rawInput) => {
      const input = worldIdInputSchema.parse(rawInput);
      const row = await prisma.world.findUnique({
        where: { id: input.worldId },
        include: {
          novels: {
            select: { id: true },
          },
          consistencyIssues: {
            where: { status: "open" },
            select: { id: true },
          },
        },
      });
      if (!row) {
        throw new AgentToolError("NOT_FOUND", "World not found.");
      }
      return getWorldDetailOutputSchema.parse({
        id: row.id,
        name: row.name,
        worldType: row.worldType ?? null,
        status: row.status,
        version: row.version,
        overviewSummary: row.overviewSummary ?? null,
        consistencyReport: row.consistencyReport ?? null,
        novelCount: row.novels.length,
        openIssueCount: row.consistencyIssues.length,
        summary: `世界观《${row.name}》当前有 ${row.consistencyIssues.length} 个未解决冲突。`,
      });
    },
  },
  explain_world_conflict: {
    name: "explain_world_conflict",
    title: "解释世界观冲突",
    description: "读取世界观一致性冲突，并给出恢复建议。",
    category: "inspect",
    riskLevel: "low",
    domainAgent: "WorldAgent",
    resourceScopes: ["world"],
    inputSchema: explainWorldConflictInputSchema,
    outputSchema: explainWorldConflictOutputSchema,
    execute: async (_context, rawInput) => {
      const input = explainWorldConflictInputSchema.parse(rawInput);
      const world = await prisma.world.findUnique({
        where: { id: input.worldId },
        include: {
          consistencyIssues: {
            where: input.issueId ? { id: input.issueId } : { status: "open" },
            orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
          },
        },
      });
      if (!world) {
        throw new AgentToolError("NOT_FOUND", "World not found.");
      }
      const issue = world.consistencyIssues[0] ?? null;
      const failureSummary = issue
        ? `${issue.message}${issue.targetField ? `（字段: ${issue.targetField}）` : ""}`
        : "当前世界观没有未解决的一致性冲突。";
      return explainWorldConflictOutputSchema.parse({
        worldId: world.id,
        issueId: issue?.id ?? null,
        issueCount: world.consistencyIssues.length,
        severity: issue?.severity ?? null,
        failureSummary,
        failureDetails: issue?.detail ?? world.consistencyReport ?? null,
        recoveryHint: issue
          ? "建议先确认冲突字段是否应以世界观为准，再更新对应层内容或相关小说设定。"
          : "当前无需处理冲突。",
        summary: failureSummary,
      });
    },
  },
};
