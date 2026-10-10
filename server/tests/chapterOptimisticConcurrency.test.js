import assert from "node:assert/strict";
import test from "node:test";
import { NovelCoreCrudService } from "../dist/services/novel/novelCoreCrudService.js";
import { prisma } from "../dist/db/prisma.js";

test("chapter save rejects a stale editor version before writing", async () => {
  const originalFindFirst = prisma.chapter.findFirst;
  const originalUpdate = prisma.chapter.update;
  let updateCalls = 0;
  prisma.chapter.findFirst = async () => ({
    id: "chapter-1",
    updatedAt: new Date("2026-10-11T00:00:00.000Z"),
  });
  prisma.chapter.update = async () => {
    updateCalls += 1;
    throw new Error("stale editor was written");
  };

  try {
    await assert.rejects(
      new NovelCoreCrudService().updateChapter("novel-1", "chapter-1", {
        content: "new content",
        expectedUpdatedAt: "2026-10-11T00:01:00.000Z",
      }),
      (error) => error?.statusCode === 409 && /本章保存版本已变化/.test(error.message),
    );
    assert.equal(updateCalls, 0);
  } finally {
    prisma.chapter.findFirst = originalFindFirst;
    prisma.chapter.update = originalUpdate;
  }
});
