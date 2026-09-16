const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Database = require("better-sqlite3");

const prismaRoot = path.join(__dirname, "..", "src", "prisma");
const sqliteSchemaPath = path.join(prismaRoot, "schema.sqlite.prisma");
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

function indexExists(database, indexName) {
  return database.prepare(
    "SELECT 1 FROM sqlite_master WHERE type = 'index' AND name = ? LIMIT 1",
  ).get(indexName) != null;
}

function parseSqliteSchemaModels(schemaSource) {
  const modelMatches = Array.from(schemaSource.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm));
  const modelNames = new Set(modelMatches.map((match) => match[1]));

  return modelMatches.map((match) => {
    const modelName = match[1];
    const body = match[2];
    const mappedTable = body.match(/^\s*@@map\("([^"]+)"\)/m);
    const columns = body
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("//") && !line.startsWith("@@"))
      .flatMap((line) => {
        const field = line.match(/^(\w+)\s+([A-Za-z]\w*)(?:\?|\[\])?(?:\s|$)/);
        if (!field || modelNames.has(field[2])) {
          return [];
        }

        const mappedColumn = line.match(/@map\("([^"]+)"\)/);
        return [mappedColumn?.[1] ?? field[1]];
      })
      .sort();

    return {
      modelName,
      tableName: mappedTable?.[1] ?? modelName,
      columns,
    };
  }).sort((left, right) => left.tableName.localeCompare(right.tableName));
}

test("SQLite migrations contain every model and column in the SQLite Prisma schema", () => {
  const database = new Database(":memory:");

  try {
    applySqliteMigrations(database);
    const schemaModels = parseSqliteSchemaModels(fs.readFileSync(sqliteSchemaPath, "utf8"));
    const databaseTables = database.prepare(
      `SELECT name
       FROM sqlite_master
       WHERE type = 'table'
         AND name NOT LIKE 'sqlite_%'
         AND name <> '_prisma_migrations'
       ORDER BY name`,
    ).all()
      .map((row) => row.name)
      .sort((left, right) => left.localeCompare(right));

    const databaseTableNames = new Set(databaseTables);
    assert.deepEqual(
      schemaModels.filter((model) => !databaseTableNames.has(model.tableName)).map((model) => model.tableName),
      [],
      "SQLite migrations must create every table in schema.sqlite.prisma",
    );
    for (const model of schemaModels) {
      const databaseColumns = new Set(
        database.prepare(`PRAGMA table_info("${model.tableName}")`).all().map((column) => column.name),
      );
      assert.deepEqual(
        model.columns.filter((columnName) => !databaseColumns.has(columnName)),
        [],
        `${model.modelName} must contain every column in schema.sqlite.prisma`,
      );
    }

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
