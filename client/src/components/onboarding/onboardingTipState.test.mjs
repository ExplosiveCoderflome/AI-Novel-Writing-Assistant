import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";
import { dismissOnboardingTip, loadOnboardingTipDismissal } from "./onboardingTipState.ts";

// Compile the CommonJS desktop module without launching Electron or touching app data.
const require = createRequire(import.meta.url);
const desktopSource = new URL("../../../../desktop/src/runtime/preferences/onboardingTips.ts", import.meta.url);
function desktopStore(filePath) {
  const module = { exports: {} };
  const source = ts.transpileModule(readFileSync(desktopSource, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(source, { module, exports: module.exports, require });
  return module.exports.createOnboardingTipStore(filePath);
}

function localStorage() {
  const values = new Map();
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
}

function fixture(t) {
  const directory = mkdtempSync(path.join(tmpdir(), "onboarding-dismissal-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const filePath = path.join(directory, "preferences", "onboarding-tips.json");
  const store = desktopStore(filePath);
  const bridge = {
    getDismissedOnboardingTips: async () => store.read(),
    dismissOnboardingTip: async (key) => store.dismiss(key),
  };
  return { filePath, bridge };
}

test("a dismissed tip stays hidden after desktop restart with fresh page storage", async (t) => {
  const { filePath, bridge } = fixture(t);
  assert.equal(await loadOnboardingTipDismissal("auto-director-idea", localStorage(), bridge), false);
  await dismissOnboardingTip("auto-director-idea", localStorage(), bridge);

  // A new module/store instance represents the next main process; page storage is empty.
  const restarted = desktopStore(filePath);
  const nextBridge = { getDismissedOnboardingTips: async () => restarted.read() };
  assert.equal(await loadOnboardingTipDismissal("auto-director-idea", localStorage(), nextBridge), true);
  assert.equal(await loadOnboardingTipDismissal("auto-director-candidates", localStorage(), nextBridge), false);
});

test("existing page dismissals migrate to desktop storage without reopening", async (t) => {
  const { filePath, bridge } = fixture(t);
  const storage = localStorage();
  storage.setItem("ai-novel.guide-tip.auto-director-idea", "dismissed");
  assert.equal(await loadOnboardingTipDismissal("auto-director-idea", storage, bridge), true);
  assert.deepEqual(Array.from(desktopStore(filePath).read()), ["auto-director-idea"]);
});

test("desktop persistence works when page storage is unavailable", async (t) => {
  const { filePath, bridge } = fixture(t);
  const unavailable = { getItem() { throw new Error("denied"); }, setItem() { throw new Error("denied"); } };
  await dismissOnboardingTip("auto-director-idea", unavailable, bridge);
  assert.deepEqual(Array.from(desktopStore(filePath).read()), ["auto-director-idea"]);
  assert.equal(await loadOnboardingTipDismissal("auto-director-idea", unavailable, bridge), true);
});

test("web and older desktop bridges retain the existing local storage behavior", async () => {
  const storage = localStorage();
  assert.equal(await loadOnboardingTipDismissal("auto-director-idea", storage), false);
  await dismissOnboardingTip("auto-director-idea", storage);
  assert.equal(await loadOnboardingTipDismissal("auto-director-idea", storage, {}), true);
  const failedBridge = { getDismissedOnboardingTips: async () => { throw new Error("offline"); } };
  assert.equal(await loadOnboardingTipDismissal("auto-director-idea", storage, failedBridge), true);
});

test("desktop writes preserve other dismissals and deduplicate repeat closes", async (t) => {
  const { filePath, bridge } = fixture(t);
  await dismissOnboardingTip("auto-director-idea", localStorage(), bridge);
  await dismissOnboardingTip("auto-director-candidates", localStorage(), bridge);
  await dismissOnboardingTip("auto-director-idea", localStorage(), bridge);
  assert.deepEqual(Array.from(desktopStore(filePath).read()), ["auto-director-idea", "auto-director-candidates"]);
});

test("invalid keys and malformed desktop files cannot overwrite saved preferences", async (t) => {
  const { filePath, bridge } = fixture(t);
  await dismissOnboardingTip("auto-director-idea", localStorage(), bridge);
  const store = desktopStore(filePath);
  const before = readFileSync(filePath, "utf8");
  assert.throws(() => store.dismiss("../invalid"));
  assert.equal(readFileSync(filePath, "utf8"), before);
  writeFileSync(filePath, "{broken", "utf8");
  assert.throws(() => store.dismiss("auto-director-candidates"));
  assert.equal(readFileSync(filePath, "utf8"), "{broken");
});
