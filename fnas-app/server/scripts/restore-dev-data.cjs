const fs = require("fs");
const path = require("path");
const { DatabaseSync } = require("node:sqlite");

const ROOT_DIR = path.resolve(__dirname, "..");
const DEFAULT_TARGET = path.join(ROOT_DIR, "dev.db");
const DEFAULT_BACKUP_DIR = path.join(ROOT_DIR, "tmp", "db-backups");

function parseArgs(argv) {
  const options = {
    execute: false,
    source: null,
    target: DEFAULT_TARGET,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--execute") {
      options.execute = true;
      continue;
    }

    if (arg === "--dry-run") {
      options.execute = false;
      continue;
    }

    if (arg === "--source") {
      options.source = argv[index + 1] ? path.resolve(argv[index + 1]) : null;
      index += 1;
      continue;
    }

    if (arg === "--target") {
      options.target = argv[index + 1] ? path.resolve(argv[index + 1]) : DEFAULT_TARGET;
      index += 1;
      continue;
    }
  }

  return options;
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

function ensureFileExists(filePath, label) {
  if (!filePath || !fs.existsSync(filePath)) {
    throw new Error(`${label} does not exist: ${filePath || "(missing path)"}`);
  }
}

function getLatestBackupPath() {
  if (!fs.existsSync(DEFAULT_BACKUP_DIR)) {
    return null;
  }

  const candidates = fs
    .readdirSync(DEFAULT_BACKUP_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".db"))
    .map((entry) => path.join(DEFAULT_BACKUP_DIR, entry.name))
    .sort((left, right) => {
      const statDelta = fs.statSync(right).mtimeMs - fs.statSync(left).mtimeMs;
      if (statDelta !== 0) {
        return statDelta;
      }

      return path.basename(right).localeCompare(path.basename(left));
    });

  return candidates[0] ?? null;
}

function getUserTables(db) {
  return db
    .prepare(
      `
        SELECT name
        FROM sqlite_master
        WHERE type = 'table'
          AND name NOT LIKE 'sqlite_%'
          AND name != '_prisma_migrations'
        ORDER BY name
      `,
    )
    .all()
    .map((row) => row.name);
}

function getTableColumns(db, tableName) {
  return db
    .prepare(`PRAGMA table_info("${tableName.replace(/"/g, "\"\"")}")`)
    .all()
    .map((row) => row.name);
}

function getTableCount(db, tableName) {
  const row = db.prepare(`SELECT COUNT(*) AS count FROM "${tableName.replace(/"/g, "\"\"")}"`).get();
  return Number(row.count);
}

function compareSchemas(sourceDb, targetDb) {
  const sourceTables = getUserTables(sourceDb);
  const targetTables = getUserTables(targetDb);

  const missingInTarget = sourceTables.filter((table) => !targetTables.includes(table));
  const missingInSource = targetTables.filter((table) => !sourceTables.includes(table));

  if (missingInTarget.length > 0 || missingInSource.length > 0) {
    throw new Error(
      [
        "Source/target tables do not match.",
        missingInTarget.length > 0 ? `Missing in target: ${missingInTarget.join(", ")}` : null,
        missingInSource.length > 0 ? `Missing in source: ${missingInSource.join(", ")}` : null,
      ]
        .filter(Boolean)
        .join(" "),
    );
  }

  for (const tableName of sourceTables) {
    const sourceColumns = getTableColumns(sourceDb, tableName);
    const targetColumns = getTableColumns(targetDb, tableName);
    const sourceSet = new Set(sourceColumns);
    const targetSet = new Set(targetColumns);
    const missingInTargetColumns = sourceColumns.filter((column) => !targetSet.has(column));
    const missingInSourceColumns = targetColumns.filter((column) => !sourceSet.has(column));

    if (missingInTargetColumns.length > 0 || missingInSourceColumns.length > 0) {
      throw new Error(
        [
          `Column mismatch in table ${tableName}.`,
          missingInTargetColumns.length > 0
            ? `Missing in target: ${missingInTargetColumns.join(",")}`
            : null,
          missingInSourceColumns.length > 0
            ? `Missing in source: ${missingInSourceColumns.join(",")}`
            : null,
        ]
          .filter(Boolean)
          .join(" "),
      );
    }
  }

  return sourceTables;
}

function buildSummary(sourceDb, targetDb, tableNames) {
  return tableNames.map((tableName) => ({
    tableName,
    sourceCount: getTableCount(sourceDb, tableName),
    targetCount: getTableCount(targetDb, tableName),
  }));
}

function backupTargetDatabase(targetPath) {
  fs.mkdirSync(DEFAULT_BACKUP_DIR, { recursive: true });

  const backupPath = path.join(
    DEFAULT_BACKUP_DIR,
    `dev_restore_backup_${formatTimestamp()}.db`,
  );

  fs.copyFileSync(targetPath, backupPath);

  const stats = fs.statSync(backupPath);
  if (!stats.isFile() || stats.size <= 0) {
    throw new Error(`Backup verification failed: ${backupPath}`);
  }

  return { backupPath, size: stats.size };
}

function quoteSqlString(value) {
  return `'${value.replace(/'/g, "''")}'`;
}

function quoteIdentifier(value) {
  return `"${value.replace(/"/g, "\"\"")}"`;
}

function restoreData(targetDb, sourcePath, tableNames) {
  const sourceAlias = "restore_source";
  const sourceLiteral = quoteSqlString(sourcePath);

  targetDb.exec(`ATTACH DATABASE ${sourceLiteral} AS ${sourceAlias}`);

  try {
    targetDb.exec("PRAGMA foreign_keys = OFF");
    targetDb.exec("BEGIN IMMEDIATE");

    for (const tableName of tableNames) {
      targetDb.exec(`DELETE FROM ${quoteIdentifier(tableName)}`);
    }

    for (const tableName of tableNames) {
      const columns = getTableColumns(targetDb, tableName).map(quoteIdentifier).join(", ");
      targetDb.exec(
        [
          `INSERT INTO ${quoteIdentifier(tableName)} (${columns})`,
          `SELECT ${columns}`,
          `FROM ${sourceAlias}.${quoteIdentifier(tableName)}`,
        ].join(" "),
      );
    }

    targetDb.exec("COMMIT");
  } catch (error) {
    try {
      targetDb.exec("ROLLBACK");
    } catch {
      // Ignore rollback failures after a broken transaction.
    }
    throw error;
  } finally {
    targetDb.exec("PRAGMA foreign_keys = ON");
    targetDb.exec(`DETACH DATABASE ${sourceAlias}`);
  }
}

function printSummary(rows, title) {
  console.log(title);
  for (const row of rows) {
    console.log(
      `- ${row.tableName}: source=${row.sourceCount} target=${row.targetCount}`,
    );
  }
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const sourcePath = options.source ?? getLatestBackupPath();

  ensureFileExists(sourcePath, "Source database");
  ensureFileExists(options.target, "Target database");

  const sourceDb = new DatabaseSync(sourcePath, { open: true, readOnly: true });
  const targetDb = new DatabaseSync(options.target);

  try {
    const tableNames = compareSchemas(sourceDb, targetDb);
    const beforeSummary = buildSummary(sourceDb, targetDb, tableNames);

    console.log(`Source: ${sourcePath}`);
    console.log(`Target: ${options.target}`);
    printSummary(beforeSummary, "Planned restore summary:");

    if (!options.execute) {
      console.log("Dry run only. Add --execute to restore data.");
      return;
    }

    const { backupPath, size } = backupTargetDatabase(options.target);
    console.log(`Target backup created: ${backupPath}`);
    console.log(`Target backup size: ${size} bytes`);

    restoreData(targetDb, sourcePath, tableNames);

    const afterSummary = buildSummary(sourceDb, targetDb, tableNames);
    printSummary(afterSummary, "Restore result summary:");
    console.log("Restore completed.");
  } finally {
    sourceDb.close();
    targetDb.close();
  }
}

main();
