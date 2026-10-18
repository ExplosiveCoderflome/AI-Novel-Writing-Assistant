import type {ChatOpenAI} from "@langchain/openai";
import {executionSignal} from "../../runtime/execution";

/** Decorate outside request limiting so cancellation also reaches queued requests. */
export function attachExecutionSignal(llm: ChatOpenAI): ChatOpenAI {
  const invoke = llm.invoke.bind(llm), stream = llm.stream.bind(llm);
  llm.invoke = (async (...args: Parameters<ChatOpenAI["invoke"]>) => {
    const signal = executionSignal(args[1]?.signal);
    signal?.throwIfAborted();
    const result = await invoke(args[0], {...args[1], signal});
    signal?.throwIfAborted();
    return result;
  }) as ChatOpenAI["invoke"];
  llm.stream = (async (...args: Parameters<ChatOpenAI["stream"]>) => {
    const signal = executionSignal(args[1]?.signal);
    signal?.throwIfAborted();
    return stream(args[0], {...args[1], signal});
  }) as ChatOpenAI["stream"];
  return llm;
}
