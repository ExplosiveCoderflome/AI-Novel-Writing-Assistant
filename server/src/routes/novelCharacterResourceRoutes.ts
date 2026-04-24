import type { Router } from "express";
import type {
  CharacterResourceLedgerResponse,
  CharacterResourceProposalSummary,
} from "@ai-novel/shared/types/characterResource";
import { characterResourceUpdatePayloadSchema } from "@ai-novel/shared/types/characterResource";
import type { ApiResponse } from "@ai-novel/shared/types/api";
import { z } from "zod";
import { llmProviderSchema } from "../llm/providerSchema";
import { prisma } from "../db/prisma";
import { AppError } from "../middleware/errorHandler";
import { validate } from "../middleware/validate";
import { characterResourceExtractionService } from "../services/novel/characterResource/CharacterResourceExtractionService";
import { characterResourceLedgerService } from "../services/novel/characterResource/CharacterResourceLedgerService";
import { stateCommitService } from "../services/novel/state/StateCommitService";

const characterResourceCharacterParamsSchema = z.object({
  id: z.string().trim().min(1),
  characterId: z.string().trim().min(1),
});

const characterResourceChapterParamsSchema = z.object({
  id: z.string().trim().min(1),
  chapterId: z.string().trim().min(1),
});

const characterResourceProposalParamsSchema = z.object({
  id: z.string().trim().min(1),
  proposalId: z.string().trim().min(1),
});

const resourceExtractionSchema = z.object({
  provider: llmProviderSchema.optional(),
  model: z.string().trim().optional(),
  temperature: z.number().min(0).max(2).optional(),
}).default({});

interface RegisterNovelCharacterResourceRoutesInput {
  router: Router;
  idParamsSchema: z.ZodType<{ id: string }>;
}

function parseStringArray(value: string | null | undefined): string[] {
  if (!value?.trim()) {
    return [];
  }
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? parsed.map((item) => String(item ?? "").replace(/\s+/g, " ").trim()).filter(Boolean)
      : [];
  } catch {
    return [];
  }
}

function parsePayload(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function mapProposal(row: {
  id: string;
  novelId: string;
  chapterId: string | null;
  proposalType: string;
  riskLevel: string;
  status: string;
  summary: string;
  payloadJson: string;
  evidenceJson: string | null;
  validationNotesJson: string | null;
  createdAt: Date;
  updatedAt: Date;
}): CharacterResourceProposalSummary {
  return {
    id: row.id,
    novelId: row.novelId,
    chapterId: row.chapterId,
    proposalType: "character_resource_update",
    riskLevel: row.riskLevel === "high" ? "high" : row.riskLevel === "medium" ? "medium" : "low",
    status: row.status === "committed" || row.status === "rejected" || row.status === "validated"
      ? row.status
      : "pending_review",
    summary: row.summary,
    payload: parsePayload(row.payloadJson),
    evidence: parseStringArray(row.evidenceJson),
    validationNotes: parseStringArray(row.validationNotesJson),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function listPendingResourceProposals(novelId: string): Promise<CharacterResourceProposalSummary[]> {
  const rows = await prisma.stateChangeProposal.findMany({
    where: {
      novelId,
      proposalType: "character_resource_update",
      status: "pending_review",
    },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    take: 50,
  });
  return rows.map(mapProposal);
}

export function registerNovelCharacterResourceRoutes(
  input: RegisterNovelCharacterResourceRoutesInput,
): void {
  const { router, idParamsSchema } = input;

  router.get(
    "/:id/character-resources",
    validate({ params: idParamsSchema }),
    async (req, res, next) => {
      try {
        const { id } = req.params as z.infer<typeof idParamsSchema>;
        const [items, pendingProposals] = await Promise.all([
          characterResourceLedgerService.listResources(id),
          listPendingResourceProposals(id),
        ]);
        const data: CharacterResourceLedgerResponse = { items, pendingProposals };
        res.status(200).json({
          success: true,
          data,
          message: "角色关键资源已加载。",
        } satisfies ApiResponse<typeof data>);
      } catch (error) {
        next(error);
      }
    },
  );

  router.get(
    "/:id/characters/:characterId/resources",
    validate({ params: characterResourceCharacterParamsSchema }),
    async (req, res, next) => {
      try {
        const { id, characterId } = req.params as z.infer<typeof characterResourceCharacterParamsSchema>;
        const data = await characterResourceLedgerService.listCharacterResources(id, characterId);
        res.status(200).json({
          success: true,
          data,
          message: "角色资源已加载。",
        } satisfies ApiResponse<typeof data>);
      } catch (error) {
        next(error);
      }
    },
  );

  router.get(
    "/:id/chapters/:chapterId/resource-context",
    validate({ params: characterResourceChapterParamsSchema }),
    async (req, res, next) => {
      try {
        const { id, chapterId } = req.params as z.infer<typeof characterResourceChapterParamsSchema>;
        const data = await characterResourceLedgerService.getChapterResourceContext(id, chapterId);
        res.status(200).json({
          success: true,
          data,
          message: "本章关键资源已加载。",
        } satisfies ApiResponse<typeof data>);
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    "/:id/chapters/:chapterId/resources/extract",
    validate({ params: characterResourceChapterParamsSchema, body: resourceExtractionSchema }),
    async (req, res, next) => {
      try {
        const { id, chapterId } = req.params as z.infer<typeof characterResourceChapterParamsSchema>;
        const body = resourceExtractionSchema.parse(req.body);
        const proposals = await characterResourceExtractionService.extractChapterResourceProposals({
          novelId: id,
          chapterId,
          provider: body.provider,
          model: body.model,
          temperature: body.temperature,
          sourceType: "manual_resource_extract",
          sourceStage: "chapter_resource_review",
        });
        const data = await stateCommitService.proposeAndCommit({
          novelId: id,
          chapterId,
          sourceType: "manual_resource_extract",
          sourceStage: "chapter_resource_review",
          proposals,
        });
        res.status(200).json({
          success: true,
          data,
          message: "资源变化已提取，低风险变化会用于后续写作。",
        } satisfies ApiResponse<typeof data>);
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    "/:id/character-resource-proposals/:proposalId/confirm",
    validate({ params: characterResourceProposalParamsSchema }),
    async (req, res, next) => {
      try {
        const { id, proposalId } = req.params as z.infer<typeof characterResourceProposalParamsSchema>;
        const row = await prisma.stateChangeProposal.findFirst({
          where: {
            id: proposalId,
            novelId: id,
            proposalType: "character_resource_update",
            status: "pending_review",
          },
        });
        if (!row) {
          throw new AppError("没有找到可确认的角色资源变更。", 404);
        }

        const payload = characterResourceUpdatePayloadSchema.parse(parsePayload(row.payloadJson));
        const evidence = parseStringArray(row.evidenceJson);
        const validationNotes = parseStringArray(row.validationNotesJson);
        await prisma.$transaction(async (tx) => {
          const chapter = row.chapterId
            ? await tx.chapter.findFirst({
                where: { id: row.chapterId, novelId: id },
                select: { order: true },
              })
            : null;
          await characterResourceLedgerService.applyCommittedUpdate(tx, {
            novelId: id,
            chapterId: row.chapterId,
            chapterOrder: typeof payload.chapterOrder === "number" ? payload.chapterOrder : chapter?.order ?? null,
            payload,
            evidence,
            validationNotes,
          });
          await tx.stateChangeProposal.update({
            where: { id: proposalId },
            data: { status: "committed" },
          });
        });

        const data: CharacterResourceLedgerResponse = {
          items: await characterResourceLedgerService.listResources(id),
          pendingProposals: await listPendingResourceProposals(id),
        };
        res.status(200).json({
          success: true,
          data,
          message: "资源变更已确认，后续写作会参考它。",
        } satisfies ApiResponse<typeof data>);
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    "/:id/character-resource-proposals/:proposalId/reject",
    validate({ params: characterResourceProposalParamsSchema }),
    async (req, res, next) => {
      try {
        const { id, proposalId } = req.params as z.infer<typeof characterResourceProposalParamsSchema>;
        const updated = await prisma.stateChangeProposal.updateMany({
          where: {
            id: proposalId,
            novelId: id,
            proposalType: "character_resource_update",
            status: "pending_review",
          },
          data: { status: "rejected" },
        });
        if (updated.count === 0) {
          throw new AppError("没有找到可忽略的角色资源变更。", 404);
        }
        const data: CharacterResourceLedgerResponse = {
          items: await characterResourceLedgerService.listResources(id),
          pendingProposals: await listPendingResourceProposals(id),
        };
        res.status(200).json({
          success: true,
          data,
          message: "资源变更已忽略，不会影响后续写作。",
        } satisfies ApiResponse<typeof data>);
      } catch (error) {
        next(error);
      }
    },
  );
}
