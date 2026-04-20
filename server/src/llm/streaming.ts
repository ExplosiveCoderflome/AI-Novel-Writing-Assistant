import type { Response } from "express";
import type { BaseMessageChunk } from "@langchain/core/messages";
import type { SSEFrame } from "@ai-novel/shared/types/api";
import { AppError, formatUpstreamConnectionError } from "../middleware/errorHandler";

const SSE_HEARTBEAT_INTERVAL_MS = 15000;

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

export interface StreamRunStatusContext {
  runId: string;
  queuedMessage?: string;
  runningMessage?: string;
  failedMessage?: string;
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
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();

  const heartbeat = setInterval(() => {
    writeSSEFrame(res, { type: "ping" });
  }, SSE_HEARTBEAT_INTERVAL_MS);

  return () => clearInterval(heartbeat);
}

export function startSSE(res: Response, runStatus?: StreamRunStatusContext): () => void {
  const disposeHeartbeat = initSSE(res);
  if (runStatus) {
    writeSSEFrame(res, {
      type: "run_status",
      runId: runStatus.runId,
      status: "queued",
      message: runStatus.queuedMessage,
    });
  }
  return disposeHeartbeat;
}

export function writeRunningStatus(res: Response, runStatus?: StreamRunStatusContext): void {
  if (!runStatus) {
    return;
  }
  writeSSEFrame(res, {
    type: "run_status",
    runId: runStatus.runId,
    status: "running",
    phase: "streaming",
    message: runStatus.runningMessage,
  });
}

export function writeFailedStatus(res: Response, runStatus: StreamRunStatusContext | undefined, message: string): void {
  if (!runStatus) {
    return;
  }
  writeSSEFrame(res, {
    type: "run_status",
    runId: runStatus.runId,
    status: "failed",
    message: runStatus.failedMessage ?? message,
  });
}

function resolveSSEErrorMessage(error: unknown, fallbackMessage: string): string {
  if (error instanceof AppError && error.message.trim().length > 0) {
    return error.message;
  }

  const upstreamConnectionMessage = formatUpstreamConnectionError(error);
  if (upstreamConnectionMessage) {
    return upstreamConnectionMessage;
  }

  return fallbackMessage;
}

export function respondWithSSEError(
  res: Response,
  error: unknown,
  options?: {
    disposeHeartbeat?: () => void;
    runStatus?: StreamRunStatusContext;
    fallbackMessage?: string;
  },
): void {
  const message = resolveSSEErrorMessage(error, options?.fallbackMessage ?? "流式输出失败。");
  writeFailedStatus(res, options?.runStatus, message);
  writeSSEFrame(res, {
    type: "error",
    error: message,
  });
  options?.disposeHeartbeat?.();
  if (!res.writableEnded) {
    res.end();
  }
}

export async function streamToSSE(
  res: Response,
  stream: AsyncIterable<BaseMessageChunk>,
  onDone?: (
    fullContent: string,
    helpers: StreamDoneHelpers,
  ) => void | StreamDonePayload | Promise<void | StreamDonePayload>,
  options?: {
    disposeHeartbeat?: () => void;
    runStatus?: StreamRunStatusContext;
  },
): Promise<void> {
  const disposeHeartbeat = options?.disposeHeartbeat ?? startSSE(res, options?.runStatus);
  writeRunningStatus(res, options?.runStatus);
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
    respondWithSSEError(res, error, {
      runStatus: options?.runStatus,
      fallbackMessage: "流式输出失败。",
    });
  } finally {
    disposeHeartbeat();
    if (!res.writableEnded) {
      res.end();
    }
  }
}
