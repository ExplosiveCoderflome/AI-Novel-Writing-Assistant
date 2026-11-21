import { createHash, randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { validateOutlineDocument } from "../domain/outlineDocument";
import { impactDialogueReviewSchema, impactRoles, type ImpactRequest, type ImpactReview, type ImpactRole, type ImpactSnapshot, type ImpactSubmission, type ImpactSummary } from "@ai-novel/shared/types/outlineCharacterImpact";
import { AgentConversationStore, agentReplyLive } from "../../../agentConversation";
import { characterDialoguePrompt, characterImpactPrompt } from "../../../../prompting/prompts/outline/characterImpact.prompt";
import { AppError } from "../../../../middleware/errorHandler";
import { runOutlineProposalStructuredCall } from "../application/outlineProposalStructuredCall";
import { mapOutlineGenerateFailure } from "../application/OutlineProposalService";
import { composeImpact, reviewHandoff } from "./compose";
import { readWrittenChapterIds } from "./writtenChapters";

const reviewStages: Record<ImpactRole, string> = {character: "正在梳理人物动机…", plot: "正在核对相关卷章…", payoff: "正在综合伏笔与人物修改…"};

export interface ImpactDialogueContext {
  scopeKey: string;
  turnId: string;
  conversationHistory: { author: string; assistant: string | null }[];
  priorProposalId?: string;
}

export class CharacterImpactService {
  constructor(private readonly db: PrismaClient) {}

  async context(projectId: string, characterId: string, baseVersion: number): Promise<ImpactSnapshot> {
    const project = await this.db.outlineProject.findUnique({where: {id: projectId}, select: {currentVersion: true, currentRevisionId: true, status: true}});
    if (!project || project.status !== "active") throw new AppError("找不到可编辑的大纲。", 404);
    if (project.currentVersion !== baseVersion) throw new AppError("大纲已有新修订，请按最新版本重新分析。", 409);
    const revision = await this.db.outlineRevision.findFirstOrThrow({where: {projectId, version: baseVersion, id: project.currentRevisionId!}});
    const document = validateOutlineDocument(JSON.parse(revision.documentJson));
    const character = document.characters.find(person => person.nodeId === characterId);
    if (!character) throw new AppError("本版大纲中找不到选中的人物。", 404);
    const [parent, writtenChapterIds] = await Promise.all([
      revision.parentRevisionId ? this.db.outlineRevision.findFirst({where: {projectId, id: revision.parentRevisionId}, select: {documentJson: true}}) : null,
      readWrittenChapterIds(this.db, projectId),
    ]);
    const previous = parent && validateOutlineDocument(JSON.parse(parent.documentJson)).characters.find(person => person.nodeId === characterId);
    const recentCharacterChanges: ImpactSnapshot["recentCharacterChanges"] = [];
    if (previous) {
      for (const field of ["name", "role", "goal", "motivation", "conflict", "secret", "arcDirection"] as const) {
        const before = previous[field] ?? "";
        const after = character[field] ?? "";
        if (before !== after) recentCharacterChanges.push({field, before, after});
      }
    }
    return {projectId, characterId, baseVersion, document, writtenChapterIds, recentCharacterChanges};
  }

  async generate(projectId: string, request: ImpactRequest & {priorProposalId?: string}, dialogue?: ImpactDialogueContext) {
    const snapshot = await this.context(projectId, request.characterId, request.baseVersion);
    let previousProposal;
    let replacesPending = false;
    if (request.priorProposalId) {
      const previous = await this.db.outlineProposal.findFirst({where: {id: request.priorProposalId, projectId,
        kind: "character_impact", ...(dialogue ? {} : {baseVersion: snapshot.baseVersion, status: "pending"})}});
      const payload = previous && JSON.parse(previous.proposalJson);
      if (payload?.impact.characterId !== request.characterId) throw new AppError("原建议与当前人物或版本不符，请刷新待审建议。", 409);
      if (!previous || (dialogue && !["pending", "applied", "partially_applied"].includes(previous.status))) {
        throw new AppError("请基于仍可讨论的提案继续。", 409);
      }
      replacesPending = previous.status === "pending" && previous.baseVersion === snapshot.baseVersion;
      previousProposal = {requestText: previous.requestText, operations: payload.operations, retained: payload.impact.retained,
        ...(dialogue && {status: previous.status, baseVersion: previous.baseVersion, appliedOperationIds: payload.impact.appliedOperationIds})};
    }
    const reviews: Partial<Record<ImpactRole, ImpactReview>> = {};
    let reply: { replyText: string; responseKind: "explanation" | "proposal" } | undefined;
    for (const role of impactRoles) {
      if (dialogue && !await this.db.agentConversationTurn.count({where: {id: dialogue.turnId, scopeKey: dialogue.scopeKey, status: "running"}})) {
        throw new AppError("本轮讨论已结束。", 409);
      }
      try {
        const promptInput = {snapshot, requestText: request.requestText, role, prior: {...reviews}, previousProposal,
          ...(dialogue && {conversationHistory: dialogue.conversationHistory})};
        let stageReview: ImpactReview;
        if (dialogue) {
          const result = await agentReplyLive.during(dialogue.turnId, reviewStages[role], role === "payoff", itemKey =>
            runOutlineProposalStructuredCall({asset: characterDialoguePrompt, promptInput, options: {itemKey}}));
          const {replyText, responseKind, ...review} = impactDialogueReviewSchema.parse(result.output);
          stageReview = review;
          reply = {replyText, responseKind};
        } else {
          stageReview = (await runOutlineProposalStructuredCall({asset: characterImpactPrompt, promptInput})).output;
        }
        reviews[role] = reviewHandoff(stageReview, reviews);
        composeImpact(snapshot, reviews, "workbench");
      } catch (error) { throw mapOutlineGenerateFailure(error, "edit"); }
    }
    return this.store(projectId, request, reviews, "workbench", dialogue && reply ? { ...dialogue, ...reply, replacesPending } : undefined);
  }

  submit(projectId: string, submission: ImpactSubmission) {
    return this.store(projectId, submission, submission.reviews, "external");
  }

  private async store(projectId: string, request: ImpactRequest, reviews: Partial<Record<ImpactRole, ImpactReview>>, origin: ImpactSummary["origin"], dialogue?: ImpactDialogueContext & { replyText: string; responseKind: "explanation" | "proposal"; replacesPending: boolean }) {
    const snapshot = await this.context(projectId, request.characterId, request.baseVersion);
    const payload = composeImpact(snapshot, reviews, origin);
    const data = {
      projectId, characterNodeId: request.characterId, baseVersion: snapshot.baseVersion, status: "pending", kind: "character_impact",
      requestText: request.requestText, proposalJson: JSON.stringify(payload),
      ...(origin === "workbench" ? {promptId: characterImpactPrompt.id, promptVersion: dialogue ? characterDialoguePrompt.version : characterImpactPrompt.version} : {}),
    };
    return this.db.$transaction(async tx => {
      // Serialize publication with revision saves, after all model calls have finished.
      const current = await tx.outlineProject.findUniqueOrThrow({where: {id: projectId}, select: {updatedAt: true}});
      const guard = await tx.outlineProject.updateMany({where: {id: projectId, currentVersion: snapshot.baseVersion, status: "active"},
        data: {currentVersion: {increment: 0}, updatedAt: current.updatedAt}});
      if (!guard.count) throw new AppError("大纲已有新修订，请按最新版本重新分析。", 409);
      if (origin === "external") {
        const id = createHash("sha256").update(JSON.stringify([projectId, snapshot.baseVersion, request.characterId, request.requestText, reviews])).digest("hex");
        return tx.outlineProposal.upsert({where: {id}, create: {...data, id}, update: {}});
      }
      if (dialogue?.responseKind === "explanation") {
        await AgentConversationStore.complete(tx, dialogue.scopeKey, dialogue.turnId, null, dialogue.replyText);
        return null;
      }
      if (dialogue?.priorProposalId && dialogue.replacesPending) {
        const parent = await tx.outlineProposal.updateMany({ where: { id: dialogue.priorProposalId, projectId,
          baseVersion: snapshot.baseVersion, kind: "character_impact", status: "pending" }, data: { status: "superseded" } });
        if (!parent.count) throw new AppError("上一版提案已处理，请刷新后再发起讨论。", 409);
      }
      const proposal = await tx.outlineProposal.create({data: {...data, id: randomUUID()}});
      if (dialogue) {
        await AgentConversationStore.complete(tx, dialogue.scopeKey, dialogue.turnId, proposal.id, dialogue.replyText);
      }
      return proposal;
    });
  }

  async pending(projectId: string, characterId: string, baseVersion: number) {
    const rows = await this.db.outlineProposal.findMany({
      where: {projectId, kind: "character_impact", status: "pending", baseVersion}, orderBy: [{createdAt: "desc"}, {id: "desc"}],
    });
    return rows.filter(row => JSON.parse(row.proposalJson).impact.characterId === characterId);
  }
}
