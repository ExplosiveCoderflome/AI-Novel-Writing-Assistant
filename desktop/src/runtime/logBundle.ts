import { zipEntries } from "@ai-novel/shared/utils/zip";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import { resolveDesktopLogsDir } from "./paths";

function collectRecentLogFiles(limit = 5): Array<{ name: string; data: Buffer }> {
  const directory = resolveDesktopLogsDir();
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".log"))
    .map((entry) => {
      const absolutePath = path.join(directory, entry.name);
      return { entry, absolutePath, modifiedAt: fs.statSync(absolutePath).mtimeMs };
    })
    .sort((left, right) => right.modifiedAt - left.modifiedAt)
    .slice(0, limit)
    .map(({ entry, absolutePath }) => ({ name: `logs/${entry.name}`, data: fs.readFileSync(absolutePath) }));
}

export function createDesktopLogBundle(summary: string): string {
  const tempPath = path.join(os.tmpdir(), `ai-novel-logs-${Date.now()}.zip`);
  const entries = [
    ...collectRecentLogFiles(),
    { name: "runtime-summary.txt", data: Buffer.from(summary, "utf8") },
  ];
  fs.writeFileSync(tempPath, zipEntries(entries, data => zlib.deflateRawSync(data, { level: 6 })));
  return tempPath;
}
