const fs = require('node:fs');
const path = require('node:path');

// Narrow journal fixtures do not need the legacy director's unrelated foreign keys.
module.exports = function applyObservabilityMigration(db) {
  db.exec('CREATE TABLE IF NOT EXISTS "DirectorLlmUsageRecord" ("id" TEXT PRIMARY KEY, "durationMs" INTEGER)');
  db.exec(fs.readFileSync(path.join(__dirname, '../../src/prisma/migrations.sqlite/20261106090000_llm_observability/migration.sql'), 'utf8'));
};
