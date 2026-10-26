import type { Prisma, PrismaClient } from "@prisma/client";
import type { StepContext } from "../../../../modules/director";
import { hashProductionContent } from "../../../../modules/production";
import { canonicalProductionJson } from "../../../../modules/production/common";
import { createKernelOwnership } from "../execution/ownership";
import { validateKernelModelPolicy, type KernelModelPolicy } from "./types";

const TYPE="production_kernel_model_policy";
/** The same worker lease and immutable contract own model policy and chapter production. */
export async function bindKernelModelPolicy(db: PrismaClient, context: StepContext, capture: ()=>Promise<KernelModelPolicy>) {
  const assertOwnership=createKernelOwnership(context),contract=structuredClone(context.contract);
  const contractHash=hashProductionContent(canonicalProductionJson(contract));
  async function saved(tx: Prisma.TransactionClient){
    const rows=await tx.directorNextEvent.findMany({where:{runId:contract.runId,type:TYPE},select:{payloadJson:true},take:2});
    if(!rows.length)return null;
    if(rows.length!==1)throw new Error("Kernel model policy binding is ambiguous");
    const value=JSON.parse(rows[0].payloadJson);
    if(value.version!==1||value.contractHash!==contractHash)throw new Error("Kernel model policy contract changed");
    const policy=validateKernelModelPolicy(value.policy);
    if(policy.provider!==contract.modelConfig.route||policy.model!==contract.modelConfig.model)throw new Error("Kernel model policy target changed");
    return policy;
  }
  const existing=await db.$transaction(async tx=>{await assertOwnership(tx);return saved(tx);});
  if(existing)return existing;
  const candidate=validateKernelModelPolicy(await capture());
  if(candidate.provider!==contract.modelConfig.route||candidate.model!==contract.modelConfig.model)throw new Error("Kernel model policy target changed");
  return db.$transaction(async tx=>{
    await assertOwnership(tx);
    const existing=await saved(tx);if(existing)return existing;
    const latest=await tx.directorNextEvent.findFirst({where:{runId:contract.runId},orderBy:{seq:"desc"},select:{seq:true}});
    await tx.directorNextEvent.create({data:{id:`${contract.runId}:production-model-policy`,runId:contract.runId,
      seq:(latest?.seq ?? 0)+1,type:TYPE,payloadJson:canonicalProductionJson({version:1,contractHash,policy:candidate})}});
    return candidate;
  });
}
