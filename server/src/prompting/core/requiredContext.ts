import { AsyncLocalStorage } from "node:async_hooks";
import type { BaseMessage } from "@langchain/core/messages";
import { renderAdoptedOutlineContext } from "../prompts/outline/adoptedOutlineContext";
interface RequiredContext { key: string; value: unknown }
const contexts = new AsyncLocalStorage<RequiredContext>();
export const withRequiredPromptContext = <T>(context: RequiredContext, work: () => Promise<T>) => contexts.run(context, work);
export function appendRequiredPromptContext(messages: BaseMessage[]): BaseMessage[] {
  const context = contexts.getStore();
  if (!context) return messages;
  return [...messages, renderAdoptedOutlineContext(context.key, context.value)];
}
