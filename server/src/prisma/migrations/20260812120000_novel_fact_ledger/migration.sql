CREATE TABLE "NovelFactEntry" (
  "id" TEXT NOT NULL,
  "novelId" TEXT NOT NULL,
  "chapterOrder" INTEGER NOT NULL,
  "text" TEXT NOT NULL,
  "category" TEXT NOT NULL DEFAULT 'completed',
  "source" TEXT NOT NULL DEFAULT 'auto',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "NovelFactEntry_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "NovelFactEntry_novelId_chapterOrder_idx"
  ON "NovelFactEntry"("novelId", "chapterOrder");
CREATE INDEX "NovelFactEntry_novelId_category_idx"
  ON "NovelFactEntry"("novelId", "category");

ALTER TABLE "NovelFactEntry" ADD CONSTRAINT "NovelFactEntry_novelId_fkey"
  FOREIGN KEY ("novelId") REFERENCES "Novel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
