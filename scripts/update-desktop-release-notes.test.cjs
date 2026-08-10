const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  extractReleaseNotesForVersion,
  main,
  parseArgs,
  renderReleaseBody,
  resolveReleaseTag,
} = require("./update-desktop-release-notes.cjs");

const datedNotes = [
  "# 更新历史",
  "",
  "### 2026-08-11",
  "",
  "- v1.2.3-beta.10 的候选说明。",
  "",
  "### 2026-08-10",
  "",
  "- v1.2.3-beta.1 的候选说明。",
  "",
  "### 2026-08-09",
  "",
  "- v1.2.2 的稳定版说明。",
  "",
].join("\n");

test("renders exact stable and beta tags and rejects mismatches", () => {
  assert.equal(resolveReleaseTag("1.2.3", "v1.2.3"), "v1.2.3");
  assert.equal(resolveReleaseTag("1.2.3-beta.4", "v1.2.3-beta.4"), "v1.2.3-beta.4");
  assert.throws(
    () => resolveReleaseTag("1.2.3-beta.4", "desktop-v1.2.3-beta.4"),
    /must exactly match v1\.2\.3-beta\.4/,
  );
  assert.throws(
    () => resolveReleaseTag("1.2.3", "v1.2.4"),
    /must exactly match v1\.2\.3/,
  );
});

test("uses exact version boundaries inside date-based release-note blocks", () => {
  const betaOneBlock = extractReleaseNotesForVersion(datedNotes, "1.2.3-beta.1");
  assert.match(betaOneBlock, /^### 2026-08-10/);
  assert.doesNotMatch(betaOneBlock, /beta\.10/);

  const fallbackBlock = extractReleaseNotesForVersion(datedNotes, "1.3.0-beta.1");
  assert.match(fallbackBlock, /^### 2026-08-11/);
});

test("supports stdout and explicit write-body modes without a GitHub mutation mode", () => {
  assert.equal(parseArgs([]).outputMode, "stdout");
  assert.equal(parseArgs(["--dry-run"]).outputMode, "stdout");
  assert.deepEqual(parseArgs(["--write-body", "release-body.md"]), {
    help: false,
    outputMode: "file",
    writeBodyPath: "release-body.md",
  });
  assert.throws(() => parseArgs(["--write-body"]), /requires a file path/);
  assert.throws(
    () => parseArgs(["--write-body", "release-body.md", "--stdout"]),
    /not both/,
  );
});

test("writes a beta release body only when --write-body is explicit", (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "desktop-release-notes-"));
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));
  const packagePath = path.join(tempDir, "package.json");
  const notesPath = path.join(tempDir, "release-notes.md");
  const outputPath = path.join(tempDir, "body.md");
  fs.writeFileSync(packagePath, `${JSON.stringify({ version: "1.2.3-beta.1" })}\n`, "utf8");
  fs.writeFileSync(notesPath, datedNotes, "utf8");

  const body = renderReleaseBody({ packagePath, notesPath, refName: "v1.2.3-beta.1" });
  assert.match(body, /### 2026-08-10/);
  assert.match(body, /桌面客户端版本：v1\.2\.3-beta\.1$/);
  assert.equal(fs.existsSync(outputPath), false);

  main({
    argv: ["--write-body", outputPath],
    packagePath,
    notesPath,
    refName: "v1.2.3-beta.1",
  });
  assert.equal(fs.readFileSync(outputPath, "utf8"), `${body}\n`);
});
