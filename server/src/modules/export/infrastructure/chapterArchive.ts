import { zipEntries } from "@ai-novel/shared/utils/zip";
import zlib from "node:zlib";
import { safeFileNamePart, type NovelTxtRecord } from "../novelExport.formatting";

export function buildChapterArchive(novel: NovelTxtRecord): Buffer {
  const chapters = novel.narrativeForm === "short_story"
    ? [{ order: 1, title: novel.title, content: novel.shortStoryContent }]
    : novel.chapters;
  return Buffer.from(zipEntries(chapters.map(chapter => ({
    name: `${String(chapter.order).padStart(4, "0")}-${safeFileNamePart(chapter.title)}.txt`,
    data: Buffer.from(`第${chapter.order}章 ${chapter.title}\n\n${(chapter.content ?? "").replace(/\r\n?/g, "\n").trim()}\n`, "utf8"),
  })), data => zlib.deflateRawSync(data, { level: 6 })));
}
