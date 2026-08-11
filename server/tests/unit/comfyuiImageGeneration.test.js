const test = require("node:test");
const assert = require("node:assert/strict");
const { comfyUIDaemonService } = require("../../dist/services/image/comfyui/ComfyUIDaemonService");
const { generateImagesByProvider } = require("../../dist/services/image/provider");

test("ComfyUI Image Generation Unit Test Suite", async (t) => {

  await t.test("checkDaemonHealth returns daemon health structure", async () => {
    const health = await comfyUIDaemonService.checkDaemonHealth();
    assert.equal(typeof health.ok, "boolean");
    assert.equal(typeof health.baseURL, "string");
    assert.ok(Array.isArray(health.checkpoints));
    assert.equal(typeof health.message, "string");
  });

  await t.test("generateImagesByProvider handles ComfyUI daemon and validates checkpoints", async () => {
    const health = await comfyUIDaemonService.checkDaemonHealth();
    if (!health.ok) {
      await assert.rejects(
        async () => {
          await generateImagesByProvider({
            provider: "comfyui",
            model: "MiniMax-H3",
            prompt: "A beautiful Chinese female character, character turnaround sheet, high resolution",
            size: "1024x1536",
          });
        },
        (err) => {
          assert.ok(err.message.includes("ComfyUI") || err.message.includes("8188"));
          return true;
        }
      );
    } else if (health.checkpoints.length === 0) {
      // 当 ComfyUI 在线但 checkpoints 目录暂无 safetensors 模型时，抛出明确提示
      await assert.rejects(
        async () => {
          await generateImagesByProvider({
            provider: "comfyui",
            model: "MiniMax-H3",
            prompt: "A beautiful Chinese female character",
            size: "1024x1024",
          });
        },
        (err) => {
          assert.ok(err.message.includes("checkpoints") || err.message.includes("ComfyUI"));
          return true;
        }
      );
    } else {
      const res = await generateImagesByProvider({
        provider: "comfyui",
        model: "MiniMax-H3",
        prompt: "A beautiful Chinese female character, character turnaround sheet, high resolution",
        size: "1024x1536",
      });
      assert.equal(res.provider, "comfyui");
      assert.ok(res.images.length > 0);
      assert.ok(res.images[0].url.startsWith("data:image/") || res.images[0].url.startsWith("http"));
    }
  });

});
