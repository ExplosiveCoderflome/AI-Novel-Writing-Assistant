import { randomUUID } from "node:crypto";
import { outlineInitialGeneratePrompt, outlineEditProposalPrompt } from "../../../../prompting/prompts/outline/outline.prompts";
import { runOutlineProposalStructuredCall } from "./outlineProposalStructuredCall";
import {
  extractStructuredOutputErrorCategory,
  StructuredOutputError,
} from "../../../../llm/structuredOutput";
import { validateOutlineDocument } from "../domain/outlineDocument";
import { createEmptyOutlineDocument } from "../domain/outlineDocument";
import {
  assertValidOutlineEditOperations,
  mapOutlineApplyFailure,
  type OutlineEditOperation,
} from "../domain/outlineEditOperations";
import { OutlineRepository } from "../infrastructure/OutlineRepository";
import { AppError } from "../../../../middleware/errorHandler";

export function mapOutlineGenerateFailure(error: unknown, kind: "edit" | "initial_generation"): unknown {
  if (error instanceof AppError) return error;
  const category = error instanceof StructuredOutputError
    ? error.category
    : extractStructuredOutputErrorCategory(error instanceof Error ? error.message : String(error ?? ""));
  if (!category) return error;
  const noun = kind === "edit" ? "修改建议" : "大纲建议";
  switch (category) {
    case "schema_mismatch": {
      const stripped = (error instanceof Error ? error.message : String(error ?? ""))
        .replace(/\[STRUCTURED_OUTPUT:[^\]]+\]\s*/g, "")
        .replace(/\[[^\]]+@v\d+\]\s*/g, "")
        .trim();
      const marker = stripped.lastIndexOf("错误：");
      const rawDetail = (marker >= 0 ? stripped.slice(marker + "错误：".length) : stripped).replace(/^[-\s]+/, "").trim();
      const detail = rawDetail.replace(/[。]+$/, "");
      return detail
        ? new AppError(`模型返回的${noun}格式有误，自动修复后仍未通过校验：${detail}。请重新生成提案。`, 400)
        : new AppError(`模型返回的${noun}格式有误，自动修复后仍未通过校验。请重新生成提案。`, 400);
    }
    case "incomplete_json":
    case "malformed_json":
      return new AppError(`模型返回的${noun}不完整，未能通过校验。请重新生成提案。`, 400);
    case "output_budget_exhausted":
    case "reasoning_budget_exhausted":
      return new AppError(
        kind === "edit"
          ? "这次要生成的内容较多，超出了单次输出上限。请分批提出修改（例如先改前几卷），或调高模型路线的输出上限后重试。"
          : "这次要生成的内容较多，超出了单次输出上限。请先生成部分内容（例如先定卷和前几章），或调高模型路线的输出上限后重试。",
        400,
      );
    case "empty_response":
      return new AppError("模型没有返回内容，请重新生成提案。", 400);
    case "thinking_pollution":
      return new AppError(`模型返回的${noun}中混入了思考过程，未能通过校验。请重新生成提案，或在厂商设置里关闭深度思考后重试。`, 400);
    case "unsupported_native_json":
      return new AppError("当前模型不支持本次需要的结构化输出格式，请换一个模型后重试。", 400);
    case "transport_error":
      return new AppError("连接模型服务时发生网络错误，请检查模型服务后重试。", 502);
    case "model_unavailable":
      return new AppError("模型服务暂时不可用，请稍后重试。", 502);
    default:
      return error;
  }
}

export class OutlineProposalService {
  constructor(private readonly repository: OutlineRepository) {}
  async generate(projectId: string, request: { kind: "edit" | "initial_generation"; requestText: string; scope?: string }) {
    const current = await this.repository.getCurrent(projectId);
    if (!current || !current.revision) throw new AppError("大纲项目不存在", 404);
    const document = validateOutlineDocument(JSON.parse(current.revision.documentJson));
    const baseVersion = current.project.currentVersion;
    let result: Awaited<ReturnType<typeof runOutlineProposalStructuredCall>>;
    try {
      result = request.kind === "initial_generation"
        ? await runOutlineProposalStructuredCall({ asset: outlineInitialGeneratePrompt, promptInput: { idea: request.requestText, rough: true } })
        : await runOutlineProposalStructuredCall({ asset: outlineEditProposalPrompt, promptInput: { request: request.requestText, baseVersion, document, scope: request.scope ?? "story" } });
    } catch (error) {
      throw mapOutlineGenerateFailure(error, request.kind);
    }
    if (request.kind === "edit") {
      const operations = (result.output as { operations: OutlineEditOperation[] }).operations;
      assertValidOutlineEditOperations(operations, { document });
    }
    const latest = await this.repository.getCurrent(projectId);
    const stale = !latest || latest.project.currentVersion !== baseVersion;
    return this.repository.createProposal({ id: randomUUID(), projectId, baseVersion, kind: request.kind, status: stale ? "stale" : "pending", requestText: request.requestText, proposalJson: JSON.stringify(result.output), promptId: result.meta.invocation.promptId, promptVersion: result.meta.invocation.promptVersion });
  }
  async apply(projectId: string, proposalId: string, operationIds: string[], feedbackAuthorized = false) {
    const proposal = await this.repository.findProposal(projectId, proposalId);
    if (proposal?.kind === "text_feedback" && !feedbackAuthorized) throw new AppError("请从章节反馈逐项采纳建议。", 409);
    if (!proposal || !["pending"].includes(proposal.status)) throw new AppError("此提案不可采纳", 409, "请重新生成提案后再采纳。");
    const current = await this.repository.getCurrent(projectId);
    if (!current || current.project.currentVersion !== proposal.baseVersion) throw new AppError("大纲已更新，请重新生成提案。", 409);
    const payload = JSON.parse(proposal.proposalJson) as { operations: OutlineEditOperation[] };
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
    const document = validateOutlineDocument(JSON.parse(current.revision!.documentJson));
    const selectedIds = operationIds.length ? operationIds : payload.operations.map((operation) => operation.operationId);
    try {
      assertValidOutlineEditOperations(payload.operations, { document, selectedOperationIds: selectedIds });
      return await this.repository.applyOutlineProposal(
        projectId,
        proposalId,
        proposal.baseVersion,
        new Set(selectedIds),
        document,
        payload.operations,
      );
    } catch (error) {
      mapOutlineApplyFailure(error);
    }
  }
  get(projectId: string, proposalId: string) { return this.repository.findProposal(projectId, proposalId); }
  async reject(projectId: string, proposalId: string) {
    const proposal = await this.repository.findProposal(projectId, proposalId);
    if (proposal?.kind === "text_feedback") throw new AppError("请从章节反馈逐项拒绝建议。", 409);
    if (!proposal || proposal.status !== "pending") throw new AppError("此提案不可放弃", 409);
    return this.repository.updateProposalStatus(proposalId, "rejected");
  }
}
