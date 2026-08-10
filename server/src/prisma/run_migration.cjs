// Manual migration script using better-sqlite3
const path = require("path");
const fs = require("fs");

const dbPath = path.join(__dirname, "../dev.db");
const sqlPath = path.join(__dirname, "manual_migration_stock_pnl.sql");

const Database = require("better-sqlite3");
const db = new Database(dbPath);

const sql = fs.readFileSync(sqlPath, "utf-8");

// Split on semicolons, filter empty statements
const statements = sql
  .split(";")
  .map((s) => s.trim())
  .filter((s) => s.length > 0 && !s.startsWith("--"));

let success = 0;
let skipped = 0;
let errors = 0;

for (const stmt of statements) {
  try {
    db.exec(stmt + ";");
    success++;
    console.log(`✅ OK: ${stmt.substring(0, 80).replace(/\n/g, " ")}...`);
  } catch (err) {
    if (
      err.message.includes("duplicate column name") ||
      err.message.includes("already exists") ||
      err.message.includes("table StockPortfolioSnapshot already exists") ||
      err.message.includes("table StockTradingDiscipline already exists")
    ) {
      skipped++;
      console.log(`⚠️  SKIP (already exists): ${stmt.substring(0, 60).replace(/\n/g, " ")}...`);
    } else {
      errors++;
      console.error(`❌ ERROR: ${err.message}`);
      console.error(`   SQL: ${stmt.substring(0, 100).replace(/\n/g, " ")}`);
    }
  }
}

db.close();
console.log(`\nMigration complete: ${success} applied, ${skipped} skipped, ${errors} errors`);
