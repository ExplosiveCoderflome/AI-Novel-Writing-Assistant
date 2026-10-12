import type { ChatOpenAI } from "@langchain/openai";
import type { BaseMessage, BaseMessageFields } from "@langchain/core/messages";
import type { CacheCapability } from "../domain/CacheCapabilities";
import { applyCacheRequestPolicy, getPromptCacheBoundary } from "./CacheRequestAdapter";
export function attachLLMCacheRequestPolicy(llm: ChatOpenAI, capability: CacheCapability): ChatOpenAI {
    if (capability.protocol !== "openai-compatible" || capability.mode !== "explicit")
        return llm;
    function adapt(input: unknown): unknown {
        const boundary = getPromptCacheBoundary(input);
        if (!boundary || !Array.isArray(input))
            return input;
        const raw = { messages: input.map((m: BaseMessage) => ({ role: m.type, content: m.content })) };
        const next = applyCacheRequestPolicy(raw, capability, boundary);
        if (next === raw)
            return input;
        return input.map((m: BaseMessage, i: number) => {
            if (next.messages[i].content === m.content)
                return m;
            const Constructor = m.constructor as new (input: BaseMessageFields) => BaseMessage;
            return new Constructor({ ...m, content: next.messages[i].content });
        });
    }
    const invoke = llm.invoke.bind(llm), stream = llm.stream.bind(llm), batch = llm.batch.bind(llm);
    llm.invoke = ((...args: Parameters<ChatOpenAI["invoke"]>) => { args[0] = adapt(args[0]) as typeof args[0]; return invoke(...args); }) as ChatOpenAI["invoke"];
    llm.stream = ((...args: Parameters<ChatOpenAI["stream"]>) => { args[0] = adapt(args[0]) as typeof args[0]; return stream(...args); }) as ChatOpenAI["stream"];
    llm.batch = ((...args: Parameters<ChatOpenAI["batch"]>) => { args[0] = args[0].map(i => adapt(i)) as typeof args[0]; return batch(...args); }) as ChatOpenAI["batch"];
    return llm;
}
