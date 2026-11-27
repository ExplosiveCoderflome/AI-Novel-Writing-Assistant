const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

test("human style feedback isolates book contrast pairs, compiles into generation/editor contracts, and supports removal", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "human-style-feedback-"));
  const script = String.raw`
const assert = require("node:assert/strict");
const { prisma } = require("./dist/db/prisma");
const { ensureRuntimeDatabaseReady } = require("./dist/db/runtimeMigrations");
const { novelHumanStyleFeedbackService } = require("./dist/services/styleEngine/NovelHumanStyleFeedbackService");
const { StyleBindingService } = require("./dist/services/styleEngine/StyleBindingService");
const { buildWriterStyleContractText } = require("./dist/services/styleEngine/styleContractText");
const { ChapterEditorWorkspaceService } = require("./dist/services/novel/chapterEditor/ChapterEditorWorkspaceService");

(async () => {
  await ensureRuntimeDatabaseReady();
  const baseProfile = await prisma.styleProfile.create({
    data: {
      name: "悬疑模板写法",
      sourceType: "from_text",
      narrativeRulesJson: JSON.stringify({ progressionMode: "线索递进" }),
      characterRulesJson: JSON.stringify({ allowSelfReflection: false }),
      languageRulesJson: JSON.stringify({
        contrastPairs: [
          { aiPattern: "他心中五味杂陈", preferred: "他把杯底敲在桌上", note: "模板默认" },
        ],
      }),
      rhythmRulesJson: JSON.stringify({ pace: "fast" }),
    },
  });

  const novel = await prisma.novel.create({ data: { id: "book-feedback-1", title: "夜班便利店" } });
  const otherNovel = await prisma.novel.create({ data: { id: "book-feedback-2", title: "另一本书" } });
  const chapter = await prisma.chapter.create({
    data: {
      id: "ch-feedback-1",
      novelId: novel.id,
      order: 1,
      title: "凌晨一点",
      content: "他深吸一口气，心中泛起一股莫名的感动。\n\n冰柜门关上时啪地响了一声。",
    },
  });

  await prisma.styleBinding.create({
    data: { styleProfileId: baseProfile.id, targetType: "novel", targetId: novel.id, priority: 1, weight: 1, enabled: true },
  });
  await prisma.styleBinding.create({
    data: { styleProfileId: baseProfile.id, targetType: "novel", targetId: otherNovel.id, priority: 1, weight: 1, enabled: true },
  });

  const first = await novelHumanStyleFeedbackService.recordFeedback(novel.id, chapter.id, {
    excerpt: "他深吸一口气，心中泛起一股莫名的感动。",
    preferredText: "他把找零硬币一枚枚码进铁盒，没再抬头。",
    issueTags: ["ai_taste", "pacing_flat"],
    feedbackNote: "不要写概括情绪，写手里动作",
  });
  assert.equal(first.createdBookProfile, true);
  assert.equal(first.isBookOwned, true);
  assert.notEqual(first.profileId, baseProfile.id);
  assert.equal(first.contrastPairs.length, 2);
  assert.equal(first.contrastPairs[0].aiPattern, "他深吸一口气，心中泛起一股莫名的感动。");
  assert.equal(first.contrastPairs[0].preferred, "他把找零硬币一枚枚码进铁盒，没再抬头。");

  const refreshedBase = await prisma.styleProfile.findUniqueOrThrow({ where: { id: baseProfile.id } });
  const baseLang = JSON.parse(refreshedBase.languageRulesJson);
  assert.equal(baseLang.contrastPairs.length, 1, "shared template profile must stay untouched");

  const second = await novelHumanStyleFeedbackService.recordFeedback(novel.id, chapter.id, {
    excerpt: "这一刻他暗下决心一定要查清真相。",
    issueTags: ["padded_filler"],
    feedbackNote: "直接删掉内心独白，从门口脚步声切入",
  });
  assert.equal(second.createdBookProfile, false);
  assert.equal(second.profileId, first.profileId);
  assert.equal(second.contrastPairs.length, 3);

  const resolved = await new StyleBindingService().resolveForGeneration({ novelId: novel.id, chapterId: chapter.id });
  const contractText = buildWriterStyleContractText(resolved.compiledBlocks?.contract ?? null);
  assert.match(contractText, /这一刻他暗下决心一定要查清真相/);
  assert.match(contractText, /他把找零硬币一枚枚码进铁盒/);

  const editorContext = await new ChapterEditorWorkspaceService().loadContext(novel.id, chapter.id);
  assert.match(editorContext.styleSummary, /他把找零硬币一枚枚码进铁盒/);

  const afterRemove = await novelHumanStyleFeedbackService.removeFeedbackPair(
    novel.id,
    "这一刻他暗下决心一定要查清真相。",
  );
  assert.equal(afterRemove.contrastPairs.length, 2);
  assert.ok(!afterRemove.contrastPairs.some((pair) => pair.aiPattern.includes("查清真相")));
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
`;
  const serverDir = path.resolve(__dirname, "../..");
  const dbPath = path.join(directory, "test.sqlite").replace(/\\/g, "/");
  const run = spawnSync(process.execPath, ["-e", script], {
    cwd: serverDir,
    encoding: "utf8",
    env: {
      ...process.env,
      NODE_ENV: "test",
      AI_NOVEL_RUNTIME: "desktop",
      AI_NOVEL_APP_DATA_DIR: directory,
      DATABASE_URL: `file:${dbPath}`,
    },
    timeout: 120_000,
  });
  try {
    assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
