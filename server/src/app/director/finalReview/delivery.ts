import type { FinalApproval, FinalReview } from "@ai-novel/shared/types/director/finalReview/contract";
import { prisma } from "../../../db/prisma";
import { AppError } from "../../../middleware/errorHandler";
import { artifactContentHash } from "../../../modules/director";
import { buildNovelTxtExport, exportVersion } from "../../../modules/export";
import { saveManualChapterContent } from "../../../services/novel/chapterEditor/persistence/ManualChapterStore";
import { queueRagUpsert } from "../../../services/novel/novelCoreSupport";
import { readFinalManuscript } from "./manuscript";

export async function finalReviewWorkspace(novelId: string): Promise<FinalReview> {
  return prisma.$transaction(async (tx) => {
    const { chapters, version, manuscriptVersion } = await readFinalManuscript(tx, novelId);
    const receipt = await tx.directorFinalApproval.findUnique({ where: { novelId } });
    return {
      chapters,
      version,
      confirmedVersion: receipt?.confirmedVersion === manuscriptVersion ? manuscriptVersion : null,
    };
  });
}
export async function approveFinalManuscript(novelId: string, input: FinalApproval) {
  const requestHash = artifactContentHash(input);
  const result = await prisma.$transaction(
    async (tx) => {
      const { book, rows, chapters, manuscriptVersion, version } = await readFinalManuscript(tx, novelId);
      const receipt = await tx.directorFinalApproval.findUnique({ where: { novelId } });
      if (receipt?.requestHash === requestHash && receipt.confirmedVersion === manuscriptVersion)
        return { confirmedVersion: manuscriptVersion, changed: [] };
      if (version !== input.version) throw new AppError("稿件有新版本，请重新打开全书检查后核对。", 409);
      if (chapters.some((c) => c.findings === null)) throw new AppError("请先检查完全部章节，再确认导出。", 409);
      const byId = new Map(rows.map((row) => [row.id, row]));
      const changed: string[] = [];
      for (const edit of input.edits) {
        const row = byId.get(edit.chapterId);
        if (!row) throw new AppError("修改包含其他章节，请重新核对。", 409);
        if (row.content === edit.content) continue;
        await saveManualChapterContent(tx, row, edit.content);
        row.content = edit.content;
        changed.push(row.id);
      }
      const confirmedVersion = exportVersion(book, rows);
      await tx.directorFinalApproval.upsert({
        where: { novelId },
        create: { novelId, requestHash, confirmedVersion },
        update: { requestHash, confirmedVersion },
      });
      return { confirmedVersion, changed };
    },
    { isolationLevel: "Serializable", timeout: 60_000 },
  );
  for (const id of result.changed) queueRagUpsert("chapter", id);
  return { confirmedVersion: result.confirmedVersion };
}
export async function exportFinalManuscript(novelId: string, version: string) {
  return prisma.$transaction(
    async (tx) => {
      const { book, rows, manuscriptVersion } = await readFinalManuscript(tx, novelId);
      const approval = await tx.directorFinalApproval.findUnique({ where: { novelId } });
      if (approval?.confirmedVersion !== version || manuscriptVersion !== version)
        throw new AppError("请先确认当前全书稿件，再下载 TXT。", 409);
      return buildNovelTxtExport({ title: book.title, description: book.description, confirmedManuscript: true, chapters: rows });
    },
    { isolationLevel: "Serializable" },
  );
}
