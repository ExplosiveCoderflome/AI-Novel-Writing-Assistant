import type { PrismaClient } from "@prisma/client";
import { artifactContentHash, type StepContext, type StepHandler } from "../../../../modules/director";
import { runUnit, type UnitPorts, type UnitRef, type UnitRequest } from "../../../../modules/production";
import { ProtectedProductionContentError } from "../../../../modules/production/common";
import { assertKernelOwnership } from "../execution/ownership";
import { readKernelUnitOutcome } from "../readModel/completion";
import { chooseProductionBatchImplementation } from "./binding";
import { createKernelChapterBatchHandler } from "./handler";
import { createProductionBatchRouter, productionKernelV2ChaptersEnabled } from "./router";
import {assertKernelStartReadiness, KernelReadinessError} from "../readiness";
import {readManualChapterRequest} from "../manual/contract";
import {MissingTaskOutputBudgetError} from "../../../../platform/llm/execution";

export interface KernelBatchRuntime {
  request(unit: UnitRef): UnitRequest;
  ports(unit: UnitRef): UnitPorts;
}

/** The live app supplies native ports here; tests replace transports/sources rather than the batch decision loop. */
export function createKernelProductionStep(input: {db: PrismaClient; legacy: StepHandler;
  runtime(context: StepContext): Promise<KernelBatchRuntime>; enabled?: ()=>boolean}): StepHandler {
  return createProductionBatchRouter({enabled:input.enabled ?? productionKernelV2ChaptersEnabled,
    choose:(context,enabled)=>chooseProductionBatchImplementation(input.db,context,Boolean(readManualChapterRequest(context.contract)) || enabled),legacy:input.legacy,
    kernel:async context=>{
      await assertKernelOwnership(input.db,context);
      try {
        await assertKernelStartReadiness(input.db,context.contract);
        const runtime=await input.runtime(context);
        return await createKernelChapterBatchHandler({assertActive:()=>assertKernelOwnership(input.db,context),
          readChapters:()=>input.db.chapter.findMany({where:{novelId:context.contract.novelId,
            order:{gte:context.contract.chapterRange!.from,lte:context.contract.chapterRange!.to}},
            select:{id:true,novelId:true,order:true,content:true},orderBy:{order:"asc"}}),
          readOutcome:(_context,chapter)=>readKernelUnitOutcome(input.db,context.contract,chapter),
          runChapter:(_context,chapter)=>{
            const unit={novelId:chapter.novelId,chapterId:chapter.id,order:chapter.order};
            return runUnit(runtime.request(unit),runtime.ports(unit));
          },hashBatch:artifactContentHash})(context);
      } catch (error: unknown) {
        if (error instanceof ProtectedProductionContentError) {
          return { stopSignal: { kind: "manual_recovery", action: "pause_for_manual", source: "runtime", reason: error.message } };
        }
        if (!(error instanceof MissingTaskOutputBudgetError)
          && !(error instanceof KernelReadinessError && error.code === "production_output_budget_capture_missing")) throw error;
        return { stopSignal: { kind: "manual_recovery", action: "pause_for_manual", source: "runtime", reason: error.message } };
      }
    }});
}
