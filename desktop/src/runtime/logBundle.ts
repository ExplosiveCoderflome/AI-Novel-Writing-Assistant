import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import { resolveDesktopLogsDir } from "./paths";

function crc32(data: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function zipEntries(entries: Array<{ name: string; data: Buffer }>): Buffer {
  const local: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8");
    const compressed = zlib.deflateRawSync(entry.data, { level: 6 });
    const header = Buffer.alloc(30 + name.length);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(0, 6);
    header.writeUInt16LE(8, 8);
    header.writeUInt16LE(0, 10);
    header.writeUInt16LE(0, 12);
    header.writeUInt32LE(crc32(entry.data), 14);
    header.writeUInt32LE(compressed.length, 18);
    header.writeUInt32LE(entry.data.length, 22);
    header.writeUInt16LE(name.length, 26);
    name.copy(header, 30);
    local.push(header, compressed);

    const directory = Buffer.alloc(46 + name.length);
    directory.writeUInt32LE(0x02014b50, 0);
    directory.writeUInt16LE(20, 4);
    directory.writeUInt16LE(20, 6);
    directory.writeUInt16LE(0, 8);
    directory.writeUInt16LE(8, 10);
    directory.writeUInt16LE(0, 12);
    directory.writeUInt16LE(0, 14);
    directory.writeUInt32LE(crc32(entry.data), 16);
    directory.writeUInt32LE(compressed.length, 20);
    directory.writeUInt32LE(entry.data.length, 24);
    directory.writeUInt16LE(name.length, 28);
    directory.writeUInt32LE(offset, 42);
    name.copy(directory, 46);
    central.push(directory);
    offset += header.length + compressed.length;
  }

  const centralData = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralData.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, centralData, end]);
}

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
  fs.writeFileSync(tempPath, zipEntries(entries));
  return tempPath;
}
