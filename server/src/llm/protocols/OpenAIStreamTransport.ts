import type { ModelRouteRequestProtocol } from "@ai-novel/shared/types/novel";
import { ResponseTerminationError } from "../structured/ResponseCollector";
import { originBoundFetch, readSseJSON, assertApiResponse } from "./transport";

/** Validate protocol completion before the SDK can discard unsupported control events. */
export function protocolBoundFetch(baseURL:string, protocol:ModelRouteRequestProtocol, outputParameter:"max_tokens"|"max_completion_tokens"="max_tokens"):typeof fetch {
  const bound=originBoundFetch(baseURL);
  return async(input,init)=>{
    // This locked SDK guesses token field names from model IDs and overwrites modelKwargs.
    // Select the field by the configured protocol contract after SDK serialization.
    const url=String(typeof input === "string" || input instanceof URL ? input : input.url);
    if(url.includes("/chat/completions") && typeof init?.body === "string") {
      const body=JSON.parse(init.body), value=body.max_completion_tokens ?? body.max_tokens;
      delete body.max_tokens;delete body.max_completion_tokens;
      if(value != null)body[outputParameter]=value;
      init={...init,body:JSON.stringify(body)};
    }
    const response=await bound(input,init);
    if(!response.ok) {
      const headers=new Headers(init?.headers);const secret=headers.get("authorization")?.replace(/^Bearer /i,"") ?? headers.get("x-api-key");
      await assertApiResponse(response,secret ?? undefined);
    }
    if(!response.body || !response.headers.get("content-type")?.includes("text/event-stream")) return response;
    let completed=false, textChars=0, reasoningChars=0;
    const iterator=readSseJSON(response.body,init?.signal ?? undefined)[Symbol.asyncIterator]();
    const encoder=new TextEncoder();
    const body=new ReadableStream<Uint8Array>({
      async pull(controller) {
        try {
          const next=await iterator.next();
          if(next.done) {
            if(!completed) throw new Error("模型流在结束事件前中断，未接受部分结果。请检查接口连接。");
            controller.close();return;
          }
          const {event,data}=next.value;
          if(event === "done" && !completed) throw new Error("模型流缺少结束原因，未接受部分结果。");
          if(data) {
            if(protocol === "openai_responses") {
              if(data.type === "response.output_text.delta") textChars+=data.delta?.length ?? 0;
              if(data.type === "response.reasoning_summary_text.delta") reasoningChars+=data.delta?.length ?? 0;
              if(data.type === "response.incomplete") throw new ResponseTerminationError(
                data.response?.incomplete_details?.reason === "max_output_tokens" ? "incomplete_json" : "transport_error",
                {finishReason:data.response?.incomplete_details?.reason ?? "incomplete",finishObserved:true,
                  outputTokens:data.response?.usage?.output_tokens ?? null,textChars,reasoningChars});
              if(data.type === "response.failed" || data.type === "error") throw new Error("Responses 返回服务错误，未接受部分结果。");
              if(data.type === "response.completed") completed=true;
            } else {
              if(data.error) throw new Error("Chat Completions 返回服务错误，未接受部分结果。");
              if(data.choices?.some((choice:any)=>choice.finish_reason != null)) completed=true;
            }
          }
          controller.enqueue(encoder.encode(event === "done" ? "data: [DONE]\n\n" : `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch(error) {await iterator.return?.(undefined);controller.error(error);}
      },
      async cancel(){await iterator.return?.(undefined);},
    },{highWaterMark:0});
    return new Response(body,{status:response.status,statusText:response.statusText,headers:response.headers});
  };
}
