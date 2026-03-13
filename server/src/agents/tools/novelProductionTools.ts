import { AgentToolError, type AgentToolName } from "../types";
import type { AgentToolDefinition } from "./toolTypes";
import {
  generateNovelCharactersInput,
  generateNovelCharactersOutput,
  generateNovelOutlineInput,
  generateNovelOutlineOutput,
  generateStoryBibleInput,
  generateStoryBibleOutput,
  generateStructuredOutlineInput,
  generateStructuredOutlineOutput,
  generateWorldForNovelInput,
  generateWorldForNovelOutput,
  getNovelProductionStatusInput,
  getNovelProductionStatusOutput,
  startFullNovelPipelineInput,
  startFullNovelPipelineOutput,
  syncChaptersFromStructuredOutlineInput,
  syncChaptersFromStructuredOutlineOutput,
} from "./novelToolShared";
import { novelProductionService } from "../../services/novel/NovelProductionService";

function resolveNovelId(contextNovelId: string | undefined, rawNovelId: string | undefined): string {
  const novelId = rawNovelId?.trim() || contextNovelId?.trim();
  if (!novelId) {
    throw new AgentToolError("INVALID_INPUT", "没有当前小说上下文。");
  }
  return novelId;
}

export const novelProductionToolDefinitions: Partial<
  Record<AgentToolName, AgentToolDefinition<Record<string, unknown>, Record<string, unknown>>>
> = {
  generate_world_for_novel: {
    name: "generate_world_for_novel",
    title: "生成小说世界观",
    description: "为当前小说生成世界观；若已绑定世界观则直接复用。",
    category: "mutate",
    riskLevel: "medium",
    domainAgent: "NovelAgent",
    resourceScopes: ["novel", "world"],
    inputSchema: generateWorldForNovelInput,
    outputSchema: generateWorldForNovelOutput,
    execute: async (context, rawInput) => {
      const input = generateWorldForNovelInput.parse(rawInput);
      return generateWorldForNovelOutput.parse(
        await novelProductionService.generateWorldForNovel({
          novelId: resolveNovelId(context.novelId, input.novelId),
          description: input.description,
          worldType: input.worldType,
          provider: context.provider,
          model: context.model,
          temperature: context.temperature,
        }),
      );
    },
  },
  generate_novel_characters: {
    name: "generate_novel_characters",
    title: "生成核心角色",
    description: "为当前小说生成核心角色；若已有角色则直接复用。",
    category: "mutate",
    riskLevel: "medium",
    domainAgent: "NovelAgent",
    resourceScopes: ["novel", "chapter"],
    inputSchema: generateNovelCharactersInput,
    outputSchema: generateNovelCharactersOutput,
    execute: async (context, rawInput) => {
      const input = generateNovelCharactersInput.parse(rawInput);
      return generateNovelCharactersOutput.parse(
        await novelProductionService.generateNovelCharacters({
          novelId: resolveNovelId(context.novelId, input.novelId),
          description: input.description,
          genre: input.genre,
          styleTone: input.styleTone,
          narrativePov: input.narrativePov,
          provider: context.provider,
          model: context.model,
          temperature: context.temperature,
          count: input.count,
        }),
      );
    },
  },
  generate_story_bible: {
    name: "generate_story_bible",
    title: "生成小说圣经",
    description: "为当前小说生成小说圣经。",
    category: "mutate",
    riskLevel: "medium",
    domainAgent: "NovelAgent",
    resourceScopes: ["novel"],
    inputSchema: generateStoryBibleInput,
    outputSchema: generateStoryBibleOutput,
    execute: async (context, rawInput) => {
      const input = generateStoryBibleInput.parse(rawInput);
      return generateStoryBibleOutput.parse(
        await novelProductionService.generateStoryBible({
          novelId: resolveNovelId(context.novelId, input.novelId),
          provider: context.provider,
          model: context.model,
          temperature: context.temperature,
        }),
      );
    },
  },
  generate_novel_outline: {
    name: "generate_novel_outline",
    title: "生成发展走向",
    description: "为当前小说生成发展走向。",
    category: "mutate",
    riskLevel: "medium",
    domainAgent: "NovelAgent",
    resourceScopes: ["novel"],
    inputSchema: generateNovelOutlineInput,
    outputSchema: generateNovelOutlineOutput,
    execute: async (context, rawInput) => {
      const input = generateNovelOutlineInput.parse(rawInput);
      return generateNovelOutlineOutput.parse(
        await novelProductionService.generateNovelOutline({
          novelId: resolveNovelId(context.novelId, input.novelId),
          description: input.description,
          provider: context.provider,
          model: context.model,
          temperature: context.temperature,
        }),
      );
    },
  },
  generate_structured_outline: {
    name: "generate_structured_outline",
    title: "生成结构化大纲",
    description: "为当前小说生成结构化大纲和章节规划。",
    category: "mutate",
    riskLevel: "medium",
    domainAgent: "NovelAgent",
    resourceScopes: ["novel", "chapter"],
    inputSchema: generateStructuredOutlineInput,
    outputSchema: generateStructuredOutlineOutput,
    execute: async (context, rawInput) => {
      const input = generateStructuredOutlineInput.parse(rawInput);
      return generateStructuredOutlineOutput.parse(
        await novelProductionService.generateStructuredOutline({
          novelId: resolveNovelId(context.novelId, input.novelId),
          targetChapterCount: input.targetChapterCount,
          provider: context.provider,
          model: context.model,
          temperature: context.temperature,
        }),
      );
    },
  },
  sync_chapters_from_structured_outline: {
    name: "sync_chapters_from_structured_outline",
    title: "同步章节目录",
    description: "根据结构化大纲同步章节目录。",
    category: "mutate",
    riskLevel: "medium",
    domainAgent: "NovelAgent",
    resourceScopes: ["novel", "chapter"],
    inputSchema: syncChaptersFromStructuredOutlineInput,
    outputSchema: syncChaptersFromStructuredOutlineOutput,
    execute: async (context, rawInput) => {
      const input = syncChaptersFromStructuredOutlineInput.parse(rawInput);
      return syncChaptersFromStructuredOutlineOutput.parse(
        await novelProductionService.syncChaptersFromStructuredOutline(
          resolveNovelId(context.novelId, input.novelId),
        ),
      );
    },
  },
  start_full_novel_pipeline: {
    name: "start_full_novel_pipeline",
    title: "启动整本写作",
    description: "基于当前小说的章节目录启动整本写作任务。",
    category: "run",
    riskLevel: "high",
    approvalRequired: true,
    domainAgent: "NovelAgent",
    resourceScopes: ["novel", "chapter", "generation_job", "task"],
    inputSchema: startFullNovelPipelineInput,
    outputSchema: startFullNovelPipelineOutput,
    execute: async (context, rawInput) => {
      const input = startFullNovelPipelineInput.parse(rawInput);
      const novelId = resolveNovelId(context.novelId, input.novelId);
      if (input.dryRun) {
        const startOrder = input.startOrder ?? 1;
        const endOrder = input.endOrder ?? Math.max(input.targetChapterCount ?? 20, startOrder);
        return startFullNovelPipelineOutput.parse({
          novelId,
          jobId: null,
          status: "preview_only",
          startOrder,
          endOrder,
          dryRun: true,
          summary: "dryRun: 整本写作任务将被创建，但未实际启动。",
        });
      }
      return startFullNovelPipelineOutput.parse(
        {
          ...(await novelProductionService.startFullNovelPipeline({
          novelId,
          startOrder: input.startOrder,
          endOrder: input.endOrder,
          maxRetries: input.maxRetries,
          provider: context.provider,
          model: context.model,
          temperature: context.temperature,
          targetChapterCount: input.targetChapterCount,
          })),
          dryRun: false,
        },
      );
    },
  },
  get_novel_production_status: {
    name: "get_novel_production_status",
    title: "读取整本生产状态",
    description: "聚合当前小说的资产准备状态、章节数量和整本写作任务状态。",
    category: "inspect",
    riskLevel: "low",
    domainAgent: "NovelAgent",
    resourceScopes: ["novel", "chapter", "generation_job"],
    inputSchema: getNovelProductionStatusInput,
    outputSchema: getNovelProductionStatusOutput,
    execute: async (context, rawInput) => {
      const input = getNovelProductionStatusInput.parse(rawInput);
      return getNovelProductionStatusOutput.parse(
        await novelProductionService.getNovelProductionStatus({
          novelId: input.novelId?.trim() || context.novelId,
          title: input.title,
          targetChapterCount: input.targetChapterCount,
        }),
      );
    },
  },
};
