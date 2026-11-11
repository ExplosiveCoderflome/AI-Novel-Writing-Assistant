import type { Prisma } from "@prisma/client";
import type { OutlineDocument } from "@ai-novel/shared/types/outline";
import type { OutlineBookMapping, OutlinePayoffPlan } from "@ai-novel/shared/types/outlineOpenBook";
import { applyOutlinePolicy } from "../domain/policy";
import { outlineHash } from "../domain/mapping";
import { OutlineOpenBookError } from "../domain/errors";
export async function readOutlinePayoffPlans(db: Pick<Prisma.TransactionClient, "outlineBookBinding" | "outlineRevision">, novelId: string) {
  const binding = await db.outlineBookBinding.findUnique({where: {novelId}});
  if (!binding) return null;
  const revision = await db.outlineRevision.findFirstOrThrow({where: {id: binding.revisionId, projectId: binding.projectId}});
  const doc: OutlineDocument = JSON.parse(revision.documentJson);
  if (outlineHash(doc) !== binding.sourceDocumentHash) throw new OutlineOpenBookError("OUTLINE_BINDING_INTEGRITY", "大纲伏笔来源校验失败。");
  const mapping: OutlineBookMapping = JSON.parse(binding.mappingJson);
  const chapterOrders = (ids: string[]) => ids.map(id => mapping.chapters.find(c => c.nodeId === id)?.chapterOrder).filter((n): n is number => n !== undefined);
  const effective = applyOutlinePolicy(doc, JSON.parse(binding.policyJson));
  const plans: OutlinePayoffPlan[] = effective.payoffs.map(p => {
    const mapped = mapping.payoffs.find(m => m.nodeId === p.nodeId)!;
    return {nodeId: p.nodeId, ledgerKey: mapped.ledgerKey, ledgerItemId: mapped.ledgerItemId, title: p.title, kind: p.kind,
      setupDescription: p.setupDescription, payoffDescription: p.payoffDescription,
      setupChapterNodeIds: p.setupChapterNodeIds, payoffChapterNodeIds: p.payoffChapterNodeIds,
      setupChapterOrders: chapterOrders(p.setupChapterNodeIds), payoffChapterOrders: chapterOrders(p.payoffChapterNodeIds),
      state: mapped.ledgerItemId ? "linked" : "planned"};
  });
  return {binding, mapping, plans};
}
