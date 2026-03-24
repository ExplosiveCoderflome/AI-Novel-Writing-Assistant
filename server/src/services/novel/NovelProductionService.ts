import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { LLMProvider } from "@ai-novel/shared/types/llm";
import { prisma } from "../../db/prisma";
import { getLLM } from "../../llm/factory";
import { WorldService } from "../world/WorldService";
import { NovelService } from "./NovelService";
import { collectStream, extractJsonArray, parseStructuredOutline } from "./novelProductionHelpers";
import { novelProductionStatusService, type ProductionStatusResult } from "./NovelProductionStatusService";

interface NovelLlmOptions {
  provider?: LLMProvider;
  model?: string;
  temperature?: number;
}

export class NovelProductionService {
  private readonly novelService = new NovelService();

  private readonly worldService = new WorldService();

  async generateWorldForNovel(input: {
    novelId: string;
    description?: string;
    worldType?: string;
  } & NovelLlmOptions) {
    const novel = await prisma.novel.findUnique({
      where: { id: input.novelId },
      include: {
        world: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });
    if (!novel) {
      throw new Error("未找到当前小说。");
    }
    if (novel.world) {
      return {
        novelId: novel.id,
        worldId: novel.world.id,
        worldName: novel.world.name,
        reused: true,
        summary: `已复用当前小说绑定的世界观《${novel.world.name}》。`,
      };
    }

    const worldName = `${novel.title}世界观`;
    const generatedAt = new Date();
    const { stream, onDone } = await this.worldService.createWorldGenerateStream({
      name: worldName,
      description: input.description?.trim() || novel.description?.trim() || `为小说《${novel.title}》生成世界观设定`,
      worldType: input.worldType?.trim() || "custom",
      complexity: "standard",
      dimensions: {
        geography: true,
        culture: true,
        magicSystem: true,
        technology: true,
        history: true,
      },
      provider: input.provider,
      model: input.model,
    });
    const fullContent = await collectStream(stream);
    await onDone(fullContent);

    const world = await prisma.world.findFirst({
      where: {
        name: worldName,
        createdAt: {
          gte: generatedAt,
        },
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
      },
    });
    if (!world) {
      throw new Error("世界观生成已完成，但未能定位生成结果。");
    }
    return {
      novelId: novel.id,
      worldId: world.id,
      worldName: world.name,
      reused: false,
      summary: `已为《${novel.title}》生成世界观《${world.name}》。`,
    };
  }

  async generateNovelCharacters(input: {
    novelId: string;
    description?: string;
    genre?: string;
    styleTone?: string;
    narrativePov?: "first_person" | "third_person" | "mixed";
    count?: number;
  } & NovelLlmOptions) {
    const novel = await prisma.novel.findUnique({
      where: { id: input.novelId },
      include: {
        world: {
          select: {
            id: true,
            name: true,
            description: true,
            background: true,
            conflicts: true,
            magicSystem: true,
          },
        },
        characters: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            name: true,
            role: true,
          },
        },
      },
    });
    if (!novel) {
      throw new Error("未找到当前小说。");
    }
    if (novel.characters.length > 0) {
      return {
        novelId: novel.id,
        reused: true,
        characterCount: novel.characters.length,
        items: novel.characters,
        summary: `已复用《${novel.title}》现有的 ${novel.characters.length} 个角色。`,
      };
    }

    const llm = await getLLM(input.provider ?? "deepseek", {
      model: input.model,
      temperature: input.temperature ?? 0.6,
    });
    const desiredCount = Math.min(Math.max(input.count ?? 5, 3), 6);
    const result = await llm.invoke([
      new SystemMessage([
        "你是小说角色设计师。",
        `请为一部小说生成 ${desiredCount} 个核心角色，返回 JSON 数组。`,
        "每个对象只能包含 name, role, personality, background, development, currentState, currentGoal。",
        "所有字段必须使用简体中文。",
        "不要输出解释。",
      ].join("\n")),
      new HumanMessage([
        `小说标题：${novel.title}`,
        `小说简介：${input.description?.trim() || novel.description?.trim() || "暂无"}`,
        `题材：${input.genre?.trim() || "未指定"}`,
        `叙事视角：${input.narrativePov ?? "未指定"}`,
        `风格基调：${input.styleTone?.trim() || "未指定"}`,
        `世界观：${novel.world ? `${novel.world.name}\n${novel.world.description ?? novel.world.background ?? ""}\n${novel.world.conflicts ?? ""}\n${novel.world.magicSystem ?? ""}` : "暂无已绑定世界观"}`,
      ].join("\n\n")),
    ]);

    const parsed = JSON.parse(extractJsonArray(String(result.content))) as Array<Record<string, unknown>>;
    const uniqueNames = new Set<string>();
    const created: Array<{ id: string; name: string; role: string }> = [];
    for (const item of parsed) {
      const name = typeof item.name === "string" ? item.name.trim() : "";
      const role = typeof item.role === "string" ? item.role.trim() : "";
      if (!name || !role || uniqueNames.has(name)) {
        continue;
      }
      uniqueNames.add(name);
      const character = await this.novelService.createCharacter(novel.id, {
        name,
        role,
        personality: typeof item.personality === "string" ? item.personality.trim() : undefined,
        background: typeof item.background === "string" ? item.background.trim() : undefined,
        development: typeof item.development === "string" ? item.development.trim() : undefined,
        currentState: typeof item.currentState === "string" ? item.currentState.trim() : undefined,
        currentGoal: typeof item.currentGoal === "string" ? item.currentGoal.trim() : undefined,
      });
      created.push({
        id: character.id,
        name: character.name,
        role: character.role,
      });
    }
    if (created.length === 0) {
      throw new Error("角色生成未返回可保存的结果。");
    }
    return {
      novelId: novel.id,
      reused: false,
      characterCount: created.length,
      items: created,
      summary: `已为《${novel.title}》生成 ${created.length} 个核心角色。`,
    };
  }

  async generateStoryBible(input: {
    novelId: string;
  } & NovelLlmOptions) {
    const { stream, onDone } = await this.novelService.createBibleStream(input.novelId, {
      provider: input.provider,
      model: input.model,
      temperature: input.temperature,
    });
    const fullContent = await collectStream(stream);
    await onDone(fullContent);
    const novel = await prisma.novel.findUnique({
      where: { id: input.novelId },
      include: {
        bible: true,
      },
    });
    if (!novel) {
      throw new Error("未找到当前小说。");
    }
    return {
      novelId: novel.id,
      exists: Boolean(novel.bible),
      coreSetting: novel.bible?.coreSetting ?? null,
      mainPromise: novel.bible?.mainPromise ?? null,
      summary: `已生成《${novel.title}》的小说圣经。`,
    };
  }

  async generateNovelOutline(input: {
    novelId: string;
    description?: string;
  } & NovelLlmOptions) {
    const { stream, onDone } = await this.novelService.createOutlineStream(input.novelId, {
      provider: input.provider,
      model: input.model,
      temperature: input.temperature,
      initialPrompt: input.description,
    });
    const outline = await collectStream(stream);
    await onDone(outline);
    return {
      novelId: input.novelId,
      outline,
      outlineLength: outline.length,
      summary: "已生成小说发展走向。",
    };
  }

  async generateStructuredOutline(input: {
    novelId: string;
    targetChapterCount?: number;
  } & NovelLlmOptions) {
    const targetChapterCount = input.targetChapterCount ?? 20;
    const { stream, onDone } = await this.novelService.createStructuredOutlineStream(input.novelId, {
      provider: input.provider,
      model: input.model,
      temperature: input.temperature,
      totalChapters: targetChapterCount,
    });
    const structuredOutline = await collectStream(stream);
    await onDone(structuredOutline);
    const chapterCount = await prisma.chapter.count({
      where: { novelId: input.novelId },
    });
    const novel = await prisma.novel.findUnique({
      where: { id: input.novelId },
      select: { structuredOutline: true },
    });
    return {
      novelId: input.novelId,
      chapterCount,
      targetChapterCount,
      structuredOutline: novel?.structuredOutline ?? structuredOutline,
      summary: `已生成 ${targetChapterCount} 章结构化大纲。`,
    };
  }

  async syncChaptersFromStructuredOutline(novelId: string) {
    const novel = await prisma.novel.findUnique({
      where: { id: novelId },
      select: {
        id: true,
        structuredOutline: true,
      },
    });
    if (!novel) {
      throw new Error("未找到当前小说。");
    }
    if (!novel.structuredOutline?.trim()) {
      throw new Error("当前小说还没有结构化大纲。");
    }
    const chapters = parseStructuredOutline(novel.structuredOutline);
    if (chapters.length === 0) {
      throw new Error("结构化大纲中没有可同步的章节。");
    }

    const existing = await prisma.chapter.findMany({
      where: { novelId },
      select: { id: true, order: true },
    });
    const existingByOrder = new Map(existing.map((item) => [item.order, item.id]));
    let createdCount = 0;
    let updatedCount = 0;

    for (const chapter of chapters) {
      const existingId = existingByOrder.get(chapter.order);
      if (existingId) {
        await prisma.chapter.update({
          where: { id: existingId },
          data: {
            title: chapter.title,
            expectation: chapter.summary,
          },
        });
        updatedCount += 1;
      } else {
        await prisma.chapter.create({
          data: {
            novelId,
            title: chapter.title,
            order: chapter.order,
            content: "",
            expectation: chapter.summary,
            generationState: "planned",
          },
        });
        createdCount += 1;
      }
    }

    return {
      novelId,
      chapterCount: chapters.length,
      createdCount,
      updatedCount,
      summary: `已同步 ${chapters.length} 个章节目录。`,
    };
  }

  async startFullNovelPipeline(input: {
    novelId: string;
    startOrder?: number;
    endOrder?: number;
    maxRetries?: number;
    targetChapterCount?: number;
  } & NovelLlmOptions) {
    const chapterCount = await prisma.chapter.count({
      where: { novelId: input.novelId },
    });
    if (chapterCount === 0) {
      throw new Error("当前小说还没有章节目录，无法启动整本写作。");
    }
    const startOrder = input.startOrder ?? 1;
    const endOrder = input.endOrder ?? Math.max(chapterCount, input.targetChapterCount ?? chapterCount);
    const job = await this.novelService.startPipelineJob(input.novelId, {
      startOrder,
      endOrder,
      maxRetries: input.maxRetries,
      provider: input.provider,
      model: input.model,
      temperature: input.temperature,
    });
    return {
      novelId: input.novelId,
      jobId: job.id,
      status: job.status,
      startOrder: job.startOrder,
      endOrder: job.endOrder,
      summary: `已启动第${job.startOrder}到第${job.endOrder}章的整本写作任务。`,
    };
  }

  getNovelProductionStatus(input: {
    novelId?: string;
    title?: string;
    targetChapterCount?: number;
  }): Promise<ProductionStatusResult> {
    return novelProductionStatusService.getNovelProductionStatus(input);
  }
}

export const novelProductionService = new NovelProductionService();
