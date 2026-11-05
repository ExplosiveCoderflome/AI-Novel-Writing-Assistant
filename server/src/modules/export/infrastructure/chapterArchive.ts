import archiver from "archiver";
import { safeFileNamePart, type NovelTxtRecord } from "../novelExport.formatting";

export function buildChapterArchive(novel: NovelTxtRecord): Promise<Buffer> {
  const chapters = novel.narrativeForm === "short_story"
    ? [{ order: 1, title: novel.title, content: novel.shortStoryContent }]
    : novel.chapters;
  return new Promise((resolve, reject) => {
    const archive = archiver("zip", { zlib: { level: 6 } });
    const chunks: Buffer[] = [];
    archive.on("data", (chunk: Buffer) => chunks.push(chunk));
    archive.on("end", () => resolve(Buffer.concat(chunks)));
    archive.on("error", reject);

    for (const chapter of chapters) {
      archive.append(
        Buffer.from(`第${chapter.order}章 ${chapter.title}\n\n${(chapter.content ?? "").replace(/\r\n?/g, "\n").trim()}\n`, "utf8"),
        { name: `${String(chapter.order).padStart(4, "0")}-${safeFileNamePart(chapter.title)}.txt` },
      );
    }
    void archive.finalize().catch(reject);
  });
}
