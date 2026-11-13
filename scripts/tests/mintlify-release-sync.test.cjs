const test = require("node:test");
const assert = require("node:assert/strict");
const { assertCompleteRelease, parseStableTag, updateHomepage, updateInstallation } = require("../sync-mintlify-release.cjs");

const names = [
  "Biz-Novel-Studio-0.8.2-setup-x64.exe",
  "Biz-Novel-Studio-0.8.2-portable-x64.exe",
  "Biz-Novel-Studio-0.8.2-mac-arm64.dmg",
  "Biz-Novel-Studio-0.8.2-mac-x64.dmg",
  "Biz-Novel-Studio-0.8.2-linux-x86_64.AppImage",
];
const completeRelease = (overrides = {}) => ({ tag_name: "v0.8.2", draft: false, prerelease: false, assets: names.map((name) => ({ name })), ...overrides });

test("only stable, complete formal releases pass asset gate", () => {
  assert.equal(assertCompleteRelease(completeRelease(), "v0.8.2"), "0.8.2");
  assert.throws(() => parseStableTag("v0.8.2-rc.1"), /stable release tag/);
  assert.throws(() => assertCompleteRelease(completeRelease({ prerelease: true }), "v0.8.2"), /prerelease/);
  assert.throws(() => assertCompleteRelease(completeRelease({ assets: names.slice(0, 4).map((name) => ({ name })) }), "v0.8.2"), /missing assets/);
  assert.throws(() => assertCompleteRelease(completeRelease({ assets: names.map((name) => ({ name: name.replace("0.8.2", "0.8.2-extra") })) }), "v0.8.2"), /missing assets/);
});

test("updates only five download links and intended homepage badges", () => {
  const links = names.map((name) => `href="https://github.com/ExplosiveCoderflome/AI-Novel-Writing-Assistant/releases/download/v0.8.1/${name.replace("0.8.2", "0.8.1")}"`).join("\n");
  const updated = updateInstallation(links, "0.8.2");
  assert.equal((updated.match(/releases\/download\/v0\.8\.2\//g) || []).length, 5);
  assert.match(updateHomepage("v0.8.1 · 开源; v0.8.1 · AGPL-3.0; https://img.shields.io/github/stars/x", "0.8.2"), /v0\.8\.2 · 开源; v0\.8\.2 · AGPL-3\.0; https:\/\/img\.shields\.io\/github\/stars\/x/);
  assert.throws(() => updateInstallation(`${links}\nhref="https://github.com/ExplosiveCoderflome/AI-Novel-Writing-Assistant/releases/download/v0.8.1/Biz-Novel-Studio-0.8.1-setup-x64.exe"`, "0.8.2"), /Duplicate/);
});

test("running transformation twice is idempotent", () => {
  const source = names.map((name) => `href="https://github.com/ExplosiveCoderflome/AI-Novel-Writing-Assistant/releases/download/v0.8.1/${name.replace("0.8.2", "0.8.1")}"`).join("\n");
  const once = updateInstallation(source, "0.8.2");
  assert.equal(updateInstallation(once, "0.8.2"), once);
  const badge = "v0.8.1 · 开源";
  assert.equal(updateHomepage(updateHomepage(badge, "0.8.2"), "0.8.2"), "v0.8.2 · 开源");
});
