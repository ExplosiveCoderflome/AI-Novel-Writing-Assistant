import type { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { validateOutlineDocument } from "../domain/outlineDocument";

export class OutlineRepository {
  constructor(private readonly db: PrismaClient) {}
  list() { return this.db.outlineProject.findMany({ where: { status: "active" }, orderBy: { updatedAt: "desc" } }); }
  get(id: string) { return this.db.outlineProject.findUnique({ where: { id } }); }
  async getCurrent(id: string) {
    const project = await this.db.outlineProject.findUnique({ where: { id } });
    if (!project) return null;
    const revision = project.currentRevisionId ? await this.db.outlineRevision.findUnique({ where: { id: project.currentRevisionId } }) : null;
    return { project, revision };
  }
  listRevisionRows(projectId: string) { return this.db.outlineRevision.findMany({ where: { projectId }, orderBy: { version: "desc" } }); }
  findRevision(projectId: string, id: string) { return this.db.outlineRevision.findFirst({ where: { id, projectId } }); }
  findRevisions(projectId: string, versions: number[]) { return this.db.outlineRevision.findMany({ where: { projectId, version: { in: versions } } }); }
  findProposal(projectId: string, id: string) { return this.db.outlineProposal.findFirst({ where: { id, projectId } }); }
  createProposal(data: Parameters<PrismaClient["outlineProposal"]["create"]>[0]["data"]) { return this.db.outlineProposal.create({ data }); }
  async applyOutlineProposal(projectId: string, proposalId: string, baseVersion: number, selected: Set<string>, source: ReturnType<typeof validateOutlineDocument>, operations: Array<{operationId:string;kind:string;nodeType?:string;nodeId?:string;clientRef?:string;parentNodeId?:string;fields?:Record<string,unknown>;dependsOn:string[]}>) {
    return this.db.$transaction(async tx => {
      const project = await tx.outlineProject.findUnique({ where: { id: projectId } });
      const proposal = await tx.outlineProposal.findUnique({ where: { id: proposalId } });
      if (!project || project.currentVersion !== baseVersion || !proposal || proposal.status !== "pending") throw new Error("OUTLINE_PROPOSAL_STALE");
      const doc = structuredClone(source) as any;
      const refs = new Map<string,string>();
      for (const op of operations.filter(x=>selected.has(x.operationId) && x.kind === "add_node")) refs.set(op.clientRef ?? "", randomUUID());
      const groups: Record<string, any[]> = { volume: doc.volumes, chapter: doc.chapters, character: doc.characters, payoff: doc.payoffs, fact: doc.facts };
      for (const op of operations.filter(x=>selected.has(x.operationId))) {
        if (op.kind === "add_node" && op.nodeType) {
          const id = refs.get(op.clientRef ?? "")!;
          const fields = structuredClone(op.fields ?? {}) as Record<string, unknown>;
          for (const [key, value] of Object.entries(fields)) if (typeof value === "string" && refs.has(value)) fields[key] = refs.get(value);
          groups[op.nodeType].push({ nodeId: id, order: groups[op.nodeType].length, planningDepth: "rough", chapterNodeIds: [], characterNodeIds: [], payoffNodeIds: [], appearanceNodeIds: [], setupChapterNodeIds: [], payoffChapterNodeIds: [], relatedNodeIds: [], scope: { type: "story" }, immutable: false, ...fields });
        } else if (op.kind === "update_fields" && op.nodeId && op.fields) {
          const node = Object.values(groups).flat().find(item=>item.nodeId===op.nodeId);
          if (!node) throw new Error("提案目标节点不存在");
          Object.assign(node, op.fields);
        } else if (op.kind === "remove_node" && op.nodeId) {
          for (const nodes of Object.values(groups)) { const index = nodes.findIndex(item=>item.nodeId===op.nodeId); if (index>=0) nodes.splice(index,1); }
        } else if (op.kind === "move_node" && op.nodeId && op.parentNodeId) {
          const chapter = doc.chapters.find((item:any)=>item.nodeId===op.nodeId);
          if (!chapter) throw new Error("当前仅支持移动章节");
          chapter.volumeNodeId = op.parentNodeId;
        }
      }
      for (const volume of doc.volumes) volume.chapterNodeIds = doc.chapters.filter((chapter:any)=>chapter.volumeNodeId===volume.nodeId).map((chapter:any)=>chapter.nodeId);
      const document = validateOutlineDocument(doc);
      const revision = await tx.outlineRevision.create({ data: { id: randomUUID(), projectId, version: baseVersion + 1, parentRevisionId: project.currentRevisionId, documentJson: JSON.stringify(document), sourceType: "proposal", sourceProposalId: proposalId } });
      const update = await tx.outlineProject.updateMany({ where: { id: projectId, currentVersion: baseVersion }, data: { currentVersion: baseVersion + 1, currentRevisionId: revision.id } });
      if (update.count !== 1) throw new Error("OUTLINE_VERSION_CONFLICT");
      await tx.outlineProposal.update({ where: { id: proposalId }, data: { status: selected.size === operations.length ? "applied" : "partially_applied" } });
      return { revision, document };
    });
  }
  create(data: Parameters<PrismaClient["outlineProject"]["create"]>[0]) { return this.db.outlineProject.create(data); }
  transaction<T>(run: (tx: Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends">) => Promise<T>) { return this.db.$transaction(run); }
}
