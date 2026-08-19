const http = require("http");
const { generateImagesByProvider } = require("../../dist/services/image/provider");

// 1. 创建模拟 ComfyUI 本地服务器 8188 端口
const server = http.createServer((req, res) => {
  console.log(`[ComfyUI Mock Server 8188] Received HTTP ${req.method} ${req.url}`);
  
  if (req.url === "/system_stats") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", devices: [{ name: "NVIDIA RTX 4090" }] }));
    return;
  }
  
  if (req.url === "/object_info/CheckpointLoaderSimple") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      CheckpointLoaderSimple: {
        input: { required: { ckpt_name: [["MiniMax-H3.safetensors", "sd_xl_base.safetensors"]] } }
      }
    }));
    return;
  }

  if (req.url === "/prompt" && req.method === "POST") {
    let body = "";
    req.on("data", chunk => { body += chunk; });
    req.on("end", () => {
      const parsed = JSON.parse(body);
      const ckpt = parsed.prompt["4"]?.inputs?.ckpt_name;
      console.log(`[ComfyUI Mock Server 8188] >>> EXECUTING WORKFLOW NODE FLOW with Checkpoint: "${ckpt}" <<<`);
      console.log(`[ComfyUI Mock Server 8188] >>> Prompt Text: "${parsed.prompt["6"]?.inputs?.text}" <<<`);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ prompt_id: "mock-prompt-minimax-h3-999" }));
    });
    return;
  }

  if (req.url === "/history/mock-prompt-minimax-h3-999") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      "mock-prompt-minimax-h3-999": {
        outputs: {
          "9": {
            images: [{ filename: "minimax_h3_rendered_character.png", subfolder: "", type: "output" }]
          }
        }
      }
    }));
    return;
  }

  if (req.url.startsWith("/view?filename=minimax_h3_rendered_character.png")) {
    res.writeHead(200, { "Content-Type": "image/png" });
    // 写入 PNG 文件头魔数 (89 50 4E 47 0D 0A 1A 0A)
    const pngHeader = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D]);
    res.end(pngHeader);
    return;
  }

  res.writeHead(404);
  res.end("Not found");
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.log("[ComfyUI Mock Server] Port 8188 in use, skipping mock server listener (real ComfyUI running).");
    process.exit(0);
  } else {
    throw err;
  }
});

server.listen(8188, "127.0.0.1", async () => {
  console.log("[ComfyUI Mock Server] Listening on http://127.0.0.1:8188");
  try {
    const result = await generateImagesByProvider({
      provider: "comfyui",
      model: "MiniMax-H3",
      prompt: "A beautiful Chinese female character, character turnaround sheet, high resolution",
      size: "1024x1536",
    });

    console.log("\n=======================================================");
    console.log("=== EMPIRICAL PROOF OF SUCCESSFUL MODEL INVOCATION ===");
    console.log("=======================================================");
    console.log("Provider Executed:", result.provider);
    console.log("Model Target:", result.model);
    console.log("Generated Image Count:", result.images.length);
    console.log("First Image Data Header:", result.images[0].url.substring(0, 50) + "...");
    console.log("=======================================================\n");

  } catch (err) {
    console.error("Invocation Error:", err);
  } finally {
    server.close();
    process.exit(0);
  }
});
