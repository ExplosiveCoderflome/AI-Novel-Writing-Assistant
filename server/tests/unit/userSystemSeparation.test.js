const test = require("node:test");
const assert = require("node:assert/strict");
const { userSettingProtectionService } = require("../../dist/platform/config/UserSettingProtectionService.js");
const { userAssetBackupGateway } = require("../../dist/services/novel/export/UserAssetBackupGateway.js");
const { prisma } = require("../../dist/db/prisma.js");

test("PAI Insight 2: USER/SYSTEM Asset & Architecture Separation", async (t) => {
  const testKey = `test.user.setting.${Date.now()}`;

  t.after(async () => {
    try {
      await prisma.appSetting.deleteMany({
        where: { key: testKey },
      });
    } catch {}
  });

  await t.test("preserves existing user settings and does not overwrite them", async () => {
    // 1. First time: setting is created with custom value
    const firstResult = await userSettingProtectionService.ensureDefaultAppSetting(testKey, "user_custom_value");
    assert.equal(firstResult, "user_custom_value");

    // 2. Second time: attempt to ensure with a different "default" value
    const secondResult = await userSettingProtectionService.ensureDefaultAppSetting(testKey, "system_default_override");

    // 3. Must preserve user_custom_value (100% non-destructive)
    assert.equal(secondResult, "user_custom_value");

    const inDb = await userSettingProtectionService.getAppSetting(testKey);
    assert.equal(inDb, "user_custom_value");
  });

  await t.test("exports user project assets and verifies snapshot integrity", async () => {
    const novelId = `test-novel-export-${Date.now()}`;

    // Create mock novel with chapter
    await prisma.novel.create({
      data: {
        id: novelId,
        title: "红楼梦新传测试",
        description: "创作者测试项目",
        chapters: {
          create: [
            {
              id: `chapter-${Date.now()}`,
              title: "第一章",
              content: "宝玉在红尘中醒来...",
              order: 1,
            },
          ],
        },
      },
    });

    try {
      const backupPkg = await userAssetBackupGateway.exportProjectAssets(novelId);
      assert.equal(backupPkg.novel.title, "红楼梦新传测试");
      assert.equal(backupPkg.chapters.length, 1);

      const isValid = userAssetBackupGateway.verifyBackupIntegrity(backupPkg);
      assert.equal(isValid, true);
    } finally {
      await prisma.chapter.deleteMany({ where: { novelId } });
      await prisma.novel.delete({ where: { id: novelId } });
    }
  });
});
