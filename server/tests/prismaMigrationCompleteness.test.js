const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Database = require("better-sqlite3");

const prismaRoot = path.join(__dirname, "..", "src", "prisma");
const sqliteMigrationsDir = path.join(prismaRoot, "migrations.sqlite");
const postgresMigrationsDir = path.join(prismaRoot, "migrations");
const visualAssetSchemaRepairMigrations = [
  "20260916090000_comic_character_gender",
  "20260916090100_comic_panel_scene_ref",
  "20260916090200_drama_character_portrait_data",
  "20260916090300_drama_character_three_view_data",
  "20260916090400_comic_character_assets",
  "20260916090500_comic_scenes",
];

function listMigrationNames(migrationsDir) {
  return fs.readdirSync(migrationsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));
}

function applySqliteMigrations(database) {
  for (const migrationName of listMigrationNames(sqliteMigrationsDir)) {
    const migrationSql = fs.readFileSync(
      path.join(sqliteMigrationsDir, migrationName, "migration.sql"),
      "utf8",
    );
    database.exec(migrationSql);
  }
}

function tableExists(database, tableName) {
  return database.prepare(
    "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1",
  ).get(tableName) != null;
}

function indexExists(database, indexName) {
  return database.prepare(
    "SELECT 1 FROM sqlite_master WHERE type = 'index' AND name = ? LIMIT 1",
  ).get(indexName) != null;
}

function columnExists(database, tableName, columnName) {
  return database.prepare(`PRAGMA table_info("${tableName}")`).all()
    .some((column) => column.name === columnName);
}

test("SQLite migrations create the visual asset source schema", () => {
  const database = new Database(":memory:");

  try {
    applySqliteMigrations(database);

    assert.equal(tableExists(database, "ComicCharacterAsset"), true);
    assert.equal(tableExists(database, "ComicScene"), true);
    assert.equal(columnExists(database, "ComicCharacter", "gender"), true);
    assert.equal(columnExists(database, "ComicPanel", "sceneRef"), true);
    assert.equal(columnExists(database, "DramaCharacter", "portraitData"), true);
    assert.equal(columnExists(database, "DramaCharacter", "threeViewData"), true);
    assert.equal(indexExists(database, "ComicCharacterAsset_characterId_idx"), true);
    assert.equal(indexExists(database, "ComicCharacterAsset_projectId_idx"), true);
    assert.equal(indexExists(database, "ComicScene_projectId_idx"), true);
    assert.equal(database.pragma("integrity_check", { simple: true }), "ok");
    assert.deepEqual(database.pragma("foreign_key_check"), []);
  } finally {
    database.close();
  }
});

test("visual asset schema repair migrations exist for SQLite and PostgreSQL", () => {
  for (const migrationName of visualAssetSchemaRepairMigrations) {
    assert.equal(
      fs.existsSync(path.join(sqliteMigrationsDir, migrationName, "migration.sql")),
      true,
      `${migrationName} must exist for SQLite`,
    );
    assert.equal(
      fs.existsSync(path.join(postgresMigrationsDir, migrationName, "migration.sql")),
      true,
      `${migrationName} must exist for PostgreSQL`,
    );
  }
});
