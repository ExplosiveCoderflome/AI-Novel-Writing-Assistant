const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("fs/promises");
const os = require("os");
const sharp = require("sharp");

const { comicSpriteSheetService } = require("../dist/services/comic/ComicSpriteSheetService.js");
const { comicCharacterAssetService } = require("../dist/services/comic/ComicCharacterAssetService.js");
const { comicCharacterImageService } = require("../dist/services/comic/ComicCharacterImageService.js");
const { prisma } = require("../dist/db/prisma.js");

test("Comic Character Visual Pipeline Services", async (t) => {
  const novelId = `test-novel-comic-${Date.now()}`;
  const projectId = `test-proj-comic-${Date.now()}`;
  const charId = `test-char-comic-${Date.now()}`;
  let dummyPngPath = "";

  t.before(async () => {
    // Generate a temporary 10x10 PNG file using sharp to serve as mock image
    dummyPngPath = path.join(os.tmpdir(), `dummy-test-sheet-${Date.now()}.png`);
    await sharp({
      create: { width: 10, height: 10, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 1 } }
    }).png().toFile(dummyPngPath);

    // Create a mock Novel and ComicProject/ComicCharacter in Prisma
    await prisma.novel.create({
      data: {
        id: novelId,
        title: "Test Novel for Comic",
      },
    });

    // Create ComicProject
    await prisma.comicProject.create({
      data: {
        id: projectId,
        sourceRef: novelId,
        title: "Test Project",
      },
    });

    // Create ComicCharacter
    await prisma.comicCharacter.create({
      data: {
        id: charId,
        projectId: projectId,
        name: "Test Character",
        gender: "female",
        sheetData: JSON.stringify({ status: "idle" }),
      },
    });
  });

  t.after(async () => {
    // Cleanup files
    if (dummyPngPath) {
      await fs.unlink(dummyPngPath).catch(() => {});
    }
    // Cleanup DB records
    await prisma.comicCharacterAsset.deleteMany({ where: { characterId: charId } });
    await prisma.comicCharacter.deleteMany({ where: { projectId } });
    await prisma.comicProject.deleteMany({ where: { id: projectId } });
    await prisma.novel.deleteMany({ where: { id: novelId } });
  });

  await t.test("ComicSpriteSheetService builds and cleans up combined sprite sheet image", async () => {
    const result = await comicSpriteSheetService.buildSpriteSheet({
      characterId: charId,
      characterName: "Test Character",
      sheetFilePath: dummyPngPath,
      costumeAssets: [],
      propAssets: [],
    });

    assert.ok(result);
    assert.ok(result.filePath);
    
    // Verify file exists
    const stats = await fs.stat(result.filePath);
    assert.ok(stats.size > 0);

    // Verify cleanup deletes the temporary combined image
    await result.cleanup();
    await assert.rejects(fs.stat(result.filePath));
  });

  await t.test("ComicCharacterAssetService CRUD operations", async () => {
    // 1. Create asset
    const asset = await comicCharacterAssetService.createAsset({
      characterId: charId,
      projectId,
      assetType: "costume",
      name: "Standard Robe",
      description: "A simple classical style robe.",
    });

    assert.ok(asset.id);
    assert.equal(asset.name, "Standard Robe");
    assert.equal(asset.assetType, "costume");

    // 2. Get asset
    const fetched = await comicCharacterAssetService.getAsset(asset.id);
    assert.equal(fetched.name, "Standard Robe");

    // 3. List assets
    const list = await comicCharacterAssetService.listAssets(charId);
    assert.ok(list.length >= 1);
    assert.ok(list.some(item => item.id === asset.id));

    // 4. Update asset
    const updated = await comicCharacterAssetService.updateAsset(asset.id, {
      name: "Premium Robe",
      description: "A gorgeous silk robe.",
    });
    assert.equal(updated.name, "Premium Robe");

    // 5. Delete asset
    await comicCharacterAssetService.deleteAsset(asset.id);
    await assert.rejects(comicCharacterAssetService.getAsset(asset.id));
  });

  await t.test("ComicCharacterImageService parses sheetData and default status", async () => {
    // Get default sheet data
    const sheetData = await comicCharacterImageService.getSheetData(charId);
    assert.equal(sheetData.status, "idle");

    // Update character sheetData in DB
    await prisma.comicCharacter.update({
      where: { id: charId },
      data: {
        sheetData: JSON.stringify({
          status: "done",
          version: 2,
          url: "/api/images/mock.png",
          history: [
            { version: 1, url: "/api/images/mock_v1.png" }
          ]
        }),
      },
    });

    const updatedSheetData = await comicCharacterImageService.getSheetData(charId);
    assert.equal(updatedSheetData.status, "done");
    assert.equal(updatedSheetData.version, 2);
    assert.ok(updatedSheetData.history);
    assert.equal(updatedSheetData.history.length, 1);
    assert.equal(updatedSheetData.history[0].version, 1);
  });
});
