import type { LLMProvider } from "@ai-novel/shared/types/llm";
import { prisma } from "../../db/prisma";
import { ragServices } from "../rag";
import type { RagOwnerType } from "../rag/types";
import { runStructuredPrompt } from "../../prompting/core/promptRunner";
import { chapterSummaryPrompt } from "../../prompting/prompts/novel/review.prompts";
import { novelFactService, type NovelFactWriteItem } from "./fact/NovelFactService";

interface LLMGenerateOptions {
  provider?: LLMProvider;
  model?: string;
  temperature?: number;
  /**
   * 正文覆盖：定稿流程接入时传入刚定稿的 finalContent，
   * 避免依赖"正文是否已落库"的时序（DB 中可能尚未写入）。
   */
  contentOverride?: string;
}

type FactCategory = "plot" | "character" | "world";

function normalizeSummary(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function extractFacts(content: string): Array<{ category: FactCategory; content: string }> {
  const lines = content
    .split(/[\n。！？]/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 8)
    .slice(0, 8);

  return lines.map((line) => {
    if (/世界|地理|宗门|王朝|大陆|规则/.test(line)) {
      return { category: "world" as const, content: line };
    }
    if (/主角|反派|角色|他|她|众人/.test(line)) {
      return { category: "character" as const, content: line };
    }
    return { category: "plot" as const, content: line };
  });
}

function fallbackSummary(content: string): string {
  const sentences = content
    .split(/(?<=[。！？])/g)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  if (sentences.length === 0) {
    return content.slice(0, 180);
  }
  return sentences.slice(0, 3).join("");
}

function joinFacts(items: string[], max = 3): string {
  return Array.from(new Set(items)).slice(0, max).join("；");
}

export class NovelChapterSummaryService {
  async generateChapterSummary(novelId: string, chapterId: string, options: LLMGenerateOptions = {}) {
    const chapter = await prisma.chapter.findFirst({
      where: { id: chapterId, novelId },
      include: { novel: { select: { title: true } } },
    });
    if (!chapter) {
      throw new Error("章节不存在。");
    }

    const content = (options.contentOverride ?? chapter.content ?? "").trim();
    const existingExpectation = (chapter.expectation ?? "").trim();
    let summary = "";
    let concreteFacts: NovelFactWriteItem[] = [];

    if (content) {
      try {
        const result = await runStructuredPrompt({
          asset: chapterSummaryPrompt,
          promptInput: {
            novelTitle: chapter.novel.title,
            chapterOrder: chapter.order,
            chapterTitle: chapter.title,
            content: content.slice(0, 7000),
          },
          options: {
            provider: options.provider,
            model: options.model,
            temperature: options.temperature ?? 0.3,
          },
        });
        const parsed = result.output;
        summary = normalizeSummary(parsed.summary ?? "");
        concreteFacts = (parsed.concreteFacts ?? [])
          .map((fact) => ({
            text: fact.text.trim(),
            category: fact.category,
            source: "auto" as const,
          }))
          .filter((fact) => fact.text.length > 0);
      } catch {
        summary = "";
        concreteFacts = [];
      }
    }

    if (!summary) {
      if (content) {
        summary = normalizeSummary(fallbackSummary(content));
      } else if (existingExpectation) {
        summary = existingExpectation;
      } else {
        summary = "暂无可总结正文";
      }
    }

    const facts = extractFacts(content || summary);
    const keyEvents = joinFacts(facts.filter((item) => item.category === "plot").map((item) => item.content), 3);
    const characterStates = joinFacts(facts.filter((item) => item.category === "character").map((item) => item.content), 3);

    await prisma.$transaction(async (tx) => {
      await tx.chapter.update({
        where: { id: chapterId },
        data: { expectation: summary },
      });
      await tx.chapterSummary.upsert({
        where: { chapterId },
        update: {
          summary,
          keyEvents: keyEvents || null,
          characterStates: characterStates || null,
        },
        create: {
          novelId,
          chapterId,
          summary,
          keyEvents: keyEvents || null,
          characterStates: characterStates || null,
        },
      });
    });

    // 桥接 Fact Ledger：将正文即兴产生的硬事实写入事实账本，
    // 供后续章节 JIT task sheet 通过 completedMilestones 消费，防止后文改写本章设定。
    if (concreteFacts.length > 0) {
      try {
        await novelFactService.writeFacts(novelId, chapter.order, concreteFacts);
      } catch (error) {
        // 事实写入失败不应阻断摘要生成主流程
        console.warn("[chapter-summary] concreteFacts ledger write failed", {
          novelId,
          chapterId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    this.queueRagUpsert("chapter", chapterId);
    this.queueRagUpsert("chapter_summary", chapterId);

    return {
      chapterId,
      summary,
      expectation: summary,
      concreteFactCount: concreteFacts.length,
    };
  }

  private queueRagUpsert(ownerType: RagOwnerType, ownerId: string): void {
    void ragServices.ragIndexService.enqueueUpsert(ownerType, ownerId).catch(() => {
      // Keep summary generation resilient when RAG queueing fails.
    });
  }
}

export const novelChapterSummaryService = new NovelChapterSummaryService();
