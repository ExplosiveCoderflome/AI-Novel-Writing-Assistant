import { AppError } from "../../../../middleware/errorHandler";
import { readActiveManuscriptChapters } from "./ManuscriptWorkspaceService";

type ManuscriptIsolationDb = {
  manuscriptProject: { findUnique(input: unknown): Promise<{ id: string } | null> };
};

export async function isManuscriptNovel(db: ManuscriptIsolationDb, novelId: string): Promise<boolean> {
  return Boolean(await db.manuscriptProject.findUnique({ where: { novelId }, select: { id: true } }));
}

export async function rejectLegacyManuscriptWrite(db: ManuscriptIsolationDb, novelId: string): Promise<void> {
  if (await isManuscriptNovel(db, novelId)) {
    throw new AppError("请在原稿修订工作区处理章节，旧创作入口不会覆盖导入正文。", 409);
  }
}

export async function rejectManuscriptDirectorEntry(db: ManuscriptIsolationDb, novelId: string): Promise<void> {
  if (await isManuscriptNovel(db, novelId)) {
    throw new AppError("导入原稿请在原稿修订工作区中调整章节，导演创作不会改写导入正文。", 409);
  }
}

export async function readEffectiveNovelChapters(db: ManuscriptIsolationDb, novelId: string) {
  return readActiveManuscriptChapters(db as never, novelId);
}

export { readActiveManuscriptChapters };

export async function resolveEffectiveNovelChapters<T>(
  db: ManuscriptIsolationDb,
  novelId: string,
  legacyRead: () => Promise<T>,
): Promise<Awaited<ReturnType<typeof readActiveManuscriptChapters>> | T> {
  const active = await readActiveManuscriptChapters(db as never, novelId);
  return active ?? legacyRead();
}

export function isCurrentSyncMarker(marker: { status: string } | null | undefined): boolean {
  return Boolean(marker && marker.status !== "superseded");
}
