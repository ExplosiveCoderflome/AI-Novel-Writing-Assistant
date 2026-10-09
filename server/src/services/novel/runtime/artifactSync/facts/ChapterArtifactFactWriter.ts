import { prisma } from "../../../../../db/prisma";
import type { ChapterArtifactDeltaOutput } from "../../../../../prompting/prompts/novel/chapterArtifactDelta.prompts";
import type { RagOwnerType } from "../../../../rag/types";
import { compactText } from "../../../characterResource/characterResourceShared";
import { novelFactService, type NovelFactWriteItem } from "../../../fact/NovelFactService";
import { extractFacts } from "../../../novelP0Utils";
import { ChapterArtifactContentVersionError } from "../ChapterArtifactSyncResult";
import { buildChapterArtifactContentHash } from "../ChapterArtifactContentVersion";

function shortLines(values: Array<string | null | undefined>): string | null {
  const lines = [...new Set(values.map(value => compactText(value)).filter(Boolean))].slice(0, 3);
  return lines.join("；") || null;
}

/** Finalized summary/fact persistence; no model calls and no director orchestration. */
export class ChapterArtifactFactWriter {
  constructor(private readonly queueUpsert: (ownerType: RagOwnerType, ownerId: string) => void) {}

  async persist(input: {novelId: string; chapterId: string; chapterOrder: number; content: string;
    output: ChapterArtifactDeltaOutput; expectedContentHash: string; artifactSyncPolicy?: "director_v2"}): Promise<number> {
    const summary = compactText(input.output.summary) || "暂无可总结正文";
    const legacy = input.artifactSyncPolicy === "director_v2" ? [] : extractFacts(input.content || summary);
    const keyEvents = shortLines(input.artifactSyncPolicy === "director_v2"
      ? input.output.concreteFacts.filter(fact => fact.category !== "state_changed").map(fact => fact.text)
      : legacy.filter(fact => fact.category === "plot").map(fact => fact.content));
    const characterStates = shortLines(input.artifactSyncPolicy === "director_v2"
      ? input.output.stateDeltas.characterStates.map(state => state.summary)
      : legacy.filter(fact => fact.category === "character").map(fact => fact.content));
    await prisma.$transaction(async tx => {
      const current = await tx.chapter.findFirst({where: {id: input.chapterId, novelId: input.novelId}, select: {content: true}});
      if (!current || buildChapterArtifactContentHash(current.content ?? "") !== input.expectedContentHash) {
        throw new ChapterArtifactContentVersionError("章节正文版本已变化，已拒绝写入过期摘要与事实。");
      }
      await tx.chapter.update({where: {id: input.chapterId}, data: {expectation: summary}});
      await tx.chapterSummary.upsert({where: {chapterId: input.chapterId},
        update: {summary, keyEvents, characterStates},
        create: {novelId: input.novelId, chapterId: input.chapterId, summary, keyEvents, characterStates},
      });
    });
    const facts: NovelFactWriteItem[] = input.output.concreteFacts.map(fact => ({
      text: compactText(fact.text), category: fact.category, source: "auto" as const,
    })).filter(fact => fact.text.length > 0);
    if (facts.length > 0) await novelFactService.writeFacts(input.novelId, input.chapterOrder, facts, {
      chapterId: input.chapterId, expectedChapterContent: input.content,
    });
    // Only the final-version writer owns these V2 jobs, not draft saves or
    // generic sync completion, preventing duplicate/premature embeddings.
    this.queueUpsert("chapter", input.chapterId);
    this.queueUpsert("chapter_summary", input.chapterId);
    return facts.length;
  }
}
