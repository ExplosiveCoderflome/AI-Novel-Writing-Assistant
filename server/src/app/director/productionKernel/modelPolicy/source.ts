import type { RunContract } from "../../../../modules/director";
import { resolveLLMClientOptions } from "../../../../llm/factory";
import { getStructuredFallbackSettings } from "../../../../llm/structuredFallbackSettings";
import { ProductionSnapshotConflictError } from "../../../../modules/production";
import { canonicalProductionJson } from "../../../../modules/production/common";
import { configurationKey, matchSavedKernelBudget } from "../prompts/preflight";
import { createKernelModelWindowReader, kernelModelWindowsSchema } from "../prompts/modelWindows";
import { KERNEL_MODEL_TASKS, validateKernelModelPolicy, type KernelModelPolicy } from "./types";
import { MissingTaskOutputBudgetError } from "../../../../platform/llm/execution";

export interface KernelModelPolicySources {
  /** Explicit provider/model metadata. Empty/unknown metadata cannot authorize a model. */
  readWindows?: () => unknown;
  readFallback?: typeof getStructuredFallbackSettings;
  resolveModel?: typeof resolveLLMClientOptions;
}

/** Only native configuration resolution; never constructs an SDK client, probes a provider or writes settings. */
export async function captureKernelModelPolicy(contract: RunContract, sources: KernelModelPolicySources = {},
  saved?: KernelModelPolicy): Promise<KernelModelPolicy> {
  const provider=contract.modelConfig.route,model=contract.modelConfig.model;
  if(!provider?.trim()||provider==="default"||!model?.trim()||model==="default")throw new Error("Kernel model policy needs an explicit provider/model");
  const configured=kernelModelWindowsSchema.parse((sources.readWindows ?? (()=>JSON.parse(process.env.PRODUCTION_KERNEL_MODEL_WINDOWS ?? "[]")))());
  const windowFor=createKernelModelWindowReader(configured);
  const fallback=structuredClone(await (sources.readFallback ?? getStructuredFallbackSettings)());
  const models=[{provider,model},...(fallback.enabled ? [{provider:fallback.provider,model:fallback.model}] : [])]
    .filter((row,index,rows)=>rows.findIndex(other=>other.provider===row.provider&&other.model===row.model)===index);
  const windows:KernelModelPolicy["windows"]=[],targets:KernelModelPolicy["targets"]=[];
  for(const target of models){
    const contextWindow=await windowFor(target.provider,target.model);
    if(contextWindow===null)throw new Error(`模型缺少明确的上下文窗口配置（${target.provider}/${target.model}）。`);
    windows.push({...target,contextWindow});
  }
  for(const target of models)for(const taskType of KERNEL_MODEL_TASKS){
    const current=await (sources.resolveModel ?? resolveLLMClientOptions)(target.provider,{model:target.model,taskType,executionMode:"plain"});
    const previous=saved?.targets.find(row=>row.provider===target.provider&&row.model===target.model&&row.taskType===taskType);
    const effective=previous ? matchSavedKernelBudget(current, previous.configurationHash, previous.maxTokens) : current;
    if(effective.provider!==target.provider||effective.model!==target.model)throw new ProductionSnapshotConflictError();
    const window=windows.find(row=>row.provider===target.provider&&row.model===target.model)!.contextWindow;
    if(!Number.isSafeInteger(effective.maxTokens)||effective.maxTokens!<1)
      throw new MissingTaskOutputBudgetError(target.provider, target.model, taskType);
    if(effective.maxTokens!+1024>=window) throw new Error(`模型 ${target.provider}/${target.model} 的 ${taskType} 输出预算超出了可用上下文，请调整模型路由后重新准备。`);
    targets.push({...target,taskType,configurationHash:configurationKey(effective),
      ...(!saved || previous?.maxTokens != null ? {maxTokens: effective.maxTokens} : {})});
  }
  return validateKernelModelPolicy({version:1,provider,model,windows,fallback,targets,
    ...(!saved || saved.structuredThinking ? {structuredThinking:"default_off"} : {})});
}

/** Install assertCurrent in every physical request fence; preflight receives the captured fallback and windows. */
export function createKernelFrozenModelPolicy(input: unknown, capture: ()=>Promise<KernelModelPolicy>) {
  const snapshot=validateKernelModelPolicy(input),identity=canonicalProductionJson(snapshot);
  return {contextWindowFor:createKernelModelWindowReader(snapshot.windows),
    readFallback:async()=>structuredClone(snapshot.fallback),
    async assertCurrent(){
      if(canonicalProductionJson(validateKernelModelPolicy(await capture()))!==identity)throw new ProductionSnapshotConflictError();
    }};
}
