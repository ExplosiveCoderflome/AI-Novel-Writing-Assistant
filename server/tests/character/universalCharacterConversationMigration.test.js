const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const migrationName = "20260714110000_universal_character_conversation";
const prismaRoot = path.join(__dirname, "..", "src", "prisma");

function readMigration(directory) {
  return fs.readFileSync(path.join(prismaRoot, directory, migrationName, "migration.sql"), "utf8");
}

test("universal character conversation migrations preserve legacy dialogue records", () => {
  const postgres = readMigration("migrations");
  const sqlite = readMigration("migrations.sqlite");

  for (const migration of [postgres, sqlite]) {
    assert.match(migration, /CharacterConversationSession/);
    assert.match(migration, /CharacterConversationTurn/);
    assert.match(migration, /conversationSessionId/);
    assert.doesNotMatch(migration, /DROP TABLE "CharacterDialogueSession"/);
    assert.doesNotMatch(migration, /DROP TABLE "CharacterDialogueTurn"/);
  }

  assert.match(sqlite, /INSERT INTO "new_CharacterDialogueInfluence"/);
  assert.match(sqlite, /FROM "CharacterDialogueInfluence"/);
  assert.match(sqlite, /"sessionId" TEXT/);
});
