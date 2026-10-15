import type { CharacterResourceLedgerResponse } from "@ai-novel/shared/types/characterResource";
import { characterResourceUpdatePayloadSchema } from "@ai-novel/shared/types/characterResource";
import type { LLMProvider } from "@ai-novel/shared/types/llm";
import { characterResourceReviewStore } from "../persistence/CharacterResourceReviewStore";
import { AppError } from "../../../../middleware/errorHandler";
import { characterResourceExtractionService } from "../CharacterResourceExtractionService";
import { characterResourceLedgerService } from "../CharacterResourceLedgerService";
import { stateCommitService } from "../../state/StateCommitService";

type ResourceLlmOptions = { provider?: LLMProvider; model?: string; temperature?: number };

export class CharacterResourceApplicationService {
  async getLedger(novelId: string): Promise<CharacterResourceLedgerResponse> {
    const [items, pendingProposals] = await Promise.all([
      characterResourceLedgerService.listResources(novelId),
      characterResourceReviewStore.listPending(novelId),
    ]);
    return { items, pendingProposals };
  }

  async extractChapter(novelId: string, chapterId: string, options: ResourceLlmOptions = {}) {
    const proposals = await characterResourceExtractionService.extractChapterResourceProposals({
      novelId,
      chapterId,
      provider: options.provider,
      model: options.model,
      temperature: options.temperature,
      sourceType: "manual_resource_extract",
      sourceStage: "chapter_resource_review",
    });
    return stateCommitService.proposeAndCommit({
      novelId,
      chapterId,
      sourceType: "manual_resource_extract",
      sourceStage: "chapter_resource_review",
      proposals,
      skipFactExtraction: true,
    });
  }

  async backfill(novelId: string, options: ResourceLlmOptions & { limit?: number } = {}) {
    const limit = options.limit ?? 3;
    const chapters = await characterResourceReviewStore.selectBackfillChapters(novelId, limit);

    let committedCount = 0;
    let pendingReviewCount = 0;
    let rejectedCount = 0;
    let proposalCount = 0;
    for (const chapter of chapters) {
      const proposals = await characterResourceExtractionService.extractChapterResourceProposals({
        novelId,
        chapterId: chapter.id,
        chapterOrder: chapter.order,
        provider: options.provider,
        model: options.model,
        temperature: options.temperature,
        sourceType: "manual_resource_backfill",
        sourceStage: "character_resource_backfill",
      });
      proposalCount += proposals.length;
      const result = await stateCommitService.proposeAndCommit({
        novelId,
        chapterId: chapter.id,
        chapterOrder: chapter.order,
        sourceType: "manual_resource_backfill",
        sourceStage: "character_resource_backfill",
        proposals,
        skipFactExtraction: true,
      });
      committedCount += result.committed.length;
      pendingReviewCount += result.pendingReview.length;
      rejectedCount += result.rejected.length;
    }

    return {
      scannedChapterCount: chapters.length,
      proposalCount,
      committedCount,
      pendingReviewCount,
      rejectedCount,
      items: await characterResourceLedgerService.listResources(novelId),
      pendingProposals: await characterResourceReviewStore.listPending(novelId),
    };
  }

  async confirmProposal(novelId: string, proposalId: string) {
    const row = await characterResourceReviewStore.findPending(novelId, proposalId);
    if (!row) {
      throw new AppError("没有找到可确认的角色资源变更。", 404);
    }

    const payload = characterResourceUpdatePayloadSchema.parse(row.payload);
    const chapterOrder = row.chapterId
      ? await characterResourceReviewStore.findChapterOrder(novelId, row.chapterId)
      : null;
    const result = await stateCommitService.commitExistingProposals({
      novelId,
      proposalIds: [proposalId],
      chapterId: row.chapterId,
      chapterOrder: typeof payload.chapterOrder === "number" ? payload.chapterOrder : chapterOrder,
      sourceType: "manual_resource_confirm",
      sourceStage: "chapter_resource_review",
      reason: "character_resource_manual_confirm",
    });
    if (result.committed.length === 0) {
      throw new AppError("没有找到可确认的角色资源变更。", 404);
    }

    return this.getLedger(novelId);
  }

  async rejectProposal(novelId: string, proposalId: string) {
    const updated = await characterResourceReviewStore.rejectPending(novelId, proposalId);
    if (updated.count === 0) {
      throw new AppError("没有找到可忽略的角色资源变更。", 404);
    }
    return this.getLedger(novelId);
  }
}

export const characterResourceApplicationService = new CharacterResourceApplicationService();
