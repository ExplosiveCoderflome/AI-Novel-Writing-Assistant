const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  assertSmokeResult,
  resolvePackagedExecutable,
} = require("./run-packaged-smoke.cjs");

function createTemporaryDesktop(t, productName = "AI Novel Writer") {
  const baseDesktopDir = fs.mkdtempSync(path.join(os.tmpdir(), "packaged-smoke-runner-test-"));
  t.after(() => fs.rmSync(baseDesktopDir, { recursive: true, force: true }));
  fs.writeFileSync(path.join(baseDesktopDir, "package.json"), JSON.stringify({ productName }), "utf8");
  return baseDesktopDir;
}

function passingSmokeResult(overrides = {}) {
  return {
    ok: true,
    platform: "darwin",
    arch: "arm64",
    electronVersion: "35.7.5",
    nodeAbi: "135",
    checks: {
      betterSqlite3: { ok: true },
      sharp: { ok: true },
      prisma: { ok: true },
      serverHealth: { ok: true },
      rendererEntry: { ok: true },
    },
    ...overrides,
  };
}

test("resolvePackagedExecutable resolves the macOS bundle executable", (t) => {
  const baseDesktopDir = createTemporaryDesktop(t);
  const executablePath = path.join(
    baseDesktopDir,
    "build",
    "dist",
    "mac-arm64",
    "Writer.app",
    "Contents",
    "MacOS",
    "AI Novel Writer",
  );
  fs.mkdirSync(path.dirname(executablePath), { recursive: true });
  fs.writeFileSync(executablePath, "", "utf8");
  assert.equal(resolvePackagedExecutable({ platform: "mac", arch: "arm64" }, baseDesktopDir), executablePath);
});

test("resolvePackagedExecutable resolves the Windows product executable", (t) => {
  const baseDesktopDir = createTemporaryDesktop(t);
  const executablePath = path.join(baseDesktopDir, "build", "dist", "win-unpacked", "AI Novel Writer.exe");
  fs.mkdirSync(path.dirname(executablePath), { recursive: true });
  fs.writeFileSync(executablePath, "", "utf8");
  assert.equal(resolvePackagedExecutable({ platform: "win", arch: "x64" }, baseDesktopDir), executablePath);
});

test("assertSmokeResult proves the packaged Electron version, ABI, platform, and all checks", () => {
  const result = passingSmokeResult();
  assert.equal(
    assertSmokeResult(result, { platform: "mac", arch: "arm64" }, "35.7.5"),
    result,
  );
  assert.throws(
    () => assertSmokeResult(passingSmokeResult({ electronVersion: "35.7.4" }), { platform: "mac", arch: "arm64" }, "35.7.5"),
    /expected Electron ABI/,
  );
  assert.throws(
    () => assertSmokeResult(passingSmokeResult({ nodeAbi: "unknown" }), { platform: "mac", arch: "arm64" }, "35.7.5"),
    /expected Electron ABI/,
  );
  assert.throws(
    () => assertSmokeResult(passingSmokeResult({ arch: "x64" }), { platform: "mac", arch: "arm64" }, "35.7.5"),
    /expected darwin\/arm64/,
  );
  const failedSharp = passingSmokeResult();
  failedSharp.checks.sharp.ok = false;
  assert.throws(
    () => assertSmokeResult(failedSharp, { platform: "mac", arch: "arm64" }, "35.7.5"),
    /check sharp did not pass/,
  );
});
