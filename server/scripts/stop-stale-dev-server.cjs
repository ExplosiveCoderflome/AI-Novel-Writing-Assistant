const { execFileSync } = require("child_process");
const path = require("path");

const repoRoot = normalizeCommandLine(path.resolve(__dirname, "..", ".."));
const currentPid = process.pid;
const parentPid = process.ppid;
const optOut = String(process.env.AI_NOVEL_SKIP_DEV_SINGLETON || "").trim();
const powershellPath = process.env.SystemRoot
  ? path.join(process.env.SystemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe")
  : "powershell.exe";

function normalizeCommandLine(value) {
  return String(value || "").toLowerCase().replace(/\\/g, "/");
}

function isTargetProcess(processInfo) {
  if (!processInfo) {
    return false;
  }
  const pid = Number(processInfo.ProcessId);
  const processParentPid = Number(processInfo.ParentProcessId);
  if (pid === currentPid || pid === parentPid || processParentPid === currentPid || processParentPid === parentPid) {
    return false;
  }

  const commandLine = normalizeCommandLine(processInfo.CommandLine);
  if (!commandLine.includes(`${repoRoot}/`) || !/(?:^|[\s"/])src\/app\.ts(?:[\s"]|$)/.test(commandLine)) {
    return false;
  }

  // Match both the watcher and the Node child it starts on Windows.
  const usesTsx = /\/tsx\/dist\/(?:cli\.mjs|preflight\.cjs)(?:[\s"]|$)/.test(commandLine);
  const usesLegacyRunner = commandLine.includes("ts-node-dev");
  return usesTsx || usesLegacyRunner;
}

function readWindowsNodeProcesses() {
  const command = [
    "$ErrorActionPreference = 'Stop';",
    "Get-CimInstance Win32_Process -Filter \"name = 'node.exe'\"",
    "| Select-Object ProcessId,ParentProcessId,CommandLine",
    "| ConvertTo-Json -Compress",
  ].join(" ");

  const output = execFileSync(
    powershellPath,
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  ).trim();

  if (!output) {
    return [];
  }

  const parsed = JSON.parse(output);
  return Array.isArray(parsed) ? parsed : [parsed];
}

function stopWindowsProcesses(processes) {
  const targetIds = processes
    .filter(isTargetProcess)
    .map((item) => Number(item.ProcessId))
    .filter((pid) => Number.isInteger(pid) && pid > 0);

  if (targetIds.length === 0) {
    return 0;
  }

  const quotedIds = targetIds.join(",");
  execFileSync(
    powershellPath,
    [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      `Stop-Process -Id ${quotedIds} -Force -ErrorAction SilentlyContinue`,
    ],
    { stdio: "ignore" },
  );

  return targetIds.length;
}

function main() {
  if (optOut === "1" || optOut.toLowerCase() === "true") {
    return;
  }

  if (process.platform !== "win32") {
    return;
  }

  try {
    const stoppedCount = stopWindowsProcesses(readWindowsNodeProcesses());
    if (stoppedCount > 0) {
      console.log(`[dev-server] stopped ${stoppedCount} stale server dev process(es).`);
    }
  } catch (error) {
    console.warn(`[dev-server] skipped stale process cleanup: ${error.message}`);
  }
}

main();
