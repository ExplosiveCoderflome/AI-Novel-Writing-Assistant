const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

function initializeTemporarySqliteDatabase(tempDir, filename) {
  const root = path.resolve(tempDir);
  const databasePath = path.resolve(root, filename);
  const relative = path.relative(root, databasePath);
  if (!fs.statSync(root).isDirectory() || relative.startsWith("..") || path.isAbsolute(relative)
    || fs.existsSync(databasePath)) throw new Error("Expected a new database inside a temporary fixture directory");
  const databaseUrl = `file:${databasePath.replace(/\\/g, "/")}`;
  execFileSync(process.execPath, ["-e", "require('./dist/db/runtimeMigrations').ensureRuntimeDatabaseReady()"], {
    cwd: path.resolve(__dirname, "../.."),
    env: { ...process.env, NODE_ENV: "test", DATABASE_URL: databaseUrl,
      AI_NOVEL_RUNTIME: "desktop", AI_NOVEL_APP_DATA_DIR: root },
    stdio: ["ignore", "ignore", "pipe"],
  });
  return databaseUrl;
}

module.exports = { initializeTemporarySqliteDatabase };
