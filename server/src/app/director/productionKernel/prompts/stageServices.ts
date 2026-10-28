import type { LLMProvider } from "@ai-novel/shared/types/llm";
import type { ChapterRuntimePackage } from "@ai-novel/shared/types/chapterRuntime";
import type { StyleRewriteBaseline } from "@ai-novel/shared/types/styleEngine";
import { buildKernelAcceptancePromptRequest, buildKernelPatchPromptRequest, createRegisteredChapterWriter,
  hashProductionContent, ProductionSnapshotConflictError, InvalidProductionRequestError,
  type AcceptancePromptContextResolver, type ChapterModelAdapterDependencies, type ChapterStageServices,
  type PreparedStageCall, type RegisteredChapterWriterDependencies, type UnitRun } from "../../../../modules/production";
import { canonicalProductionJson, cloneProductionData, type ProductionJson } from "../../../../modules/production/common";
import { chapterAcceptanceAssessmentPrompt } from "../../../../prompting/prompts/novel/chapterAcceptance.prompts";
import { chapterPatchRepairPrompt } from "../../../../prompting/prompts/novel/chapterPatchRepair.prompts";
import { chapterWriterPrompt } from "../../../../prompting/prompts/novel/chapterWriter.prompts";
import type { PromptExecutionOptions, PromptContextBlock, PromptAsset } from "../../../../prompting/core/promptTypes";
import { createKernelPromptPreparer } from "./preflight";
import { runKernelRequestScope } from "../execution/requestScope";

type RepairInput = Parameters<ChapterStageServices["repair"]>[0];
type PhysicalScope = Parameters<typeof runKernelRequestScope>[0];
type NativePrompt = {promptInput: unknown;contextBlocks?: PromptContextBlock[];options: PromptExecutionOptions};
type SavedPrompt = {nativePrompt: NativePrompt;nativeIdentity: string;repairRuntime?: ChapterRuntimePackage};
export interface KernelNativeStagePromptDependencies {
  preflight: ReturnType<typeof createKernelPromptPreparer>;
  resolveAcceptanceContext: AcceptancePromptContextResolver;
  resolveWriterContext: RegisteredChapterWriterDependencies["resolveContext"];
  invokeWriter: RegisteredChapterWriterDependencies["invokePrompt"];
  buildRepairRuntime(input: Omit<RepairInput,"call">): Promise<ChapterRuntimePackage>;
  requestLimit(run: UnitRun, stage: string): number;
  budget: PhysicalScope["budget"];
  fence(run: UnitRun): Promise<void>;
}
const wire = (value: unknown): ProductionJson => JSON.parse(JSON.stringify(value));
const hash = (value: unknown): string => hashProductionContent(canonicalProductionJson(wire(value)));

/** Native services retain evaluation/application. Only their saved read-only requests enter this caller's fences. */
export function createKernelNativeStagePrompts(deps: KernelNativeStagePromptDependencies):
  Pick<ChapterStageServices,"describe"|"scoped"|"write"> & Pick<ChapterModelAdapterDependencies,"repairRuntime"> {
  const writer=createRegisteredChapterWriter({resolveContext:deps.resolveWriterContext,invokePrompt:deps.invokeWriter,
    describePrompt:async request=>(await deps.preflight.prepare(request)).description});
  const assetFor=(stage: string|null):PromptAsset<any,any,any>=>{
    if(stage === "draft")return chapterWriterPrompt;
    if(stage === "accept" || stage === "verify")return chapterAcceptanceAssessmentPrompt;
    if(stage === "repair")return chapterPatchRepairPrompt;
    throw new InvalidProductionRequestError("Unexpected native model stage");
  };
  function saved(run: UnitRun, call: PreparedStageCall): SavedPrompt {
    const value=call.input as unknown as SavedPrompt,options=value.nativePrompt?.options;
    if(!value.nativeIdentity || !options || options.novelId !== run.progress.unit.novelId || options.chapterId !== run.progress.unit.chapterId
      || options.provider !== run.snapshots.model.provider || options.model !== run.snapshots.model.model)throw new InvalidProductionRequestError("Native Prompt differs from the frozen unit");
    return cloneProductionData(value);
  }
  async function revalidate(run: UnitRun, call: PreparedStageCall) {
    const value=saved(run,call),prepared=await deps.preflight.prepare({...value.nativePrompt,asset:assetFor(run.activeStage)});
    if(prepared.description.identity !== value.nativeIdentity)throw new ProductionSnapshotConflictError();
    return prepared;
  }
  return {
    write:writer.invoke,
    async describe(stage,run,input) {
      if(!["draft","accept","verify","repair"].includes(stage))return {callsModel:false,input,
        inputFingerprint:hash(input),promptVersion:`kernel_${stage}@1`,configVersion:run.snapshots.model.configVersion};
      const value=input as unknown as {prepared:Parameters<ChapterStageServices["write"]>[1];content:string;
        assessment:RepairInput["assessment"];baseline?:RepairInput["assessment"];repair?:{styleRewriteBaseline?:StyleRewriteBaseline}};
      let native: NativePrompt,call:PreparedStageCall|undefined,runtime:ChapterRuntimePackage|undefined;
      if(stage === "draft") {
        call=await writer.describe(run,value.prepared);
        native=(call.input as {writerRequest:ProductionJson}).writerRequest as unknown as NativePrompt;
      } else if(stage === "repair") {
        runtime=await deps.buildRepairRuntime({run,prepared:value.prepared,content:value.content,assessment:value.assessment});
        native=buildKernelPatchPromptRequest({novelId:run.progress.unit.novelId,chapterId:run.progress.unit.chapterId,
          novelTitle:value.prepared.novelTitle,chapterTitle:value.prepared.chapterTitle,content:value.content,issues:value.assessment.issues,
          issuesJson:JSON.stringify(value.assessment.assessment),runtimePackage:runtime,repairContext:runtime.context.chapterRepairContext,
          provider:run.snapshots.model.provider as LLMProvider,model:run.snapshots.model.model,repairMode:run.snapshots.profile.repair.mode});
      } else native=await buildKernelAcceptancePromptRequest({novelId:run.progress.unit.novelId,chapterId:run.progress.unit.chapterId,
        novelTitle:value.prepared.novelTitle,chapterTitle:value.prepared.chapterTitle,chapterOrder:run.progress.unit.order,content:value.content,
        contextPackage:value.prepared.contextPackage,targetWordCount:value.prepared.contextPackage.chapterWriteContext?.chapterMission.targetWordCount
          ?? value.prepared.contextPackage.chapter.targetWordCount ?? null,provider:run.snapshots.model.provider as LLMProvider,model:run.snapshots.model.model,
        repairReviewBaseline:stage === "verify" ? value.baseline?.assessment : undefined,
        styleRewriteBaseline:stage === "verify" ? value.repair?.styleRewriteBaseline : undefined,persist:false},deps.resolveAcceptanceContext);
      const prepared=await deps.preflight.prepare({...native,asset:assetFor(stage)}),description=prepared.description;
      if(description.outputTokens > (run.snapshots.profile.outputBudgets[stage] ?? 0))throw new InvalidProductionRequestError("Native output exceeds the frozen stage allowance");
      const stored={nativePrompt:{promptInput:native.promptInput,contextBlocks:native.contextBlocks,options:native.options},nativeIdentity:description.identity,
        ...(runtime ? {repairRuntime:runtime} : {})};
      return {...(call ?? {callsModel:true,outputTokens:description.outputTokens,inputFingerprint:hash(stored),promptVersion:description.promptVersion,
        configVersion:run.snapshots.model.configVersion}),input:wire({...((call?.input as object) ?? {}),...stored})};
    },
    async scoped(run,call,operation) {
      await deps.fence(run);
      if(!call.callsModel){const result=await operation();await deps.fence(run);return result;}
      const prepared=await revalidate(run,call as PreparedStageCall);
      const result=await prepared.execute(()=>runKernelRequestScope({unit:run.progress.unit,requestKey:call.requestKey,
        maxRequests:deps.requestLimit(run,run.activeStage!),reserveTokens:prepared.reserveTokens,budget:deps.budget,fence:()=>deps.fence(run)},operation));
      await revalidate(run,call as PreparedStageCall);await deps.fence(run);return result;
    },
    async repairRuntime(input) {
      const value=saved(input.run,input.call);
      if(!value.repairRuntime || value.nativePrompt.promptInput === null
        || (value.nativePrompt.promptInput as {chapterContent?:string}).chapterContent !== input.content)throw new InvalidProductionRequestError("Saved repair runtime differs from its manuscript");
      return value.repairRuntime;
    },
  };
}
