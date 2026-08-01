const test = require("node:test");
const assert = require("node:assert/strict");
const { safetyGuardService } = require("../dist/platform/security/SafetyGuardService.js");
const { SafetyCheckFailedError } = require("../dist/platform/security/safetyGuardTypes.js");
const { NovelService } = require("../dist/services/novel/NovelService.js");
const novelService = new NovelService();
const { prisma } = require("../dist/db/prisma.js");

test("PAI Insight 6: Security & Permission System (SafetyGuardService)", async (t) => {
  await t.test("instantly permits LOW and MEDIUM risk operations", async () => {
    const resultLow = await safetyGuardService.assertSafetyCheck({
      operationName: "readNovel",
      riskLevel: "LOW",
    });
    assert.equal(resultLow.safe, true);

    const resultMed = await safetyGuardService.assertSafetyCheck({
      operationName: "updateNovelTitle",
      riskLevel: "MEDIUM",
    });
    assert.equal(resultMed.safe, true);
  });

  await t.test("throws SafetyCheckFailedError for HIGH/CRITICAL operations when missing confirmToken", async () => {
    await assert.rejects(
      async () => {
        await safetyGuardService.assertSafetyCheck({
          operationName: "deleteNovel",
          riskLevel: "CRITICAL",
          confirmToken: undefined,
        });
      },
      (err) => {
        assert.ok(err instanceof SafetyCheckFailedError);
        assert.match(err.message, /CONFIRM_DELETE/);
        return true;
      },
    );
  });

  await t.test("creates automatic pre-deletion snapshot and permits deletion when confirmToken is valid", async () => {
    const novelId = `test-novel-safety-${Date.now()}`;

    await prisma.novel.create({
      data: {
        id: novelId,
        title: "Novel to be Safely Deleted",
        description: "Safety Guard snapshot test",
      },
    });

    try {
      const result = await safetyGuardService.assertSafetyCheck({
        operationName: "deleteNovel",
        riskLevel: "CRITICAL",
        novelId,
        confirmToken: "CONFIRM_DELETE",
      });

      assert.equal(result.safe, true);
      assert.equal(result.backupCreated, true);
      assert.ok(result.backupPath);
    } finally {
      await prisma.novel.deleteMany({ where: { id: novelId } });
    }
  });

  await t.test("blocks novelService.deleteNovel when missing confirmToken", async () => {
    const novelId = `test-novel-blocked-${Date.now()}`;

    await prisma.novel.create({
      data: {
        id: novelId,
        title: "Protected Novel",
      },
    });

    try {
      // Calling deleteNovel without confirmToken should throw SafetyCheckFailedError
      await assert.rejects(
        async () => {
          await novelService.deleteNovel(novelId);
        },
        (err) => {
          assert.ok(err.name === "SafetyCheckFailedError" || err.constructor.name === "SafetyCheckFailedError" || err instanceof SafetyCheckFailedError);
          return true;
        },
      );

      // Verify the novel is STILL in the database (not deleted)
      const existing = await prisma.novel.findUnique({ where: { id: novelId } });
      assert.ok(existing !== null);
    } finally {
      await prisma.novel.deleteMany({ where: { id: novelId } });
    }
  });
});
