import { AsyncLocalStorage } from "node:async_hooks";
import type { ChatOpenAI } from "@langchain/openai";
import type { ResolvedLLMClientOptions } from "../../../llm/factory";
import type { StructuredFallbackSettings } from "../../../llm/structuredFallbackSettings";

export interface LlmExecutionPolicy {
  fallback: StructuredFallbackSettings;
  assertConfiguration(configuration: ResolvedLLMClientOptions): void;
  assertRequest(configuration: ResolvedLLMClientOptions, request: {input: unknown; options: unknown}): void;
}
const execution = new AsyncLocalStorage<{policy: LlmExecutionPolicy; unsafe?: unknown}>();
const ATTACHED = Symbol("LLM_EXECUTION_POLICY");
export async function withLlmExecutionPolicy<T>(policy: LlmExecutionPolicy, run: () => Promise<T>): Promise<T> {
  const state = {policy:{...policy,fallback:structuredClone(policy.fallback)},unsafe:undefined as unknown};
  return execution.run(state,async()=>{
    try {const result=await run();if(state.unsafe)throw state.unsafe;return result;}
    catch(error){throw state.unsafe ?? error;}
  });
}
export function currentStructuredFallbackSnapshot(): StructuredFallbackSettings | undefined {
  const settings = execution.getStore()?.policy.fallback;
  return settings && structuredClone(settings);
}
function check(operation: (policy: LlmExecutionPolicy) => void): void {
  const current=execution.getStore();if(!current)return;
  if(current.unsafe)throw current.unsafe;
  try{operation(current.policy);}catch(error){current.unsafe=error;throw error;}
}
export function assertLlmExecutionConfiguration(configuration: ResolvedLLMClientOptions): void {
  check(policy=>policy.assertConfiguration(configuration));
}
/** Runs before usage observation/provider effects, including format-repair and fallback calls. */
export function attachLlmExecutionPolicy<T extends Pick<ChatOpenAI,"invoke"|"stream"|"batch">>(llm: T, configuration: ResolvedLLMClientOptions): T {
  if((llm as T & {[ATTACHED]?: boolean})[ATTACHED])return llm;
  for(const method of ["invoke","stream","batch"] as const){
    const call=llm[method].bind(llm) as (...args: unknown[])=>Promise<unknown>;
    Object.defineProperty(llm,method,{configurable:true,writable:true,value:async(...args: unknown[])=>{
      check(policy=>{
        policy.assertConfiguration(configuration);
        const inputs=method==="batch"?args[0] as unknown[]:[args[0]];
        for(const [index,input]of inputs.entries())policy.assertRequest(configuration,{
          input,options:method==="batch"&&Array.isArray(args[1])?args[1][index]:args[1],
        });
      });
      return call(...args);
    }});
  }
  Object.defineProperty(llm,ATTACHED,{value:true});return llm;
}
