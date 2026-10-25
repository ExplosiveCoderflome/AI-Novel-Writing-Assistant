import { AIMessageChunk, type BaseMessageChunk } from "@langchain/core/messages";
import type { LlmTokenUsageSnapshot } from "../usageTracking";
import { LlmResponseAccumulator, type ResponseDiagnostics } from "./ResponseCollector";

export function captureStreamOutput(rawStream: AsyncIterable<BaseMessageChunk>, onChunk?: (text: string) => void, onReasoning?: (text: string) => void) {
  let resolveText!: (value: string) => void, rejectText!: (error: unknown) => void;
  let resolveUsage!: (value: LlmTokenUsageSnapshot | null) => void, rejectUsage!: (error: unknown) => void;
  let resolveResponse!: (value: ResponseDiagnostics) => void, rejectResponse!: (error: unknown) => void;
  const completedText = new Promise<string>((resolve, reject) => { resolveText = resolve; rejectText = reject; });
  const completedUsage = new Promise<LlmTokenUsageSnapshot | null>((resolve, reject) => { resolveUsage = resolve; rejectUsage = reject; });
  const completedResponse = new Promise<ResponseDiagnostics>((resolve, reject) => { resolveResponse = resolve; rejectResponse = reject; });
  // Consumers may await text before the other promises. Preserve errors without unhandled rejections.
  void completedText.catch(() => {}); void completedUsage.catch(() => {}); void completedResponse.catch(() => {});
  const stream = { async *[Symbol.asyncIterator]() {
    const accumulator = new LlmResponseAccumulator({ onText: onChunk, onReasoning });
    let complete = false;
    try {
      for await (const chunk of rawStream) {
        const text = accumulator.push(chunk);
        yield new AIMessageChunk({ content: text, response_metadata: chunk.response_metadata,
          usage_metadata: (chunk as AIMessageChunk).usage_metadata });
      }
      const result = accumulator.finish();
      if (result.tail) yield new AIMessageChunk({ content: result.tail });
      complete = true;
      resolveText(result.rawContent); resolveUsage(result.tokenUsage); resolveResponse(result.response);
    } catch (error) { rejectText(error); rejectUsage(error); rejectResponse(error); throw error; }
    finally {
      if (!complete) {
        const error = new Error("模型流在读取完成前被中止。");
        rejectText(error); rejectUsage(error); rejectResponse(error);
      }
    }
  } };
  return { stream, completedText, completedUsage, completedResponse };
}
