import type {Prisma} from "@prisma/client";
import {assertNovelDirectorVersion} from "../../../../../modules/novel/director-routing";
import {ChapterArtifactContentVersionError} from "../ChapterArtifactSyncResult";
import {buildChapterArtifactContentHash} from "../ChapterArtifactContentVersion";

export interface ManualRevisionProof {
  manualRevision?: string;
  revisionGuard?: {id: string; metadataJson: string | null; novel?: {directorEpoch: number; directorVersion: string | null}};
}

/** Authorizes saved author text, never a director step or a resume command. */
export async function authorizeManualRevision(tx: Prisma.TransactionClient,
  input: ManualRevisionProof & {novelId: string; chapterId: string; content: string}): Promise<boolean> {
  if (!input.manualRevision && !input.revisionGuard) return false;
  const guard = input.revisionGuard;
  const stale = () => new ChapterArtifactContentVersionError("正文修订已变化，已停止过期资料同步。");
  if (!input.manualRevision || !guard?.metadataJson || guard.novel?.directorVersion !== "v2") throw stale();
  let payload: {revision?: string; novelId?: string; chapterId?: string; contentHash?: string; attemptId?: string};
  try {payload = JSON.parse(guard.metadataJson);} catch {throw stale();}
  const contentHash = buildChapterArtifactContentHash(input.content);
  if (!payload || !payload.attemptId || payload.revision !== input.manualRevision || payload.novelId !== input.novelId
    || payload.chapterId !== input.chapterId || payload.contentHash !== contentHash) throw stale();
  const epoch = guard.novel.directorEpoch;
  const book = await tx.novel.updateMany({where: {id: input.novelId, directorVersion: "v2", directorEpoch: epoch},
    data: {directorEpoch: {increment: 0}}});
  if (book.count !== 1) throw stale();
  await assertNovelDirectorVersion(input.novelId, "v2", epoch, tx);
  const marker = await tx.chapterArtifactSyncCheckpoint.updateMany({where: {
    id: guard.id, metadataJson: guard.metadataJson, novelId: input.novelId, chapterId: input.chapterId,
    contentHash, artifactType: "manual_chapter_sync:v1", syncMode: "manual", status: "running",
  }, data: {updatedAt: new Date()}});
  if (marker.count !== 1) throw stale();
  const chapter = await tx.chapter.updateMany({where: {id: input.chapterId, novelId: input.novelId, content: input.content},
    data: {content: input.content}});
  if (chapter.count !== 1) throw stale();
  return true;
}
