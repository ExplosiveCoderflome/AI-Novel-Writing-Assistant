import type {Prisma} from "@prisma/client";
import {directorProductionPlan, downstreamArtifactTypes, type RunContract} from "../../../modules/director";
import {AppError} from "../../../middleware/errorHandler";

/** Called only in the explicit resume transaction, before a prose job has been bound. */
export async function revalidateSavedPlanning(contract:RunContract, tx:Prisma.TransactionClient) {
  const from=contract.chapterRange?.from;
  if (!from || contract.planVersion !== directorProductionPlan.version) return;
  const current=await tx.directorNextArtifact.findFirst({where:{novelId:contract.novelId,scope:contract.scope,type:"chapter_task_sheet"},orderBy:{version:"desc"}});
  if (!current || current.status === "stale") return;
  const plans=await tx.volumeChapterPlan.findMany({where:{volume:{novelId:contract.novelId},chapterOrder:from},select:{taskSheet:true,sceneCards:true}});
  if (plans.length===1 && plans[0].taskSheet?.trim() && plans[0].sceneCards?.trim()) return;
  const types=["chapter_task_sheet",...downstreamArtifactTypes(directorProductionPlan,"chapter_task_sheet")].filter(type=>type !== "chapter_draft");
  const artifacts=await tx.directorNextArtifact.findMany({where:{novelId:contract.novelId,scope:contract.scope,type:{in:types}},orderBy:{version:"desc"}});
  const seen=new Set<string>();
  for (const artifact of artifacts) {
    if (seen.has(artifact.type)) continue;
    seen.add(artifact.type);
    if (artifact.protectedUserContent && artifact.status !== "stale") throw new AppError("缺失的章节计划包含需要保留的修改，请先核对保存结果，不能自动覆盖。",400);
  }
  await tx.directorNextArtifact.updateMany({where:{novelId:contract.novelId,scope:contract.scope,type:{in:types},protectedUserContent:false,status:{not:"stale"}},data:{status:"stale"}});
}
