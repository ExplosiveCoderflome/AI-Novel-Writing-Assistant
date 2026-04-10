import { randomUUID } from "node:crypto";
import type {
  ChapterEditorCandidate,
  ChapterEditorOperation,
  ChapterEditorRewritePreviewRequest,
  ChapterEditorRewritePreviewResponse,
} from "@ai-novel/shared/types/novel";
import { prisma } from "../../../db/prisma";
import { runStructuredPrompt } from "../../../prompting/core/promptRunner";
import {
  chapterEditorRewriteCandidatesPrompt,
  type ChapterEditorRewriteCandidatesPromptInput,
} from "../../../prompting/prompts/novel/chapterEditor/rewriteCandidates.prompts";
import { buildChapterEditorDiffChunks } from "./chapterEditorDiff";

type PrismaLike = Pick<typeof prisma, "novel">;
type RunStructuredPromptLike = typeof runStructuredPrompt<ChapterEditorRewriteCandidatesPromptInput, { candidates: Array<{
  label: string;
  content: string;
  summary?: string;
  semanticTags?: string[];
}> }>;

const OPERATION_LABELS: Record<ChapterEditorOperation, string> = {
  polish: "优化表达",
  expand: "扩写细节",
  compress: "精简压缩",
  emotion: "强化情绪",
  conflict: "强化冲突",
  custom: "自定义指令改写",
};

function normalizeText(text: string): string {
  return text.replace(/\r\n/g, "\n");
}

function ensureNonEmptyText(value: string | null | undefined): string {
  return normalizeText(value ?? "");
}

function buildConstraintsText(input: ChapterEditorRewritePreviewRequest["constraints"]): string {
  const lines = [
    input.keepFacts ? "- 保留现有剧情事实" : "- 可调整部分事实",
    input.keepPov ? "- 保持当前人称与叙事视角" : "- 可调整叙事视角",
    input.noUnauthorizedSetting ? "- 不新增未授权设定" : "- 可引入补充设定",
    input.preserveCoreInfo ? "- 尽量保留原段核心信息" : "- 可重组核心信息",
  ];
  return lines.join("\n");
}

function dedupeCandidates(candidates: ChapterEditorCandidate[]): ChapterEditorCandidate[] {
  const seen = new Set<string>();
  const deduped: ChapterEditorCandidate[] = [];
  for (const candidate of candidates) {
    const key = candidate.content.trim();
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(candidate);
  }
  return deduped;
}

export class NovelChapterEditorService {
  constructor(
    private readonly db: PrismaLike = prisma,
    private readonly promptRunner: typeof runStructuredPrompt = runStructuredPrompt,
  ) {}

  async previewRewrite(
    novelId: string,
    chapterId: string,
    input: ChapterEditorRewritePreviewRequest,
  ): Promise<ChapterEditorRewritePreviewResponse> {
    const novel = await this.db.novel.findUnique({
      where: { id: novelId },
      include: {
        world: {
          select: {
            name: true,
            description: true,
            overviewSummary: true,
            conflicts: true,
            magicSystem: true,
            axioms: true,
          },
        },
        characters: {
          select: {
            name: true,
            role: true,
            currentState: true,
            currentGoal: true,
          },
          orderBy: { createdAt: "asc" },
        },
        chapters: {
          where: { id: chapterId },
          select: {
            id: true,
            title: true,
            content: true,
            order: true,
            expectation: true,
          },
        },
      },
    });

    if (!novel) {
      throw new Error("小说不存在。");
    }

    const chapter = novel.chapters[0];
    if (!chapter) {
      throw new Error("章节不存在。");
    }

    const persistedContent = ensureNonEmptyText(chapter.content);
    const content = ensureNonEmptyText(input.contentSnapshot || persistedContent);
    if (!content.trim()) {
      throw new Error("当前章节正文为空，无法发起局部改写。");
    }

    const targetRange = input.targetRange;
    if (
      typeof targetRange.from !== "number"
      || typeof targetRange.to !== "number"
      || targetRange.from < 0
      || targetRange.to <= targetRange.from
      || targetRange.to > content.length
    ) {
      throw new Error("选区范围无效，请重新选择后再试。");
    }

    const selectedText = content.slice(targetRange.from, targetRange.to);
    if (!selectedText.trim()) {
      throw new Error("选中文本不能为空。");
    }

    if (normalizeText(targetRange.text) !== selectedText) {
      throw new Error("选中文本已发生变化，请重新选择后再试。");
    }

    const charactersFallback = novel.characters.length > 0
      ? novel.characters
          .slice(0, 8)
          .map((character) => {
            const parts = [
              `${character.name}(${character.role})`,
              character.currentState?.trim(),
              character.currentGoal?.trim(),
            ].filter((part): part is string => Boolean(part && part.trim()));
            return `- ${parts.join(" / ")}`;
          })
          .join("\n")
      : "无";
    const worldFallback = novel.world
      ? [
        novel.world.name,
        novel.world.description,
        novel.world.overviewSummary,
        novel.world.conflicts,
        novel.world.magicSystem,
        novel.world.axioms,
      ]
        .filter((item): item is string => Boolean(item && item.trim()))
        .join("\n")
      : "无";

    const promptInput: ChapterEditorRewriteCandidatesPromptInput = {
      operation: input.operation,
      operationLabel: OPERATION_LABELS[input.operation],
      customInstruction: input.customInstruction?.trim() || undefined,
      selectedText,
      beforeParagraphs: input.context.beforeParagraphs ?? [],
      afterParagraphs: input.context.afterParagraphs ?? [],
      goalSummary: input.chapterContext.goalSummary?.trim() || chapter.expectation?.trim() || null,
      chapterSummary: input.chapterContext.chapterSummary?.trim() || null,
      styleSummary: input.chapterContext.styleSummary?.trim() || null,
      characterStateSummary: input.chapterContext.characterStateSummary?.trim() || charactersFallback,
      worldConstraintSummary: input.chapterContext.worldConstraintSummary?.trim() || worldFallback,
      constraintsText: buildConstraintsText(input.constraints),
    };

    const result = await this.promptRunner({
      asset: chapterEditorRewriteCandidatesPrompt,
      promptInput,
      options: {
        provider: input.provider ?? "deepseek",
        model: input.model,
        temperature: input.temperature ?? 0.45,
      },
    });

    const candidates = dedupeCandidates(
      result.output.candidates.slice(0, 3).map((candidate, index) => ({
        id: randomUUID(),
        label: candidate.label?.trim() || `方案 ${index + 1}`,
        content: candidate.content.trim(),
        summary: candidate.summary?.trim() || null,
        semanticTags: candidate.semanticTags?.filter((tag) => tag.trim().length > 0) ?? [],
        diffChunks: buildChapterEditorDiffChunks(selectedText, candidate.content.trim()),
      })),
    );

    if (candidates.length < 2) {
      throw new Error("AI 未返回足够的候选版本，请重试。");
    }

    return {
      sessionId: randomUUID(),
      operation: input.operation,
      targetRange: {
        from: targetRange.from,
        to: targetRange.to,
        text: selectedText,
      },
      candidates,
      activeCandidateId: candidates[0]?.id ?? null,
    };
  }
}
