import type { BaseMessageChunk } from "@langchain/core/messages";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { prisma } from "../../db/prisma";
import { getLLM } from "../../llm/factory";

interface CreateWorldInput {
  name: string;
  description?: string;
  background?: string;
  geography?: string;
  cultures?: string;
  magicSystem?: string;
  politics?: string;
  races?: string;
  religions?: string;
  technology?: string;
  conflicts?: string;
}

interface WorldGenerateInput {
  name: string;
  description: string;
  worldType: string;
  complexity: "simple" | "standard" | "detailed";
  dimensions: {
    geography: boolean;
    culture: boolean;
    magicSystem: boolean;
    technology: boolean;
    history: boolean;
  };
  provider?: "deepseek" | "siliconflow" | "openai" | "anthropic";
  model?: string;
}

interface RefineWorldInput {
  attribute:
    | "description"
    | "background"
    | "geography"
    | "cultures"
    | "magicSystem"
    | "politics"
    | "races"
    | "religions"
    | "technology"
    | "conflicts";
  currentValue: string;
  refinementLevel: "light" | "deep";
  provider?: "deepseek" | "siliconflow" | "openai" | "anthropic";
  model?: string;
}

function extractJSONObject(source: string): string {
  const first = source.indexOf("{");
  const last = source.lastIndexOf("}");
  if (first === -1 || last === -1 || first >= last) {
    throw new Error("世界观生成返回格式不正确。");
  }
  return source.slice(first, last + 1);
}

export class WorldService {
  async listWorlds() {
    return prisma.world.findMany({
      orderBy: { updatedAt: "desc" },
    });
  }

  async createWorld(input: CreateWorldInput) {
    return prisma.world.create({
      data: input,
    });
  }

  async getWorldById(id: string) {
    return prisma.world.findUnique({
      where: { id },
    });
  }

  async updateWorld(id: string, input: Partial<CreateWorldInput>) {
    return prisma.world.update({
      where: { id },
      data: input,
    });
  }

  async deleteWorld(id: string) {
    await prisma.world.delete({ where: { id } });
  }

  async createWorldGenerateStream(input: WorldGenerateInput) {
    const llm = await getLLM(input.provider ?? "deepseek", {
      model: input.model,
      temperature: 0.7,
    });

    const dimensionRequirements: string[] = [];
    if (input.dimensions.geography) {
      dimensionRequirements.push(
        "geography 维度要求：地形地貌、气候带、标志性地点（5个以上）、空间结构。",
      );
    }
    if (input.dimensions.culture) {
      dimensionRequirements.push(
        "culture 维度要求：主要种族/势力（3-5个）、文化习俗、宗教体系、政治结构。",
      );
    }
    if (input.dimensions.magicSystem) {
      dimensionRequirements.push(
        "magicSystem 维度要求：力量来源、晋级体系（至少5层）、稀缺度、核心限制。",
      );
    }
    if (input.dimensions.technology) {
      dimensionRequirements.push(
        "technology 维度要求：整体科技水平、标志性技术、技术对社会影响。",
      );
    }
    if (input.dimensions.history) {
      dimensionRequirements.push(
        "history 维度要求：起源传说、3个重大历史事件、当前主要冲突。",
      );
    }

    const stream = await llm.stream([
      new SystemMessage(
        "你是一位专业的奇幻世界设定设计师，擅长构建沉浸式、自洽的小说世界。请严格输出 JSON。",
      ),
      new HumanMessage(
        `请为以下世界生成详细设定：
世界名称：${input.name}
世界类型：${input.worldType}
世界描述：${input.description}
复杂度：${input.complexity}

${dimensionRequirements.join("\n")}

输出 JSON 格式：
{
  "geography": "...",
  "cultures": "...",
  "magicSystem": "...",
  "technology": "...",
  "conflicts": "..."
}`,
      ),
    ]);

    return {
      stream: stream as AsyncIterable<BaseMessageChunk>,
      onDone: async (fullContent: string) => {
        const jsonText = extractJSONObject(fullContent);
        const parsed = JSON.parse(jsonText) as Record<string, string>;
        await prisma.world.create({
          data: {
            name: input.name,
            description: input.description,
            geography: parsed.geography ?? null,
            cultures: parsed.cultures ?? null,
            magicSystem: parsed.magicSystem ?? null,
            technology: parsed.technology ?? null,
            conflicts: parsed.conflicts ?? null,
          },
        });
      },
    };
  }

  async createRefineStream(worldId: string, input: RefineWorldInput) {
    const world = await prisma.world.findUnique({ where: { id: worldId } });
    if (!world) {
      throw new Error("世界观不存在。");
    }

    const llm = await getLLM(input.provider ?? "deepseek", {
      model: input.model,
      temperature: input.refinementLevel === "deep" ? 0.8 : 0.5,
    });

    const stream = await llm.stream([
      new SystemMessage("你是一位专业的世界观设定编辑，请保持设定自洽并增强细节。"),
      new HumanMessage(
        `世界名称：${world.name}
当前维度：${input.attribute}
当前内容：
${input.currentValue}
精炼深度：${input.refinementLevel}
请仅输出优化后的文本内容。`,
      ),
    ]);

    return {
      stream: stream as AsyncIterable<BaseMessageChunk>,
      onDone: async (fullContent: string) => {
        await prisma.world.update({
          where: { id: worldId },
          data: {
            [input.attribute]: fullContent,
          },
        });
      },
    };
  }
}
