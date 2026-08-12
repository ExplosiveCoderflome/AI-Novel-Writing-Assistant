import assert from "node:assert";
import { MODEL_ROUTE_TASK_TYPES, resolveModel } from "./modelRouter";
import { applySmartModelRouting } from "../eval/services/autoRoutingService";

export async function runMultimodalModelRoutesTest() {
  // 1. Task types length and inclusion check
  assert.strictEqual(MODEL_ROUTE_TASK_TYPES.length, 17, "Should contain 17 model route task types");
  assert.ok(MODEL_ROUTE_TASK_TYPES.includes("image_gen"), "Should include image_gen");
  assert.ok(MODEL_ROUTE_TASK_TYPES.includes("video_gen"), "Should include video_gen");
  assert.ok(MODEL_ROUTE_TASK_TYPES.includes("embedding"), "Should include embedding");
  assert.ok(MODEL_ROUTE_TASK_TYPES.includes("asr"), "Should include asr");
  assert.ok(MODEL_ROUTE_TASK_TYPES.includes("tts"), "Should include tts");
  assert.ok(MODEL_ROUTE_TASK_TYPES.includes("ocr"), "Should include ocr");

  // 2. Default route resolution check
  const imageRoute = await resolveModel("image_gen");
  assert.strictEqual(imageRoute.routeKey, "image_gen");
  assert.strictEqual(imageRoute.provider, "comfyui");

  const videoRoute = await resolveModel("video_gen");
  assert.strictEqual(videoRoute.routeKey, "video_gen");
  assert.strictEqual(videoRoute.provider, "comfyui");

  const embedRoute = await resolveModel("embedding");
  assert.strictEqual(embedRoute.routeKey, "embedding");
  assert.strictEqual(embedRoute.provider, "ollama");

  // 3. Smart Auto-routing check
  const result = await applySmartModelRouting();
  assert.strictEqual(result.updatedCount, 17, "Should update all 17 routes");
  assert.ok(result.routes.image_gen, "image_gen route should be set");
  assert.ok(result.routes.video_gen, "video_gen route should be set");
  assert.ok(result.routes.embedding, "embedding route should be set");

  console.log("✅ All 17 Multimodal Model Route tests passed successfully!");
}

if (require.main === module) {
  runMultimodalModelRoutesTest().catch((err) => {
    console.error("❌ Test failed:", err);
    process.exit(1);
  });
}
