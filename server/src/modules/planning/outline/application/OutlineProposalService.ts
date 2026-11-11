import { randomUUID } from "node:crypto";
import { outlineInitialGeneratePrompt, outlineEditProposalPrompt } from "../../../../prompting/prompts/outline/outline.prompts";
import { runStructuredPrompt } from "../../../../prompting/core/promptRunner";
import { validateOutlineDocument } from "../domain/outlineDocument";
import { OutlineRepository } from "../infrastructure/OutlineRepository";

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
    if (!proposal || !["pending"].includes(proposal.status)) throw new Error("此提案不可采纳");
    const current = await this.repository.getCurrent(projectId);
    if (!current || current.project.currentVersion !== proposal.baseVersion) throw new Error("OUTLINE_PROPOSAL_STALE");
    if (proposal.kind === "initial_generation") throw new Error("初版生成提案的采纳映射尚未完成");
    const payload = JSON.parse(proposal.proposalJson) as { operations: Array<{ operationId: string; kind: string; nodeType?: string; nodeId?: string; clientRef?: string; parentNodeId?: string; fields?: Record<string, unknown>; dependsOn: string[] }> };
    const selected = new Set(operationIds.length ? operationIds : payload.operations.map(x=>x.operationId));
    for (const operation of payload.operations.filter(x=>selected.has(x.operationId))) if (operation.dependsOn.some(id=>!selected.has(id))) throw new Error("所选操作缺少依赖项");
    const document = validateOutlineDocument(JSON.parse(current.revision!.documentJson));
    return this.repository.applyOutlineProposal(projectId, proposalId, proposal.baseVersion, selected, document, payload.operations);
  }
}
