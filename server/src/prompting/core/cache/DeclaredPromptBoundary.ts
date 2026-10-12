import type { BaseMessage } from "@langchain/core/messages";
import type { PromptAsset } from "../promptTypes";
import { declarePromptCacheBoundary } from "../../../platform/llm/cache";

export function registerPromptCacheBoundary(
  asset: Pick<PromptAsset<unknown, unknown>, "cacheBoundary" | "structuredOutputHint">,
  rendered: BaseMessage[],
  messages: BaseMessage[],
): void {
  if (!asset.cacheBoundary) return;
  let boundary = asset.cacheBoundary;
  const firstUser = rendered.findIndex(message => message.type !== "system");
  // Shift a declared book block only when a static schema was actually inserted before it.
  const insertedStaticSchema = asset.structuredOutputHint?.placement === "stable_prefix"
    && messages.length === rendered.length + 1 && firstUser > 0
    && messages[firstUser] !== rendered[firstUser]
    && messages[firstUser + 1] === rendered[firstUser];
  if (insertedStaticSchema) {
    boundary = boundary.messageIndex === 0
      ? { messageIndex: firstUser, contentBlockIndex: 0 }
      : { ...boundary, messageIndex: boundary.messageIndex >= firstUser ? boundary.messageIndex + 1 : boundary.messageIndex };
  }
  declarePromptCacheBoundary(messages, boundary);
}
