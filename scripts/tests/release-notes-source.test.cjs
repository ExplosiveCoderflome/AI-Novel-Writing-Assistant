const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "../..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");

test("desktop release notes are sourced from the full history and current package version has a dated entry", () => {
  const desktop = JSON.parse(read("desktop/package.json"));
  const notes = read("docs/releases/release-notes.md");
  const appNotes = read("client/src/components/layout/desktopReleaseNotes.ts");
  assert.match(desktop.version, /^\d+\.\d+\.\d+$/);
  assert.match(notes, new RegExp(`^###\\s+\\d{4}-\\d{2}-\\d{2}\\s+·\\s+v${desktop.version.replaceAll(".", "\\.")}\\s*$`, "m"),
    `release-notes.md must include a dated entry for desktop ${desktop.version}`);
  assert.match(appNotes, /release-notes\.md\?raw/, "in-app notes must read the canonical release history");
  // Failed packaging tag must remain documented as a dated entry without claiming installers shipped.
  assert.match(notes, /^### 2026-11-14 · v0\.8\.3$/m);
  assert.match(notes, /v0\.8\.3[\s\S]*?没有[\s\S]*?安装包/);
  assert.match(read("README.md"), /正式桌面版以 GitHub Release 的 \*\*v0\.8\.5\*\*.*五平台/s);
  assert.match(read("README.md"), /v0\.8\.3.*无安装包/s);
});
