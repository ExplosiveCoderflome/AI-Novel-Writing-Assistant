import type { Response } from "express";
import type { BaseMessageChunk } from "@langchain/core/messages";
import type { SSEFrame } from "@ai-novel/shared/types/api";

export type WritableSSEFrame = Extract<
  SSEFrame,
  {
    type:
    | "chunk"
    | "done"
    | "error"
    | "ping"
    | "reasoning"
    | "runtime_package"
    | "tool_call"
    | "tool_result"
    | "approval_required"
    | "approval_resolved"
    | "run_status";
  }
>;

export interface StreamDonePayload {
  fullContent?: string;
  frames?: WritableSSEFrame[];
}

export interface StreamDoneHelpers {
  writeFrame: (payload: WritableSSEFrame) => void;
}

export function writeSSEFrame(res: Response, payload: WritableSSEFrame): void {
  if (res.writableEnded) {
    return;
  }
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function normalizeChunkContent(content: BaseMessageChunk["content"]): string {
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") {
          return part;
        }
        if (typeof part === "object" && part && "text" in part && typeof part.text === "string") {
          return part.text;
        }
        return "";
      })
      .join("");
  }

  return "";
}

export function initSSE(res: Response): () => void {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  const heartbeat = setInterval(() => {
    writeSSEFrame(res, { type: "ping" });
  }, 15000);

  return () => clearInterval(heartbeat);
}

export async function streamToSSE(
  res: Response,
  stream: AsyncIterable<BaseMessageChunk>,
  onDone?: (
    fullContent: string,
    helpers: StreamDoneHelpers,
  ) => void | StreamDonePayload | Promise<void | StreamDonePayload>,
): Promise<void> {
  const disposeHeartbeat = initSSE(res);
  let fullContent = "";

  try {
    for await (const chunk of stream) {
      if (res.writableEnded) {
        break;
      }
      const text = normalizeChunkContent(chunk.content);
      if (!text) {
        continue;
      }
      fullContent += text;
      writeSSEFrame(res, { type: "chunk", content: text });
    }

    const donePayload = await onDone?.(fullContent, {
      writeFrame: (payload) => writeSSEFrame(res, payload),
    });
    if (donePayload?.frames?.length) {
      for (const frame of donePayload.frames) {
        writeSSEFrame(res, frame);
      }
    }
    if (donePayload?.fullContent) {
      fullContent = donePayload.fullContent;
    }
    writeSSEFrame(res, { type: "done", fullContent });
  } catch (error) {
    writeSSEFrame(res, {
      type: "error",
      error: error instanceof Error ? error.message : "流式输出失败。",
    });
  } finally {
    disposeHeartbeat();
    if (!res.writableEnded) {
      res.end();
    }
  }
}
