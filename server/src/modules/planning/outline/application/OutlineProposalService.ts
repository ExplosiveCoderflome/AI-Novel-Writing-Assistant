import { randomUUID } from "node:crypto";
import { outlineInitialGeneratePrompt, outlineEditProposalPrompt } from "../../../../prompting/prompts/outline/outline.prompts";
import { runStructuredPrompt } from "../../../../prompting/core/promptRunner";
import { validateOutlineDocument } from "../domain/outlineDocument";
import { createEmptyOutlineDocument } from "../domain/outlineDocument";
import { OutlineRepository } from "../infrastructure/OutlineRepository";
import { AppError } from "../../../../middleware/errorHandler";

export class OutlineProposalService {
  constructor(private readonly repository: OutlineRepository) {}
  async generate(projectId: string, request: { kind: "edit" | "initial_generation"; requestText: string; scope?: string }) {
    const current = await this.repository.getCurrent(projectId);
    if (!current || !current.revision) throw new Error("大纲项目不存在");
    const document = validateOutlineDocument(JSON.parse(current.revision.documentJson));
    const baseVersion = current.project.currentVersion;
    const result = request.kind === "initial_generation"
      ? await runStructuredPrompt({ asset: outlineInitialGeneratePrompt, promptInput: { idea: request.requestText, rough: true } })
      : await runStructuredPrompt({ asset: outlineEditProposalPrompt, promptInput: { request: request.requestText, baseVersion, document, scope: request.scope ?? "story" } });
    const latest = await this.repository.getCurrent(projectId);
    const stale = !latest || latest.project.currentVersion !== baseVersion;
    return this.repository.createProposal({ id: randomUUID(), projectId, baseVersion, kind: request.kind, status: stale ? "stale" : "pending", requestText: request.requestText, proposalJson: JSON.stringify(result.output), promptId: result.meta.invocation.promptId, promptVersion: result.meta.invocation.promptVersion });
  }
  async apply(projectId: string, proposalId: string, operationIds: string[]) {
    const proposal = await this.repository.findProposal(projectId, proposalId);
    if (!proposal || !["pending"].includes(proposal.status)) throw new AppError("此提案不可采纳", 409, "请重新生成提案后再采纳。");
    const current = await this.repository.getCurrent(projectId);
    if (!current || current.project.currentVersion !== proposal.baseVersion) throw new AppError("大纲已更新，请重新生成提案。", 409);
    const payload = JSON.parse(proposal.proposalJson) as { operations: Array<{ operationId: string; kind: string; nodeType?: string; nodeId?: string; clientRef?: string; parentNodeId?: string; fields?: Record<string, unknown>; dependsOn: string[] }> };
    if (proposal.kind === "initial_generation") {
      const initial = JSON.parse(proposal.proposalJson) as { storyFields: Record<string, unknown>; volumes: Array<Record<string, any>>; chapters: Array<Record<string, any>>; characters: Array<Record<string, any>>; payoffs: Array<Record<string, any>>; facts: Array<Record<string, any>> };
      const refs = new Map<string, string>();
      for (const item of [...initial.volumes, ...initial.chapters, ...initial.characters, ...initial.payoffs, ...initial.facts]) refs.set(item.clientRef, randomUUID());
      const document = createEmptyOutlineDocument(String(initial.storyFields.title ?? "新大纲"));
      Object.assign(document.story, initial.storyFields);
      document.volumes = initial.volumes.map((x,index)=>({ nodeId: refs.get(x.clientRef)!, title: x.title, summary: x.summary, order: index, planningDepth: x.planningDepth, chapterNodeIds: [] }));
      document.chapters = initial.chapters.map((x,index)=>({ nodeId: refs.get(x.clientRef)!, volumeNodeId: refs.get(x.volumeRef) ?? document.volumes[0]?.nodeId ?? "", title: x.title, summary: x.summary, order: index, planningDepth: x.planningDepth, characterNodeIds: [], payoffNodeIds: [] })).filter(x=>!!x.volumeNodeId);
      document.volumes.forEach(volume=>volume.chapterNodeIds=document.chapters.filter(chapter=>chapter.volumeNodeId===volume.nodeId).map(chapter=>chapter.nodeId));
      document.characters = initial.characters.map(x=>({ nodeId: refs.get(x.clientRef)!, name: x.title, role: x.role, appearanceNodeIds: [] }));
      document.payoffs = initial.payoffs.map(x=>({ nodeId: refs.get(x.clientRef)!, title: x.title, kind: "other", setupDescription: x.setupDescription ?? x.summary, payoffDescription: x.payoffDescription ?? "", setupChapterNodeIds: [], payoffChapterNodeIds: [], relatedNodeIds: [] }));
      document.facts = initial.facts.map(x=>({ nodeId: refs.get(x.clientRef)!, title: x.title, content: x.content ?? x.summary, scope: { type: "story" }, relatedNodeIds: [], immutable: false }));
      return this.repository.applyInitialProposal(projectId, proposalId, proposal.baseVersion, document);
    }
    const selected = new Set(operationIds.length ? operationIds : payload.operations.map(x=>x.operationId));
    for (const operation of payload.operations.filter(x=>selected.has(x.operationId))) if (operation.dependsOn.some(id=>!selected.has(id))) throw new Error("所选操作缺少依赖项");
    const document = validateOutlineDocument(JSON.parse(current.revision!.documentJson));
    return this.repository.applyOutlineProposal(projectId, proposalId, proposal.baseVersion, selected, document, payload.operations);
  }
  get(projectId: string, proposalId: string) { return this.repository.findProposal(projectId, proposalId); }
  async reject(projectId: string, proposalId: string) {
    const proposal = await this.repository.findProposal(projectId, proposalId);
    if (!proposal || proposal.status !== "pending") throw new Error("此提案不可放弃");
    return this.repository.updateProposalStatus(proposalId, "rejected");
  }
}
