import { prisma } from "../../db/prisma";
import { AppError } from "../../middleware/errorHandler";

type ExportFormat = "txt" | "markdown";

interface NovelChapterRecord {
  order: number;
  title: string;
  content: string | null;
}

interface NovelRecord {
  title: string;
  description: string | null;
  chapters: NovelChapterRecord[];
}

interface NovelExportResult {
  fileName: string;
  contentType: string;
  content: string;
}

function normalizeText(input: string | null | undefined): string {
  return (input ?? "").replace(/\r\n?/g, "\n").trim();
}

function safeFileNamePart(input: string): string {
  const cleaned = input
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || "novel";
}

function padTimeUnit(value: number): string {
  return String(Math.max(0, Math.floor(value))).padStart(2, "0");
}

function buildExportTimestamp(input: Date = new Date()): string {
  return [
    input.getFullYear(),
    padTimeUnit(input.getMonth() + 1),
    padTimeUnit(input.getDate()),
  ].join("")
    + "-"
    + [
      padTimeUnit(input.getHours()),
      padTimeUnit(input.getMinutes()),
      padTimeUnit(input.getSeconds()),
    ].join("");
}

function buildTxtContent(novel: NovelRecord): string {
  const lines: string[] = [];
  lines.push(`《${novel.title}》`);
  lines.push("");

  const description = normalizeText(novel.description);
  if (description) {
    lines.push("【简介】");
    lines.push(description);
    lines.push("");
  }

  if (novel.chapters.length === 0) {
    lines.push("（暂无章节内容）");
    return lines.join("\n");
  }

  for (const chapter of novel.chapters) {
    lines.push("=".repeat(48));
    lines.push(`第${chapter.order}章 ${chapter.title}`);
    lines.push("-".repeat(48));
    lines.push(normalizeText(chapter.content) || "（本章暂无内容）");
    lines.push("");
  }

  return lines.join("\n");
}

function buildMarkdownContent(novel: NovelRecord): string {
  const lines: string[] = [];
  lines.push(`# ${novel.title}`);
  lines.push("");

  const description = normalizeText(novel.description);
  if (description) {
    lines.push("## 简介");
    lines.push(description);
    lines.push("");
  }

  if (novel.chapters.length === 0) {
    lines.push("（暂无章节内容）");
    return lines.join("\n");
  }

  for (const chapter of novel.chapters) {
    lines.push(`## 第${chapter.order}章 ${chapter.title}`);
    lines.push("");
    lines.push(normalizeText(chapter.content) || "（本章暂无内容）");
    lines.push("");
  }

  return lines.join("\n");
}

export class NovelExportService {
  async buildExportContent(novelId: string, format: ExportFormat): Promise<NovelExportResult> {
    const novel = await prisma.novel.findUnique({
      where: { id: novelId },
      select: {
        title: true,
        description: true,
        chapters: {
          select: {
            order: true,
            title: true,
            content: true,
          },
          orderBy: {
            order: "asc",
          },
        },
      },
    });

    if (!novel) {
      throw new AppError("小说不存在。", 404);
    }

    const fileTitle = safeFileNamePart(novel.title);
    const exportTimestamp = buildExportTimestamp();
    if (format === "markdown") {
      return {
        fileName: `${fileTitle}-${exportTimestamp}.md`,
        contentType: "text/markdown; charset=utf-8",
        content: buildMarkdownContent(novel),
      };
    }

    return {
      fileName: `${fileTitle}-${exportTimestamp}.txt`,
      contentType: "text/plain; charset=utf-8",
      content: buildTxtContent(novel),
    };
  }
}

export const novelExportService = new NovelExportService();
