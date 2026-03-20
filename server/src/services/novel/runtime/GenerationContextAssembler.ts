import type { GenerationContextPackage } from "@ai-novel/shared/types/chapterRuntime";
import { prisma } from "../../../db/prisma";
import { ragServices } from "../../rag";
import { plannerService } from "../../planner/PlannerService";
import { stateService } from "../../state/StateService";
import { getRagQueryForChapter, novelReferenceService } from "../NovelReferenceService";
import { NovelContinuationService } from "../NovelContinuationService";
import { parseJsonStringArray } from "../novelP0Utils";
import { NovelWorldSliceService } from "../storyWorldSlice/NovelWorldSliceService";
import {
  buildLegacyWorldContextFromWorld,
  formatStoryWorldSlicePromptBlock,
} from "../storyWorldSlice/storyWorldSliceFormatting";
import type { ChapterRuntimeRequestInput } from "./chapterRuntimeSchema";

const OPENING_COMPARE_LIMIT = 3;
const OPENING_SLICE_LENGTH = 220;

function extractOpening(content: string, maxLength = OPENING_SLICE_LENGTH): string {
  return content.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function buildWorldContextFromNovel(
  novel: {
    world?: {
      name: string;
      worldType?: string | null;
      description?: string | null;
      axioms?: string | null;
      background?: string | null;
      geography?: string | null;
      magicSystem?: string | null;
      politics?: string | null;
      races?: string | null;
      religions?: string | null;
      technology?: string | null;
      conflicts?: string | null;
      history?: string | null;
      economy?: string | null;
      factions?: string | null;
    } | null;
  } | null,
): string {
  return buildLegacyWorldContextFromWorld(novel?.world ?? null);
}

function mapPlan(plan: Awaited<ReturnType<typeof plannerService.getChapterPlan>>): GenerationContextPackage["plan"] {
  if (!plan) {
    return null;
  }
  return {
    id: plan.id,
    chapterId: plan.chapterId ?? null,
    title: plan.title,
    objective: plan.objective,
    participants: parseJsonStringArray(plan.participantsJson),
    reveals: parseJsonStringArray(plan.revealsJson),
    riskNotes: parseJsonStringArray(plan.riskNotesJson),
    hookTarget: plan.hookTarget ?? null,
    rawPlanJson: plan.rawPlanJson ?? null,
    scenes: plan.scenes.map((scene) => ({
      id: scene.id,
      sortOrder: scene.sortOrder,
      title: scene.title,
      objective: scene.objective ?? null,
      conflict: scene.conflict ?? null,
      reveal: scene.reveal ?? null,
      emotionBeat: scene.emotionBeat ?? null,
    })),
    createdAt: plan.createdAt.toISOString(),
    updatedAt: plan.updatedAt.toISOString(),
  };
}

function mapStateSnapshot(snapshot: Awaited<ReturnType<typeof stateService.getLatestSnapshotBeforeChapter>>): GenerationContextPackage["stateSnapshot"] {
  if (!snapshot) {
    return null;
  }
  return {
    id: snapshot.id,
    novelId: snapshot.novelId,
    sourceChapterId: snapshot.sourceChapterId ?? null,
    summary: snapshot.summary ?? null,
    rawStateJson: snapshot.rawStateJson ?? null,
    characterStates: snapshot.characterStates.map((item) => ({
      characterId: item.characterId,
      currentGoal: item.currentGoal ?? null,
      emotion: item.emotion ?? null,
      summary: item.summary ?? null,
    })),
    relationStates: snapshot.relationStates.map((item) => ({
      sourceCharacterId: item.sourceCharacterId,
      targetCharacterId: item.targetCharacterId,
      summary: item.summary ?? null,
    })),
    informationStates: snapshot.informationStates.map((item) => ({
      holderType: item.holderType,
      holderRefId: item.holderRefId ?? null,
      fact: item.fact,
      status: item.status,
      summary: item.summary ?? null,
    })),
    foreshadowStates: snapshot.foreshadowStates.map((item) => ({
      title: item.title,
      summary: item.summary ?? null,
      status: item.status,
      setupChapterId: item.setupChapterId ?? null,
      payoffChapterId: item.payoffChapterId ?? null,
    })),
    createdAt: snapshot.createdAt.toISOString(),
    updatedAt: snapshot.updatedAt.toISOString(),
  };
}

export class GenerationContextAssembler {
  private readonly continuationService = new NovelContinuationService();
  private readonly worldSliceService = new NovelWorldSliceService();

  async assemble(
    novelId: string,
    chapterId: string,
    request: ChapterRuntimeRequestInput,
  ): Promise<{
    novel: { id: string; title: string };
    chapter: { id: string; title: string; order: number; content: string | null; expectation: string | null };
    contextPackage: GenerationContextPackage;
  }> {
    const [novel, chapter] = await Promise.all([
      prisma.novel.findUnique({
        where: { id: novelId },
        include: { world: true, characters: true },
      }),
      prisma.chapter.findFirst({
        where: { id: chapterId, novelId },
      }),
    ]);

    if (!novel || !chapter) {
      throw new Error("Novel or chapter not found.");
    }

    const ensuredPlan = await plannerService.ensureChapterPlan(novelId, chapterId, request);
    const [storyWorldSlice, planPromptBlock, stateSnapshot, stateContextBlock, bible, summaries, facts, styleReference, recentChapters, decisions, openAuditIssues, continuationPack] = await Promise.all([
      this.worldSliceService.ensureStoryWorldSlice(novelId, { builderMode: "runtime" }),
      plannerService.buildPlanPromptBlock(novelId, chapterId),
      stateService.getLatestSnapshotBeforeChapter(novelId, chapter.order),
      stateService.buildStateContextBlock(novelId, chapter.order),
      prisma.novelBible.findUnique({ where: { novelId } }),
      prisma.chapterSummary.findMany({
        where: {
          novelId,
          chapter: { order: { lt: chapter.order } },
        },
        include: { chapter: true },
        orderBy: { chapter: { order: "desc" } },
        take: 5,
      }),
      prisma.consistencyFact.findMany({
        where: { novelId },
        orderBy: { createdAt: "desc" },
        take: 12,
      }),
      novelReferenceService.buildReferenceForStage(novelId, "chapter"),
      prisma.chapter.findMany({
        where: {
          novelId,
          order: { lt: chapter.order },
          content: { not: null },
        },
        orderBy: { order: "desc" },
        take: 2,
        select: { order: true, title: true, content: true },
      }),
      prisma.creativeDecision.findMany({
        where: {
          novelId,
          OR: [{ expiresAt: null }, { expiresAt: { gte: chapter.order } }],
        },
        orderBy: [{ importance: "asc" }, { createdAt: "desc" }],
        take: 20,
      }),
      prisma.auditIssue.findMany({
        where: {
          status: "open",
          report: {
            is: {
              novelId,
              chapterId,
            },
          },
        },
        orderBy: [{ createdAt: "desc" }],
      }),
      this.continuationService.buildChapterContextPack(novelId),
    ]);

    const previousChaptersSummary = request.previousChaptersSummary?.length
      ? request.previousChaptersSummary
      : summaries.map((item) => `第${item.chapter.order}章《${item.chapter.title}》: ${item.summary}`);

    const summaryText = previousChaptersSummary.length > 0
      ? `最近章节摘要：\n${previousChaptersSummary.join("\n")}`
      : "最近章节摘要：暂无";
    const factText = facts.length > 0
      ? `最近关键事实：\n${facts.map((item) => `[${item.category}] ${item.content}`).join("\n")}`
      : "最近关键事实：暂无";
    const recentChapterContentText = recentChapters.length > 0
      ? `最近章节正文片段（避免重复描写）：\n${recentChapters
          .map((item) => {
            const digest = (item.content ?? "").replace(/\s+/g, " ").trim().slice(0, 220);
            return `${item.order}章《${item.title}》：${digest}`;
          })
          .filter((item) => item.trim().length > 0)
          .join("\n")}`
      : "最近章节正文片段：暂无";
    const charactersContextText = novel.characters.length > 0
      ? `角色设定：\n${novel.characters
          .map((item) => `- ${item.name}(${item.role})${item.personality ? ` ${item.personality.slice(0, 80)}` : ""}`)
          .join("\n")}`
      : "";
    const bibleText = bible
      ? `作品圣经：
主线承诺${bible.mainPromise ?? ""}
核心设定${bible.coreSetting ?? ""}
禁止冲突${bible.forbiddenRules ?? ""}
角色成长弧${bible.characterArcs ?? ""}
世界规则${bible.worldRules ?? ""}`
      : "作品圣经：暂无";
    const outlineText = novel.outline?.trim()
      ? `发展走向：\n${novel.outline.slice(0, 800)}`
      : "";
    const styleBlock = styleReference.trim()
      ? `文风参考（来自拆书分析）：\n${styleReference}`
      : "";
    const decisionsBlock = decisions.length > 0
      ? `创作决策（请遵守）：\n${decisions.map((item) => `[${item.category}${item.importance === "critical" ? " 重要" : ""}] ${item.content}`).join("\n")}`
      : "";

    const ragQuery = getRagQueryForChapter(chapter.order, novel.title, novel.structuredOutline ?? null);
    let ragText = "";
    try {
      ragText = await ragServices.hybridRetrievalService.buildContextBlock(ragQuery, {
        novelId,
        currentChapterOrder: chapter.order,
      });
    } catch {
      ragText = "";
    }

    const openingHint = await this.buildOpeningConstraintHint(novelId, chapter.order);
    const contextPackage: GenerationContextPackage = {
      chapter: {
        id: chapter.id,
        title: chapter.title,
        order: chapter.order,
        content: chapter.content ?? null,
        expectation: chapter.expectation ?? null,
        supportingContextText: [
          storyWorldSlice
            ? formatStoryWorldSlicePromptBlock(storyWorldSlice)
            : buildWorldContextFromNovel(novel),
          outlineText,
          charactersContextText,
          bibleText,
          summaryText,
          factText,
          recentChapterContentText,
          ragText ? `语义检索补充：\n${ragText}` : "",
          stateContextBlock,
          planPromptBlock,
          styleBlock,
          decisionsBlock,
        ].filter(Boolean).join("\n\n"),
      },
      plan: mapPlan(ensuredPlan),
      stateSnapshot: mapStateSnapshot(stateSnapshot),
      storyWorldSlice,
      characterRoster: novel.characters.map((item) => ({
        id: item.id,
        name: item.name,
        role: item.role,
        personality: item.personality ?? null,
        currentState: item.currentState ?? null,
        currentGoal: item.currentGoal ?? null,
      })),
      creativeDecisions: decisions.map((item) => ({
        id: item.id,
        chapterId: item.chapterId ?? null,
        category: item.category,
        content: item.content,
        importance: item.importance,
        expiresAt: item.expiresAt ?? null,
        sourceType: item.sourceType ?? null,
        sourceRefId: item.sourceRefId ?? null,
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString(),
      })),
      openAuditIssues: openAuditIssues.map((item) => ({
        id: item.id,
        reportId: item.reportId,
        auditType: item.auditType as GenerationContextPackage["openAuditIssues"][number]["auditType"],
        severity: item.severity as GenerationContextPackage["openAuditIssues"][number]["severity"],
        code: item.code,
        description: item.description,
        evidence: item.evidence,
        fixSuggestion: item.fixSuggestion,
        status: item.status as GenerationContextPackage["openAuditIssues"][number]["status"],
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString(),
      })),
      previousChaptersSummary,
      openingHint,
      continuation: {
        enabled: continuationPack.enabled,
        sourceType: continuationPack.sourceType,
        sourceId: continuationPack.sourceId,
        sourceTitle: continuationPack.sourceTitle,
        systemRule: continuationPack.systemRule,
        humanBlock: continuationPack.humanBlock,
        antiCopyCorpus: continuationPack.antiCopyCorpus,
      },
    };

    return {
      novel: { id: novel.id, title: novel.title },
      chapter: {
        id: chapter.id,
        title: chapter.title,
        order: chapter.order,
        content: chapter.content ?? null,
        expectation: chapter.expectation ?? null,
      },
      contextPackage,
    };
  }

  private async buildOpeningConstraintHint(novelId: string, chapterOrder: number): Promise<string> {
    const recentChapters = await prisma.chapter.findMany({
      where: {
        novelId,
        order: { lt: chapterOrder },
        content: { not: null },
      },
      orderBy: { order: "desc" },
      take: OPENING_COMPARE_LIMIT,
      select: { order: true, title: true, content: true },
    });

    const openingList = recentChapters
      .map((item) => ({
        order: item.order,
        title: item.title,
        opening: extractOpening(item.content ?? ""),
      }))
      .filter((item) => item.opening.length > 0);

    if (openingList.length === 0) {
      return "Recent openings: none.";
    }

    return [
      "Recent openings (do not reuse the same opening structure or sentence starter):",
      ...openingList.map((item) => `- Chapter ${item.order} ${item.title}: ${item.opening}`),
    ].join("\n");
  }
}
