import type { AuditType, Prisma } from "@prisma/client";
import { chapterAcceptanceAssessmentSchema } from "../../../../prompting/prompts/novel/chapterAcceptance.prompts";
import type { UnitRun } from "../../application";
import { InvalidProductionRequestError } from "../../application";

const normalize = (value: string) => value.replace(/\s+/g," ").trim();
/** Publish only the retained manuscript's structured assessment. Caller owns the chapter/lease locks and transaction. */
export async function publishSelectedAssessment(tx: Prisma.TransactionClient, run: UnitRun): Promise<boolean> {
  const stage = run.progress.selected === "candidate" ? "verify" : "accept";
  const saved = run.artifacts.stageData?.[stage] as {assessment?: unknown} | undefined;
  if (!saved?.assessment) {
    if (run.snapshots.profile.stages.includes("accept")) throw new InvalidProductionRequestError("Selected assessment is missing");
    return false;
  }
  const result = chapterAcceptanceAssessmentSchema.safeParse(saved.assessment);
  if (!result.success) throw new InvalidProductionRequestError("Selected assessment is invalid");
  const assessment = result.data;
  const available = !assessment.riskTags.includes("acceptance_gate_unavailable");
  const grouped = new Map<AuditType, typeof assessment.blockingIssues>();
  for (const issue of assessment.blockingIssues) {
    const type: AuditType = ["continuity","character","plot"].includes(issue.category) ? issue.category as AuditType : "mode_fit";
    grouped.set(type,[...(grouped.get(type) ?? []),issue]);
  }
  if (!grouped.size) grouped.set("mode_fit",[]);
  const {novelId,chapterId,order} = run.progress.unit;
  // Every report describes the current selected version. Do not leave another category's old-version report visible.
  await tx.auditReport.deleteMany({where:{novelId,chapterId}});
  const conflicts: Array<{key: string; issueId: string; type: string; title: string; summary: string; severity: string; evidence: string; hint: string}> = [];
  for (const [auditType,issues] of grouped) {
    const report = await tx.auditReport.create({data:{novelId,chapterId,auditType,
      overallScore:available ? Math.round(assessment.score.overall) : null, summary:assessment.summary,
      legacyScoreJson:JSON.stringify({...(available ? {...assessment.score,scoreAvailable:true} : {scoreAvailable:false}),
        acceptanceStatus:assessment.status,continuePolicy:assessment.continuePolicy,riskTags:assessment.riskTags,
        assetSyncRecommendation:assessment.assetSyncRecommendation,repairDirectives:assessment.repairDirectives,
        productionUnitRunId:run.id,contentHash:run.progress.selectedContentHash}),
      issues:{create:issues.map((issue,index)=>({auditType,severity:issue.severity,code:issue.code || `acceptance_${index+1}`,
        description:issue.evidence,evidence:issue.evidence,fixSuggestion:issue.fixSuggestion}))}},include:{issues:true}});
    for (const issue of report.issues) {
      const summary = normalize(issue.description), code = issue.code.trim();
      conflicts.push({key:`${auditType}:${code.toLowerCase()}:${summary.toLowerCase()}`,issueId:issue.id,type:auditType,
        title:`${auditType}/${code || summary.slice(0,32)}`,summary,severity:issue.severity,
        evidence:normalize(issue.evidence),hint:normalize(issue.fixSuggestion)});
    }
  }
  await tx.openConflict.updateMany({where:{novelId,chapterId,sourceType:"audit_issue",status:"open",
    conflictKey:{notIn:conflicts.map(item=>item.key)}},data:{status:"resolved"}});
  for (const item of conflicts) {
    const data = {sourceSnapshotId:null,sourceIssueId:item.issueId,conflictType:item.type,title:item.title,summary:item.summary,
      severity:item.severity,status:"open",evidenceJson:JSON.stringify([item.evidence].filter(Boolean)),
      resolutionHint:item.hint || null,lastSeenChapterOrder:order};
    await tx.openConflict.upsert({where:{novelId_chapterId_sourceType_conflictKey:{novelId,chapterId,sourceType:"audit_issue",conflictKey:item.key}},
      create:{novelId,chapterId,sourceType:"audit_issue",conflictKey:item.key,...data},update:data});
  }
  return true;
}
