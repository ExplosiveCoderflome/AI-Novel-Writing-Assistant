import { APP_VERSION } from "@/lib/constants";
import releaseNotes from "../../../../docs/releases/release-notes.md?raw";

export interface DesktopReleaseNotes {
  version: string;
  title: string;
  summary: string;
  items: string[];
}

/**
 * In-app desktop update popup. Bound to the current package version via APP_VERSION
 * (from desktop/package.json at build time) and the matching
 * `### YYYY-MM-DD · vX.Y.Z` block in docs/releases/release-notes.md.
 * For v0.8.8 that block covers outline chapter-confirm open-to-saved-prose,
 * multi-chapter director prose start, and automatic output-budget defaults with
 * usage detail (ceiling / source / finish reason / structure check).
 */
function currentRelease(markdown: string): DesktopReleaseNotes {
  const version = APP_VERSION;
  const heading = new RegExp(`^###\\s+\\d{4}-\\d{2}-\\d{2}\\s+·\\s+v${version.replaceAll(".", "\\.")}\\s*$`, "m");
  const match = heading.exec(markdown);
  if (!match) return { version, title: "本次更新介绍", summary: "查看完整更新说明。", items: [] };
  const block = markdown.slice(match.index + match[0].length).split(/^###\s/m, 1)[0];
  const content = block.split(/\r?\n/).map(line => line.trim());
  const summary = content.find(line => line && !line.startsWith("#") && !line.startsWith("-")) ?? "查看完整更新说明。";
  const items = content.filter(line => line.startsWith("- ")).map(line => line.slice(2));
  return { version, title: "本次更新介绍", summary, items };
}

export const CURRENT_DESKTOP_RELEASE_NOTES: DesktopReleaseNotes = currentRelease(releaseNotes);
