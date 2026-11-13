import { referenceContract, parseShortStoryReference } from "../../creation-studio/reference";
import type { CreationIntentInterpretation, ShortStoryPlanContract } from "@ai-novel/shared/types/creationStudio";
import { prisma } from "../../../../db/prisma";
import { AppError } from "../../../../middleware/errorHandler";
import { parseJson, type RevisionBaseline } from "../domain/revisionState";
import { shortStoryProductionFoundationText } from "./shortStoryPromptContext";

export async function loadRevisionContext(novelId: string) {
  const imported = await prisma.manuscriptProject.findUnique({where:{novelId},include:{novel:true}});
  if(imported?.narrativeForm==="short_story"){
    const planRow=await prisma.shortStoryPlan.findUnique({where:{novelId},include:{segments:{orderBy:{order:"asc"}}}});
    if(!planRow)throw new AppError("导入短篇缺少分节方案。",409);
    const plan=parseJson<ShortStoryPlanContract>(planRow.structureJson,{title:imported.novel?.title??"",targetWordCount:planRow.targetWordCount,endingPromise:planRow.endingPromise,segments:[]});
    const importedInterpretation={understanding:"从已导入原稿分节形成的工作上下文；没有确认的原始创作意图。",recommendedNarrativeForm:"short_story" as const,recommendedTargetWordCount:planRow.targetWordCount,confidence:1,recommendationReason:"来自用户导入的原稿。",recommendedWritingPlatform:"none" as const,writingPlatformConfidence:1,writingPlatformReason:"导入内容沿用原稿。",directions:[{id:"imported",title:"导入原稿修订",premise:"",coreExperience:"",protagonist:"",centralConflict:"",endingPromise:"",styleKeywords:[]},{id:"imported-unused",title:"未选择新方向",premise:"",coreExperience:"",protagonist:"",centralConflict:"",endingPromise:"",styleKeywords:[]}] as const};
    return {novel:imported.novel!,planRow,plan,segments:planRow.segments,activeIntent:null,interpretation:importedInterpretation,direction:importedInterpretation.directions[0],task:null,productionFoundation:"导入短篇修订上下文；不启动生成工作流。",reference:referenceContract(parseShortStoryReference(imported.novel?.shortStoryReferenceJson??null,Boolean(imported.novel?.referenceBookAnalysisId))),imported:true as const};
  }
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
  if(context.imported)return {intentId:"imported",planId:context.planRow.id,planUpdatedAt:context.planRow.updatedAt.toISOString(),segments:context.segments.map(({id,order,version})=>({id,order,version})),affectedIds,checkpoint:{status:"imported",type:null,summary:null,operationId:null,pendingManualRecovery:false,cancelRequestedAt:null}};
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
  if(context.imported){const current=captureBaseline(context,baseline.affectedIds);if(current.planId!==baseline.planId||current.planUpdatedAt!==baseline.planUpdatedAt||JSON.stringify(current.segments)!==JSON.stringify(baseline.segments))throw new RevisionConflict();return;}
  const current = captureBaseline(context, baseline.affectedIds);
  if (current.intentId !== baseline.intentId || current.planId !== baseline.planId
    || current.planUpdatedAt !== baseline.planUpdatedAt
    || JSON.stringify(current.segments) !== JSON.stringify(baseline.segments)) {
    throw new RevisionConflict();
  }
}
