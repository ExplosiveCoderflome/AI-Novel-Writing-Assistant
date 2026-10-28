import { z } from "zod";
import type { LLMProvider } from "@ai-novel/shared/types/llm";

export const kernelModelWindowsSchema=z.array(z.object({provider:z.string().trim().min(1),model:z.string().trim().min(1),
  contextWindow:z.number().int().positive().max(Number.MAX_SAFE_INTEGER)}).strict());

/** Caller supplies captured provider metadata/configuration. No model-family guesses or output-cap substitution. */
export function createKernelModelWindowReader(snapshot: unknown):(provider:LLMProvider,model:string)=>Promise<number|null> {
  const entries=kernelModelWindowsSchema.parse(snapshot),windows=new Map<string,number>();
  for(const row of entries){
    const key=JSON.stringify([row.provider,row.model]);
    if(windows.has(key))throw new Error("模型上下文窗口配置重复。");
    windows.set(key,row.contextWindow);
  }
  return async(provider,model)=>windows.get(JSON.stringify([provider,model])) ?? null;
}
