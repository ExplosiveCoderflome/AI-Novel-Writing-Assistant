// 安卓专用：用 better-sqlite3 直接执行 Prisma 的 SQL 迁移建表（不依赖 prisma CLI）
const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');

const dbPath = path.join(__dirname, 'dev.db');
const migrationsDir = path.join(__dirname, 'migrations.sqlite');

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// 创建 prisma 迁移追踪表（与 prisma 兼容）
db.exec(`
CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
  "id"                    TEXT PRIMARY KEY NOT NULL,
  "checksum"             TEXT NOT NULL,
  "finished_at"          DATETIME,
  "migration_name"       TEXT NOT NULL,
  "logs"                 TEXT,
  "rolled_back_at"       DATETIME,
  "started_at"           DATETIME NOT NULL DEFAULT current_timestamp,
  "applied_steps_count"  INTEGER UNSIGNED NOT NULL DEFAULT 0
);
`);

if (!fs.existsSync(migrationsDir)) {
  console.log('[init-db] no migrations dir, skip');
  process.exit(0);
}

const names = fs.readdirSync(migrationsDir)
  .filter((n) => fs.statSync(path.join(migrationsDir, n)).isDirectory())
  .sort();

const applied = new Set(
  db.prepare(`SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL`).all().map((r) => r.migration_name)
);

let count = 0;
for (const name of names) {
  if (applied.has(name)) continue;
  const sqlPath = path.join(migrationsDir, name, 'migration.sql');
  if (!fs.existsSync(sqlPath)) continue;
  const sql = fs.readFileSync(sqlPath, 'utf8');
  const checksum = require('node:crypto').createHash('sha256').update(sql).digest('hex');
  const tx = db.transaction(() => {
    db.prepare(`PRAGMA defer_foreign_keys = ON`).run();
    db.exec(sql);
    db.prepare(
      `INSERT INTO "_prisma_migrations" (id, checksum, migration_name, finished_at, applied_steps_count)
       VALUES (?, ?, ?, current_timestamp, 1)`
    ).run(require('node:crypto').randomUUID(), checksum, name);
  });
  tx();
  count++;
  console.log('[init-db] applied', name);
}

console.log(`[init-db] done, applied ${count} new migration(s)`);
process.exit(0);
