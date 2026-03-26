import type { LLMProvider } from "@ai-novel/shared/types/llm";
import { prisma } from "../../db/prisma";
import { ragServices } from "../rag";
import type { RagOwnerType } from "../rag/types";
import { runStructuredPrompt } from "../../prompting/core/promptRunner";
import { chapterSummaryPrompt } from "../../prompting/prompts/novel/review.prompts";

interface LLMGenerateOptions {
  provider?: LLMProvider;
  model?: string;
  temperature?: number;
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

    const content = (chapter.content ?? "").trim();
    const existingExpectation = (chapter.expectation ?? "").trim();
    let summary = "";

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
      } catch {
        summary = "";
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

    this.queueRagUpsert("chapter", chapterId);
    this.queueRagUpsert("chapter_summary", chapterId);

    return {
      chapterId,
      summary,
      expectation: summary,
    };
  }

  private queueRagUpsert(ownerType: RagOwnerType, ownerId: string): void {
    void ragServices.ragIndexService.enqueueUpsert(ownerType, ownerId).catch(() => {
      // Keep summary generation resilient when RAG queueing fails.
    });
  }
}
