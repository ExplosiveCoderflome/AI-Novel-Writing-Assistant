const test = require("node:test");
const assert = require("node:assert/strict");

const { NovelExportService } = require("../dist/modules/export/novelExport.service.js");
const { prisma } = require("../dist/db/prisma.js");

test("buildExportContent uses novel title plus timestamp as export filename", async () => {
  const originalFindUnique = prisma.novel.findUnique;

  prisma.novel.findUnique = async () => ({
    title: "霓虹档案 / Neon Archive",
    description: "都市异能悬疑",
    narrativeForm: "long_novel",
    shortStorySegments: [],
    chapters: [
      {
        order: 1,
        title: "误入局中",
        content: "第一章正文",
      },
    ],
  });

  try {
    const service = new NovelExportService();
    const result = await service.buildExportContent("novel_export_demo", "txt");

    assert.match(result.fileName, /^霓虹档案 _ Neon Archive-\d{8}-\d{6}\.txt$/);
    assert.equal(result.contentType, "text/plain; charset=utf-8");
    assert.match(result.content, /第一章正文/);
  } finally {
    prisma.novel.findUnique = originalFindUnique;
  }
});

function unpackZip(buffer) {
  const { inflateRawSync } = require("node:zlib");
  const entries = [];
  let offset = 0;
  while (buffer.readUInt32LE(offset) === 0x04034b50) {
    assert.equal(buffer.readUInt16LE(offset + 6), 0x0800, "filenames must be marked UTF-8");
    const size = buffer.readUInt32LE(offset + 18);
    const nameLength = buffer.readUInt16LE(offset + 26);
    const start = offset + 30 + nameLength;
    entries.push({
      name: buffer.toString("utf8", offset + 30, start),
      content: inflateRawSync(buffer.subarray(start, start + size)).toString("utf8"),
    });
    offset = start + size;
  }
  assert.equal(buffer.readUInt32LE(offset), 0x02014b50);
  const end = buffer.length - 22;
  assert.equal(buffer.readUInt32LE(end), 0x06054b50);
  assert.equal(buffer.readUInt16LE(end + 10), entries.length);
  return entries;
}

test("ZIP export contains separate ordered chapter TXT files with safe Chinese filenames", async () => {
  const original = prisma.novel.findUnique;
  prisma.novel.findUnique = async () => ({
    title: "分章测试", description: null, narrativeForm: "long_novel", shortStorySegments: [],
    chapters: [
      { order: 1, title: "误入/局中", content: "第一章正文" },
      { order: 2, title: "退路封死", content: "第二章正文\r\n另一行" },
    ],
  });
  try {
    const result = await new NovelExportService().buildExportContent("novel", "zip");
    assert.equal(result.contentType, "application/zip");
    assert.match(result.fileName, /^分章测试-\d{8}-\d{6}\.zip$/);
    assert.deepEqual(unpackZip(result.content), [
      { name: "0001-误入_局中.txt", content: "第1章 误入/局中\n\n第一章正文\n" },
      { name: "0002-退路封死.txt", content: "第2章 退路封死\n\n第二章正文\n另一行\n" },
    ]);
    await assert.rejects(new NovelExportService().buildExportContent("novel", "zip", "outline"), { statusCode: 400 });
  } finally {
    prisma.novel.findUnique = original;
  }
});

test("short-story ZIP exports saved segments without relying on long-novel chapters", async () => {
  const original = prisma.novel.findUnique;
  prisma.novel.findUnique = async () => ({
    title: "短篇", description: null, narrativeForm: "short_story", chapters: [],
    shortStorySegments: [{ order: 1, content: "开头" }, { order: 2, content: "结尾" }],
  });
  try {
    const result = await new NovelExportService().buildExportContent("story", "zip");
    assert.deepEqual(unpackZip(result.content), [{ name: "0001-短篇.txt", content: "第1章 短篇\n\n开头\n\n结尾\n" }]);
  } finally {
    prisma.novel.findUnique = original;
  }
});

test("export HTTP route accepts ZIP and sends binary content with a downloadable filename", async () => {
  const express = require("express");
  const http = require("node:http");
  const { novelExportService } = require("../dist/modules/export/novelExport.service.js");
  const router = require("../dist/modules/export/http/novelExport.js").default;
  const original = novelExportService.buildExportContent;
  const archive = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0xff, 0x00]);
  novelExportService.buildExportContent = async (id, format, scope) => {
    assert.deepEqual([id, format, scope], ["novel", "zip", "full"]);
    return { content: archive, contentType: "application/zip", fileName: "分章.zip" };
  };
  const app = express();
  app.use("/novels", router);
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/novels/novel/export?format=zip`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "application/zip");
    assert.match(response.headers.get("content-disposition"), new RegExp(encodeURIComponent("分章.zip")));
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), archive);
  } finally {
    novelExportService.buildExportContent = original;
    await new Promise(resolve => server.close(resolve));
  }
});
