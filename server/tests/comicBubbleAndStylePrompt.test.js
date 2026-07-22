// Hook better-sqlite3 to prevent native binary evaluation crash on Node v26
const Module = require("module");
const originalRequire = Module.prototype.require;
Module.prototype.require = function (id) {
  if (id === "better-sqlite3") {
    const MockDb = function () {
      this.pragma = (val) => {
        if (val === "journal_mode") return "wal";
        return "wal";
      };
      this.prepare = () => ({ run: () => {} });
      this.close = () => {};
    };
    return MockDb;
  }
  return originalRequire.apply(this, arguments);
};

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const { prisma } = require("../dist/db/prisma.js");
const { resolveComicStyleKeywords, resolveComicStyleKeywordsEn, buildGenderLockPrompt } = require("../dist/services/comic/comicStylePrompt.js");
const { comicBubbleLayoutService } = require("../dist/services/comic/ComicBubbleLayoutService.js");

test("comicStylePrompt - resolves keywords correctly", () => {
  // Test style Preset JSON parsing
  assert.equal(
    resolveComicStyleKeywords('{"style":"ink_traditional"}'),
    "水墨国风，传统毛笔笔触，淡彩晕染，traditional Chinese ink-wash painting style, brush strokes, muted washed colors"
  );
  
  // Test fallback to default
  assert.equal(
    resolveComicStyleKeywords(null),
    "彩色韩漫风格，干净线条，鲜艳配色，Korean webtoon style, clean line art, vibrant colors"
  );
  assert.equal(
    resolveComicStyleKeywords('{"style":"unknown_preset"}'),
    "彩色韩漫风格，干净线条，鲜艳配色，Korean webtoon style, clean line art, vibrant colors"
  );
  assert.equal(
    resolveComicStyleKeywords("invalid-json"),
    "彩色韩漫风格，干净线条，鲜艳配色，Korean webtoon style, clean line art, vibrant colors"
  );

  // Test English keywords
  assert.equal(
    resolveComicStyleKeywordsEn('{"style":"chibi"}'),
    "chibi / SD cute manga style, round soft proportions"
  );
});

test("comicStylePrompt - builds gender lock prompt correctly", () => {
  assert.match(buildGenderLockPrompt("male", "林平"), /MALE/);
  assert.match(buildGenderLockPrompt("female", "苏清"), /FEMALE/);
  assert.match(buildGenderLockPrompt("other", "阿吉"), /androgynous/);
  assert.equal(buildGenderLockPrompt(null), "");
  assert.equal(buildGenderLockPrompt("unknown"), "");
});

test("ComicBubbleLayoutService - overlays bubbles on panel image and updates database", async () => {
  const originalReaddir = fs.readdir;
  const originalReadFile = fs.readFile;
  const originalMkdir = fs.mkdir;
  const originalWriteFile = fs.writeFile;
  const originalFindUnique = prisma.comicPanel.findUnique;
  const originalUpdate = prisma.comicPanel.update;

  const sharp = require("sharp");
  const mockPngBuffer = await sharp({
    create: {
      width: 1024,
      height: 1536,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 }
    }
  }).png().toBuffer();

  // Mock fs/promises
  fs.readdir = async () => ["panel.png"];
  fs.readFile = async () => {
    return mockPngBuffer;
  };
  fs.mkdir = async () => {};
  let writtenFile = null;
  fs.writeFile = async (path, buffer) => {
    writtenFile = { path, buffer };
  };

  // Mock Prisma comicPanel
  prisma.comicPanel.findUnique = async () => {
    return {
      id: "panel-test-1",
      dialogues: JSON.stringify([
        { speaker: "林平", text: "放肆！", bubbleType: "round", anchorHint: "top-left" },
        { speaker: "苏清", text: "你才是。", bubbleType: "spike", anchorHint: "bottom-right" }
      ]),
      letteredData: null
    };
  };

  let updatedPanelId = null;
  let updatedData = null;
  prisma.comicPanel.update = async (args) => {
    updatedPanelId = args.where.id;
    updatedData = args.data;
    return { id: updatedPanelId, ...updatedData };
  };

  try {
    const result = await comicBubbleLayoutService.letterPanel("panel-test-1");

    assert.ok(result);
    assert.equal(result.ext, "png");
    assert.equal(result.width, 1024);
    assert.equal(result.height, 1536);
    assert.ok(result.buffer);

    // Verify file write
    assert.ok(writtenFile);
    assert.match(writtenFile.path, /lettered\.png$/);

    // Verify DB update
    assert.equal(updatedPanelId, "panel-test-1");
    const parsedLettered = JSON.parse(updatedData.letteredData);
    assert.equal(parsedLettered.status, "done");
    assert.equal(parsedLettered.url, "/api/comic/panel-images/panel-test-1/lettered");
  } finally {
    // Restore
    fs.readdir = originalReaddir;
    fs.readFile = originalReadFile;
    fs.mkdir = originalMkdir;
    fs.writeFile = originalWriteFile;
    prisma.comicPanel.findUnique = originalFindUnique;
    prisma.comicPanel.update = originalUpdate;
  }
});
