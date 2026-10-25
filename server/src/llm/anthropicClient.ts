import { normalizeApiBaseURL, originBoundFetch, readSseJSON, assertApiResponse } from "./protocols/transport";
import { toJSONSchema } from "zod";
import {applyCacheRequestPolicy,getPromptCacheBoundary,resolveCacheCapability} from "../platform/llm/cache";
import { IterableReadableStream } from "@langchain/core/utils/stream";
import {
  AIMessage,
  AIMessageChunk,
  SystemMessage,
  type BaseMessage,
  type MessageContent,
} from "@langchain/core/messages";

interface AnthropicLLMOptions {
  apiKey?: string;
  model: string;
  baseURL: string;
  temperature: number;
  maxTokens?: number;
  timeoutMs?: number;
  modelKwargs?: Record<string, unknown>;
  tools?: any[];
}

type AnthropicRole = "user" | "assistant";

interface AnthropicMessage {
  role: AnthropicRole;
  content: any[];
}

function stringifyMessageContent(content: MessageContent | unknown): string {
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    return content.map((part) => {
      if (typeof part === "string") {
        return part;
      }
      if (part && typeof part === "object" && "text" in part && typeof part.text === "string") {
        return part.text;
      }
      return "";
    }).join("\n");
  }
  return "";
}

function detectRole(message: BaseMessage): "system" | AnthropicRole {
  if (message instanceof SystemMessage || message.type === "system") {
    return "system";
  }
  if (message instanceof AIMessage || message.type === "ai") {
    return "assistant";
  }
  return "user";
}

function normalizeBaseURL(baseURL: string): string { return normalizeApiBaseURL(baseURL,"anthropic"); }

function convertMessages(messages: BaseMessage[]): { system?: {type:"text";text:string}[]; messages: AnthropicMessage[]; cacheBoundary: import("../platform/llm/cache").PromptCacheBoundary|null } {
  const systemParts: string[] = [];
  const converted: AnthropicMessage[] = [];

  const declared=getPromptCacheBoundary(messages);
  let cacheBoundary:import("../platform/llm/cache").PromptCacheBoundary|null=null;
  for (const [sourceIndex,message] of messages.entries()) {
    const content = stringifyMessageContent(message.content).trim();
    const tools = (message as any).tool_calls as any[] | undefined;
    const preserved = (message.additional_kwargs as any)?.anthropic_content as any[] | undefined;
    if (message._getType() === "tool") {
      converted.push({role:"user",content:[{type:"tool_result",tool_use_id:(message as any).tool_call_id,content}]}); continue;
    }
    if (tools?.length || preserved?.length) {
      converted.push({role:"assistant",content:preserved ?? [...(content?[{type:"text",text:content}]:[]),...tools!.map(t=>({type:"tool_use",id:t.id,name:t.name,input:t.args}))]}); continue;
    }
    if (!content) {
      continue;
    }
    const role = detectRole(message);
    if (role === "system") {
      if(declared?.messageIndex===sourceIndex && (declared.contentBlockIndex??0)===0)cacheBoundary={messageIndex:0,contentBlockIndex:systemParts.length};
      systemParts.push(content);
      continue;
    }
    const previous = converted[converted.length - 1];
    if (previous && previous.role === role) {
      if(declared?.messageIndex===sourceIndex && (declared.contentBlockIndex??0)===0)cacheBoundary={messageIndex:converted.length,contentBlockIndex:previous.content.length};
      previous.content.push({type:"text",text:content});
    } else {
      if(declared?.messageIndex===sourceIndex && (declared.contentBlockIndex??0)===0)cacheBoundary={messageIndex:converted.length+1,contentBlockIndex:0};
      converted.push({ role, content:[{type:"text",text:content}] });
    }
  }

  return {
    system: systemParts.length > 0 ? systemParts.map(text=>({type:"text" as const,text})) : undefined,
    messages: converted,
    cacheBoundary,
  };
}

function extractTextContent(payload: unknown): string {
  if (!payload || typeof payload !== "object") {
    return "";
  }
  const content = (payload as { content?: unknown }).content;
  if (!Array.isArray(content)) {
    return "";
  }
  return content.map((part) => {
    if (!part || typeof part !== "object") {
      return "";
    }
    const candidate = part as { type?: unknown; text?: unknown };
    return candidate.type === "text" && typeof candidate.text === "string" ? candidate.text : "";
  }).join("");
}

export function createAnthropicLLM(options: AnthropicLLMOptions) {
  async function postMessages(messages: BaseMessage[], callOptions?: { signal?: AbortSignal }, stream = false) {
    const converted = convertMessages(messages);
    if (converted.messages.length === 0) {
      throw new Error("Anthropic request requires at least one user or assistant message.");
    }
    const controller = new AbortController();
    const signal = callOptions?.signal;
    const cleanup = () => {
      if (timeout) clearTimeout(timeout);
      signal?.removeEventListener("abort", onAbort);
    };
    const onAbort = () => {
      controller.abort(signal?.reason);
      cleanup();
    };
    const timeout = options.timeoutMs
      ? setTimeout(() => {
        controller.abort(new Error("Anthropic request timed out."));
        cleanup();
      }, options.timeoutMs)
      : null;
    signal?.addEventListener("abort", onAbort, { once: true });
    if (signal?.aborted) onAbort();
    try {
      controller.signal.throwIfAborted();
      const response = await originBoundFetch(options.baseURL)(`${normalizeBaseURL(options.baseURL)}/messages`, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "content-type": "application/json",
          "x-api-key": options.apiKey ?? "",
          "anthropic-version": process.env.ANTHROPIC_VERSION ?? "2023-06-01",
        },
        body: JSON.stringify(applyCacheRequestPolicy({
          model: options.model,
          max_tokens: options.maxTokens ?? 4096,
          ...(options.modelKwargs?.thinking && (options.modelKwargs.thinking as any).type !== "disabled" ? {} : {temperature: options.temperature}),
          ...options.modelKwargs,
          ...(options.tools?.length ? {tools:options.tools.map((t:any)=>({name:t.function?.name ?? t.name,description:t.function?.description ?? t.description,input_schema:t.function?.parameters ?? (t.schema?.safeParse?toJSONSchema(t.schema):t.schema)}))}:{}),
          stream,
          ...(converted.system ? { system: converted.system } : {}),
          messages: converted.messages,
        },resolveCacheCapability({model:options.model,protocol:"anthropic",baseURL:options.baseURL}),converted.cacheBoundary)),
      });
      await assertApiResponse(response,options.apiKey);
      return { response, controller, cleanup };
    } catch (error) {
      cleanup();
      throw error;
    }
  }

  return {
    bindTools(tools:any[]) { return createAnthropicLLM({...options,tools}); },
    async invoke(messages: BaseMessage[], callOptions?: {signal?:AbortSignal}) {
      const { response, cleanup } = await postMessages(messages, callOptions, false);
      try {
        const payload = await response.json() as any;
        return new AIMessage({
          content: extractTextContent(payload),
          response_metadata: {...payload,finish_reason:payload.stop_reason},
          additional_kwargs:{anthropic_content:payload.content,reasoning_content:(payload.content ?? []).filter((p:any)=>p.type==="thinking").map((p:any)=>p.thinking).join("")},
          tool_calls:(payload.content ?? []).filter((p:any)=>p.type==="tool_use").map((p:any)=>({name:p.name,id:p.id,args:p.input,type:"tool_call"})),
        });
      } finally {
        cleanup();
      }
    },
    async stream(messages: BaseMessage[], callOptions?: {signal?:AbortSignal}) {
      const { response, controller, cleanup } = await postMessages(messages, callOptions, true);
      const body = response.body;
      if (!body) {
        cleanup();
        throw new Error("Anthropic stream response body is empty.");
      }
      let finished = false;
      const finish = async () => {
        if (finished) return;
        finished = true; cleanup();
        controller.signal.removeEventListener("abort", onStreamAbort);
        if (!body.locked) await body.cancel().catch(() => undefined);
      };
      const onStreamAbort = () => { void finish().catch(() => undefined); };
      controller.signal.addEventListener("abort", onStreamAbort, {once:true});
      if (controller.signal.aborted) await finish();
      const chunks = (async function* () {
        let stopped = false, usage:Record<string,unknown> = {}, stopReason:string|undefined;
        const blocks:any[]=[];
        try {
          for await (const {data:event} of readSseJSON(body,controller.signal)) {
            controller.signal.throwIfAborted();
            if (!event) continue;
            if (event.type === "error") throw new Error(String(event.error?.message ?? "Anthropic 流返回服务错误，未接受部分结果。").split(options.apiKey || "[NO_KEY]").join("[REDACTED]").slice(0,240));
            const reported = event.message?.usage ?? event.usage;
            if (reported) usage={...usage,...reported};
            if (event.type === "message_delta" && event.delta?.stop_reason) stopReason=event.delta.stop_reason;
            let text="", reasoning=""; const tool_call_chunks:any[]=[];
            if (event.type === "content_block_start") {
              blocks[event.index]={...event.content_block};
              const block=blocks[event.index];
              if (block.type === "text") text=block.text ?? "";
              if (block.type === "thinking") reasoning=block.thinking ?? "";
              if (block.type === "tool_use") {block._json="";tool_call_chunks.push({name:block.name,id:block.id,index:event.index,args:"",type:"tool_call_chunk"});}
            }
            if (event.type === "content_block_delta") {
              const d=event.delta ?? {}, block=blocks[event.index];
              if (d.type === "text_delta") {text=d.text ?? "";if(block)block.text=(block.text ?? "")+text;}
              if (d.type === "thinking_delta") {reasoning=d.thinking ?? "";if(block)block.thinking=(block.thinking ?? "")+reasoning;}
              if (d.type === "signature_delta" && block) block.signature=(block.signature ?? "")+(d.signature ?? "");
              if (d.type === "input_json_delta") {if(block)block._json=(block._json ?? "")+d.partial_json;tool_call_chunks.push({index:event.index,args:d.partial_json,type:"tool_call_chunk"});}
            }
            if (event.type === "message_stop") {
              stopped=true;
              for(const block of blocks) if(block?._json!==undefined) {block.input=block._json?JSON.parse(block._json):block.input;delete block._json;}
            }
            if(text || reasoning || reported || stopReason || tool_call_chunks.length || (stopped && blocks.length)) yield new AIMessageChunk({content:text,tool_call_chunks,
              additional_kwargs:{...(reasoning?{reasoning_content:reasoning}:{}),...(stopped?{anthropic_content:blocks.filter(Boolean)}:{})},
              response_metadata:{...(reported?{usage}:{}),...(stopReason?{finish_reason:stopReason}: {})}});
            if(stopped) break;
          }
          if(!stopped) throw new Error("Anthropic stream interrupted before message_stop.");
        } finally {await finish();}
      })();
      return new IterableReadableStream<AIMessageChunk>({
        async pull(output) {
          try {
            controller.signal.throwIfAborted();
            const result = await chunks.next();
            if (result.done) output.close();
            else output.enqueue(result.value);
          } catch (error) {
            output.error(error);
          }
        },
        async cancel(reason) {
          controller.abort(reason);
          // A generator returned before its first next() never enters finally.
          await finish();
          await chunks.return();
        },
      }, { highWaterMark: 0 });
    },
    async batch(messages: BaseMessage[][], callOptions?: {signal?:AbortSignal}) {
      return Promise.all(messages.map((entry) => this.invoke(entry, callOptions)));
    },
  };
}
