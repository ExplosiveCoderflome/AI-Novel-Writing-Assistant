import type { LLMProvider } from "@ai-novel/shared/types/llm";
import type { PromptAsset, PromptContextBlock, PromptExecutionOptions } from "../../../../prompting/core/promptTypes";
import { prepareEffectivePromptExecution } from "../../../../prompting/execution";
import { resolveLLMClientOptions, type ResolvedLLMClientOptions } from "../../../../llm/factory";
import { getStructuredFallbackSettings, type StructuredFallbackSettings } from "../../../../llm/structuredFallbackSettings";
import { buildStructuredResponseFormat, resolveStructuredOutputProfile, selectStructuredOutputStrategy,
  type StructuredOutputStrategy } from "../../../../llm/structuredOutput";
import { withLlmExecutionPolicy } from "../../../../platform/llm/execution";
import type { PhysicalModelRequest } from "../../../../platform/llm/retries";
import { hashProductionContent, ProductionContextBudgetError, type ArtifactPromptDescription } from "../../../../modules/production";
import { canonicalProductionJson, checkContextBudget } from "../../../../modules/production/common";

export interface KernelPromptPreparerDependencies {
  contextWindowFor(provider: LLMProvider, model: string): Promise<number | null>;
  resolveModel?: typeof resolveLLMClientOptions;
  readFallback?: () => Promise<StructuredFallbackSettings>;
}
const json = (value: unknown) => JSON.parse(JSON.stringify(value ?? null));
const canonical = (value: unknown): string => canonicalProductionJson(json(value));
const digest = (value: unknown): string => hashProductionContent(canonical(value));
/** Whitelist configuration identity. Credentials and raw endpoints never enter persistent descriptions. */
export function configurationKey(value: ResolvedLLMClientOptions): string {
  return digest({provider:value.provider,model:value.model,endpoint:digest(value.baseURL),authMode:value.authMode,
    temperature:value.temperature,maxTokens:value.maxTokens ?? null,timeoutMs:value.timeoutMs ?? null,
    reasoningEnabled:value.reasoningEnabled,reasoningEffort:value.reasoningEffort,reasoningForcedOff:value.reasoningForcedOff,
    modelKwargsHash:digest(value.modelKwargs),includeRawResponse:value.includeRawResponse,requestProtocol:value.requestProtocol,
    executionMode:value.executionMode,structuredStrategy:value.structuredStrategy ?? null,profileHash:digest(value.structuredProfile),
    taskType:value.taskType ?? null,modelRoute:value.modelRoute ?? null,routeDegraded:value.routeDegraded ?? false});
}
function messages(input: unknown): unknown {
  if(input && typeof input === "object" && "toChatMessages" in input && typeof input.toChatMessages === "function")return messages(input.toChatMessages());
  if(!Array.isArray(input))throw new Error("Kernel model invocation requires complete chat messages");
  return input.map(raw=>{
    const value=raw as {getType?:()=>string;_getType?:()=>string;role?:string;content?:unknown;additional_kwargs?:object;tool_calls?:unknown[]};
    const role=value.getType?.() ?? value._getType?.() ?? value.role;
    if(!role || value.content === undefined)throw new Error("Invalid kernel model message");
    return {role:role === "user" ? "human" : role === "assistant" ? "ai" : role,content:value.content,
      ...(value.additional_kwargs && Object.keys(value.additional_kwargs).length ? {additional:value.additional_kwargs} : {}),
      ...(value.tool_calls?.length ? {tools:value.tool_calls} : {})};
  });
}

/** Resolves every allowed native target/strategy read-only, then fences actual SDK calls against those snapshots. */
export function createKernelPromptPreparer(deps: KernelPromptPreparerDependencies) {
  const resolve=deps.resolveModel ?? resolveLLMClientOptions;
  return {async prepare<I,O,R=O>(request: {asset:PromptAsset<I,O,R>;promptInput:I;contextBlocks?:PromptContextBlock[];options?:PromptExecutionOptions}) {
    const options=request.options;
    if(!options?.provider || !options.model)throw new Error("Kernel Prompt requires an explicit frozen provider/model");
    const prepared=await prepareEffectivePromptExecution(request),initial=messages(prepared.messages);
    const fallback=structuredClone(await (deps.readFallback ?? getStructuredFallbackSettings)());
    const configurations=new Map<string,{configuration:ResolvedLLMClientOptions;window:number}>(),formats:unknown[]=[];
    async function add(configuration: ResolvedLLMClientOptions) {
      if(!Number.isSafeInteger(configuration.maxTokens) || configuration.maxTokens!<1)throw new Error("模型配置缺少可执行的输出额度上限。");
      const window=await deps.contextWindowFor(configuration.provider,configuration.model);
      if(window === null)throw new ProductionContextBudgetError();
      configurations.set(configurationKey(configuration),{configuration,window});
    }
    const primary=await resolve(options.provider,{fallbackProvider:"deepseek",model:options.model,
      temperature:options.temperature ?? (request.asset.mode === "structured" ? 0.3 : undefined),maxTokens:options.maxTokens,
      ...(request.asset.mode === "text" ? {reasoningEnabled:options.reasoningEnabled,timeoutMs:options.timeoutMs} : {}),
      taskType:request.asset.taskType,executionMode:"plain"});
    if(request.asset.mode === "text")await add(primary);
    else {
      const targets=[primary];
      if(fallback.enabled && fallback.model.trim() && (fallback.provider !== primary.provider || fallback.model !== primary.model)) {
        targets.push(await resolve(fallback.provider,{fallbackProvider:"deepseek",model:fallback.model,temperature:fallback.temperature,
          maxTokens:fallback.maxTokens ?? undefined,taskType:request.asset.taskType,executionMode:"plain"}));
      }
      for(const target of targets){
        const profile=resolveStructuredOutputProfile({provider:target.provider,model:target.model,baseURL:target.baseURL,requestProtocol:target.requestProtocol,executionMode:"structured"});
        const first=selectStructuredOutputStrategy(profile,request.asset.outputSchema!);
        const strategies:StructuredOutputStrategy[]=[first,...(first === "json_schema" && profile.nativeJsonObject ? ["json_object" as const] : []),...(first !== "prompt_json" ? ["prompt_json" as const] : [])];
        for(const [index,strategy]of strategies.entries()){
          formats.push(buildStructuredResponseFormat({strategy,schema:request.asset.outputSchema!,label:`${request.asset.id}@${request.asset.version}`}));
          const actual=await resolve(target.provider,{fallbackProvider:"deepseek",model:target.model,baseURL:target.baseURL,authMode:target.authMode,
            temperature:index === 0 ? target.temperature : Math.min(target.temperature,0.2),maxTokens:target.maxTokens,timeoutMs:options.timeoutMs,
            taskType:request.asset.taskType,executionMode:"structured",structuredStrategy:strategy,requestProtocol:target.requestProtocol});
          await add(actual);
          // Structured retries reuse the last strategy past the end of the
          // sequence with the subsequent-attempt temperature (min(base, 0.2)),
          // and a preferred strategy can reorder any entry past index 0. A
          // single-strategy profile therefore reaches an unregistered
          // temperature on its first retry, and the fence turns a retryable
          // output failure into an unknown outcome. Register that pair for
          // every strategy so the retry can run.
          await add(await resolve(target.provider,{fallbackProvider:"deepseek",model:target.model,baseURL:target.baseURL,authMode:target.authMode,
            temperature:Math.min(target.temperature,0.2),maxTokens:target.maxTokens,timeoutMs:options.timeoutMs,
            taskType:request.asset.taskType,executionMode:"structured",structuredStrategy:strategy,requestProtocol:target.requestProtocol}));
          // JSON correction uses the actual attempt's output cap and its own native temperature.
          await add(await resolve(target.provider,{fallbackProvider:"deepseek",model:target.model,baseURL:target.baseURL,
            temperature:0.15,maxTokens:actual.maxTokens,timeoutMs:options.timeoutMs,taskType:request.asset.taskType,
            executionMode:"structured",structuredStrategy:"prompt_json",requestProtocol:target.requestProtocol}));
        }
      }
    }
    const rows=[...configurations.entries()],outputTokens=Math.max(...rows.map(([,row])=>row.configuration.maxTokens!));
    const contextWindow=Math.min(...rows.map(([,row])=>row.window)),renderedInput=canonical({messages:initial,responseFormats:formats});
    if(!checkContextBudget({input:renderedInput,contextWindow,outputTokens,safetyTokens:1024}).ok)throw new ProductionContextBudgetError();
    for(const [,row]of rows)if(!checkContextBudget({input:canonical({messages:initial,responseFormats:formats,modelKwargs:row.configuration.modelKwargs ?? null}),
      contextWindow:row.window,outputTokens:row.configuration.maxTokens!,safetyTokens:1024}).ok)throw new ProductionContextBudgetError();
    const description:ArtifactPromptDescription={identity:digest({asset:request.asset.id,version:request.asset.version,
      configurations:rows.map(([key,row])=>({key,window:row.window})),fallback,renderedHash:hashProductionContent(renderedInput)}),
      promptVersion:request.asset.version,provider:primary.provider,model:primary.model,outputTokens,requestOutputTokens:primary.maxTokens!,contextWindow,renderedInput};
    const assertConfiguration=(configuration:ResolvedLLMClientOptions)=>{
      const row=configurations.get(configurationKey(configuration));if(!row){throw new Error("Kernel model configuration snapshot changed");}return row;
    };
    const reserveTokens=(physical:PhysicalModelRequest|undefined):number=>{
      if(!physical?.configuration)throw new Error("Actual model request configuration is unavailable");
      const row=assertConfiguration(physical.configuration),call=physical.options as Record<string,unknown>|undefined;
      for(const key of ["maxTokens","max_tokens","max_completion_tokens"])if(call?.[key] !== undefined && call[key] !== row.configuration.maxTokens)throw new Error("Kernel output allowance changed");
      const input=canonical({messages:messages(physical.input),responseFormat:call?.response_format ?? null,tools:call?.tools ?? null,
        toolChoice:call?.tool_choice ?? null,modelKwargs:row.configuration.modelKwargs ?? null});
      const budget=checkContextBudget({input,contextWindow:row.window,outputTokens:row.configuration.maxTokens!,safetyTokens:1024});
      if(!budget.ok || !("requiredTokens" in budget))throw new ProductionContextBudgetError();
      return budget.requiredTokens;
    };
    return {description,reserveTokens,execute:<T>(operation:()=>Promise<T>)=>{
      let initialSeen=false;
      return withLlmExecutionPolicy({fallback,assertConfiguration,assertRequest:(configuration,physical)=>{
        reserveTokens({configuration,...physical});
        if(!initialSeen && canonical(messages(physical.input)) !== canonical(initial))throw new Error("Kernel effective Prompt snapshot changed");
        initialSeen=true;
      }},operation);
    }};
  }};
}
