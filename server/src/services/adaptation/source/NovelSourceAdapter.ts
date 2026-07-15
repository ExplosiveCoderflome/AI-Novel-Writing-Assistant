/**
 * 小说内容源适配器（novel_import）——共享层版本
 *
 * drama 与 comic 共用此适配器。唯一通过 prisma 只读访问 novel 相关表，
 * 不 import 任何 services/novel/* 业务逻辑（由 CI 守卫强制）。
 *
 * loadChapterText：按章节区间取原文，供 comic 分格脚本提取对白。
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
  if (raw === "revealed" || raw === "state_changed") return raw;
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

    const [chapters, characters, factRows, novelWorld] = await Promise.all([
      prisma.chapter.findMany({
        where: { novelId },
        orderBy: { order: "asc" },
        select: { order: true, title: true, expectation: true, content: true },
      }),
      prisma.character.findMany({
        where: { novelId },
        select: {
          id: true,
          name: true,
          gender: true,
          role: true,
          personality: true,
          background: true,
          appearance: true,
          physique: true,
          attireStyle: true,
          signatureDetail: true,
        },
      }),
      prisma.novelFactEntry.findMany({
        where: { novelId },
        orderBy: { chapterOrder: "asc" },
        select: { text: true, category: true },
      }),
      prisma.novelWorld.findUnique({
        where: { novelId },
        select: { structuredDataJson: true },
      }),
    ]);

    const beats: SourceBeat[] = chapters.map((chapter) => {
      const summary =
        (chapter.expectation ?? "").trim() || truncate(chapter.content ?? "") || chapter.title;
      return {
        order: chapter.order,
        summary: `${chapter.title}：${summary}`,
        sourceChapterStart: chapter.order,
        sourceChapterEnd: chapter.order,
      };
    });

    const bundleCharacters: SourceCharacter[] = characters.map((character) => ({
      name: character.name,
      gender: character.gender as "male" | "female" | "other" | "unknown" | undefined,
      persona: [character.role, character.personality].filter(Boolean).join("｜") || undefined,
      relations: character.background ?? undefined,
      visualHint: [
        character.appearance,
        character.physique,
        character.attireStyle,
        character.signatureDetail,
      ].filter(Boolean).join("，") || undefined,
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
      worldNotes: formatWorldNotes(novelWorld?.structuredDataJson),
    };
  }

  async loadChapterText(ref: SourceRef, start: number, end: number): Promise<string> {
    const novelId = ref.ref?.trim();
    if (!novelId) return "";

    const chapters = await prisma.chapter.findMany({
      where: { novelId, order: { gte: start, lte: end } },
      orderBy: { order: "asc" },
      select: { order: true, title: true, content: true },
    });

    return chapters
      .map((ch) => `【第${ch.order}章 ${ch.title}】\n${ch.content ?? ""}`)
      .join("\n\n");
  }
}

function formatWorldNotes(structuredDataJson: string | null | undefined): string | undefined {
  if (!structuredDataJson?.trim()) return undefined;
  try {
    const data = JSON.parse(structuredDataJson);
    const sections: string[] = [];

    if (data.profile) {
      if (data.profile.summary) sections.push(`世界背景：${data.profile.summary}`);
      if (data.profile.identity) sections.push(`核心设定：${data.profile.identity}`);
      if (data.profile.tone) sections.push(`氛围基调：${data.profile.tone}`);
    }

    if (data.rules && Array.isArray(data.rules.axioms)) {
      const rules = data.rules.axioms
        .map((r: any) => `- ${r.name || "未命名规则"}：${r.summary || r.enforcement || ""}`)
        .filter((r: string) => r.trim().length > 0)
        .join("\n");
      if (rules) sections.push(`世界法则/铁律：\n${rules}`);
    }

    if (Array.isArray(data.factions)) {
      const factions = data.factions
        .map((f: any) => `- ${f.name}（立场：${f.doctrine || "未设定"}，势力定位：${f.position || "未设定"}）`)
        .join("\n");
      if (factions) sections.push(`主要势力与阵营：\n${factions}`);
    }

    if (Array.isArray(data.locations)) {
      const locations = data.locations
        .map((l: any) => `- ${l.name}：${l.summary || ""}（叙事功能：${l.narrativeFunction || "未设定"}）`)
        .join("\n");
      if (locations) sections.push(`重要场景地点设定：\n${locations}`);
    }

    return sections.length > 0 ? sections.join("\n\n") : undefined;
  } catch {
    return undefined;
  }
}

export const novelSourceAdapter = new NovelSourceAdapter();
