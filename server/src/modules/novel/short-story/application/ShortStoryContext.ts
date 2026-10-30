import { referenceContract, parseShortStoryReference } from "../../creation-studio/reference";
import type { CreationIntentInterpretation, ShortStoryPlanContract } from "@ai-novel/shared/types/creationStudio";
import { prisma } from "../../../../db/prisma";
import { AppError } from "../../../../middleware/errorHandler";
import { parseJson, type RevisionBaseline } from "../domain/revisionState";
import { shortStoryProductionFoundationText } from "./shortStoryPromptContext";

export async function loadRevisionContext(novelId: string) {
  const novel = await prisma.novel.findUnique({
    where: { id: novelId },
    include: {
      genre: true,
      primaryStoryMode: true,
      secondaryStoryMode: true,
      shortStoryPlan: {
        include: { segments: { orderBy: { order: "asc" } } },
      },
      intentVersions: {
        where: { status: "active" },
        orderBy: { version: "desc" },
        take: 1,
      },
      workflowTasks: {
        where: { lane: "creation_studio" },
        orderBy: { updatedAt: "desc" },
        take: 1,
      },
    },
  });
  if (!novel || novel.narrativeForm !== "short_story" || !novel.shortStoryPlan) {
    throw new AppError("短篇作品尚未准备好。", 409);
  }
  const activeIntent = novel.intentVersions[0];
  const task = novel.workflowTasks[0];
  if (!activeIntent || !task) {
    throw new AppError("短篇作品缺少可恢复的创作上下文。", 409);
  }
  const interpretation = parseJson<CreationIntentInterpretation | null>(activeIntent.structuredIntentJson, null);
  const selected = parseJson<{ selectedDirectionId?: string }>(activeIntent.impactScopeJson, {});
  const direction = interpretation?.directions.find((item) => item.id === selected.selectedDirectionId);
  if (!interpretation || !direction) {
    throw new AppError("短篇作品缺少生效中的创作方向。", 409);
  }
  return {
    novel,
    planRow: novel.shortStoryPlan,
    plan: parseJson<ShortStoryPlanContract>(novel.shortStoryPlan.structureJson, {
      title: novel.title,
      targetWordCount: novel.targetWordCount ?? novel.shortStoryPlan.targetWordCount,
      endingPromise: novel.shortStoryPlan.endingPromise,
      segments: [],
    }),
    segments: novel.shortStoryPlan.segments,
    activeIntent,
    interpretation,
    direction,
    task,
    productionFoundation: shortStoryProductionFoundationText(novel),
    reference: referenceContract(parseShortStoryReference(novel.shortStoryReferenceJson, Boolean(novel.referenceBookAnalysisId))),
  };
}

export type ShortStoryContext = Awaited<ReturnType<typeof loadRevisionContext>>;

export function captureBaseline(context: ShortStoryContext, affectedIds: string[]): RevisionBaseline {
  return {
    intentId: context.activeIntent.id,
    planId: context.planRow.id,
    planUpdatedAt: context.planRow.updatedAt.toISOString(),
    segments: context.segments.map(({id, order, version}) => ({id, order, version})),
    affectedIds,
    checkpoint: {
      status: context.task.status,
      type: context.task.checkpointType,
      summary: context.task.checkpointSummary,
      operationId: context.task.shortStoryOperationId,
      pendingManualRecovery: context.task.pendingManualRecovery,
      cancelRequestedAt: context.task.cancelRequestedAt?.toISOString() ?? null,
    },
  };
}

export class RevisionConflict extends AppError {
  constructor(message = "正文或故事方案已更新，请重新预览并确认修改。") { super(message, 409); }
}

export function assertBaseline(context: ShortStoryContext, baseline: RevisionBaseline): void {
  const current = captureBaseline(context, baseline.affectedIds);
  if (current.intentId !== baseline.intentId || current.planId !== baseline.planId
    || current.planUpdatedAt !== baseline.planUpdatedAt
    || JSON.stringify(current.segments) !== JSON.stringify(baseline.segments)) {
    throw new RevisionConflict();
  }
}
