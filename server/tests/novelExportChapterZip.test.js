const test = require("node:test");
const assert = require("node:assert/strict");
const yauzl = require("yauzl");

const { NovelExportService } = require("../dist/modules/export/novelExport.service.js");
const { buildChapterArchive } = require("../dist/modules/export/infrastructure/chapterArchive.js");
const { prisma } = require("../dist/db/prisma.js");

async function unpackZip(buffer) {
  assert.ok(Buffer.isBuffer(buffer));
  const zip = await new Promise((resolve, reject) => {
    yauzl.fromBuffer(buffer, { lazyEntries: true }, (error, archive) => {
      if (error) reject(error);
      else resolve(archive);
    });
  });
  return new Promise((resolve, reject) => {
    const entries = [];
    zip.on("error", reject);
    zip.on("end", () => resolve(entries));
    zip.on("entry", entry => {
      zip.openReadStream(entry, (error, stream) => {
        if (error) {
          zip.close();
          reject(error);
          return;
        }
        const chunks = [];
        stream.on("error", reject);
        stream.on("data", chunk => chunks.push(chunk));
        stream.on("end", () => {
          entries.push({ name: entry.fileName, content: Buffer.concat(chunks).toString("utf8") });
          zip.readEntry();
        });
      });
    });
    zip.readEntry();
  });
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
    assert.deepEqual(await unpackZip(result.content), [
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
    assert.deepEqual(await unpackZip(result.content), [{ name: "0001-短篇.txt", content: "第1章 短篇\n\n开头\n\n结尾\n" }]);
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
  const archive = await buildChapterArchive({
    title: "分章", description: null, chapters: [{ order: 1, title: "起点", content: "正文" }],
  });
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
    const downloaded = Buffer.from(await response.arrayBuffer());
    assert.deepEqual(downloaded, archive);
    assert.deepEqual(await unpackZip(downloaded), [
      { name: "0001-起点.txt", content: "第1章 起点\n\n正文\n" },
    ]);
  } finally {
    novelExportService.buildExportContent = original;
    await new Promise(resolve => server.close(resolve));
  }
});

test("empty chapter collections produce a readable empty ZIP", async () => {
  const archive = await buildChapterArchive({ title: "空书", description: null, chapters: [] });
  assert.deepEqual(await unpackZip(archive), []);
});

test("chapter archives retain blank chapters and normalize whitespace", async () => {
  const archive = await buildChapterArchive({ title: "书", description: null, chapters: [
    { order: 9, title: "空白:章节?", content: null },
    { order: 10, title: "末章", content: "  内容\r尾声\r\n  " },
  ] });
  assert.deepEqual(await unpackZip(archive), [
    { name: "0009-空白_章节_.txt", content: "第9章 空白:章节?\n\n\n" },
    { name: "0010-末章.txt", content: "第10章 末章\n\n内容\n尾声\n" },
  ]);
});
