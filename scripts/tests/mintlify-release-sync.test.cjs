const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const repoRoot = path.resolve(__dirname, "../..");
const files = ["index.mdx", "installation.mdx", "changelog.mdx", "en/index.mdx", "en/installation.mdx", "en/changelog.mdx"];
const version = "0.8.10";
const tag = "v" + version;
const platforms = ["setup-x64.exe", "portable-x64.exe", "mac-arm64.dmg", "mac-x64.dmg", "linux-x86_64.AppImage"];
const summary = {
  zh: ["书级方案生成失败后可从失败卡恢复。"],
  en: ["Resume book planning from its failure card."],
};

function releaseFor(releaseTag = tag) {
  return {
    tag_name: releaseTag,
    draft: false,
    prerelease: false,
    published_at: "2026-11-17T18:00:00Z",
    assets: platforms.map((platform) => {
      const name = "Biz-Novel-Studio-" + releaseTag.slice(1) + "-" + platform;
      return {
        name,
        state: "uploaded",
        size: 123456,
        browser_download_url: "https://github.com/ExplosiveCoderflome/AI-Novel-Writing-Assistant/releases/download/" + releaseTag + "/" + name,
      };
    }),
  };
}

function setup(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "mintlify-release-sync-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const copy = (file) => path.join(root, "mintlify-docs", file);
  fs.mkdirSync(path.dirname(copy("en/index.mdx")), { recursive: true });
  for (const file of files) fs.copyFileSync(path.join(repoRoot, "mintlify-docs", file), copy(file));
  const summaryDir = path.join(root, "docs", "releases", "mintlify");
  fs.mkdirSync(summaryDir, { recursive: true });
  const releaseFile = path.join(root, "release.json");
  return {
    copy,
    read: (file) => fs.readFileSync(copy(file), "utf8"),
    snapshot: () => files.map((file) => fs.readFileSync(copy(file), "utf8")),
    writeSummary: (notes) => fs.writeFileSync(path.join(summaryDir, tag + ".json"), JSON.stringify(notes)),
    run(release = releaseFor(), args = [], requestedTag = release.tag_name) {
      fs.writeFileSync(releaseFile, JSON.stringify(release));
      return spawnSync(process.execPath, [
        path.join(repoRoot, "scripts", "sync-mintlify-release.cjs"),
        "--tag", requestedTag, "--release-file", releaseFile, "--root", root, ...args,
      ], { encoding: "utf8" });
    },
  };
}

test("updates the four badges and ten links in the real bilingual pages and prepends a dated entry per language", (t) => {
  const docs = setup(t);
  docs.writeSummary(summary);
  const oldHistory = ["changelog.mdx", "en/changelog.mdx"].map(docs.read);
  const release = releaseFor();
  const result = docs.run(release);
  assert.equal(result.status, 0, result.stderr);
  for (const prefix of ["", "en/"]) {
    const homepage = docs.read(prefix + "index.mdx");
    assert.equal((homepage.match(/v0\.8\.10 · (?:开源|AGPL-3\.0)/g) || []).length, 2);
    assert.doesNotMatch(homepage, /v0\.8\.[157] · (?:开源|AGPL-3\.0)/);
    const installation = docs.read(prefix + "installation.mdx");
    assert.ok(installation.includes("**v0.8.10**"));
    const links = [...installation.matchAll(/href="([^"]+\/releases\/download\/[^"]+)"/g)].map((match) => match[1]);
    assert.deepEqual(links, release.assets.map((asset) => asset.browser_download_url));
  }
  for (const [index, file] of ["changelog.mdx", "en/changelog.mdx"].entries()) {
    const updated = docs.read(file);
    const [body] = Object.values(summary)[index];
    const entryPattern = /<Update label="2026-11-18" description="v0\.8\.10">\r?\n\r?\n- .+?\r?\n\r?\n<\/Update>\r?\n\r?\n/;
    assert.match(updated, entryPattern);
    assert.ok(updated.includes("- " + body));
    assert.equal(updated.replace(entryPattern, ""), oldHistory[index]);
  }
  const after = docs.snapshot();
  const repeat = docs.run(release);
  assert.equal(repeat.status, 0, repeat.stderr);
  assert.deepEqual(docs.snapshot(), after);
});

test("dry run previews both languages and leaves the actual pages byte-for-byte intact", (t) => {
  const docs = setup(t);
  docs.writeSummary(summary);
  const before = docs.snapshot();
  const result = docs.run(releaseFor(), ["--dry-run"]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Would update mintlify-docs\/en\/installation\.mdx/);
  assert.match(result.stdout, /Would update mintlify-docs\/changelog\.mdx/);
  assert.deepEqual(docs.snapshot(), before);
});

test("a missing release summary is reported and downloads advance while history waits for the bilingual summary", (t) => {
  const docs = setup(t);
  const before = docs.snapshot();
  const result = docs.run();
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stderr, /docs\/releases\/mintlify\/v0\.8\.10\.json/);
  assert.match(docs.read("en/installation.mdx"), /download \*\*v0\.8\.10\*\*/);
  assert.equal(docs.read("changelog.mdx"), before[2]);
  assert.equal(docs.read("en/changelog.mdx"), before[5]);
  docs.writeSummary(summary);
  const backfill = docs.run();
  assert.equal(backfill.status, 0, backfill.stderr);
  assert.match(docs.read("en/changelog.mdx"), /description="v0\.8\.10"/);
});

test("an older release rerun cannot roll back newer documentation", (t) => {
  const docs = setup(t);
  const latest = docs.run();
  assert.equal(latest.status, 0, latest.stderr);
  const before = docs.snapshot();
  const replay = docs.run(releaseFor("v0.8.9"));
  assert.equal(replay.status, 0, replay.stderr);
  assert.match(replay.stdout, /Skipping v0\.8\.9/);
  assert.deepEqual(docs.snapshot(), before);
});

test("a non-stable, unpublished or incomplete release never writes pages", (t) => {
  const docs = setup(t);
  const before = docs.snapshot();
  const release = releaseFor();
  for (const [candidate, requestedTag, error] of [
    [release, "v0.8.10-rc.1", /stable release tag/],
    [release, "v0.8.11", /tag-mismatched/],
    [{ ...release, draft: true }, tag, /draft/],
    [{ ...release, prerelease: true }, tag, /prerelease/],
    [{ ...release, published_at: null }, tag, /publication date/],
    [{ ...release, assets: release.assets.slice(0, 4) }, tag, /missing.*linux/],
    [{ ...release, assets: release.assets.map((asset) => ({ ...asset, state: "starter" })) }, tag, /missing.*setup/],
    [{ ...release, assets: release.assets.map((asset) => ({ ...asset, browser_download_url: "https://example.com/file" })) }, tag, /missing.*setup/],
  ]) {
    const result = docs.run(candidate, [], requestedTag);
    assert.equal(result.status, 1);
    assert.match(result.stderr, error);
    assert.deepEqual(docs.snapshot(), before);
  }
});

test("a duplicate platform in the English download cards fails before writing any page", (t) => {
  const docs = setup(t);
  const file = "en/installation.mdx";
  fs.writeFileSync(docs.copy(file), docs.read(file).replace(/(Biz-Novel-Studio-[0-9.]+-)portable-x64\.exe/, "$1setup-x64.exe"));
  const before = docs.snapshot();
  const result = docs.run();
  assert.equal(result.status, 1);
  assert.match(result.stderr, /en\/installation\.mdx.*Duplicate/);
  assert.deepEqual(docs.snapshot(), before);
});

test("an incomplete bilingual summary fails before writing any page", (t) => {
  const docs = setup(t);
  docs.writeSummary({ zh: summary.zh });
  const before = docs.snapshot();
  const result = docs.run();
  assert.equal(result.status, 1);
  assert.match(result.stderr, /v0\.8\.10\.json.*en/);
  assert.deepEqual(docs.snapshot(), before);
});
