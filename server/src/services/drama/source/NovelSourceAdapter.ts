/**
 * 小说内容源适配器（novel_import）
 *
 * 这是 drama 模块与 novel 模块的【唯一】接触点。它只通过 prisma
 * 只读访问 novel 相关表，把小说转换为标准化 SourceBundle，
 * 不 import 任何 services/novel/* 业务逻辑（由 CI 守卫强制）。
 *
 * prisma 属于平台级基础设施，允许依赖；novel 业务服务不允许依赖。
 */
import { prisma } from "../../../db/prisma";
import type { SourceContentPort } from "./SourceContentPort";
import type {
  SourceBundle,
  SourceBeat,
  SourceCharacter,
  SourceFact,
  SourceFactCategory,
  SourceRef,
} from "../contracts/sourceBundle";

function truncate(text: string, max = 200): string {
  const trimmed = text.replace(/\s+/g, " ").trim();
  return trimmed.length > max ? `${trimmed.slice(0, max)}…` : trimmed;
}

function normalizeFactCategory(raw: string): SourceFactCategory {
  if (raw === "revealed" || raw === "state_changed") {
    return raw;
  }
  return "completed";
}

export class NovelSourceAdapter implements SourceContentPort {
  readonly sourceType = "novel_import" as const;

  async loadBundle(ref: SourceRef): Promise<SourceBundle> {
    const novelId = ref.ref?.trim();
    if (!novelId) {
      throw new Error("novel_import 内容源缺少 novelId（ref.ref）。");
    }

    const novel = await prisma.novel.findUnique({
      where: { id: novelId },
      select: { id: true, title: true, description: true },
    });
    if (!novel) {
      throw new Error(`未找到源小说：${novelId}`);
    }

    const [chapters, characters, factRows] = await Promise.all([
      prisma.chapter.findMany({
        where: { novelId },
        orderBy: { order: "asc" },
        select: { order: true, title: true, expectation: true, content: true },
      }),
      prisma.character.findMany({
        where: { novelId },
        select: { id: true, name: true, role: true, personality: true, background: true },
      }),
      prisma.novelFactEntry.findMany({
        where: { novelId },
        orderBy: { chapterOrder: "asc" },
        select: { text: true, category: true },
      }),
    ]);

    const beats: SourceBeat[] = chapters.map((chapter) => {
      const summary = (chapter.expectation ?? "").trim()
        || truncate(chapter.content ?? "")
        || chapter.title;
      return {
        order: chapter.order,
        summary: `${chapter.title}：${summary}`,
        sourceChapterStart: chapter.order,
        sourceChapterEnd: chapter.order,
      };
    });

    const bundleCharacters: SourceCharacter[] = characters.map((character) => ({
      name: character.name,
      persona: [character.role, character.personality].filter(Boolean).join("｜") || undefined,
      relations: character.background ?? undefined,
      sourceCharacterRef: character.id,
    }));

    const hardFacts: SourceFact[] = factRows.map((row) => ({
      text: row.text,
      category: normalizeFactCategory(row.category),
    }));

    return {
      synopsis: (novel.description ?? "").trim() || novel.title,
      beats,
      characters: bundleCharacters,
      hardFacts,
    };
  }
}

export const novelSourceAdapter = new NovelSourceAdapter();
