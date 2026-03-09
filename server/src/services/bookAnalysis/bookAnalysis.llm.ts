import type { LLMProvider } from "@ai-novel/shared/types/llm"; 
import type { BaseMessage } from "@langchain/core/messages"; 
import { supportsForcedJsonOutput } from "../../llm/capabilities"; 
import { getLLM } from "../../llm/factory"; 
 
const DEFAULT_BOOK_ANALYSIS_LLM_TIMEOUT_MS = 90_000; 
 
function getBookAnalysisLlmTimeoutMs(): number { 
  const raw = Number(process.env.BOOK_ANALYSIS_LLM_TIMEOUT_MS ?? ""); 
  if (Number.isFinite(raw) && raw >= 5_000) { 
    return raw; 
  } 
  return DEFAULT_BOOK_ANALYSIS_LLM_TIMEOUT_MS; 
} 
 
function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> { 
  return new Promise<T>((resolve, reject) => { 
    const timer = setTimeout(() => { 
      reject(new Error(`Book analysis LLM request timed out after ${timeoutMs}ms.`)); 
    }, timeoutMs); 
 
    promise.then( 
      (value: T) => { 
        clearTimeout(timer); 
        resolve(value); 
      }, 
      (error: unknown) => { 
        clearTimeout(timer); 
        reject(error); 
      }, 
    ); 
  }); 
} 
 
export async function invokeWithJsonGuard( 
  llm: Awaited<ReturnType<typeof getLLM>>, 
  messages: BaseMessage[], 
  provider: LLMProvider, 
  model?: string, 
) { 
  const timeoutMs = getBookAnalysisLlmTimeoutMs(); 
  const invoke = (options?: Record<string, unknown>) => 
    withTimeout(llm.invoke(messages, options), timeoutMs); 
 
  if (!supportsForcedJsonOutput(provider, model)) { 
    return invoke(); 
  } 
 
  try { 
    return await invoke({ 
      response_format: { type: "json_object" }, 
    } as Record<string, unknown>); 
  } catch (error) { 
    if (error instanceof Error && /timed out/i.test(error.message)) { 
      throw error; 
    } 
    return invoke(); 
  } 
}
