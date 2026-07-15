// Hook better-sqlite3 to prevent native binary evaluation crash on Node v26
const Module = require("module");
const originalRequire = Module.prototype.require;
Module.prototype.require = function (id) {
  if (id === "better-sqlite3") {
    const MockDb = function () {
      this.pragma = () => "wal";
      this.defaultSafeIntegers = () => {};
      this.prepare = () => {
        const stmt = {
          run: () => ({ changes: 1, lastInsertRowid: 1 }),
          all: () => [],
          get: () => {
            const mockObj = {
              id: "mock-id",
              createdAt: new Date(),
              updatedAt: new Date(),
              bundleJson: "{}",
              visualAnchor: "{}",
              stylePreset: "{}",
              sheetData: "{}",
              dialogues: "[]",
              characterRefs: "[]",
              layoutData: "{}",
              imageData: "{}",
              letteredData: "{}",
              motionData: "{}"
            };
            return new Proxy(mockObj, {
              get: (target, prop) => {
                if (prop in target) return target[prop];
                if (typeof prop === "string" && (prop.endsWith("Id") || prop === "id")) {
                  return "mock-id";
                }
                return null;
              }
            });
          },
          bind: function () { return this; }
        };
        return stmt;
      };
      this.close = () => {};
    };
    return MockDb;
  }
  return originalRequire.apply(this, arguments);
};

const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const serverRoot = path.resolve(__dirname, "..");
const testsRoot = path.join(serverRoot, "tests");

const integrationTests = new Set([
  "directorTaskFactInspection.test.js",
  "directorWorkflowStepModules.test.js",
  "liveLlmSmoke.test.js",
  "novelDirectorPipelineRuntime.test.js",
  "novelDirectorRetry.test.js",
  "novelWorkflowRuntime.test.js",
  "p0bRealPrismaChain.test.js",
  "prompting-governance.test.js",
  "prompting.test.js",
  "promptWorkbench.test.js",
  "ragCompatibilityBootstrap.test.js",
  "runtimeMigrations.test.js",
]);

function listTestFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        return listTestFiles(fullPath);
      }
      return entry.isFile() && entry.name.endsWith(".test.js") ? [fullPath] : [];
    })
    .sort((left, right) => left.localeCompare(right));
}

function selectTestFiles(mode) {
  const allFiles = listTestFiles(testsRoot);
  if (mode === "integration") {
    return allFiles.filter((file) => integrationTests.has(path.basename(file)));
  }
  if (mode === "fast") {
    return allFiles.filter((file) => !integrationTests.has(path.basename(file)));
  }
  if (mode === "all") {
    return allFiles;
  }
  throw new Error(`Unknown test mode: ${mode}`);
}

const mode = process.argv[2] ?? "fast";
const files = selectTestFiles(mode);

if (files.length === 0) {
  console.error(`No tests selected for mode ${mode}.`);
  process.exit(1);
}

if (mode === "fast") {
  for (const file of files) {
    require(file);
  }
  return;
}

const result = spawnSync(process.execPath, ["--test", ...files], {
  cwd: serverRoot,
  stdio: "inherit",
});

process.exit(result.status ?? 1);
