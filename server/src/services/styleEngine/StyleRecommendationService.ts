import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { LLMProvider } from "@ai-novel/shared/types/llm";
import type {
  StyleProfile,
  StyleRecommendationCandidate,
  StyleRecommendationResult,
} from "@ai-novel/shared/types/styleEngine";
import { z } from "zod";
import { prisma } from "../../db/prisma";
import { getLLM } from "../../llm/factory";
import { buildBookFramingSummary } from "../novel/bookFraming";
import { ensureStyleEngineSeedData } from "./StyleEngineSeedService";
import { clamp, extractJsonObject, mapStyleProfileRow, toLlmText } from "./helpers";

interface RecommendForNovelInput {
  novelId: string;
  provider?: LLMProvider;
  model?: string;
  temperature?: number;
}

const recommendationSchema = z.object({
  summary: z.string().trim().min(1),
  candidates: z.array(z.object({
    styleProfileId: z.string().trim().min(1),
    fitScore: z.number().int().min(0).max(100),
    recommendationReason: z.string().trim().min(1),
    caution: z.string().trim().optional().nullable(),
  })).min(1).max(3),
});

function truncateText(value: string | null | undefined, maxLength = 220): string {
  const text = value?.replace(/\s+/g, " ").trim() ?? "";
  if (!text) {
    return "";
  }
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength)}...`;
}

function collectRuleHighlights(profile: StyleProfile): string[] {
  const blocks: Array<Record<string, unknown>> = [
    profile.narrativeRules,
    profile.characterRules,
    profile.languageRules,
    profile.rhythmRules,
  ];
  const highlights: string[] = [];
  for (const block of blocks) {
    for (const [key, value] of Object.entries(block)) {
      if (value == null) {
        continue;
      }
      if (typeof value === "string" && value.trim()) {
        highlights.push(`${key}: ${value.trim()}`);
        continue;
      }
      if (typeof value === "number" || typeof value === "boolean") {
        highlights.push(`${key}: ${String(value)}`);
        continue;
      }
      if (Array.isArray(value) && value.length > 0) {
        const items = value
          .filter((item): item is string | number | boolean => ["string", "number", "boolean"].includes(typeof item))
          .map((item) => String(item).trim())
          .filter(Boolean)
          .slice(0, 3);
        if (items.length > 0) {
          highlights.push(`${key}: ${items.join(" / ")}`);
        }
      }
      if (highlights.length >= 6) {
        return highlights;
      }
    }
  }
  return highlights;
}

function buildProfileSummary(profile: StyleProfile): string {
  const parts = [
    profile.category?.trim() ? `分类：${profile.category.trim()}` : "",
    profile.tags.length > 0 ? `标签：${profile.tags.slice(0, 5).join("、")}` : "",
    profile.applicableGenres.length > 0 ? `适配题材：${profile.applicableGenres.slice(0, 4).join("、")}` : "",
    truncateText(profile.description, 120),
    truncateText(profile.analysisMarkdown, 160),
    collectRuleHighlights(profile).join("；"),
  ].filter(Boolean);
  return parts.join(" | ");
}

function buildNovelSummary(novel: {
  title: string;
  description: string | null;
  targetAudience: string | null;
  bookSellingPoint: string | null;
  competingFeel: string | null;
  first30ChapterPromise: string | null;
  commercialTagsJson: string | null;
  styleTone: string | null;
  narrativePov: string | null;
  pacePreference: string | null;
  emotionIntensity: string | null;
  aiFreedom: string | null;
  estimatedChapterCount: number | null;
  outline: string | null;
  structuredOutline: string | null;
  genre?: { name: string } | null;
  world?: { name: string; worldType: string | null } | null;
}, chapterCount: number): string {
  const bookFramingSummary = buildBookFramingSummary(novel);
  return [
    `标题：${novel.title}`,
    novel.genre?.name ? `题材：${novel.genre.name}` : "",
    novel.description?.trim() ? `简介：${truncateText(novel.description, 220)}` : "",
    bookFramingSummary ? `书级 framing：\n${bookFramingSummary}` : "",
    novel.styleTone?.trim() ? `文风关键词：${novel.styleTone.trim()}` : "",
    novel.narrativePov ? `叙事视角：${novel.narrativePov}` : "",
    novel.pacePreference ? `节奏偏好：${novel.pacePreference}` : "",
    novel.emotionIntensity ? `情绪强度：${novel.emotionIntensity}` : "",
    novel.aiFreedom ? `AI 自由度：${novel.aiFreedom}` : "",
    novel.estimatedChapterCount ? `预计章节数：${novel.estimatedChapterCount}` : "",
    chapterCount > 0 ? `当前章节数：${chapterCount}` : "",
    novel.world?.name ? `世界观：${novel.world.name}${novel.world.worldType ? `（${novel.world.worldType}）` : ""}` : "",
    novel.outline?.trim() ? `发展走向：${truncateText(novel.outline, 260)}` : "",
    novel.structuredOutline?.trim() ? `结构化大纲摘录：${truncateText(novel.structuredOutline, 260)}` : "",
  ].filter(Boolean).join("\n");
}

function mapRecommendationCandidate(
  candidate: z.infer<typeof recommendationSchema>["candidates"][number],
  profile: StyleProfile,
): StyleRecommendationCandidate {
  return {
    styleProfileId: profile.id,
    styleProfileName: profile.name,
    styleProfileDescription: profile.description ?? null,
    fitScore: clamp(candidate.fitScore, 0, 100),
    recommendationReason: candidate.recommendationReason.trim(),
    caution: candidate.caution?.trim() || null,
  };
}

function dedupeCandidates(
  parsed: z.infer<typeof recommendationSchema>,
  profilesById: Map<string, StyleProfile>,
): StyleRecommendationResult["candidates"] {
  const seen = new Set<string>();
  const candidates: StyleRecommendationCandidate[] = [];
  for (const item of parsed.candidates) {
    const profile = profilesById.get(item.styleProfileId);
    if (!profile || seen.has(profile.id)) {
      continue;
    }
    seen.add(profile.id);
    candidates.push(mapRecommendationCandidate(item, profile));
  }
  return candidates.sort((left, right) => right.fitScore - left.fitScore);
}

export class StyleRecommendationService {
  async recommendForNovel(input: RecommendForNovelInput): Promise<StyleRecommendationResult> {
    await ensureStyleEngineSeedData();

    const [novel, chapterCount, profileRows] = await Promise.all([
      prisma.novel.findUnique({
        where: { id: input.novelId },
        include: {
          genre: { select: { name: true } },
          world: { select: { name: true, worldType: true } },
        },
      }),
      prisma.chapter.count({ where: { novelId: input.novelId } }),
      prisma.styleProfile.findMany({
        where: { status: "active" },
        include: {
          antiAiBindings: {
            where: { enabled: true },
            include: { antiAiRule: true },
          },
        },
        orderBy: { updatedAt: "desc" },
        take: 12,
      }),
    ]);

    if (!novel) {
      throw new Error("小说不存在。");
    }

    const profiles = profileRows.map((row) => mapStyleProfileRow(row));
    if (profiles.length === 0) {
      return {
        novelId: input.novelId,
        summary: "当前还没有可推荐的写法资产。建议先去写法引擎创建或沉淀 1-2 套写法资产，再回来让系统推荐。",
        candidates: [],
        recommendedAt: new Date().toISOString(),
      };
    }

    const llm = await getLLM(input.provider, {
      model: input.model,
      temperature: Math.min(input.temperature ?? 0.3, 0.5),
      taskType: "planner",
    });
    const profilesById = new Map(profiles.map((profile) => [profile.id, profile]));
    const targetCount = profiles.length === 1 ? 1 : 2;
    const catalogText = profiles
      .map((profile, index) => (
        `${index + 1}. ID=${profile.id}\n名称：${profile.name}\n摘要：${buildProfileSummary(profile)}`
      ))
      .join("\n\n");
    const novelSummary = buildNovelSummary(novel, chapterCount);

    const systemPrompt = [
      "你是小说写法资产推荐器，服务对象是完全不会写作的小白用户。",
      "你的任务是从提供的写法资产列表中，挑出最适合当前小说的 2-3 套候选。",
      "只能从给定列表中选择，不允许杜撰新的写法资产 ID 或名称。",
      "优先考虑：目标读者匹配、前 30 章承诺兑现能力、商业标签匹配、题材匹配、叙事视角匹配、节奏匹配、语言质感匹配、是否能帮助小白稳定写完整本书。",
      "输出必须是 JSON 对象，格式为：",
      "{\"summary\":\"...\",\"candidates\":[{\"styleProfileId\":\"...\",\"fitScore\":88,\"recommendationReason\":\"...\",\"caution\":\"...\"}]}",
      "要求：fitScore 为 0-100 的整数；recommendationReason 必须说清楚为什么适合这本书的目标读者和前 30 章承诺；caution 可为空。",
      `请输出 ${targetCount} 个候选；如果确实只有 1 套明显合适，也至少给 1 个。`,
      "不要输出额外解释文字。",
    ].join("\n");

    const humanPrompt = [
      "当前小说信息：",
      novelSummary,
      "",
      "可选写法资产列表：",
      catalogText,
    ].join("\n");

    const result = await llm.invoke([
      new SystemMessage(systemPrompt),
      new HumanMessage(humanPrompt),
    ]);

    const parsed = await this.parseRecommendationOutput({
      rawContent: toLlmText(result.content),
      profilesById,
      llmInput: input,
      catalogText,
      novelSummary,
    });

    return {
      novelId: input.novelId,
      summary: parsed.summary,
      candidates: dedupeCandidates(parsed, profilesById),
      recommendedAt: new Date().toISOString(),
    };
  }

  private async parseRecommendationOutput(input: {
    rawContent: string;
    profilesById: Map<string, StyleProfile>;
    llmInput: RecommendForNovelInput;
    catalogText: string;
    novelSummary: string;
  }): Promise<z.infer<typeof recommendationSchema>> {
    const firstAttempt = recommendationSchema.safeParse(extractJsonObject(input.rawContent));
    if (firstAttempt.success) {
      const candidates = dedupeCandidates(firstAttempt.data, input.profilesById);
      if (candidates.length > 0) {
        return firstAttempt.data;
      }
    }

    const llm = await getLLM(input.llmInput.provider, {
      model: input.llmInput.model,
      temperature: 0.2,
      taskType: "planner",
    });
    const repairPrompt = [
      "请修复下面这段写法推荐输出，使其变成合法 JSON。",
      "要求：",
      "1. 只能使用给定列表里的 styleProfileId。",
      "2. 输出格式必须是 {summary, candidates[]}。",
      "3. candidates 最多 3 个，且至少保留 1 个有效候选。",
      "4. 不要输出额外解释，只输出 JSON 对象。",
      "",
      "小说信息：",
      input.novelSummary,
      "",
      "可选写法资产列表：",
      input.catalogText,
      "",
      "待修复原始输出：",
      input.rawContent,
    ].join("\n");
    const repaired = await llm.invoke([
      new SystemMessage("你是 JSON 修复器。"),
      new HumanMessage(repairPrompt),
    ]);
    const repairedParsed = recommendationSchema.parse(extractJsonObject(toLlmText(repaired.content)));
    const candidates = dedupeCandidates(repairedParsed, input.profilesById);
    if (candidates.length === 0) {
      throw new Error("写法推荐结果中没有有效候选。");
    }
    return repairedParsed;
  }
}

export const styleRecommendationService = new StyleRecommendationService();
