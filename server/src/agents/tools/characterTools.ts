import { prisma } from "../../db/prisma";
import { AgentToolError, type AgentToolName } from "../types";
import type { AgentToolDefinition } from "./toolTypes";
import {
  baseCharacterIdInputSchema,
  getBaseCharacterDetailOutputSchema,
  listBaseCharactersInputSchema,
  listBaseCharactersOutputSchema,
} from "./characterToolSchemas";

export const characterToolDefinitions: Partial<
  Record<AgentToolName, AgentToolDefinition<Record<string, unknown>, Record<string, unknown>>>
> = {
  list_base_characters: {
    name: "list_base_characters",
    title: "列出基础角色模板",
    description: "读取基础角色库的模板列表、分类和最近更新时间。",
    category: "read",
    riskLevel: "low",
    domainAgent: "CharacterAgent",
    resourceScopes: ["base_character"],
    parserHints: {
      intent: "list_base_characters",
      aliases: ["基础角色库", "角色模板库", "base characters"],
      phrases: ["列出基础角色库中的角色", "查看基础角色库", "角色库里有什么角色"],
      requiresNovelContext: false,
      whenToUse: "用户想查看全局基础角色模板库。",
      whenNotToUse: "用户问的是当前小说里已经规划的角色状态。",
    },
    inputSchema: listBaseCharactersInputSchema,
    outputSchema: listBaseCharactersOutputSchema,
    execute: async (_context, rawInput) => {
      const input = listBaseCharactersInputSchema.parse(rawInput);
      const rows = await prisma.baseCharacter.findMany({
        where: {
          ...(input.category ? { category: input.category } : {}),
          ...(input.search
            ? {
              OR: [
                { name: { contains: input.search } },
                { role: { contains: input.search } },
                { personality: { contains: input.search } },
                { background: { contains: input.search } },
                { tags: { contains: input.search } },
              ],
            }
            : {}),
        },
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        take: input.limit ?? 20,
      });
      return listBaseCharactersOutputSchema.parse({
        items: rows.map((row) => ({
          id: row.id,
          name: row.name,
          role: row.role,
          category: row.category,
          tags: row.tags ?? "",
          updatedAt: row.updatedAt.toISOString(),
        })),
        summary: `已读取 ${rows.length} 个基础角色模板。`,
      });
    },
  },
  get_base_character_detail: {
    name: "get_base_character_detail",
    title: "读取基础角色详情",
    description: "读取基础角色模板的完整设定和成长信息。",
    category: "read",
    riskLevel: "low",
    domainAgent: "CharacterAgent",
    resourceScopes: ["base_character"],
    inputSchema: baseCharacterIdInputSchema,
    outputSchema: getBaseCharacterDetailOutputSchema,
    execute: async (_context, rawInput) => {
      const input = baseCharacterIdInputSchema.parse(rawInput);
      const row = await prisma.baseCharacter.findUnique({
        where: { id: input.characterId },
      });
      if (!row) {
        throw new AgentToolError("NOT_FOUND", "Base character not found.");
      }
      return getBaseCharacterDetailOutputSchema.parse({
        id: row.id,
        name: row.name,
        role: row.role,
        category: row.category,
        personality: row.personality,
        background: row.background,
        development: row.development,
        appearance: row.appearance ?? null,
        weaknesses: row.weaknesses ?? null,
        interests: row.interests ?? null,
        keyEvents: row.keyEvents ?? null,
        tags: row.tags ?? "",
        updatedAt: row.updatedAt.toISOString(),
        summary: `已读取角色模板《${row.name}》。`,
      });
    },
  },
};
