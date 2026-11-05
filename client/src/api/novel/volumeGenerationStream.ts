import type { ApiResponse } from "@ai-novel/shared/types/api";
import type { VolumeChapterListProgress } from "@ai-novel/shared/types/volumePlanning";
import type { VolumeGenerationResponse } from "./volumes";

type VolumeGenerationFrame =
  | { type: "progress"; event: { chapterProgress?: VolumeChapterListProgress } }
  | { type: "done"; response: ApiResponse<VolumeGenerationResponse> }
  | { type: "error"; error: string }
  | { type: "ping" };

export async function consumeVolumeGenerationStream(
  response: Response,
  onProgress: (progress: VolumeChapterListProgress) => void,
): Promise<ApiResponse<VolumeGenerationResponse>> {
  if (!response.ok || !response.body) {
    throw new Error(`请求失败，状态码 ${response.status}`);
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const frames = buffer.split("\n\n");
      buffer = frames.pop() ?? "";
      for (const rawFrame of frames) {
        const data = rawFrame.split("\n").find(line => line.startsWith("data:"));
        if (!data) continue;
        const frame = JSON.parse(data.slice(5)) as VolumeGenerationFrame;
        if (frame.type === "error") throw new Error(frame.error);
        if (frame.type === "progress" && frame.event.chapterProgress) onProgress(frame.event.chapterProgress);
        if (frame.type === "done") return frame.response;
      }
    }
    throw new Error("拆章连接中断，请检查卷工作区后重试。");
  } finally {
    reader.releaseLock();
  }
}
