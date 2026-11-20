import { createHash, randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { validateOutlineDocument } from "../domain/outlineDocument";
import { impactRoles, type ImpactRequest, type ImpactReview, type ImpactRole, type ImpactSnapshot, type ImpactSubmission, type ImpactSummary } from "@ai-novel/shared/types/outlineCharacterImpact";
import { characterImpactPrompt } from "../../../../prompting/prompts/outline/characterImpact.prompt";
import { AppError } from "../../../../middleware/errorHandler";
import { runOutlineProposalStructuredCall } from "../application/outlineProposalStructuredCall";
import { mapOutlineGenerateFailure } from "../application/OutlineProposalService";
import { composeImpact } from "./compose";
import { readWrittenChapterIds } from "./writtenChapters";

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

  async generate(projectId: string, request: ImpactRequest & {priorProposalId?: string}) {
    const snapshot = await this.context(projectId, request.characterId, request.baseVersion);
    let previousProposal;
    if (request.priorProposalId) {
      const previous = await this.db.outlineProposal.findFirst({where: {id: request.priorProposalId, projectId,
        baseVersion: snapshot.baseVersion, kind: "character_impact", status: "pending"}});
      const payload = previous && JSON.parse(previous.proposalJson);
      if (payload?.impact.characterId !== request.characterId) throw new AppError("原建议与当前人物或版本不符，请刷新待审建议。", 409);
      previousProposal = {requestText: previous!.requestText, operations: payload.operations, retained: payload.impact.retained};
    }
    const reviews: Partial<Record<ImpactRole, ImpactReview>> = {};
    for (const role of impactRoles) {
      try {
        const result = await runOutlineProposalStructuredCall({asset: characterImpactPrompt,
          promptInput: {snapshot, requestText: request.requestText, role, prior: {...reviews}, previousProposal}});
        reviews[role] = result.output;
        composeImpact(snapshot, reviews, "workbench");
      } catch (error) { throw mapOutlineGenerateFailure(error, "edit"); }
    }
    return this.store(projectId, request, reviews, "workbench");
  }

  submit(projectId: string, submission: ImpactSubmission) {
    return this.store(projectId, submission, submission.reviews, "external");
  }

  private async store(projectId: string, request: ImpactRequest, reviews: Partial<Record<ImpactRole, ImpactReview>>, origin: ImpactSummary["origin"]) {
    const snapshot = await this.context(projectId, request.characterId, request.baseVersion);
    const payload = composeImpact(snapshot, reviews, origin);
    const data = {
      projectId, baseVersion: snapshot.baseVersion, status: "pending", kind: "character_impact",
      requestText: request.requestText, proposalJson: JSON.stringify(payload),
      ...(origin === "workbench" ? {promptId: characterImpactPrompt.id, promptVersion: characterImpactPrompt.version} : {}),
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
      return tx.outlineProposal.create({data: {...data, id: randomUUID()}});
    });
  }

  async pending(projectId: string, characterId: string, baseVersion: number) {
    const rows = await this.db.outlineProposal.findMany({
      where: {projectId, kind: "character_impact", status: "pending", baseVersion}, orderBy: [{createdAt: "desc"}, {id: "desc"}],
    });
    return rows.filter(row => JSON.parse(row.proposalJson).impact.characterId === characterId);
  }
}
