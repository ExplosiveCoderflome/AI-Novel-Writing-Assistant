import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("desktop update entry and one-time release notes contracts are present", () => {
  const badge = read("src/components/layout/AppVersionBadge.tsx");
  const notesDialog = read("src/components/layout/DesktopReleaseNotesDialog.tsx");
  const notes = read("src/components/layout/desktopReleaseNotes.ts");
  const navbar = read("src/components/layout/Navbar.tsx");
  assert.match(badge, /立即更新/);
  assert.match(badge, /重启安装/);
  assert.match(notesDialog, /localStorage/);
  assert.match(notesDialog, /SEEN_PREFIX/);
  assert.match(notes, /本次更新介绍/);
  assert.match(navbar, /DesktopReleaseNotesDialog/);
});
