const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { checkSourceFileLengths } = require("../check-source-file-length.cjs");

function createFile(targetPath, lines) {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, `${Array.from({ length: lines }, (_, index) => `line-${index + 1}`).join("\n")}\n`, "utf8");
}

test("checkSourceFileLengths flags new files that exceed the threshold", () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-novel-source-length-"));
  createFile(path.join(rootDir, "client", "src", "pages", "Huge.tsx"), 701);

  const result = checkSourceFileLengths({
    rootDir,
    threshold: 700,
    targets: ["client/src"],
    allowlist: {},
  });

  assert.equal(result.ok, false);
  assert.equal(result.violations.length, 1);
  assert.equal(result.violations[0].relativePath, "client/src/pages/Huge.tsx");
  assert.equal(result.violations[0].reason, "new_over_limit");
});

test("checkSourceFileLengths flags allowlisted files that grow past their baseline", () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-novel-source-length-"));
  createFile(path.join(rootDir, "server", "src", "services", "Existing.ts"), 735);

  const result = checkSourceFileLengths({
    rootDir,
    threshold: 700,
    targets: ["server/src"],
    allowlist: {
      "server/src/services/Existing.ts": 720,
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.violations.length, 1);
  assert.equal(result.violations[0].relativePath, "server/src/services/Existing.ts");
  assert.equal(result.violations[0].reason, "allowlisted_file_grew");
});

test("repository test files use the .test.js suffix only", () => {
  const repoRoot = path.resolve(__dirname, "..", "..");
  const legacyTestFiles = [];

  function visit(directory) {
    const entries = fs.readdirSync(directory, { withFileTypes: true });
    for (const entry of entries) {
      if (
        entry.name === ".git"
        || entry.name === "node_modules"
        || entry.name === ".worktrees"
      ) {
        continue;
      }

      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        visit(fullPath);
        continue;
      }

      if (entry.isFile() && entry.name.endsWith(".test.cjs")) {
        legacyTestFiles.push(path.relative(repoRoot, fullPath));
      }
    }
  }

  visit(repoRoot);
  assert.deepEqual(legacyTestFiles.sort(), []);
});
