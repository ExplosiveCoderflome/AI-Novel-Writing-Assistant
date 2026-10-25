import type { BaseMessageChunk } from "@langchain/core/messages";
import { ReasoningStreamCollector } from "../reasoning";
import { extractLlmTokenUsage, mergeStreamTokenUsage, type LlmTokenUsageSnapshot } from "../usageTracking";

export interface ResponseDiagnostics {
  finishReason: string | null;
  finishObserved: boolean;
  outputTokens: number | null;
  reasoningChars: number;
  textChars: number;
}

export class ResponseTerminationError extends Error {
  readonly code = "LLM_RESPONSE_TERMINATED";
  readonly retryable = false;
  constructor(readonly category: "incomplete_json" | "transport_error", readonly response: ResponseDiagnostics) {
    super(category === "incomplete_json"
      ? "模型达到输出长度上限（包含服务计入的思考），结果不完整；可提高此模型的最大输出或缩小本次范围。"
      : "模型未提供可用结果（拒绝或内容过滤）；请检查任务和模型能力。");
  }
}

export class LlmResponseAccumulator {
  private rawContent = "";
  private tokenUsage: LlmTokenUsageSnapshot | null = null;
  private finishReason: string | null = null;
  private refused = false;
  private reasoningChars = 0;
  private readonly reasoning = new ReasoningStreamCollector(true);
  constructor(private readonly observers: {
  onText?: (text: string) => void;
  onReasoning?: (text: string) => void;
  } = {}) {}
  private emit(parts: { text: string; reasoning: string }): string {
    this.rawContent += parts.text;
    this.reasoningChars += parts.reasoning.length;
    if (parts.text) this.observers.onText?.(parts.text);
    if (parts.reasoning) this.observers.onReasoning?.(parts.reasoning);
    return parts.text;
  }
  push(chunk: BaseMessageChunk): string {
    const content = typeof chunk.content === "string" ? chunk.content : Array.isArray(chunk.content)
      ? chunk.content.map((part) => typeof part === "string" ? part : part.type === "text" && typeof part.text === "string" ? part.text : "").join("") : "";
    const text = this.emit(this.reasoning.pushParts(chunk, content));
    this.tokenUsage = mergeStreamTokenUsage(this.tokenUsage, extractLlmTokenUsage(chunk));
    const meta = (chunk.response_metadata ?? {}) as Record<string, unknown>;
    const raw = chunk.additional_kwargs?.__raw_response as { choices?: Array<{ finish_reason?: string; delta?: { refusal?: unknown } }> } | undefined;
    const reason = meta.finish_reason ?? meta.stop_reason ?? (meta.incomplete_details as {reason?:string})?.reason ?? (meta.status === "completed" ? "stop" : undefined) ?? raw?.choices?.[0]?.finish_reason;
    if (typeof reason === "string") this.finishReason = reason;
    this.refused ||= Boolean(chunk.additional_kwargs?.refusal || raw?.choices?.[0]?.delta?.refusal);
    return text;
  }
  finish() {
    const tail = this.emit(this.reasoning.flushParts());
    const response: ResponseDiagnostics = { finishReason: this.finishReason, finishObserved: this.finishReason !== null,
    outputTokens: this.tokenUsage?.completionTokens ?? null, reasoningChars: this.reasoningChars, textChars: this.rawContent.length };
  if (this.finishReason && /^(length|max_tokens|max_output_tokens|model_length)$/.test(this.finishReason)) {
    throw new ResponseTerminationError("incomplete_json", response);
  }
  if (this.refused || this.finishReason === "content_filter" || this.finishReason === "refusal") {
    throw new ResponseTerminationError("transport_error", response);
  }
    return { rawContent: this.rawContent, tokenUsage: this.tokenUsage, response, tail };
  }
}

export async function collectLlmResponse(stream: AsyncIterable<BaseMessageChunk>, observers: ConstructorParameters<typeof LlmResponseAccumulator>[0] = {}) {
  const accumulator = new LlmResponseAccumulator(observers);
  for await (const chunk of stream) accumulator.push(chunk);
  return accumulator.finish();
}
