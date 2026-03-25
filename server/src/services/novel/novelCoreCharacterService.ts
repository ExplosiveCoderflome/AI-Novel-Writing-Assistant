import { invokeStructuredLlm } from "../../llm/structuredInvoke";
import { prisma } from "../../db/prisma";
import { ragServices } from "../rag";
import { characterEvolutionOutputSchema, characterWorldCheckOutputSchema } from "./novelCoreSchemas";
import { buildWorldContextFromNovel, queueRagDelete, queueRagUpsert } from "./novelCoreSupport";
import {
  CharacterInput,
  CharacterTimelineSyncOptions,
  extractCharacterEventLines,
  LLMGenerateOptions,
} from "./novelCoreShared";

export class NovelCoreCharacterService {
  async listCharacters(novelId: string) {
    return prisma.character.findMany({ where: { novelId }, orderBy: { createdAt: "asc" } });
  }

  async createCharacter(novelId: string, input: CharacterInput) {
    let payload: CharacterInput = { ...input };
    if (input.baseCharacterId) {
      const baseCharacter = await prisma.baseCharacter.findUnique({
        where: { id: input.baseCharacterId },
      });
      if (!baseCharacter) {
        throw new Error("基础角色不存在");
      }
      payload = {
        ...payload,
        personality: input.personality ?? baseCharacter.personality,
        background: input.background ?? baseCharacter.background,
        development: input.development ?? baseCharacter.development,
      };
    }

    const created = await prisma.character.create({ data: { novelId, ...payload } });
    queueRagUpsert("character", created.id);
    return created;
  }

  async updateCharacter(novelId: string, characterId: string, input: Partial<CharacterInput>) {
    const exists = await prisma.character.findFirst({
      where: { id: characterId, novelId },
      select: { id: true, currentState: true, currentGoal: true },
    });
    if (!exists) {
      throw new Error("角色不存在");
    }

    const hasStateChanged = typeof input.currentState === "string" && input.currentState !== exists.currentState;
    const hasGoalChanged = typeof input.currentGoal === "string" && input.currentGoal !== exists.currentGoal;
    const updated = await prisma.character.update({
      where: { id: characterId },
      data: {
        ...input,
        ...(hasStateChanged || hasGoalChanged ? { lastEvolvedAt: new Date() } : {}),
      },
    });

    queueRagUpsert("character", updated.id);
    return updated;
  }

  async deleteCharacter(novelId: string, characterId: string) {
    queueRagDelete("character", characterId);
    const deleted = await prisma.character.deleteMany({ where: { id: characterId, novelId } });
    if (deleted.count === 0) {
      throw new Error("角色不存在");
    }
  }

  async listCharacterTimeline(novelId: string, characterId: string) {
    return prisma.characterTimeline.findMany({
      where: { novelId, characterId },
      orderBy: [{ chapterOrder: "asc" }, { createdAt: "asc" }],
    });
  }

  async syncCharacterTimeline(
    novelId: string,
    characterId: string,
    options: CharacterTimelineSyncOptions = {},
  ) {
    const character = await prisma.character.findFirst({
      where: { id: characterId, novelId },
    });
    if (!character) {
      throw new Error("角色不存在");
    }

    const chapters = await prisma.chapter.findMany({
      where: {
        novelId,
        ...(typeof options.startOrder === "number" || typeof options.endOrder === "number"
          ? {
            order: {
              gte: options.startOrder ?? undefined,
              lte: options.endOrder ?? undefined,
            },
          }
          : {}),
      },
      orderBy: { order: "asc" },
      select: {
        id: true,
        order: true,
        title: true,
        content: true,
      },
    });

    const events: Array<{
      novelId: string;
      characterId: string;
      chapterId: string;
      chapterOrder: number;
      title: string;
      content: string;
      source: string;
    }> = [];

    for (const chapter of chapters) {
      const content = chapter.content ?? "";
      if (!content) {
        continue;
      }
      const lines = extractCharacterEventLines(content, character.name, 3);
      for (const line of lines) {
        events.push({
          novelId,
          characterId,
          chapterId: chapter.id,
          chapterOrder: chapter.order,
          title: `${chapter.order} · ${chapter.title}`,
          content: line,
          source: "chapter_extract",
        });
      }
    }

    await prisma.$transaction(async (tx) => {
      await tx.characterTimeline.deleteMany({
        where: {
          novelId,
          characterId,
          source: "chapter_extract",
          ...(typeof options.startOrder === "number" || typeof options.endOrder === "number"
            ? {
              chapterOrder: {
                gte: options.startOrder ?? undefined,
                lte: options.endOrder ?? undefined,
              },
            }
            : {}),
        },
      });
      if (events.length > 0) {
        await tx.characterTimeline.createMany({
          data: events,
        });
      }
    });

    const total = await prisma.characterTimeline.count({
      where: { novelId, characterId },
    });

    return {
      characterId,
      syncedCount: events.length,
      totalTimelineCount: total,
    };
  }

  async syncAllCharacterTimeline(novelId: string, options: CharacterTimelineSyncOptions = {}) {
    const characters = await prisma.character.findMany({
      where: { novelId },
      select: { id: true },
      orderBy: { createdAt: "asc" },
    });
    if (characters.length === 0) {
      return {
        characterCount: 0,
        syncedCount: 0,
        details: [] as Array<{ characterId: string; syncedCount: number; totalTimelineCount: number }>,
      };
    }

    const details = await Promise.all(
      characters.map((character) => this.syncCharacterTimeline(novelId, character.id, options)),
    );
    const syncedCount = details.reduce((sum, item) => sum + item.syncedCount, 0);

    return {
      characterCount: characters.length,
      syncedCount,
      details,
    };
  }

  async evolveCharacter(
    novelId: string,
    characterId: string,
    options: LLMGenerateOptions = {},
  ) {
    const [novel, character, timelines] = await Promise.all([
      prisma.novel.findUnique({
        where: { id: novelId },
        include: { bible: true },
      }),
      prisma.character.findFirst({
        where: { id: characterId, novelId },
      }),
      prisma.characterTimeline.findMany({
        where: { novelId, characterId },
        orderBy: [{ chapterOrder: "desc" }, { createdAt: "desc" }],
        take: 20,
      }),
    ]);

    if (!novel || !character) {
      throw new Error("小说或角色不存在");
    }

    const timelineText = timelines.length > 0
      ? timelines
        .map((item) => `${item.title}: ${item.content}`)
        .join("\n")
      : "暂无时间线事件";

    let ragContext = "";
    try {
      ragContext = await ragServices.hybridRetrievalService.buildContextBlock(
        `角色演进 ${character.name}\n${timelineText}`,
        {
          novelId,
          ownerTypes: ["character", "character_timeline", "chapter_summary", "consistency_fact", "novel", "bible"],
          finalTopK: 6,
        },
      );
    } catch {
      ragContext = "";
    }

    const parsed = await invokeStructuredLlm({
      label: `character-evolve:${characterId}`,
      provider: options.provider,
      model: options.model,
      temperature: options.temperature ?? 0.4,
      taskType: "planner",
      systemPrompt: `你是小说角色发展编辑。请基于角色经历输出 JSON：
{
  "personality":"更新后的性格",
  "background":"更新后的背景信息（可选）",
  "development":"更新后的成长轨迹",
  "currentState":"角色当前状态",
  "currentGoal":"角色当前目标"
}
仅输出 JSON。`,
      userPrompt: `小说：${novel.title}
作品圣经：${novel.bible?.rawContent ?? "暂无"}
角色：${character.name}（${character.role}）
现有设定：
personality=${character.personality ?? "暂无"}
background=${character.background ?? "暂无"}
development=${character.development ?? "暂无"}
currentState=${character.currentState ?? "暂无"}
currentGoal=${character.currentGoal ?? "暂无"}

时间线事件：
${timelineText}

检索补充：
${ragContext || ""}`,
      schema: characterEvolutionOutputSchema,
      maxRepairAttempts: 1,
    });

    const updated = await prisma.character.update({
      where: { id: characterId },
      data: {
        personality: parsed.personality ?? character.personality,
        background: parsed.background ?? character.background,
        development: parsed.development ?? character.development,
        currentState: parsed.currentState ?? character.currentState,
        currentGoal: parsed.currentGoal ?? character.currentGoal,
        lastEvolvedAt: new Date(),
      },
    });

    await prisma.characterTimeline.create({
      data: {
        novelId,
        characterId,
        title: `角色演进更新 · ${new Date().toLocaleString("zh-CN")}`,
        content: `状态：${updated.currentState ?? "暂无"}；目标：${updated.currentGoal ?? "暂无"}`,
        source: "ai_evolve",
      },
    });

    return updated;
  }

  async checkCharacterAgainstWorld(
    novelId: string,
    characterId: string,
    options: LLMGenerateOptions = {},
  ) {
    const [novel, character] = await Promise.all([
      prisma.novel.findUnique({
        where: { id: novelId },
        include: { world: true },
      }),
      prisma.character.findFirst({
        where: { id: characterId, novelId },
      }),
    ]);
    if (!novel || !character) {
      throw new Error("小说或角色不存在");
    }
    if (!novel.world) {
      return {
        status: "pass" as const,
        warnings: ["当前小说未绑定世界观，无法执行严格世界规则检查"],
        issues: [],
      };
    }

    const worldContext = buildWorldContextFromNovel(novel);
    try {
      const parsed = await invokeStructuredLlm({
        label: `character-world-check:${characterId}`,
        provider: options.provider,
        model: options.model,
        temperature: options.temperature ?? 0.2,
        taskType: "planner",
        systemPrompt: `你是角色设定审计员。请输出 JSON：
{
  "status":"pass|warn|error",
  "warnings":["..."],
  "issues":[{"severity":"warn|error","message":"...","suggestion":"..."}]
}
仅输出 JSON。`,
        userPrompt: `世界规则：
${worldContext}

角色设定：
name=${character.name}
role=${character.role}
personality=${character.personality ?? ""}
background=${character.background ?? ""}
development=${character.development ?? ""}
currentState=${character.currentState ?? ""}
currentGoal=${character.currentGoal ?? ""}`,
        schema: characterWorldCheckOutputSchema,
        maxRepairAttempts: 1,
      });

      return {
        status: parsed.status ?? "pass",
        warnings: Array.isArray(parsed.warnings) ? parsed.warnings : [],
        issues: Array.isArray(parsed.issues) ? parsed.issues : [],
      };
    } catch {
      return {
        status: "warn" as const,
        warnings: ["AI 检查失败，返回规则回退结果"],
        issues: [] as Array<{ severity: "warn" | "error"; message: string; suggestion?: string }>,
      };
    }
  }
}
