const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");
const dotenv = require("dotenv");

const ROOT_DIR = path.resolve(__dirname, "..");
dotenv.config({ path: path.join(ROOT_DIR, ".env"), quiet: true });

const DEFAULT_BACKUP_DIR = path.join(ROOT_DIR, "tmp", "db-backups");
const DEFAULT_SQLITE_DATABASE_URL = "file:./dev.db";
const DEFAULT_RETENTION_COUNT = 10;
const AUTOMATIC_TRIGGERS = new Set(["auto_milestone", "before_pipeline"]);
const DELETE_CHUNK_SIZE = 500;

function parseArgs(argv) {
  const options = {
    execute: false,
  };

  for (const arg of argv) {
    if (arg === "--execute") {
      options.execute = true;
      continue;
    }
    if (arg === "--dry-run") {
      options.execute = false;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      options.help = true;
    }
  }

  return options;
}

function printHelp() {
  console.log("Usage: pnpm db:prune-snapshots -- [--dry-run|--execute]");
  console.log("");
  console.log("Prunes automatic NovelSnapshot rows for the SQLite dev database.");
  console.log("Retention is configured by NOVEL_SNAPSHOT_RETENTION_COUNT, default 10.");
  console.log("Dry-run is the default. --execute creates a verified backup, deletes rows, then VACUUMs.");
}

function resolveRetentionCount(env = process.env) {
  const rawValue = env.NOVEL_SNAPSHOT_RETENTION_COUNT?.trim();
  if (!rawValue) {
    return DEFAULT_RETENTION_COUNT;
  }

  const parsed = Number(rawValue);
  if (!Number.isInteger(parsed) || parsed < 1) {
    return DEFAULT_RETENTION_COUNT;
  }

  return parsed;
}

function resolveDatabaseUrl(env = process.env) {
  return env.DATABASE_URL?.trim() || DEFAULT_SQLITE_DATABASE_URL;
}

function resolveSqliteDatabasePath(databaseUrl) {
  if (!databaseUrl.startsWith("file:")) {
    throw new Error("Snapshot pruning only supports SQLite file: DATABASE_URL values.");
  }

  const rawFilePath = databaseUrl.replace(/^file:/, "") || "dev.db";
  return path.isAbsolute(rawFilePath) ? rawFilePath : path.join(ROOT_DIR, rawFilePath);
}

function formatTimestamp() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, "0");

  return [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
    "_",
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds()),
  ].join("");
}

function formatBytes(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(2)} MiB`;
}

function createdAtMs(value) {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function selectPrunableAutoSnapshotIds(snapshots, retentionCount) {
  const normalizedRetentionCount = Number.isInteger(retentionCount) && retentionCount >= 1
    ? retentionCount
    : DEFAULT_RETENTION_COUNT;
  const byNovel = new Map();

  for (const snapshot of snapshots) {
    if (!AUTOMATIC_TRIGGERS.has(snapshot.triggerType)) {
      continue;
    }
    const current = byNovel.get(snapshot.novelId) || [];
    current.push(snapshot);
    byNovel.set(snapshot.novelId, current);
  }

  const prunableIds = [];
  const byNovelSummary = [];

  for (const [novelId, rows] of byNovel.entries()) {
    rows.sort((left, right) => {
      const timeDelta = createdAtMs(right.createdAt) - createdAtMs(left.createdAt);
      if (timeDelta !== 0) {
        return timeDelta;
      }
      return right.id.localeCompare(left.id);
    });
    const pruneRows = rows.slice(normalizedRetentionCount);
    prunableIds.push(...pruneRows.map((row) => row.id));
    byNovelSummary.push({
      novelId,
      automaticCount: rows.length,
      retainedCount: Math.min(rows.length, normalizedRetentionCount),
      prunedCount: pruneRows.length,
    });
  }

  byNovelSummary.sort((left, right) => right.prunedCount - left.prunedCount);

  return {
    prunableIds,
    byNovelSummary,
  };
}

function getSnapshotPlan(db, retentionCount) {
  const snapshots = db
    .prepare(
      `
        SELECT id, novelId, triggerType, createdAt
        FROM NovelSnapshot
        WHERE triggerType IN ('auto_milestone', 'before_pipeline')
      `,
    )
    .all();
  const manualCount = db
    .prepare("SELECT COUNT(*) AS count FROM NovelSnapshot WHERE triggerType = 'manual'")
    .get().count;
  const { prunableIds, byNovelSummary } = selectPrunableAutoSnapshotIds(snapshots, retentionCount);

  return {
    automaticCount: snapshots.length,
    manualCount: Number(manualCount),
    retainedAutomaticCount: snapshots.length - prunableIds.length,
    prunableIds,
    byNovelSummary,
  };
}

function verifyDatabase(filePath) {
  const db = new Database(filePath, { readonly: true, fileMustExist: true });
  try {
    const result = db.pragma("quick_check", { simple: true });
    if (result !== "ok") {
      throw new Error(`SQLite quick_check returned ${result}`);
    }
  } finally {
    db.close();
  }
}

async function createVerifiedBackup(db, sourcePath) {
  fs.mkdirSync(DEFAULT_BACKUP_DIR, { recursive: true });
  const backupPath = path.join(DEFAULT_BACKUP_DIR, `dev_snapshot_prune_${formatTimestamp()}.db`);

  await db.backup(backupPath);

  const stats = fs.statSync(backupPath);
  if (!stats.isFile() || stats.size <= 0) {
    throw new Error(`Backup verification failed: ${backupPath}`);
  }
  verifyDatabase(backupPath);

  console.log(`Backup created: ${backupPath}`);
  console.log(`Backup size: ${stats.size} bytes (${formatBytes(stats.size)})`);
  console.log(`Source database: ${sourcePath}`);

  return backupPath;
}

function deleteSnapshots(db, snapshotIds) {
  if (snapshotIds.length === 0) {
    return 0;
  }

  let deletedCount = 0;
  db.exec("BEGIN IMMEDIATE");
  try {
    for (let index = 0; index < snapshotIds.length; index += DELETE_CHUNK_SIZE) {
      const chunk = snapshotIds.slice(index, index + DELETE_CHUNK_SIZE);
      const placeholders = chunk.map(() => "?").join(", ");
      const result = db.prepare(`DELETE FROM NovelSnapshot WHERE id IN (${placeholders})`).run(...chunk);
      deletedCount += result.changes;
    }
    db.exec("COMMIT");
  } catch (error) {
    try {
      db.exec("ROLLBACK");
    } catch {
      // Ignore rollback failures after a broken transaction.
    }
    throw error;
  }

  return deletedCount;
}

function printPlanSummary(plan, retentionCount, execute) {
  console.log(`Mode: ${execute ? "execute" : "dry-run"}`);
  console.log(`Retention count: ${retentionCount}`);
  console.log(`Automatic snapshots: ${plan.automaticCount}`);
  console.log(`Manual snapshots retained: ${plan.manualCount}`);
  console.log(`Automatic snapshots retained: ${plan.retainedAutomaticCount}`);
  console.log(`Automatic snapshots to delete: ${plan.prunableIds.length}`);

  const topRows = plan.byNovelSummary.filter((row) => row.prunedCount > 0).slice(0, 10);
  if (topRows.length > 0) {
    console.log("Top affected novels:");
    for (const row of topRows) {
      console.log(
        `- ${row.novelId}: automatic=${row.automaticCount} retained=${row.retainedCount} delete=${row.prunedCount}`,
      );
    }
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const databaseUrl = resolveDatabaseUrl();
  const databasePath = resolveSqliteDatabasePath(databaseUrl);
  if (!fs.existsSync(databasePath)) {
    throw new Error(`Database does not exist: ${databasePath}`);
  }

  const retentionCount = resolveRetentionCount();
  const db = new Database(databasePath, { fileMustExist: true, readonly: !options.execute });
  db.pragma("busy_timeout = 5000");

  try {
    const beforeSize = fs.statSync(databasePath).size;
    const plan = getSnapshotPlan(db, retentionCount);

    console.log(`Database: ${databasePath}`);
    console.log(`Database size before: ${beforeSize} bytes (${formatBytes(beforeSize)})`);
    printPlanSummary(plan, retentionCount, options.execute);

    if (!options.execute) {
      console.log("Dry run only. Stop the dev server and add --execute to prune snapshots and run VACUUM.");
      return;
    }

    if (plan.prunableIds.length === 0) {
      console.log("No snapshots need pruning.");
      return;
    }

    console.log("Execute mode requires the dev server to be stopped to avoid SQLite write locks.");
    await createVerifiedBackup(db, databasePath);

    const deletedCount = deleteSnapshots(db, plan.prunableIds);
    console.log(`Deleted snapshots: ${deletedCount}`);

    console.log("Running VACUUM...");
    db.exec("VACUUM");
    verifyDatabase(databasePath);

    const afterSize = fs.statSync(databasePath).size;
    console.log(`Database size after: ${afterSize} bytes (${formatBytes(afterSize)})`);
    console.log(`Recovered bytes: ${beforeSize - afterSize} (${formatBytes(beforeSize - afterSize)})`);
  } finally {
    db.close();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = {
  resolveRetentionCount,
  resolveSqliteDatabasePath,
  selectPrunableAutoSnapshotIds,
};
