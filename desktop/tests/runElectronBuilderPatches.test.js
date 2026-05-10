const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("run-electron-builder patches app-builder-lib jiti compatibility", () => {
  const script = fs.readFileSync(
    path.join(__dirname, "..", "scripts", "run-electron-builder.cjs"),
    "utf8",
  );

  assert.ok(
    script.includes("jitiCompatOriginal"),
    "expected run-electron-builder.cjs to declare a jiti compatibility patch marker",
  );
  assert.ok(
    script.includes("jitiCompatPatched"),
    "expected run-electron-builder.cjs to declare a patched jiti compatibility source",
  );
  assert.ok(
    script.includes("\"app-builder-lib/out/util/config/load.js\""),
    "expected run-electron-builder.cjs to patch app-builder-lib config loader",
  );
  assert.ok(
    script.includes("jiti_1.createJiti"),
    "expected run-electron-builder.cjs to patch the createJiti invocation path",
  );
  assert.ok(
    script.includes("typeof jiti_1 === \"function\" ? jiti_1"),
    "expected run-electron-builder.cjs to support jiti v1 default function export",
  );
  assert.ok(
    script.includes("yallistCompatOriginal"),
    "expected run-electron-builder.cjs to declare a yallist compatibility patch marker",
  );
  assert.ok(
    script.includes("\"lru-cache/index.js\""),
    "expected run-electron-builder.cjs to patch lru-cache for yallist compatibility",
  );
  assert.ok(
    script.includes("yallist_1.Yallist || yallist_1.default"),
    "expected run-electron-builder.cjs to support yallist named exports",
  );
});
