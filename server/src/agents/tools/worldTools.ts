import { z } from "zod";
import { prisma } from "../../db/prisma";
import { AgentToolError, type AgentToolName } from "../types";
import type { AgentToolDefinition } from "./toolTypes";

const listWorldsInput = z.object({
  limit: z.number().int().min(1).max(50).optional(),
});

const worldSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  worldType: z.string().nullable(),
  status: z.string(),
  version: z.number().int(),
  overviewSummary: z.string().nullable(),
  updatedAt: z.string(),
});

const listWorldsOutput = z.object({
  items: z.array(worldSummarySchema),
  summary: z.string(),
});

const worldIdInput = z.object({
  worldId: z.string().trim().min(1),
});

const bindWorldToNovelInput = z.object({
  novelId: z.string().trim().min(1),
  worldId: z.string().trim().min(1).optional(),
  worldName: z.string().trim().min(1).optional(),
}).refine((input) => Boolean(input.worldId || input.worldName), {
  message: "worldId or worldName is required.",
});

const getWorldDetailOutput = z.object({
  id: z.string(),
  name: z.string(),
  worldType: z.string().nullable(),
  status: z.string(),
  version: z.number().int(),
  overviewSummary: z.string().nullable(),
  consistencyReport: z.string().nullable(),
  novelCount: z.number().int(),
  openIssueCount: z.number().int(),
  summary: z.string(),
});

const bindWorldToNovelOutput = z.object({
  novelId: z.string(),
  novelTitle: z.string(),
  worldId: z.string(),
  worldName: z.string(),
  summary: z.string(),
});

const explainWorldConflictInput = z.object({
  worldId: z.string().trim().min(1),
  issueId: z.string().trim().optional(),
});

const explainWorldConflictOutput = z.object({
  worldId: z.string(),
  issueId: z.string().nullable(),
  issueCount: z.number().int(),
  severity: z.string().nullable(),
  failureSummary: z.string(),
  failureDetails: z.string().nullable(),
  recoveryHint: z.string(),
  summary: z.string(),
});

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
    inputSchema: listWorldsInput,
    outputSchema: listWorldsOutput,
    execute: async (_context, rawInput) => {
      const input = listWorldsInput.parse(rawInput);
      const rows = await prisma.world.findMany({
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        take: input.limit ?? 20,
      });
      return listWorldsOutput.parse({
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
    inputSchema: bindWorldToNovelInput,
    outputSchema: bindWorldToNovelOutput,
    execute: async (_context, rawInput) => {
      const input = bindWorldToNovelInput.parse(rawInput);
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

      return bindWorldToNovelOutput.parse({
        novelId: novel.id,
        novelTitle: novel.title,
        worldId: world.id,
        worldName: world.name,
        summary: `已将世界观《${world.name}》绑定到小说《${novel.title}》。`,
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
    inputSchema: worldIdInput,
    outputSchema: getWorldDetailOutput,
    execute: async (_context, rawInput) => {
      const input = worldIdInput.parse(rawInput);
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
      return getWorldDetailOutput.parse({
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
    inputSchema: explainWorldConflictInput,
    outputSchema: explainWorldConflictOutput,
    execute: async (_context, rawInput) => {
      const input = explainWorldConflictInput.parse(rawInput);
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
      return explainWorldConflictOutput.parse({
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
