import type { Prisma } from "@prisma/client";
import type { LLMProvider } from "@ai-novel/shared/types/llm";
import { isFullBookAutopilotRunMode } from "@ai-novel/shared/types/novelDirector";
import { prisma } from "../../../../../db/prisma";
import { AppError } from "../../../../../middleware/errorHandler";
import { canExecuteLegacyTask } from "../../../../../modules/novel/director-routing";
import {
  directorStateProposalResolutionService,
  type DirectorStateProposalResolutionService,
} from "../../runtime/DirectorStateProposalResolutionService";
import { buildChapterArtifactContentHash, ChapterArtifactCheckpointStore } from "../../../runtime/artifactSync";

export interface DirectorResourceConfirmationInput {
  novelId: string;
  taskId: string;
  pipelineJobId: string;
  provider?: LLMProvider;
  model?: string;
  temperature?: number;
}

export class DirectorResourceConfirmationService {
  constructor(
    private readonly resolver: Pick<DirectorStateProposalResolutionService, "resolvePendingProposals"> = directorStateProposalResolutionService,
    private readonly checkpoints = new ChapterArtifactCheckpointStore(),
  ) {}

  async confirmCompletedChapterResources(input: DirectorResourceConfirmationInput): Promise<void> {
    const authority = await this.readAuthority(input);
    if (!authority) return;
    const chapters = await prisma.chapter.findMany({
      where: { novelId: input.novelId, order: { gte: authority.startOrder, lte: authority.endOrder } },
      select: { id: true, order: true, content: true },
      orderBy: { order: "asc" },
    });
    for (const chapter of chapters) {
      if (!chapter.content?.trim()) continue;
      const content = chapter.content;
      const identity = {
        novelId: input.novelId,
        chapterId: chapter.id,
        contentHash: buildChapterArtifactContentHash(content),
        artifactType: `v1_resource_confirmation:v1:${input.taskId}`,
        syncMode: "adaptive" as const,
      };
      if ((await this.checkpoints.read(identity))?.status === "succeeded") continue;
      const pending = await prisma.stateChangeProposal.count({ where: {
        novelId: input.novelId, chapterId: chapter.id, sourceType: "chapter_background_sync",
        proposalType: "character_resource_update", status: "pending_review",
      } });
      if (pending === 0) continue;
      const claim = await this.checkpoints.claim(identity, { pipelineJobId: input.pipelineJobId });
      if (claim !== "claimed") continue;
      try {
        const assertExecutionOwnership = async (db: Prisma.TransactionClient = prisma) => {
          if (!await this.readAuthority(input, db)) {
            throw new AppError("资源确认的创作任务归属或运行模式已变化，请返回本书工作台。", 409);
          }
          const protectedArtifact = await db.directorArtifact.findFirst({ where: {
            novelId: input.novelId, protectedUserContent: true,
            OR: [{ targetType: "chapter", targetId: chapter.id }, { contentTable: "Chapter", contentId: chapter.id }],
          }, select: { id: true } });
          if (protectedArtifact) throw new AppError("本章包含受保护内容，请在本书工作台核对资源变动。", 409);
        };
        // Protected user content is never submitted to automatic confirmation.
        const protectedArtifact = await prisma.directorArtifact.findFirst({ where: {
          novelId: input.novelId, protectedUserContent: true,
          OR: [{ targetType: "chapter", targetId: chapter.id }, { contentTable: "Chapter", contentId: chapter.id }],
        }, select: { id: true } });
        if (protectedArtifact) {
          await this.checkpoints.succeed(identity, { decision: "manual_required", reason: "protected_user_content" });
          continue;
        }
        await assertExecutionOwnership();
        const result = await this.resolver.resolvePendingProposals({
          novelId: input.novelId, taskId: input.taskId, chapterId: chapter.id, chapterOrder: chapter.order,
          runMode: "full_book_autopilot", provider: input.provider, model: input.model, temperature: input.temperature,
          resourceReview: { expectedChapterContent: content, assertExecutionOwnership },
        });
        if (result.reviewFailed) await this.checkpoints.fail(identity, new Error(result.reason ?? "资源核验失败"));
        else await this.checkpoints.succeed(identity, { decision: result.decision, proposalIds: result.proposalIds });
      } catch (error) {
        await this.checkpoints.fail(identity, error);
        throw error;
      }
    }
  }

  private async readAuthority(input: DirectorResourceConfirmationInput, db: Prisma.TransactionClient = prisma) {
    const job = await db.generationJob.findUnique({ where: { id: input.pipelineJobId } });
    if (!job || job.novelId !== input.novelId || job.status !== "succeeded" || job.pendingManualRecovery) return null;
    const payload = JSON.parse(job.payload ?? "{}");
    if (payload.directorNext || payload.workflowTaskId !== input.taskId) return null;
    const task = await db.novelWorkflowTask.findUnique({ where: { id: input.taskId } });
    if (!task || task.novelId !== input.novelId || task.lane !== "auto_director"
      || task.status !== "running" || task.pendingManualRecovery || task.cancelRequestedAt) return null;
    const seed = JSON.parse(task.seedPayloadJson ?? "{}");
    if (!isFullBookAutopilotRunMode(seed.directorInput?.runMode ?? seed.runMode)) return null;
    if (!await canExecuteLegacyTask(input.taskId, db)) return null;
    return { startOrder: job.startOrder, endOrder: job.endOrder };
  }
}

export const directorResourceConfirmationService = new DirectorResourceConfirmationService();
