const { execSync, spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const OLLAMA_URL = "http://127.0.0.1:11434";
const QDRANT_URL = "http://127.0.0.1:6333";
const PROJECT_ROOT = path.resolve(__dirname, "..");

async function checkUrl(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}

async function checkOllamaReady() {
  return checkUrl(`${OLLAMA_URL}/api/tags`);
}

async function checkQdrantReady() {
  return checkUrl(`${QDRANT_URL}/healthz`);
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function pullOllamaModel(modelName) {
  console.log(`[Ollama] Pulling model: ${modelName} (this may take a few minutes)...`);
  const response = await fetch(`${OLLAMA_URL}/api/pull`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: modelName }),
  });

  if (!response.ok) {
    throw new Error(`Failed to pull model ${modelName}: HTTP ${response.status}`);
  }

  // Read response stream to monitor progress
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let done = false;
  
  while (!done) {
    const { value, done: doneReading } = await reader.read();
    done = doneReading;
    if (value) {
      const chunk = decoder.decode(value, { stream: !done });
      const lines = chunk.split("\n").filter(Boolean);
      for (const line of lines) {
        try {
          const status = JSON.parse(line);
          if (status.completed && status.total) {
            const percent = ((status.completed / status.total) * 100).toFixed(1);
            process.stdout.write(`\r[Ollama] Progress for ${modelName}: ${percent}%`);
          } else if (status.status) {
            process.stdout.write(`\r[Ollama] Status: ${status.status}`);
          }
        } catch {
          // Ignore parsing issues from incomplete stream lines
        }
      }
    }
  }
  console.log(`\n[Ollama] Model ${modelName} is successfully pulled.`);
}

async function main() {
  console.log("=== Regression Test Environment Bootstrap ===");

  // 1. Check & Start Ollama
  console.log("\n[Step 1] Checking Ollama Service...");
  let ollamaOk = await checkOllamaReady();
  if (!ollamaOk) {
    console.log("[Ollama] Service is offline. Attempting to start 'ollama serve'...");
    try {
      const ollamaProcess = spawn("ollama", ["serve"], {
        detached: true,
        stdio: "ignore",
        windowsHide: true,
      });
      ollamaProcess.unref();

      // Poll until ready (up to 15 seconds)
      for (let i = 0; i < 15; i++) {
        await sleep(1000);
        ollamaOk = await checkOllamaReady();
        if (ollamaOk) {
          console.log("[Ollama] Service successfully started.");
          break;
        }
      }
    } catch (err) {
      console.error("[Ollama] Failed to spawn 'ollama serve':", err);
    }
  } else {
    console.log("[Ollama] Service is online.");
  }

  if (!ollamaOk) {
    console.error("[CRITICAL] Ollama is offline. Please launch Ollama manually and try again.");
    process.exit(1);
  }

  // 2. Validate Ollama Models
  console.log("\n[Step 2] Checking Ollama Models...");
  try {
    const res = await fetch(`${OLLAMA_URL}/api/tags`);
    const data = await res.json();
    const models = data.models?.map((m) => m.name) || [];
    
    const requiredModels = ["gemma4:e4b", "embeddinggemma:latest"];
    for (const reqModel of requiredModels) {
      const exists = models.some((m) => m.startsWith(reqModel));
      if (!exists) {
        console.log(`[Ollama] Required model '${reqModel}' is missing.`);
        await pullOllamaModel(reqModel);
      } else {
        console.log(`[Ollama] Model '${reqModel}' is available.`);
      }
    }
  } catch (err) {
    console.error("[Ollama] Failed to check models:", err);
    process.exit(1);
  }

  // 3. Check Qdrant
  console.log("\n[Step 3] Checking Qdrant Service...");
  let qdrantOk = await checkQdrantReady();
  const platform = process.platform;

  if (!qdrantOk) {
    console.log(`[Qdrant] Service is offline. Detecting platform: ${platform}`);
    console.log("[Qdrant] Attempting native startup first...");

    let nativeStarted = false;
    try {
      if (platform === "darwin") {
        // macOS: Try using Homebrew services if installed
        execSync("brew services start qdrant", { stdio: "ignore" });
        console.log("[Qdrant] Attempted native startup on macOS via Homebrew services.");
        nativeStarted = true;
      } else if (platform === "linux") {
        // Linux: Try systemctl
        execSync("systemctl start qdrant", { stdio: "ignore" });
        console.log("[Qdrant] Attempted native startup on Linux via systemctl.");
        nativeStarted = true;
      } else if (platform === "win32") {
        // Windows: Check if qdrant is in path
        execSync("where.exe qdrant", { stdio: "ignore" });
        const qdrantProcess = spawn("qdrant", [], {
          detached: true,
          stdio: "ignore",
          windowsHide: true,
        });
        qdrantProcess.unref();
        console.log("[Qdrant] Attempted native startup on Windows via local PATH executable.");
        nativeStarted = true;
      }
    } catch {
      // Native start commands failed, fall back to Docker
    }

    // Poll until ready if native startup was attempted
    if (nativeStarted) {
      for (let i = 0; i < 5; i++) {
        await sleep(1000);
        qdrantOk = await checkQdrantReady();
        if (qdrantOk) {
          console.log("[Qdrant] Native startup succeeded. Service is online.");
          break;
        }
      }
    }

    if (!qdrantOk) {
      console.log("[Qdrant] Native startup unavailable or failed. Checking Docker daemon...");
      let dockerRunning = false;
      try {
        execSync("docker info", { stdio: "ignore" });
        dockerRunning = true;
      } catch {
        // Docker not running
      }

      if (dockerRunning) {
        console.log("[Docker] Daemon is running. Attempting to start/run 'qdrant' container...");
        try {
          execSync("docker start qdrant-test", { stdio: "ignore" });
          console.log("[Docker] Started existing container 'qdrant-test'.");
        } catch {
          try {
            execSync("docker run -d --name qdrant-test -p 6333:6333 -p 6334:6334 qdrant/qdrant", { stdio: "ignore" });
            console.log("[Docker] Launched a new 'qdrant-test' container.");
          } catch (dockerErr) {
            console.error("[Docker] Failed to launch Qdrant container:", dockerErr);
          }
        }

        // Poll until ready (up to 10 seconds)
        for (let i = 0; i < 10; i++) {
          await sleep(1000);
          qdrantOk = await checkQdrantReady();
          if (qdrantOk) {
            console.log("[Qdrant] Docker startup succeeded. Service is online.");
            break;
          }
        }
      } else {
        console.log("[Qdrant] Docker daemon is offline or not installed.");
      }
    }
  } else {
    console.log("[Qdrant] Service is online.");
  }

  if (!qdrantOk) {
    console.error("\n[CRITICAL] Qdrant service is offline. Per instructions, mocks are disabled.");
    console.error(`=== Qdrant Install/Startup Guide for ${platform.toUpperCase()} ===`);
    if (platform === "win32") {
      console.error("1. Start Docker Desktop and re-run this script.");
      console.error("2. Or download Qdrant Windows binary from GitHub: https://github.com/qdrant/qdrant/releases");
      console.error("   Rename it to 'qdrant.exe', add it to your PATH, and run 'qdrant' in a terminal.");
      console.error("3. Or run it within WSL2 (Docker or native).");
    } else if (platform === "darwin") {
      console.error("1. Start Docker Desktop and re-run this script.");
      console.error("2. Or install natively via Homebrew: run 'brew install qdrant && brew services start qdrant'.");
    } else {
      console.error("1. Start Docker daemon: run 'sudo systemctl start docker' or start your container agent.");
      console.error("2. Or install natively via your package manager or download the Linux binary from: https://github.com/qdrant/qdrant/releases");
    }
    console.error("=============================================\n");
    process.exit(1);
  }

  // 4. Database reset & setup
  console.log("\n[Step 4] Resetting and Seeding SQLite Database...");
  try {
    const execOpts = { stdio: "inherit", shell: true, cwd: path.join(PROJECT_ROOT, "server") };
    
    console.log("[Database] Recreating dev.db...");
    execSync("node scripts/clean-and-create-fresh-db.js", execOpts);
    
    console.log("[Database] Setting up Ollama model routes & embeddings...");
    execSync("pnpm --filter @ai-novel/server exec ts-node-dev scratch/setup-test-db.ts", execOpts);
  } catch (dbErr) {
    console.error("[Database] Setup failed:", dbErr);
    process.exit(1);
  }

  // 5. Start Web App Development Servers
  console.log("\n[Step 5] Starting Development Services (concurrently)...");
  const logFile = path.join(PROJECT_ROOT, ".logs", "dev-raw.log");
  fs.mkdirSync(path.dirname(logFile), { recursive: true });
  const out = fs.openSync(logFile, "a");
  const err = fs.openSync(logFile, "a");

  const devProcess = spawn("pnpm", ["dev:raw"], {
    cwd: PROJECT_ROOT,
    detached: true,
    stdio: ["ignore", out, err],
    shell: true,
  });
  devProcess.unref();

  // Release parent child reference but keep process checking
  console.log("[Bootstrap] Services started. Waiting for endpoints to become ready...");
  let serverReady = false;
  let clientReady = false;
  
  for (let i = 0; i < 30; i++) {
    await sleep(2000);
    
    if (!serverReady) {
      serverReady = await checkUrl("http://localhost:3000/api/health");
    }
    if (!clientReady) {
      clientReady = await checkUrl("http://localhost:5173");
    }
    
    if (serverReady && clientReady) {
      console.log("\n🎉 SUCCESS! All services are online and ready!");
      console.log("- Client: http://localhost:5173");
      console.log("- Server: http://localhost:3000");
      console.log("- Ollama: http://127.0.0.1:11434");
      console.log("- Qdrant: http://127.0.0.1:6333");
      console.log("\nReady for regression testing. You can run the browser subagent now.");
      console.log("[Keep-Alive] Keeping bootstrap script active to maintain dev servers. Press Ctrl+C to stop.");
      while (true) {
        await sleep(60000);
      }
    }
  }

  console.warn("\n[Warning] Timeout waiting for Client or Server to become responsive. Check console logs.");
  process.exit(1);
}

main().catch(console.error);
