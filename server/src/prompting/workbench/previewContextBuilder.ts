import type { PrismaClient } from "@prisma/client";
import type { PromptAsset } from "../core/promptTypes";
import type { PromptExecutionContext } from "../context/types";
import { buildChapterPreviewBlocks } from "./auditPreviewContext";
import {
  asRecord,
  type PreviewChapterRow,
  type PreviewNovelRow,
} from "./previewContextSupport";
import { buildPreviewChapterWriteContext } from "./writerPreviewContext";

type UnknownPromptAsset = PromptAsset<unknown, unknown, unknown>;
export type PromptWorkbenchPreviewDb = Pick<PrismaClient, "novel" | "chapter">;

function isAuditPreviewPrompt(asset: UnknownPromptAsset): boolean {
  return asset.id === "audit.chapter.full" || asset.id === "audit.chapter.light";
}

function isChapterWriterPreviewPrompt(asset: UnknownPromptAsset): boolean {
  return asset.id === "novel.chapter.writer";
}

function hasExtraContextBlocks(context: PromptExecutionContext): boolean {
  return Array.isArray(asRecord(context.metadata)?.extraContextBlocks);
}

function hasChapterWriteContext(context: PromptExecutionContext): boolean {
  return Boolean(asRecord(asRecord(context.metadata)?.chapterWriteContext));
}

async function loadPreviewNovelAndChapter(input: {
  db: PromptWorkbenchPreviewDb;
  novelId: string;
  chapterId: string;
}): Promise<{ novel: PreviewNovelRow | null; chapter: PreviewChapterRow | null }> {
  const [novel, chapter] = await Promise.all([
    input.db.novel.findUnique({
      where: { id: input.novelId },
      select: {
        id: true,
        title: true,
        description: true,
        targetAudience: true,
        bookSellingPoint: true,
        first30ChapterPromise: true,
        narrativePov: true,
        pacePreference: true,
        emotionIntensity: true,
        styleTone: true,
        estimatedChapterCount: true,
        characters: {
          orderBy: { createdAt: "asc" },
          take: 12,
          select: {
            id: true,
            name: true,
            role: true,
            personality: true,
            background: true,
            development: true,
            identityLabel: true,
            factionLabel: true,
            stanceLabel: true,
            powerLevel: true,
            realm: true,
            currentLocation: true,
            availability: true,
            prohibitionsJson: true,
            currentState: true,
            currentGoal: true,
            appearance: true,
            physique: true,
            attireStyle: true,
            signatureDetail: true,
            voiceTexture: true,
            presenceImpression: true,
          },
        },
      },
    }) as Promise<PreviewNovelRow | null>,
    input.db.chapter.findFirst({
      where: { id: input.chapterId, novelId: input.novelId },
      select: {
        id: true,
        title: true,
        order: true,
        content: true,
        expectation: true,
        targetWordCount: true,
        conflictLevel: true,
        revealLevel: true,
        mustAvoid: true,
        taskSheet: true,
        sceneCards: true,
        hook: true,
      },
    }) as Promise<PreviewChapterRow | null>,
  ]);

  return { novel, chapter };
}

export async function prepareWorkbenchPreviewExecutionContext(input: {
  db: PromptWorkbenchPreviewDb;
  asset: UnknownPromptAsset;
  executionContext: PromptExecutionContext;
}): Promise<{
  executionContext: PromptExecutionContext;
  notes: string[];
}> {
  const { asset, db, executionContext } = input;
  const supportsSelectedChapterContext = isAuditPreviewPrompt(asset) || isChapterWriterPreviewPrompt(asset);
  if (!supportsSelectedChapterContext) {
    return { executionContext, notes: [] };
  }
  if (isAuditPreviewPrompt(asset) && hasExtraContextBlocks(executionContext)) {
    return { executionContext, notes: [] };
  }
  if (isChapterWriterPreviewPrompt(asset) && hasChapterWriteContext(executionContext)) {
    return { executionContext, notes: [] };
  }

  const novelId = executionContext.novelId?.trim();
  const chapterId = executionContext.chapterId?.trim();
  if (!novelId || !chapterId) {
    return { executionContext, notes: [] };
  }

  const { novel, chapter } = await loadPreviewNovelAndChapter({ db, novelId, chapterId });
  if (!novel || !chapter) {
    return {
      executionContext,
      notes: ["未找到所选小说或章节，按手动预览处理。"],
    };
  }

  if (isAuditPreviewPrompt(asset)) {
    return {
      executionContext: {
        ...executionContext,
        metadata: {
          ...(executionContext.metadata ?? {}),
          extraContextBlocks: buildChapterPreviewBlocks({ novel, chapter }),
        },
      },
      notes: [
        `使用《${novel.title}》第 ${chapter.order} 章《${chapter.title || "未命名章节"}》组装本书预览上下文。`,
        chapter.content?.trim() ? "" : "该章节暂无正文，审校预览使用章节任务和任务单展示上下文。",
      ].filter(Boolean),
    };
  }

  return {
    executionContext: {
      ...executionContext,
      metadata: {
        ...(executionContext.metadata ?? {}),
        chapterBlockMode: "full",
        chapterWriteContext: buildPreviewChapterWriteContext({ novel, chapter }),
      },
    },
    notes: [
      `使用《${novel.title}》第 ${chapter.order} 章《${chapter.title || "未命名章节"}》组装正文写作预览上下文。`,
      "预览只读取小说和章节资料，不会启动正文生成或改写章节计划。",
    ],
  };
}
