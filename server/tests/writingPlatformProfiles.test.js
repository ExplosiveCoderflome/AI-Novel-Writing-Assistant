const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  OFFICIAL_WRITING_PLATFORM_PROFILES,
  supportsWritingPlatformForm,
} = require("../dist/modules/novel/writing-platform/domain/officialWritingPlatformProfiles.js");
const { listRegisteredPromptAssets } = require("../dist/prompting/registry.js");
const { getOfficialPromptTemplate } = require("../dist/prompting/templates/officialTemplates.js");
const { getRequiredTemplateContextGroups } = require("../dist/prompting/templates/templateTypes.js");

test("official platform profiles cover the four locked launch profiles", () => {
  assert.deepEqual(Object.keys(OFFICIAL_WRITING_PLATFORM_PROFILES).sort(), [
    "fanqie_free", "jinjiang_female", "qidian_male", "zhihu_story",
  ]);
  assert.equal(supportsWritingPlatformForm("fanqie_free", "short_story"), true);
  assert.equal(supportsWritingPlatformForm("fanqie_free", "long_novel"), true);
  assert.equal(supportsWritingPlatformForm("qidian_male", "short_story"), false);
  assert.equal(supportsWritingPlatformForm("jinjiang_female", "short_story"), false);
  assert.equal(supportsWritingPlatformForm("zhihu_story", "short_story"), true);
  assert.equal(supportsWritingPlatformForm("zhihu_story", "long_novel"), false);
});

test("long and short prose prompts declare slots and advanced templates", () => {
  const assets = new Map(listRegisteredPromptAssets().map((asset) => [asset.id, asset]));
  for (const id of ["novel.chapter.writer", "novel.short_story.segment.write"]) {
    const asset = assets.get(id);
    assert.ok(asset, `${id} must be registered`);
    assert.equal(asset.management?.productPrompt, true);
    assert.equal(asset.management?.proseGeneration, true);
    assert.ok(asset.management?.editModes.includes("slots"));
    assert.ok(asset.management?.editModes.includes("advanced_template"));
    assert.ok(asset.slots?.length > 0);
    assert.ok(getOfficialPromptTemplate(id));
    assert.ok(getRequiredTemplateContextGroups(id).includes("writing_platform"));
  }
});

test("short story advanced template keeps all five formal context blocks", () => {
  assert.deepEqual(getRequiredTemplateContextGroups("novel.short_story.segment.write"), [
    "creation_intent", "short_story_plan", "short_story_continuity", "writing_platform", "book_style",
  ]);
  const template = getOfficialPromptTemplate("novel.short_story.segment.write");
  const source = template.messages.map((item) => item.content).join("\n");
  assert.match(source, /content/);
  assert.match(source, /continuitySummary/);

  const asset = listRegisteredPromptAssets()
    .find((item) => item.id === "novel.short_story.segment.write");
  assert.equal(asset.outputSchema.safeParse({ continuitySummary: "只有连续性摘要，缺少正文。" }).success, false);
  assert.equal(asset.outputSchema.safeParse({ content: "只有正文，缺少连续性摘要。".repeat(20) }).success, false);
});

test("PostgreSQL and SQLite schemas and migrations stay aligned", () => {
  const root = path.join(__dirname, "..", "src", "prisma");
  for (const schemaName of ["schema.prisma", "schema.sqlite.prisma"]) {
    const schema = fs.readFileSync(path.join(root, schemaName), "utf8");
    assert.match(schema, /writingPlatform\s+String\?/);
    assert.match(schema, /writingPlatformSnapshotJson\s+String\?/);
    assert.match(schema, /model WritingPlatformProfileOverride/);
    assert.match(schema, /model WritingPlatformProfileVersion/);
  }
  const migration = "20260803120000_writing_platform_profiles";
  assert.ok(fs.existsSync(path.join(root, "migrations", migration, "migration.sql")));
  assert.ok(fs.existsSync(path.join(root, "migrations.sqlite", migration, "migration.sql")));
});
