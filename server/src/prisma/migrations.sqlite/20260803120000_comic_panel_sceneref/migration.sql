-- 补充 ComicPanel.sceneRef 列（schema.prisma 已定义，但 add_comic_module 建表
-- 时未包含，后续也无迁移补齐；此处对齐 schema，修复迁移建库环境报
-- "column does not exist"）
ALTER TABLE "ComicPanel" ADD COLUMN "sceneRef" TEXT;
