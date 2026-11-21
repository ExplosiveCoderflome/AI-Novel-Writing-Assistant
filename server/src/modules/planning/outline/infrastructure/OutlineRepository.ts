import type { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { validateOutlineDocument } from "../domain/outlineDocument";
import { readWrittenChapterIds } from "../characterImpact/writtenChapters";
import { AppError } from "../../../../middleware/errorHandler";

export class OutlineRepository {
  constructor(private readonly db: PrismaClient, private readonly inTransaction = false) {}
  list() { return this.db.outlineProject.findMany({ where: { status: "active" }, orderBy: { updatedAt: "desc" } }); }
  archive(id: string) { return this.db.outlineProject.update({ where: { id }, data: { status: "archived" } }); }
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
  async listPendingProposals(projectId: string) {
    const rows = await this.db.outlineProposal.findMany({
      where: { projectId, status: "pending", kind: { in: ["character_impact", "chapter_edit", "volume_edit", "volume_beats", "edit", "initial_generation"] } },
      select: { id: true, kind: true, baseVersion: true, characterNodeId: true, requestText: true, proposalJson: true },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
    return rows.map(({ proposalJson, characterNodeId, ...row }) => {
      const payload = JSON.parse(proposalJson);
      const targetNodeIds = (payload.operations ?? []).flatMap((op: { nodeId?: string }) => op.nodeId ? [op.nodeId] : []);
      return { ...row, volumeId: payload.volumeId ?? null, chapterId: payload.chapterId ?? null, targetNodeIds: [...new Set(targetNodeIds)], characterId: characterNodeId ?? payload.impact?.characterId ?? null, title: payload.storyFields?.title ?? null };
    });
  }
  findProposal(projectId: string, id: string) { return this.db.outlineProposal.findFirst({ where: { id, projectId } }); }
  async updateProposalStatus(id: string, status: string) {
    const result = await this.db.outlineProposal.updateMany({where: {id, status: "pending"}, data: {status}});
    if (!result.count) throw new AppError("这份提案已处理，请刷新建议。", 409);
    return this.db.outlineProposal.findUniqueOrThrow({where: {id}});
  }
  createProposal(data: Parameters<PrismaClient["outlineProposal"]["create"]>[0]["data"]) { return this.db.outlineProposal.create({ data }); }
  async createImport(title: string, document: ReturnType<typeof validateOutlineDocument>, sourceText: string) {
    const id = randomUUID();
    return this.db.$transaction(async tx=>{
      const project = await tx.outlineProject.create({ data: { id, title, currentVersion: 1 } });
      const revision = await tx.outlineRevision.create({ data: { id: randomUUID(), projectId: id, version: 1, documentJson: JSON.stringify(document), sourceType: "import" } });
      const proposal = await tx.outlineProposal.create({ data: { id: randomUUID(), projectId: id, baseVersion: 1, kind: "import_parse", status: "applied", proposalJson: JSON.stringify(document), sourceText } });
      const updated = await tx.outlineProject.update({ where: { id }, data: { currentRevisionId: revision.id } });
      return { project: updated, revision, proposal };
    });
  }
  async saveImport(projectId: string, expectedVersion: number, document: ReturnType<typeof validateOutlineDocument>, sourceText: string) {
    return this.db.$transaction(async tx=>{
      const project = await tx.outlineProject.findUnique({ where: { id: projectId } });
      if (!project || project.currentVersion !== expectedVersion) throw new Error("OUTLINE_VERSION_CONFLICT");
      const proposalId = randomUUID();
      const revision = await tx.outlineRevision.create({ data: { id: randomUUID(), projectId, version: expectedVersion+1, parentRevisionId: project.currentRevisionId, documentJson: JSON.stringify(document), sourceType: "import", sourceProposalId: proposalId } });
      const proposal = await tx.outlineProposal.create({ data: { id: proposalId, projectId, baseVersion: expectedVersion, kind: "import_parse", status: "applied", proposalJson: JSON.stringify(document), sourceText } });
      const result = await tx.outlineProject.updateMany({ where: { id: projectId, currentVersion: expectedVersion }, data: { currentVersion: expectedVersion+1, currentRevisionId: revision.id, title: document.story.title } });
      if (!result.count) throw new Error("OUTLINE_VERSION_CONFLICT");
      return { revision, proposal };
    });
  }
  async applyOutlineProposal(projectId: string, proposalId: string, baseVersion: number, selected: Set<string>, source: ReturnType<typeof validateOutlineDocument>, operations: Array<{operationId:string;kind:string;nodeType?:string;nodeId?:string;clientRef?:string;parentNodeId?:string;fields?:Record<string,unknown>;dependsOn:string[]}>) {
    return this.transaction(async tx => {
      const project = await tx.outlineProject.findUnique({ where: { id: projectId } });
      const proposal = await tx.outlineProposal.findUnique({ where: { id: proposalId } });
      if (!project || project.currentVersion !== baseVersion || !proposal || proposal.status !== "pending") throw new Error("OUTLINE_PROPOSAL_STALE");
      if (proposal.kind === "character_impact" || proposal.kind === "chapter_edit") {
        const written = new Set(await readWrittenChapterIds(tx, projectId));
        if (operations.some(op => selected.has(op.operationId) && op.nodeId && written.has(op.nodeId))) {
          throw new AppError("所选章节已有正文，请保留该章或重新分析后续章节。", 409);
        }
      }
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
          const node = doc.story.nodeId === op.nodeId ? doc.story : Object.values(groups).flat().find(item=>item.nodeId===op.nodeId);
          if (!node) throw new Error("提案目标节点不存在");
          Object.assign(node, op.fields);
        } else if (op.kind === "remove_node" && op.nodeId) {
          for (const nodes of Object.values(groups)) { const index = nodes.findIndex(item=>item.nodeId===op.nodeId); if (index>=0) nodes.splice(index,1); }
        } else if (op.kind === "move_node" && op.nodeId && op.parentNodeId) {
          const chapter = doc.chapters.find((item:any)=>item.nodeId===op.nodeId);
          if (!chapter) throw new Error("当前仅支持移动章节");
          if (chapter.volumeNodeId !== op.parentNodeId) delete chapter.beatKey;
          chapter.volumeNodeId = op.parentNodeId;
        }
      }
      if (proposal.kind !== "volume_edit") {
        for (const volume of doc.volumes) volume.chapterNodeIds = doc.chapters.filter((chapter:any)=>chapter.volumeNodeId===volume.nodeId).map((chapter:any)=>chapter.nodeId);
      }
      const document = validateOutlineDocument(doc);
      const revision = await tx.outlineRevision.create({ data: { id: randomUUID(), projectId, version: baseVersion + 1, parentRevisionId: project.currentRevisionId, documentJson: JSON.stringify(document), sourceType: "proposal", sourceProposalId: proposalId } });
      const update = await tx.outlineProject.updateMany({ where: { id: projectId, currentVersion: baseVersion }, data: { currentVersion: baseVersion + 1, currentRevisionId: revision.id, title: document.story.title } });
      if (update.count !== 1) throw new Error("OUTLINE_VERSION_CONFLICT");
      const payload = ["character_impact", "edit", "chapter_edit", "volume_edit"].includes(proposal.kind) ? JSON.parse(proposal.proposalJson) : null;
      if (proposal.kind === "character_impact") payload.impact.appliedOperationIds = [...selected];
      else if (payload) payload.appliedOperationIds = [...selected];
      const decided = await tx.outlineProposal.updateMany({ where: { id: proposalId, status: "pending" }, data: {
        status: selected.size === operations.length ? "applied" : "partially_applied",
        ...(payload && { proposalJson: JSON.stringify(payload) }),
      } });
      if (!decided.count) throw new Error("OUTLINE_PROPOSAL_STALE");
      return { revision, document };
    });
  }
  async applyInitialProposal(projectId: string, proposalId: string, baseVersion: number, input: ReturnType<typeof validateOutlineDocument>) {
    const document = validateOutlineDocument(input);
    return this.db.$transaction(async tx=>{
      const project = await tx.outlineProject.findUnique({ where: { id: projectId } });
      const proposal = await tx.outlineProposal.findUnique({ where: { id: proposalId } });
      if (!project || project.currentVersion !== baseVersion || !proposal || proposal.status !== "pending") throw new Error("OUTLINE_PROPOSAL_STALE");
      const revision = await tx.outlineRevision.create({ data: { id: randomUUID(), projectId, version: baseVersion+1, parentRevisionId: project.currentRevisionId, documentJson: JSON.stringify(document), sourceType: "initial_generation", sourceProposalId: proposalId } });
      const update = await tx.outlineProject.updateMany({ where: { id: projectId, status: "active", currentVersion: baseVersion }, data: { currentVersion: baseVersion+1, currentRevisionId: revision.id, title: document.story.title } });
      const decision = await tx.outlineProposal.updateMany({ where: { id: proposalId, projectId, status: "pending" }, data: { status: "applied" } });
      if (!update.count || !decision.count) throw new AppError("大纲或提案已更新，请刷新后确认。", 409);
      return { revision, document };
    });
  }
  create(data: Parameters<PrismaClient["outlineProject"]["create"]>[0]) { return this.db.outlineProject.create(data); }
  transaction<T>(run: (tx: Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends">) => Promise<T>): Promise<T> { return this.inTransaction ? run(this.db) : this.db.$transaction(run); }
}
