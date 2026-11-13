const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
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

test("CLI dry-run and rejected releases never write fixture documents; complete release sync is idempotent", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "mintlify-release-sync-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const docs = path.join(root, "mintlify-docs");
  fs.mkdirSync(docs);
  const installationPath = path.join(docs, "installation.mdx");
  const homepagePath = path.join(docs, "index.mdx");
  const installation = `${names.map((name) => `href="https://github.com/ExplosiveCoderflome/AI-Novel-Writing-Assistant/releases/download/v0.8.1/${name.replace("0.8.2", "0.8.1")}"`).join("\n")}\n历史说明 v0.7.5`;
  const homepage = "v0.8.1 · 开源\nhttps://img.shields.io/github/stars/example";
  fs.writeFileSync(installationPath, installation);
  fs.writeFileSync(homepagePath, homepage);
  const releasePath = path.join(root, "release.json");
  const run = (release, extraArgs = []) => {
    fs.writeFileSync(releasePath, JSON.stringify(release));
    return spawnSync(process.execPath, [path.resolve(__dirname, "../sync-mintlify-release.cjs"), "--tag", "v0.8.2", "--release-file", releasePath, "--root", root, ...extraArgs], { encoding: "utf8" });
  };
  const before = [fs.readFileSync(installationPath, "utf8"), fs.readFileSync(homepagePath, "utf8")];

  const dryRun = run(completeRelease(), ["--dry-run"]);
  assert.equal(dryRun.status, 0, dryRun.stderr);
  assert.match(dryRun.stdout, /Would update mintlify-docs\/installation\.mdx/);
  assert.deepEqual([fs.readFileSync(installationPath, "utf8"), fs.readFileSync(homepagePath, "utf8")], before);

  for (const incomplete of [completeRelease({ assets: names.slice(0, 4).map((name) => ({ name })) }), completeRelease({ prerelease: true })]) {
    const rejected = run(incomplete);
    assert.equal(rejected.status, 1);
    assert.deepEqual([fs.readFileSync(installationPath, "utf8"), fs.readFileSync(homepagePath, "utf8")], before);
  }

  const synced = run(completeRelease());
  assert.equal(synced.status, 0, synced.stderr);
  const after = [fs.readFileSync(installationPath, "utf8"), fs.readFileSync(homepagePath, "utf8")];
  assert.equal((after[0].match(/releases\/download\/v0\.8\.2\//g) || []).length, 5);
  assert.match(after[0], /历史说明 v0\.7\.5/);
  assert.match(after[1], /github\/stars\/example/);
  const repeated = run(completeRelease());
  assert.equal(repeated.status, 0, repeated.stderr);
  assert.deepEqual([fs.readFileSync(installationPath, "utf8"), fs.readFileSync(homepagePath, "utf8")], after);
});
