import {CharacterCandidateReviewRequiredError} from "../../runtime/artifactSync/ChapterArtifactSyncResult";
export {CharacterCandidateReviewRequiredError} from "../../runtime/artifactSync/ChapterArtifactSyncResult";
import type {Prisma} from "@prisma/client";
import type {DirectorCharacterCandidateItem, DirectorCharacterCandidatePage, DirectorCharacterCandidateReview, ResolveDirectorCharacterCandidates} from "@ai-novel/shared/types/director/characterCandidates";
import {prisma} from "../../../../db/prisma";
import {withSqliteRetry} from "../../../../db/sqliteRetry";
import {AppError} from "../../../../middleware/errorHandler";
import {assertNovelDirectorVersion, readRunExecutionEpoch} from "../../../../modules/novel/director-routing";
import type {ChapterArtifactDeltaOutput} from "../../../../prompting/prompts/novel/chapterArtifactDelta.prompts";
import {buildChapterArtifactContentHash} from "../../runtime/artifactSync/ChapterArtifactContentVersion";
import {canonicalizeCandidateReferences} from "./references";
import {writeCharacterAppearances} from "../appearances";
import {chapterArtifactDeltaOutputSchema} from "../../../../prompting/prompts/novel/chapterArtifactDelta.prompts";

const artifactType = (runId: string) => `director_v2_character_candidates:${runId}`;
const sourceType = "director_v2_character_candidates";
type StoredReview = DirectorCharacterCandidateReview & {schemaVersion: 1; driver: "auto" | "assisted"};
type CandidateInput = {novelId: string; chapterId: string; content: string; directorRunId: string};


function readReview(value: string | null): StoredReview {
  const review = JSON.parse(value || "null") as StoredReview | null;
  if (!review || review.schemaVersion !== 1 || !Array.isArray(review.items)) throw new AppError("人物确认记录无法读取。", 409);
  return review;
}

/** Owns only V2 chapter identity application. No LLM calls, V1 mutations or full-cast rebuilds. */
export class DirectorCharacterCandidateService {
  constructor(private readonly db = prisma) {}

  private async owner(runId: string, tx: Prisma.TransactionClient, novelId?: string) {
    const run = await tx.directorNextRun.findUnique({where: {id: runId}});
    if (!run || (novelId && run.novelId !== novelId)) throw new AppError("人物候选不属于本次创作。", 409);
    const contract = JSON.parse(run.contractJson) as {driver?: unknown};
    if (contract.driver !== "auto" && contract.driver !== "assisted") throw new AppError("本次创作方式无效。", 409);
    const epoch = readRunExecutionEpoch(run.contractJson);
    // Lock the book's ownership fence for this short transaction; never hold it during a model call.
    const lock = await tx.novel.updateMany({where: {id: run.novelId, directorEpoch: epoch}, data: {directorEpoch: {increment: 0}}});
    if (lock.count !== 1) throw new AppError("本书创作归属已变化。", 409);
    await assertNovelDirectorVersion(run.novelId, "v2", epoch, tx);
    const current = await tx.directorNextRun.findFirst({where: {novelId: run.novelId}, orderBy: [{createdAt: "desc"}, {id: "desc"}], select: {id: true}});
    if (current?.id !== runId) throw new AppError("请在本书当前创作中处理人物候选。", 409);
    return {...run, executionEpoch: epoch, driver: contract.driver as "auto" | "assisted"};
  }

  private async assertContent(tx: Prisma.TransactionClient, novelId: string, chapterId: string, hash: string) {
    const chapter = await tx.chapter.findFirst({where: {id: chapterId, novelId}, select: {order: true, content: true}});
    if (!chapter || buildChapterArtifactContentHash(chapter.content || "") !== hash) throw new AppError("本章正文已修改，请先同步当前正文的人物候选。", 409);
    const locked = await tx.chapter.updateMany({where: {id: chapterId, novelId, content: chapter.content}, data: {content: chapter.content}});
    if (locked.count !== 1) throw new AppError("本章正文已修改，请重新核对人物。", 409);
    return chapter;
  }

  async prepare(input: CandidateInput, output: ChapterArtifactDeltaOutput): Promise<ChapterArtifactDeltaOutput> {
    if (!output.characterCandidates.length) return output;
    const hash = buildChapterArtifactContentHash(input.content);
    const review = await withSqliteRetry(() => this.db.$transaction(async tx => {
      const run = await this.owner(input.directorRunId, tx, input.novelId);
      const control = await tx.directorNextRunControl.findUnique({where: {runId: run.id}});
      if (!control || !["running", "queued"].includes(control.status)) throw new AppError("本次创作未在执行，已停止人物回填。", 409);
      const locked = await tx.directorNextRunControl.updateMany({where: {runId: run.id, version: control.version, status: control.status}, data: {version: {increment: 0}}});
      if (!locked.count) throw new AppError("本次创作状态已变化，已停止人物回填。", 409);
      const chapter = await this.assertContent(tx, input.novelId, input.chapterId, hash);
      const identity = {novelId: input.novelId, chapterId: input.chapterId, contentHash: hash,
        artifactType: artifactType(run.id), syncMode: "identity"};
      const existing = await tx.chapterArtifactSyncCheckpoint.findUnique({where: {novelId_chapterId_contentHash_artifactType_syncMode: identity}});
      if (existing) return readReview(existing.metadataJson);
      const characters = await tx.character.findMany({where: {novelId: input.novelId}, select: {id: true, name: true}});
      const items: DirectorCharacterCandidateItem[] = [];
      for (const candidate of output.characterCandidates) {
        const target = characters.find(c => c.id === candidate.matchedCharacterId);
        const hasEvidence = candidate.evidence.some(e => input.content.replace(/\s+/g, " ").includes(e.replace(/\s+/g, " ")));
        const duplicateName = characters.some(c => c.name === candidate.proposedName)
          || output.characterCandidates.filter(c => c.proposedName === candidate.proposedName).length > 1;
        const valid = hasEvidence && !!candidate.decisionReason?.trim()
          && (candidate.identityDecision !== "merge" || !!target)
          && (candidate.identityDecision !== "create" || !duplicateName);
        const row = await tx.characterCandidate.create({data: {novelId: input.novelId, sourceChapterId: input.chapterId,
          proposedName: candidate.proposedName, proposedRole: candidate.proposedRole, summary: candidate.summary,
          evidenceJson: JSON.stringify(candidate.evidence), confidence: candidate.confidence, status: "v2_pending"}});
        const item: DirectorCharacterCandidateItem = {id: row.id, name: candidate.proposedName, role: candidate.proposedRole ?? null,
          summary: candidate.summary ?? null, evidence: candidate.evidence, recommendation: valid ? candidate.identityDecision : "defer",
          targetId: target?.id ?? null, reason: valid ? candidate.decisionReason! : "身份或正文证据需要核对，请选择如何处理。", status: "pending"};
        if (run.driver === "auto" && item.recommendation !== "defer") {
          await this.apply(tx, input.novelId, item, item.recommendation, item.targetId ?? undefined);
        }
        items.push(item);
      }
      const row = await tx.chapterArtifactSyncCheckpoint.create({data: {...identity, status: "succeeded", sourceType, sourceStage: String(run.executionEpoch)}});
      const saved: StoredReview = {schemaVersion: 1, id: row.id, revision: 0, driver: run.driver,
        chapterId: input.chapterId, chapterOrder: chapter.order, contentHash: hash,
        blocking: run.driver === "assisted" && items.some(i => i.status === "pending"), items};
      await tx.chapterArtifactSyncCheckpoint.update({where: {id: row.id}, data: {metadataJson: JSON.stringify(saved)}});
      return saved;
    }), {label: "director_v2.character_candidates"});
    if (review.blocking) throw new CharacterCandidateReviewRequiredError(review.id);
    const characters = await this.db.character.findMany({where: {novelId: input.novelId}, select: {id: true, name: true}});
    return canonicalizeCandidateReferences(output, review.items, characters);
  }

  private async apply(tx: Prisma.TransactionClient, novelId: string, item: DirectorCharacterCandidateItem,
    action: "create" | "merge" | "ignore", targetId?: string) {
    if (action === "create") {
      if (await tx.character.findFirst({where: {novelId, name: item.name}})) throw new AppError(`“${item.name}”有同名角色，请关联已有角色或核对身份。`, 409);
      const character = await tx.character.create({data: {novelId, name: item.name, role: item.role || "配角", background: item.summary}});
      item.targetId = character.id;
      item.status = "created";
    } else if (action === "merge") {
      const target = targetId && await tx.character.findFirst({where: {novelId, id: targetId}, select: {id: true}});
      if (!target) throw new AppError("请选择本书中要关联的角色。", 400);
      item.targetId = target.id;
      item.status = "merged";
    } else { item.status = "ignored"; item.targetId = null; }
    await tx.characterCandidate.update({where: {id: item.id}, data: {
      status: action === "ignore" ? "v2_ignored" : "v2_confirmed", matchedCharacterId: item.targetId,
    }});
  }

  async read(runId: string): Promise<DirectorCharacterCandidatePage> {
    // Read routes never take an ownership lock or mutate run state.
    const run = await this.db.directorNextRun.findUnique({where: {id: runId}, select: {novelId: true, contractJson: true}});
    if (!run) throw new AppError("找不到这次创作。", 404);
    const epoch = readRunExecutionEpoch(run.contractJson);
    const [rows, characters, control, busy] = await Promise.all([
      this.db.chapterArtifactSyncCheckpoint.findMany({where: {novelId: run.novelId, OR: [
        {artifactType: artifactType(runId)}, {sourceType, sourceStage: String(epoch)},
      ]}, orderBy: {createdAt: "asc"}}),
      this.db.character.findMany({where: {novelId: run.novelId}, select: {id: true, name: true}, orderBy: {createdAt: "asc"}}),
      this.db.directorNextRunControl.findUnique({where: {runId}, select: {status: true}}),
      this.db.generationJob.findFirst({where: {novelId: run.novelId, executionLeaseExpiresAt: {gt: new Date()}}}),
    ]);
    const reviews: StoredReview[] = [];
    for (const row of rows) {
      const review = readReview(row.metadataJson);
      if (row.artifactType !== artifactType(runId) && (review.driver !== "auto" || !review.items.some(i => i.status === "pending"))) continue;
      if (review.items.length) reviews.push(review);
    }
    return {reviews, characters, editable: !!control && ["paused", "waiting_gate", "completed"].includes(control.status) && !busy};
  }

  async resolve(runId: string, input: ResolveDirectorCharacterCandidates): Promise<void> {
    await withSqliteRetry(() => this.db.$transaction(async tx => {
      const run = await this.owner(runId, tx);
      const control = await tx.directorNextRunControl.findUnique({where: {runId}});
      const busy = await tx.generationJob.findFirst({where: {novelId: run.novelId, executionLeaseExpiresAt: {gt: new Date()}}});
      if (!control || !["paused", "waiting_gate", "completed"].includes(control.status) || busy) throw new AppError("请等本轮章节处理结束后确认人物。", 409);
      const locked = await tx.directorNextRunControl.updateMany({where: {runId, version: control.version, status: control.status}, data: {version: {increment: 0}}});
      if (!locked.count) throw new AppError("本次创作状态已变化，请刷新后确认。", 409);
      const row = await tx.chapterArtifactSyncCheckpoint.findFirst({where: {id: input.reviewId, novelId: run.novelId, OR: [
        {artifactType: artifactType(runId)}, {sourceType, sourceStage: String(run.executionEpoch)},
      ]}});
      if (!row) throw new AppError("人物确认记录不属于本次创作。", 409);
      const review = readReview(row.metadataJson);
      if (row.artifactType !== artifactType(runId) && (review.driver !== "auto" || review.blocking)) throw new AppError("请从候选所属的创作中完成确认。", 409);
      if (review.contentHash !== input.contentHash) throw new AppError("人物确认的正文版本已变化。", 409);
      await this.assertContent(tx, run.novelId, review.chapterId, review.contentHash);
      if (review.revision !== input.revision) throw new AppError("人物处理结果已更新，请刷新后查看。", 409);
      const pending = review.items.filter(i => i.status === "pending");
      const ids = new Set(input.decisions.map(d => d.candidateId));
      if (!pending.length || ids.size !== input.decisions.length || ids.size !== pending.length || pending.some(i => !ids.has(i.id))) {
        throw new AppError("请为本章每个待处理人物选择一个处理方式。", 400);
      }
      for (const decision of input.decisions) await this.apply(tx, run.novelId, pending.find(i => i.id === decision.candidateId)!, decision.action, decision.targetId);
      review.blocking = false;
      review.revision++;
      await tx.chapterArtifactSyncCheckpoint.update({where: {id: row.id}, data: {metadataJson: JSON.stringify(review)}});
      // An automatic run may already have passed this chapter when a deferred identity is confirmed.
      // Rebind its saved extraction here, atomically, without regenerating prose or calling the model.
      const extraction = await tx.chapterArtifactSyncCheckpoint.findFirst({where: {novelId: run.novelId,
        chapterId: review.chapterId, contentHash: review.contentHash, artifactType: "artifact_delta_extraction:v1", status: "succeeded"}, orderBy: {updatedAt: "desc"}});
      if (extraction?.metadataJson) {
        const output = chapterArtifactDeltaOutputSchema.parse(JSON.parse(extraction.metadataJson).output);
        if (output.characterAppearances !== undefined) {
          const characters = await tx.character.findMany({where: {novelId: run.novelId}, select: {id: true, name: true}});
          const mapped = canonicalizeCandidateReferences(output, review.items, characters);
          const chapter = await tx.chapter.findUniqueOrThrow({where: {id: review.chapterId}, select: {content: true}});
          await writeCharacterAppearances(tx, {novelId: run.novelId, chapterId: review.chapterId, content: chapter.content ?? "",
            contentHash: review.contentHash, appearances: mapped.characterAppearances});
        }
      }
    }), {label: "director_v2.confirm_character_candidates"});
  }

  async assertResolved(runId: string, reviewId: string, tx: Prisma.TransactionClient) {
    const row = await tx.chapterArtifactSyncCheckpoint.findFirst({where: {id: reviewId, artifactType: artifactType(runId)}});
    if (!row) throw new AppError("缺少本章人物确认记录。", 409);
    const review = readReview(row.metadataJson);
    await this.assertContent(tx, row.novelId, row.chapterId, review.contentHash);
    if (review.blocking || review.items.some(i => i.status === "pending")) throw new AppError("请先确认本章人物，再从保存进度继续。", 409);
  }
}

export const directorCharacterCandidates = new DirectorCharacterCandidateService();
