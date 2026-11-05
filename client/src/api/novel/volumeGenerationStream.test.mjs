import test from "node:test";
import assert from "node:assert/strict";
import { consumeVolumeGenerationStream } from "./volumeGenerationStream.ts";

function responseFor(frames) {
  const bytes = new TextEncoder().encode(frames.map(frame => `data: ${JSON.stringify(frame)}\n\n`).join(""));
  return new Response(new ReadableStream({ start(controller) {
    // Split inside UTF-8 characters and frame boundaries as a real HTTP stream can.
    for (let offset = 0; offset < bytes.length; offset += 7) controller.enqueue(bytes.slice(offset, offset + 7));
    controller.close();
  } }));
}

test("split chapter progress arrives before the saved final response", async () => {
  const first = { volumeId: "v1", completedChapters: 0, totalChapters: 4, label: "正在拆章" };
  const second = { ...first, completedChapters: 2, label: "已完成开卷" };
  const progress = [];
  const result = { success: true, data: { novelId: "novel", slimmed: true } };
  assert.deepEqual(await consumeVolumeGenerationStream(responseFor([
    { type: "progress", event: { phase: "load_context" } },
    { type: "progress", event: { chapterProgress: first } },
    { type: "ping" },
    { type: "progress", event: { chapterProgress: second } },
    { type: "done", response: result },
  ]), event => progress.push(event)), result);
  assert.deepEqual(progress, [first, second]);
});

test("generation errors and interrupted streams do not report completion", async () => {
  await assert.rejects(consumeVolumeGenerationStream(responseFor([{ type: "error", error: "模型生成失败" }]), () => {}), /模型生成失败/);
  await assert.rejects(consumeVolumeGenerationStream(responseFor([{ type: "ping" }]), () => {}), /连接中断/);
});
