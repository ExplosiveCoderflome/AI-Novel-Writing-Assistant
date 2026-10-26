import type { PrismaClient } from "@prisma/client";
import { buildBookContractPayoffSources } from "../../../../../services/payoff/sources/bookContractPayoffSources";
import { InvalidProductionRequestError } from "../../../application";
import type { PayoffExtractionDependencies } from "./extraction";

const compact = (value: string | null | undefined) => value?.replace(/\s+/g, " ").trim() || "无";
function strings(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const value: unknown = JSON.parse(raw);
  if (!Array.isArray(value) || value.some(item => typeof item !== "string")) throw new InvalidProductionRequestError("Invalid structured payoff source");
  return value;
}
/** Read-only relocation of the existing full-ledger prompt inputs. DB failures never become empty state. */
export function createPayoffSourceReader(db: Pick<PrismaClient, "novel" | "chapter" | "volumePlan" | "storyStateSnapshot" | "openConflict" | "auditReport">): PayoffExtractionDependencies["read"] {
  return async context => {
    const { novelId, chapterId, order } = context.run.progress.unit;
    const [novel, chapter, volumes, snapshot, conflicts, reports] = await Promise.all([
      db.novel.findUnique({ where: { id: novelId }, select: { title: true, storyMacroPlan: { select: { decompositionJson: true } },
        bookContract: { select: { chapter3Payoff: true, chapter10Payoff: true, chapter30Payoff: true } } } }),
      db.chapter.findFirst({ where: { id: chapterId, novelId }, select: { order: true } }),
      db.volumePlan.findMany({ where: { novelId }, orderBy: { sortOrder: "asc" }, include: { chapters: { orderBy: { chapterOrder: "asc" },
        select: { chapterOrder: true, title: true, summary: true, payoffRefsJson: true } } } }),
      db.storyStateSnapshot.findFirst({ where: { novelId }, orderBy: { createdAt: "desc" }, include: { sourceChapter: { select: { id: true, order: true, title: true } }, foreshadowStates: true } }),
      db.openConflict.findMany({ where: { novelId, status: "open" }, orderBy: { updatedAt: "desc" }, take: 8 }),
      db.auditReport.findMany({ where: { novelId, auditType: "plot" }, orderBy: { createdAt: "desc" }, take: 4,
        include: { issues: { where: { status: "open" }, orderBy: { createdAt: "desc" } } } }),
    ]);
    if (!novel || !chapter || chapter.order !== order) throw new InvalidProductionRequestError("Payoff source chapter identity changed");
    const active = volumes.find(volume => volume.chapters.some(item => item.chapterOrder === order));
    const macro: { major_payoffs?: unknown } = novel.storyMacroPlan?.decompositionJson ? JSON.parse(novel.storyMacroPlan.decompositionJson) : {};
    const major = Array.isArray(macro.major_payoffs) ? macro.major_payoffs.filter((item): item is string => typeof item === "string" && Boolean(item.trim())) : [];
    return { novelTitle: novel.title, bookContractPayoffs: buildBookContractPayoffSources(novel.bookContract),
      activeVolumeSummary: active ? [`当前卷：第${active.sortOrder}卷《${active.title}》`, `卷摘要：${compact(active.summary)}`,
        `卷 open payoffs：${strings(active.openPayoffsJson).join("；") || "无"}`,
        active.chapters.length ? `卷章节范围：${active.chapters[0].chapterOrder}-${active.chapters.at(-1)!.chapterOrder}` : "卷章节范围：无"].join("\n")
        : `当前暂无激活卷窗口。${volumes.length ? `已有卷：${volumes.map(volume => `第${volume.sortOrder}卷《${volume.title}》`).join("；")}` : ""}`,
      latestChapterContext: [`当前章节序号：第${order}章`, snapshot?.sourceChapter ? `最新状态快照来源：第${snapshot.sourceChapter.order}章《${snapshot.sourceChapter.title}》` : "最新状态快照来源：无",
        snapshot?.summary ? `状态快照摘要：${snapshot.summary}` : ""].filter(Boolean).join("\n"),
      majorPayoffsText: major.map((item, index) => `${index + 1}. ${item}`).join("\n") || "无",
      openPayoffsText: volumes.map(volume => { const values = strings(volume.openPayoffsJson); return values.length ? `【第${volume.sortOrder}卷 ${volume.title}】 ${values.map(compact).join("；")}` : ""; }).filter(Boolean).join("\n\n") || "无",
      chapterPayoffRefsText: volumes.flatMap(volume => volume.chapters.map(item => { const refs = strings(item.payoffRefsJson);
        return refs.length ? `第${item.chapterOrder}章《${item.title}》 | ${refs.map(compact).join("；")}` : ""; })).filter(Boolean).join("\n\n") || "无",
      foreshadowStatesText: snapshot?.foreshadowStates.map(item => [`标题：${item.title}`, `状态：${compact(item.status)}`, item.summary ? `摘要：${item.summary}` : "",
        item.setupChapterId ? `setupChapterId：${item.setupChapterId}` : "", item.payoffChapterId ? `payoffChapterId：${item.payoffChapterId}` : ""].filter(Boolean).join(" | ")).join("\n") || "无",
      payoffConflictsText: conflicts.map(item => [`${item.conflictType}/${item.severity}：${item.title}`, compact(item.summary), item.resolutionHint ? `修复建议：${compact(item.resolutionHint)}` : ""].filter(Boolean).join(" | ")).join("\n") || "无",
      payoffAuditIssuesText: reports.flatMap(report => report.issues.map(issue => `${issue.code} (${issue.severity})：${compact(issue.description)} | 证据：${compact(issue.evidence)}`)).join("\n") || "无" };
  };
}
