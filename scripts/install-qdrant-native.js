// install-qdrant-native.js
// Downloads, extracts, and runs Qdrant natively on Windows using Node.js

const { execSync, spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const qdrantDir = path.join(process.env.LOCALAPPDATA, "Qdrant");
const zipPath = path.join(qdrantDir, "qdrant.zip");
const downloadUrl = "https://github.com/qdrant/qdrant/releases/download/v1.18.3/qdrant-x86_64-pc-windows-msvc.zip";

async function main() {
  console.log("=== Qdrant Native Installer for Windows ===");

  // 1. Create target folder
  if (!fs.existsSync(qdrantDir)) {
    fs.mkdirSync(qdrantDir, { recursive: true });
    console.log(`Created directory: ${qdrantDir}`);
  }

  // 2. Download zip file
  console.log(`Downloading Qdrant v1.18.3 from GitHub: ${downloadUrl}`);
  
  const response = await fetch(downloadUrl);
  if (!response.ok) {
    throw new Error(`Failed to download Qdrant: HTTP ${response.status}`);
  }
  
  const fileStream = fs.createWriteStream(zipPath);
  const reader = response.body.getReader();
  let done = false;
  
  while (!done) {
    const { value, done: doneReading } = await reader.read();
    done = doneReading;
    if (value) {
      fileStream.write(Buffer.from(value));
    }
  }
  
  await new Promise((resolve, reject) => {
    fileStream.on("finish", resolve);
    fileStream.on("error", reject);
    fileStream.end();
  });
  console.log("Download complete.");

  // 3. Extract zip file
  console.log("Extracting zip archive using PowerShell...");
  try {
    execSync(`powershell -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${qdrantDir}' -Force"`, { stdio: "inherit" });
    console.log("Extraction complete.");
  } catch (err) {
    console.error("Failed to extract zip archive:", err);
    process.exit(1);
  }

  // 4. Remove zip file
  if (fs.existsSync(zipPath)) {
    fs.unlinkSync(zipPath);
  }

  // 5. Add to environment User PATH
  console.log("Checking PATH configuration...");
  try {
    const checkPathCmd = `powershell -Command "[Environment]::GetEnvironmentVariable('Path', 'User')"`;
    const userPath = execSync(checkPathCmd).toString().trim();
    if (!userPath.includes(qdrantDir)) {
      const setPathCmd = `powershell -Command "[Environment]::SetEnvironmentVariable('Path', '${userPath};${qdrantDir}', 'User')"`;
      execSync(setPathCmd);
      console.log(`Successfully added Qdrant path to User PATH environment variable.`);
    } else {
      console.log("Qdrant path already configured in User PATH.");
    }
  } catch (err) {
    console.warn("Failed to set PATH env permanently. Running anyway.", err);
  }

  // 6. Launch Qdrant in background
  console.log("Launching Qdrant natively on port 6333...");
  const qdrantExe = path.join(qdrantDir, "qdrant.exe");
  const qdrantProcess = spawn(qdrantExe, [], {
    cwd: qdrantDir,
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
  qdrantProcess.unref();

  // 7. Verify port is listening
  console.log("Verifying Qdrant port availability...");
  for (let i = 0; i < 10; i++) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    try {
      const res = await fetch("http://127.0.0.1:6333/healthz", { signal: AbortSignal.timeout(1000) });
      if (res.ok) {
        console.log("✔ SUCCESS: Qdrant is online and listening on port 6333!");
        process.exit(0);
      }
    } catch {
      // Retry
    }
  }

  console.error("Warning: Timeout waiting for Qdrant to respond. Please start Qdrant manually.");
  process.exit(1);
}

main().catch((err) => {
  console.error("Fatal error during installation:", err);
  process.exit(1);
});
