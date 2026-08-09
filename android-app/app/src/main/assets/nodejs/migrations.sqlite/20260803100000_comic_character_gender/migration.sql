-- 补充 ComicCharacter.gender 列（20260402 的 character_gender_fields 迁移早于
-- 20260612 add_comic_module 建表，漏掉了该列；此处对齐 schema.prisma）
ALTER TABLE "ComicCharacter"
ADD COLUMN "gender" TEXT NOT NULL DEFAULT 'unknown';
