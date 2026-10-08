import {z} from "zod";
import {prisma} from "../../../db/prisma";
import {AppError} from "../../../middleware/errorHandler";
import type {DirectorWorkspaceLedgers} from "@ai-novel/shared/types/director/workspace";
import {
  characterResourceLedgerItemSchema, characterResourceEventSchema, characterResourceProposalSummarySchema,
  characterResourceEvidenceSchema, characterResourceSourceRefSchema, characterResourceRiskSignalSchema,
} from "@ai-novel/shared/types/characterResource";

const chapterRef = {chapterId:z.string().nullable().optional(),chapterOrder:z.number().int().nullable().optional()};
const payoffEvidence = z.object({summary:z.string(),...chapterRef});
const payoffSource = z.object({
  kind:z.enum(["major_payoff","volume_open_payoff","chapter_payoff_ref","foreshadow_state","open_conflict","audit_issue"]),
  refId:z.string().nullable().optional(),refLabel:z.string(),...chapterRef,
  volumeId:z.string().nullable().optional(),volumeSortOrder:z.number().int().nullable().optional(),
});

/** This read adapter deliberately does not consume lazy-sync or generation services. */
export async function readDirectorLedgers(novelId: string): Promise<DirectorWorkspaceLedgers> {
  if (!await prisma.novel.findUnique({where:{id:novelId},select:{id:true}})) throw new AppError("小说不存在。",404);
  const [payoffs,resources,events,pending] = await prisma.$transaction([
    prisma.payoffLedgerItem.findMany({where:{novelId},orderBy:[{updatedAt:"desc"},{id:"asc"}]}),
    prisma.characterResourceLedgerItem.findMany({where:{novelId},orderBy:[{updatedAt:"desc"},{id:"asc"}],include:{holderCharacter:{select:{id:true,name:true,novelId:true}},ownerCharacter:{select:{id:true,name:true,novelId:true}}}}),
    prisma.characterResourceEvent.findMany({where:{novelId,resource:{novelId}},orderBy:[{createdAt:"desc"},{id:"asc"}]}),
    prisma.stateChangeProposal.findMany({where:{novelId,proposalType:"character_resource_update",status:"pending_review"},orderBy:[{updatedAt:"desc"},{id:"asc"}]}),
  ]);
  const warnings: string[] = [];
  function savedValue<T>(text:string|null,schema:z.ZodType<T>,fallback:T,label:string):T {
    if (!text) return fallback;
    try {const value=schema.safeParse(JSON.parse(text));if(value.success) return value.data;} catch { /* Preserve the readable base record. */ }
    warnings.push(`${label}的部分保存资料无法读取。`);return fallback;
  }
  function array<T>(text:string|null,schema:z.ZodType<T>,label:string):T[] {
    const values=savedValue(text,z.array(z.unknown()),[],label);
    const result:T[]=[];
    for(const value of values) {const item=schema.safeParse(value);if(item.success) result.push(item.data);else warnings.push(`${label}的部分保存资料无法读取。`);}
    return result;
  }
  function validRows<T>(rows:unknown[],schema:z.ZodType<T>,label:string):T[] {
    return rows.flatMap(row=>{const parsed=schema.safeParse(row);if(parsed.success) return [parsed.data];warnings.push(`${label}有记录格式异常，请核对保存资料。`);return [];});
  }
  return {
    novelId,
    payoffs:payoffs.map(row=>({
      id:row.id,novelId:row.novelId,ledgerKey:row.ledgerKey,title:row.title,summary:row.summary,scopeType:row.scopeType,currentStatus:row.currentStatus,
      targetStartChapterOrder:row.targetStartChapterOrder,targetEndChapterOrder:row.targetEndChapterOrder,
      firstSeenChapterOrder:row.firstSeenChapterOrder,lastTouchedChapterOrder:row.lastTouchedChapterOrder,
      lastTouchedChapterId:row.lastTouchedChapterId,setupChapterId:row.setupChapterId,payoffChapterId:row.payoffChapterId,lastSnapshotId:row.lastSnapshotId,
      sourceRefs:array(row.sourceRefsJson,payoffSource,row.title),evidence:array(row.evidenceJson,payoffEvidence,row.title),
      riskSignals:array(row.riskSignalsJson,characterResourceRiskSignalSchema,row.title),statusReason:row.statusReason,confidence:row.confidence,
      createdAt:row.createdAt.toISOString(),updatedAt:row.updatedAt.toISOString(),
    })),
    resources:validRows(resources.map(row=>({...row,
      holderCharacterId:row.holderCharacter?.novelId===novelId?row.holderCharacter.id:null,
      ownerCharacterId:row.ownerCharacter?.novelId===novelId?row.ownerCharacter.id:null,
      holderCharacterName:row.holderCharacter?.novelId===novelId?row.holderCharacter.name:row.holderCharacterName,
      ownerName:row.ownerCharacter?.novelId===novelId?row.ownerCharacter.name:row.ownerName,
      knownByCharacterIds:array(row.knownByCharacterIdsJson,z.string(),row.name),constraints:array(row.constraintsJson,z.string(),row.name),
      riskSignals:array(row.riskSignalsJson,characterResourceRiskSignalSchema,row.name),sourceRefs:array(row.sourceRefsJson,characterResourceSourceRefSchema,row.name),
      evidence:array(row.evidenceJson,characterResourceEvidenceSchema,row.name),createdAt:row.createdAt.toISOString(),updatedAt:row.updatedAt.toISOString(),
    })),characterResourceLedgerItemSchema,"背包与资源"),
    resourceEvents:validRows(events.map(row=>({...row,evidence:array(row.evidenceJson,z.string(),"资源变化"),createdAt:row.createdAt.toISOString()})),characterResourceEventSchema,"资源变化"),
    pendingResources:validRows(pending.map(row=>({...row,
      payload:savedValue(row.payloadJson,z.record(z.string(),z.unknown()),{},"待核对资源"),
      evidence:array(row.evidenceJson,z.string(),"待核对资源"),validationNotes:array(row.validationNotesJson,z.string(),"待核对资源"),
      createdAt:row.createdAt.toISOString(),updatedAt:row.updatedAt.toISOString(),
    })),characterResourceProposalSummarySchema,"待核对资源"),
    warnings:[...new Set(warnings)],
  };
}
