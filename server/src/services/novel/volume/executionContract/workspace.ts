import type { Prisma } from "@prisma/client";
import type { VolumePlanDocument } from "@ai-novel/shared/types/novel";
import { normalizeVolumeWorkspaceDocument } from "../volumeWorkspaceDocument";

/** Existing ensure/get paths may hydrate missing rows. Preparation must never do that implicitly. */
export async function readExecutionContractWorkspace(
  db: Pick<Prisma.TransactionClient, "volumePlan" | "volumePlanVersion">,
  novelId: string,
): Promise<VolumePlanDocument> {
  const [rows, version] = await Promise.all([
    db.volumePlan.findMany({ where: { novelId }, select: { id: true } }),
    db.volumePlanVersion.findFirst({ where: { novelId, status: "active" }, orderBy: { version: "desc" } }),
  ]);
  if (!rows.length || !version) throw new Error("请返回来源页完成卷规划与章节同步，再生成正文。");
  const document = normalizeVolumeWorkspaceDocument(novelId, version.contentJson, { source: "volume", activeVersionId: version.id });
  if (!document.volumes.length || document.volumes.some(volume => !rows.some(row => row.id === volume.id))) {
    throw new Error("卷规划来源与章节记录不一致，请返回来源页完成同步。");
  }
  return document;
}
