const test = require("node:test");
const assert = require("node:assert/strict");

const { runWindowsProcessAndWait } = require("../scripts/installerProcess.cjs");

test("runs a Windows executable through a synchronous PowerShell launcher", async (t) => {
  if (process.platform !== "win32") {
    t.skip("Windows process launcher contract");
    return;
  }

  await runWindowsProcessAndWait(process.env.ComSpec, ["/d", "/c", "exit", "0"], {
    cwd: process.cwd(),
    stdio: "ignore",
  });
});

test("propagates a Windows executable failure", async (t) => {
  if (process.platform !== "win32") {
    t.skip("Windows process launcher contract");
    return;
  }

  await assert.rejects(
    runWindowsProcessAndWait(process.env.ComSpec, ["/d", "/c", "exit", "7"], {
      cwd: process.cwd(),
      stdio: "ignore",
    }),
    /exit code 7/,
  );
});
