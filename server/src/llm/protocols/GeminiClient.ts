import { AIMessage, AIMessageChunk, type BaseMessage } from "@langchain/core/messages";
import { toJSONSchema } from "zod";
import { normalizeApiBaseURL, originBoundFetch, readSseJSON, assertApiResponse } from "./transport";

interface GeminiOptions { apiKey?: string; model: string; baseURL: string; maxTokens?: number; temperature?: number; timeoutMs?: number; thinking?: Record<string, unknown>; tools?: any[] }
export function createGeminiLLM(options: GeminiOptions) {
  const baseURL = normalizeApiBaseURL(options.baseURL, "gemini");
  function parts(content: any): any[] {
    if (typeof content === "string") return [{text:content}];
    return (content ?? []).map((p:any) => {
      if (typeof p === "string") return {text:p};
      if (p.type === "text") return {text:p.text};
      throw new Error("此 Gemini 请求包含尚未支持的内容块，请使用文本或适用的兼容接口。");
    });
  }
  function request(messages: BaseMessage[], call: any = {}) {
    const contents:any[] = [], systems:any[] = [];
    for (const message of messages) {
      const kind = message._getType();
      if (kind === "system") { systems.push(...parts(message.content)); continue; }
      if (kind === "tool") {
        const tool=message as any;
        contents.push({role:"user",parts:[{functionResponse:{name:tool.name || tool.tool_call_id,response:{result:tool.content}}}]});
        continue;
      }
      const p = (message.additional_kwargs as any)?.gemini_parts ?? parts(message.content);
      for (const tool of ((message.additional_kwargs as any)?.gemini_parts ? [] : (message as any).tool_calls) ?? []) p.push({functionCall:{name:tool.name,args:tool.args}});
      contents.push({role:kind === "ai" ? "model":"user",parts:p});
    }
    const tools=call.tools ?? options.tools;
    const declarations=tools?.map((tool:any)=>({name:tool.function?.name ?? tool.name,description:tool.function?.description ?? tool.description,
      parameters:tool.function?.parameters ?? (tool.schema?.safeParse ? toJSONSchema(tool.schema) : tool.schema)}));
    return {contents,...(systems.length?{systemInstruction:{parts:systems}}:{}),
      ...(declarations?.length?{tools:[{functionDeclarations:declarations}]}:{}),
      generationConfig:{temperature:options.temperature,...(options.maxTokens!==undefined?{maxOutputTokens:options.maxTokens}:{}),
        ...(options.thinking?{thinkingConfig:options.thinking}:{}),
        ...(call.response_format?{responseMimeType:"application/json",...(call.response_format.json_schema?.schema?{responseJsonSchema:call.response_format.json_schema.schema}:{})}:{}),
      }};
  }
  const client = {
    bindTools(tools:any[]) { return createGeminiLLM({...options,tools}); },
    async stream(messages: BaseMessage[], call:any = {}): Promise<AsyncIterable<AIMessageChunk>> {
      const signal = call.signal && options.timeoutMs ? AbortSignal.any([call.signal,AbortSignal.timeout(options.timeoutMs)]) : call.signal ?? (options.timeoutMs?AbortSignal.timeout(options.timeoutMs):undefined);
      const model=options.model.replace(/^models\//, "");
      const response=await originBoundFetch(baseURL)(`${baseURL}/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`,{
        method:"POST",signal,headers:{"content-type":"application/json",...(options.apiKey?{"x-goog-api-key":options.apiKey}:{})},body:JSON.stringify(request(messages,call))});
      await assertApiResponse(response,options.apiKey); if(!response.body)throw new Error("Gemini 响应流为空。");
      return (async function*(){
        let finish=false,toolIndex=0;
        for await(const {data}of readSseJSON(response.body!,signal)) {
          if(!data)continue;
          if(data.error)throw new Error("Gemini 流返回服务错误，请检查接口与模型设置。");
          const c=data.candidates?.[0];
          let text="",reasoning=""; const tool_call_chunks:any[]=[];
          for(const p of c?.content?.parts ?? []) {
            if(p.thought)reasoning+=p.text ?? "";else text+=p.text ?? "";
            if(p.functionCall)tool_call_chunks.push({name:p.functionCall.name,args:JSON.stringify(p.functionCall.args ?? {}),id:p.functionCall.id ?? `call-${toolIndex}`,index:toolIndex++,type:"tool_call_chunk"});
          }
          const reason=c?.finishReason; if(reason)finish=true;
          const usage=data.usageMetadata;
          yield new AIMessageChunk({content:text,additional_kwargs:{...(reasoning?{reasoning_content:reasoning}:{}),...(c?.content?.parts ? {gemini_parts:c.content.parts} : {})},tool_call_chunks,
            response_metadata:{...(reason?{finish_reason:reason === "MAX_TOKENS"?"length":reason === "STOP"?"stop":"content_filter"}:{}),...(usage?{usage}: {})},
            ...(usage?{usage_metadata:{input_tokens:usage.promptTokenCount ?? 0,output_tokens:(usage.candidatesTokenCount ?? 0)+(usage.thoughtsTokenCount ?? 0),total_tokens:usage.totalTokenCount ?? 0,
              output_token_details:{reasoning:usage.thoughtsTokenCount ?? 0}}}:{})});
        }
        if(!finish)throw new Error("Gemini 流在结束事件前中断，未接受不完整结果。");
      })();
    },
    async invoke(messages: BaseMessage[],call:any={}) {let total=new AIMessageChunk({content:""});for await(const chunk of await client.stream(messages,call))total=total.concat(chunk);return new AIMessage({...total,content:total.content});},
    async batch(messages: BaseMessage[][],call:any={}) {return Promise.all(messages.map(m=>client.invoke(m,call)));},
  };
  return client;
}
