#!/usr/bin/env node

"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { performance } = require("node:perf_hooks");
const { spawn, spawnSync } = require("node:child_process");

const repoRoot = path.resolve(__dirname, "..");
const benchmarkRoot = path.join(repoRoot, ".tmp", "tsrs-benchmark");
const configRoot = path.join(benchmarkRoot, "configs");
const cliArgs = new Set(process.argv.slice(2));
const checkMode = cliArgs.has("--check");
const tscCheckMode = cliArgs.has("--tsc-check");
const benchmarkPackageNames = ["shared", "server", "client"];
const packageNames = checkMode || tscCheckMode ? [...benchmarkPackageNames, "desktop"] : benchmarkPackageNames;
const skipPrepare = cliArgs.has("--skip-prepare");
const useFastMode = !cliArgs.has("--no-fast");
const onlyIndex = process.argv.indexOf("--only");
const selectedPackages = onlyIndex >= 0 && process.argv[onlyIndex + 1]
  ? process.argv[onlyIndex + 1].split(",").map((value) => value.trim()).filter((value) => packageNames.includes(value))
  : packageNames;

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function normalizePath(value) {
  return value.replace(/\\/g, "/");
}

function absoluteConfigPath(packageName) {
  return path.join(repoRoot, packageName, "tsconfig.json");
}

function absoluteFromPackage(packageRoot, value) {
  return normalizePath(path.resolve(packageRoot, value));
}

function normalizePathMappings(packageRoot, paths) {
  return Object.fromEntries(
    Object.entries(paths ?? {}).map(([key, values]) => [
      key,
      values.map((value) => absoluteFromPackage(packageRoot, value)),
    ]),
  );
}

function createCompatibilityConfig(packageName) {
  const packageRoot = path.join(repoRoot, packageName);
  const sourceConfigPath = absoluteConfigPath(packageName);
  const sourceConfig = readJson(sourceConfigPath);
  const baseConfigPath = path.resolve(path.dirname(sourceConfigPath), sourceConfig.extends);
  const baseConfig = readJson(baseConfigPath);
  const compilerOptions = {
    ...(baseConfig.compilerOptions ?? {}),
    ...(sourceConfig.compilerOptions ?? {}),
  };

  delete compilerOptions.extends;
  delete compilerOptions.baseUrl;
  delete compilerOptions.tsBuildInfoFile;
  compilerOptions.incremental = false;
  compilerOptions.noEmit = true;
  if (packageName === "server" || packageName === "desktop") {
    compilerOptions.typeRoots = [
      path.join(packageRoot, "node_modules", "@types"),
      path.join(repoRoot, "node_modules", "@types"),
    ].filter((value, index, values) => fs.existsSync(value) && values.indexOf(value) === index)
      .map(normalizePath);
  } else {
    delete compilerOptions.typeRoots;
  }
  if (compilerOptions.types) {
    compilerOptions.types = compilerOptions.types.map((value) => {
      if (!value.includes("/")) return value;
      const candidate = path.resolve(packageRoot, "node_modules", value);
      return fs.existsSync(candidate) || fs.existsSync(`${candidate}.d.ts`)
        ? normalizePath(candidate)
        : value;
    });
  }

  if (compilerOptions.paths) {
    compilerOptions.paths = normalizePathMappings(packageRoot, compilerOptions.paths);
  }
  if (compilerOptions.typeRoots) {
    compilerOptions.typeRoots = compilerOptions.typeRoots.map((value) => absoluteFromPackage(packageRoot, value));
  }
  if (compilerOptions.rootDir) {
    compilerOptions.rootDir = absoluteFromPackage(packageRoot, compilerOptions.rootDir);
  }
  if (compilerOptions.outDir) {
    compilerOptions.outDir = absoluteFromPackage(packageRoot, compilerOptions.outDir);
  }

  if (packageName === "server" || packageName === "desktop") {
    // TypeScript 7 removes the old Node10 resolver. Bundler resolution keeps
    // the existing extensionless imports usable for this exploratory run.
    compilerOptions.module = "ESNext";
    compilerOptions.moduleResolution = "Bundler";
  }

  const generatedConfig = {
    compilerOptions,
    include: (sourceConfig.include ?? []).map((value) => absoluteFromPackage(packageRoot, value)),
    exclude: (sourceConfig.exclude ?? []).map((value) => absoluteFromPackage(packageRoot, value)),
  };
  const generatedPath = path.join(configRoot, `${packageName}.tsconfig.json`);
  fs.mkdirSync(configRoot, { recursive: true });
  fs.writeFileSync(generatedPath, `${JSON.stringify(generatedConfig, null, 2)}\n`);
  return generatedPath;
}

function resolvePackageRoot(packageName) {
  const entry = require.resolve(packageName);
  return path.dirname(path.dirname(entry));
}

function resolveTscCommand() {
  const platformName = `@typescript/typescript-${process.platform}-${process.arch}`;
  try {
    const packagePath = require.resolve(`${platformName}/package.json`, {
      paths: [resolvePackageRoot("typescript")],
    });
    return {
      command: path.join(path.dirname(packagePath), "lib", process.platform === "win32" ? "tsc.exe" : "tsc"),
      argsPrefix: [],
    };
  } catch {
    return {
      command: process.execPath,
      argsPrefix: [path.join(resolvePackageRoot("typescript"), "bin", "tsc")],
    };
  }
}

function resolveTsrsCommand() {
  const platformName = process.platform === "win32"
    ? `@tsrs/win32-${process.arch === "arm64" ? "arm64" : "x64"}`
    : process.platform === "darwin"
      ? `@tsrs/darwin-${process.arch === "arm64" ? "arm64" : "x64"}`
      : `@tsrs/linux-${process.arch === "arm64" ? "arm64" : "x64"}-gnu`;
  try {
    const packagePath = require.resolve(`${platformName}/package.json`, {
      paths: [resolvePackageRoot("tsrs")],
    });
    return {
      command: path.join(path.dirname(packagePath), process.platform === "win32" ? "tsrs.exe" : "tsrs"),
      argsPrefix: [],
    };
  } catch {
    return {
      command: process.execPath,
      argsPrefix: [path.join(resolvePackageRoot("tsrs"), "bin", "tsrs")],
    };
  }
}

function sampleWindowsProcessMemory(pid) {
  const result = spawnSync("tasklist.exe", ["/FI", `PID eq ${pid}`, "/FO", "CSV", "/NH"], {
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.status !== 0) return null;
  const line = result.stdout.split(/\r?\n/).find((value) => value.includes(`"${pid}"`));
  if (!line) return null;
  const fields = line.split("\",\"");
  const workingSet = fields.at(-1)?.replace(/[^0-9]/g, "");
  const kilobytes = Number.parseInt(workingSet ?? "", 10);
  return Number.isFinite(kilobytes) ? kilobytes * 1024 : null;
}

function startWindowsMemoryMonitor(pid) {
  let peakMemoryBytes = 0;
  const sample = () => {
    const current = sampleWindowsProcessMemory(pid);
    if (current && current > peakMemoryBytes) peakMemoryBytes = current;
  };
  sample();
  const interval = setInterval(sample, 500);
  return {
    done: Promise.resolve(null),
    stop() {
      clearInterval(interval);
      sample();
      return Promise.resolve(peakMemoryBytes || null);
    },
  };
}

function startMemoryMonitor(pid) {
  if (process.platform === "win32") return startWindowsMemoryMonitor(pid);
  return { done: Promise.resolve(null), stop: () => Promise.resolve(null) };
}

function runMeasured(label, tool, configPath, extraArgs) {
  return new Promise((resolve) => {
    const args = [
      ...tool.argsPrefix,
      "-p",
      configPath,
      "--noEmit",
      "--pretty",
      "false",
      ...extraArgs,
    ];
    const child = spawn(tool.command, args, {
      cwd: repoRoot,
      env: { ...process.env, FORCE_COLOR: "0", NO_COLOR: "1" },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    const memory = startMemoryMonitor(child.pid);
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    const startedAt = performance.now();
    const timeout = setTimeout(() => child.kill(), 10 * 60 * 1000);

    child.on("close", async (exitCode, signal) => {
      clearTimeout(timeout);
      const peakMemoryBytes = await memory.stop();
      const durationMs = Math.round(performance.now() - startedAt);
      const combined = `${stdout}\n${stderr}`.trim();
      const diagnosticLines = combined
        .split(/\r?\n/)
        .filter((line) => /(?:error|warning) TS\d+:/i.test(line))
        .slice(0, 20);
      resolve({
        label,
        status: exitCode === 0 ? "passed" : "failed",
        exitCode: exitCode ?? 1,
        signal,
        durationMs,
        peakMemoryBytes,
        diagnosticCount: diagnosticLines.length,
        diagnosticLines,
        stdout,
        stderr,
        command: [tool.command, ...args].join(" "),
      });
    });
  });
}

function runPreparation(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: repoRoot,
      env: { ...process.env, FORCE_COLOR: "0", NO_COLOR: "1" },
      stdio: "inherit",
      windowsHide: true,
      shell: process.platform === "win32",
    });
    child.on("error", reject);
    child.on("close", (exitCode) => {
      if (exitCode === 0) resolve();
      else reject(new Error(`${command} ${args.join(" ")} exited with ${exitCode}`));
    });
  });
}

function formatDuration(durationMs) {
  return `${(durationMs / 1000).toFixed(2)}s`;
}

function formatMemory(bytes) {
  if (!bytes) return "n/a";
  return `${(bytes / 1024 / 1024).toFixed(0)} MB`;
}

function formatDelta(tscResult, tsrsResult, field, suffix = "") {
  if (!tscResult[field] || !tsrsResult[field]) return "n/a";
  const delta = ((tsrsResult[field] - tscResult[field]) / tscResult[field]) * 100;
  return `${delta >= 0 ? "+" : ""}${delta.toFixed(1)}%${suffix}`;
}

function printResult(packageName, tscResult, tsrsResult) {
  console.log(`\n${packageName}`);
  console.log(`  tsc   ${tscResult.status}  ${formatDuration(tscResult.durationMs)}  ${formatMemory(tscResult.peakMemoryBytes)}`);
  console.log(`  tsrs  ${tsrsResult.status}  ${formatDuration(tsrsResult.durationMs)}  ${formatMemory(tsrsResult.peakMemoryBytes)}`);
  console.log(`  delta time ${formatDelta(tscResult, tsrsResult, "durationMs")}  memory ${formatDelta(tscResult, tsrsResult, "peakMemoryBytes")}`);
  for (const result of [tscResult, tsrsResult]) {
    if (result.diagnosticLines.length > 0) {
      console.log(`  ${result.label} diagnostics`);
      for (const line of result.diagnosticLines) console.log(`    ${line}`);
    }
  }
}

function printCheckResult(packageName, compiler, result) {
  console.log(`\n${packageName}`);
  console.log(`  ${compiler.padEnd(4)} ${result.status}  ${formatDuration(result.durationMs)}  ${formatMemory(result.peakMemoryBytes)}`);
  for (const line of result.diagnosticLines) console.log(`    ${line}`);
}

async function main() {
  fs.mkdirSync(benchmarkRoot, { recursive: true });
  if (!skipPrepare) {
    const packageManager = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
    console.log("Preparing shared declarations and Prisma Client...");
    await runPreparation(packageManager, ["--filter", "@ai-novel/shared", "build"]);
    await runPreparation(packageManager, ["--filter", "@ai-novel/server", "prisma:generate"]);
  }

  const tsc = resolveTscCommand();
  const tsrs = resolveTsrsCommand();
  const results = [];
  for (const packageName of selectedPackages) {
    const compatibilityConfig = createCompatibilityConfig(packageName);
    if (!checkMode) {
      const tscResult = await runMeasured(`${packageName}:tsc`, tsc, compatibilityConfig, ["--incremental", "false"]);
      if (tscCheckMode) {
        results.push({ packageName, tsc: tscResult, compatibilityConfig });
        printCheckResult(packageName, "tsc", tscResult);
        continue;
      }
      const tsrsArgs = useFastMode ? ["--fast"] : [];
      const tsrsResult = await runMeasured(`${packageName}:tsrs`, tsrs, compatibilityConfig, tsrsArgs);
      results.push({ packageName, tsc: tscResult, tsrs: tsrsResult, compatibilityConfig });
      printResult(packageName, tscResult, tsrsResult);
      continue;
    }
    const tsrsArgs = useFastMode ? ["--fast"] : [];
    const tsrsResult = await runMeasured(`${packageName}:tsrs`, tsrs, compatibilityConfig, tsrsArgs);
    results.push({ packageName, tsrs: tsrsResult, compatibilityConfig });
    printCheckResult(packageName, "tsrs", tsrsResult);
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const resultPath = path.join(benchmarkRoot, `result-${timestamp}.json`);
  const payload = {
    generatedAt: new Date().toISOString(),
    node: process.version,
    platform: `${process.platform}-${process.arch}`,
    tscVersion: require("typescript/package.json").version,
    tsrsVersion: require("tsrs/package.json").version,
    checkMode,
    tscCheckMode,
    tsrsFastMode: useFastMode,
    prepared: !skipPrepare,
    results,
  };
  fs.writeFileSync(resultPath, `${JSON.stringify(payload, null, 2)}\n`);
  console.log(`\nSaved benchmark result to ${path.relative(repoRoot, resultPath)}`);
  if (checkMode && results.some((result) => result.tsrs.status !== "passed")) {
    process.exitCode = 1;
  }
  if (tscCheckMode && results.some((result) => result.tsc.status !== "passed")) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
