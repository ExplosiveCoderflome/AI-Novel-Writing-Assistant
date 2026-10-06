const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const Database = require("better-sqlite3");

const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "market-radar-repeat-analysis-"));
const databasePath = path.join(tempDirectory, "market-radar.db");
process.env.DATABASE_URL = `file:${databasePath.replace(/\\/g, "/")}`;
process.env.NODE_ENV = "test";

const sqlite = new Database(databasePath);
sqlite.exec(`
  PRAGMA foreign_keys = ON;
  CREATE TABLE "MarketScanRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "progress" REAL NOT NULL DEFAULT 0,
    "requestedPlatformsJson" TEXT NOT NULL,
    "provider" TEXT,
    "model" TEXT,
    "lastError" TEXT,
    "startedAt" DATETIME,
    "finishedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
  );
  CREATE TABLE "MarketRankingSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "runId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "listKey" TEXT NOT NULL,
    "listLabel" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'succeeded',
    "error" TEXT,
    "capturedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MarketRankingSnapshot_runId_fkey" FOREIGN KEY ("runId") REFERENCES "MarketScanRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  );
  CREATE TABLE "MarketRankingItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "snapshotId" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "author" TEXT,
    "category" TEXT,
    "tagsJson" TEXT,
    "synopsis" TEXT,
    "heatLabel" TEXT,
    "serialStatus" TEXT,
    "sourceUrl" TEXT NOT NULL,
    CONSTRAINT "MarketRankingItem_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "MarketRankingSnapshot" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  );
  CREATE TABLE "MarketTrendReport" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "runId" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "structuredDataJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MarketTrendReport_runId_fkey" FOREIGN KEY ("runId") REFERENCES "MarketScanRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  );
  CREATE INDEX "MarketTrendReport_runId_createdAt_idx" ON "MarketTrendReport"("runId", "createdAt");
`);
sqlite.close();

const { prisma } = require("../dist/db/prisma.js");
const { marketRadarService } = require("../dist/modules/marketRadar/application/MarketRadarService.js");

test.after(async () => {
  await prisma.$disconnect();
  fs.rmSync(tempDirectory, { recursive: true, force: true });
});

test("a completed scan with existing reports starts another analysis and projects the latest report", async () => {
  const oldImmediate = global.setImmediate;
  let scheduledAnalyses = 0;
  global.setImmediate = () => {
    scheduledAnalyses += 1;
    return {};
  };

  try {
    await prisma.marketScanRun.create({
      data: {
        id: "scan-repeat",
        status: "succeeded",
        progress: 1,
        requestedPlatformsJson: JSON.stringify(["fanqie"]),
        snapshots: {
          create: {
            id: "snapshot-repeat",
            platform: "fanqie",
            listKey: "new_book",
            listLabel: "新书榜",
            channel: "general",
            sourceUrl: "https://example.com/list",
            items: {
              create: {
                id: "book-repeat",
                rank: 1,
                title: "测试作品",
                sourceUrl: "https://example.com/book",
              },
            },
          },
        },
        reports: {
          create: [
            {
              id: "report-old",
              summary: "较早的市场分析报告",
              structuredDataJson: JSON.stringify({ signals: [], analyzedItemIds: ["book-repeat"] }),
              createdAt: new Date("2026-09-20T00:00:00.000Z"),
            },
            {
              id: "report-latest",
              summary: "最近的市场分析报告",
              structuredDataJson: JSON.stringify({ signals: [], analyzedItemIds: ["book-repeat"] }),
              createdAt: new Date("2026-09-21T00:00:00.000Z"),
            },
          ],
        },
      },
    });

    const run = await marketRadarService.startAnalysis("scan-repeat", {
      selectedItemIds: ["book-repeat"],
    });

    assert.equal(run.status, "analyzing");
    assert.equal(run.report?.id, "report-latest");
    assert.equal(scheduledAnalyses, 1);
  } finally {
    global.setImmediate = oldImmediate;
  }
});

test("concurrent requests for the same completed scan schedule only one analysis", async () => {
  const oldImmediate = global.setImmediate;
  let scheduledAnalyses = 0;
  global.setImmediate = () => {
    scheduledAnalyses += 1;
    return {};
  };

  try {
    await prisma.marketScanRun.create({
      data: {
        id: "scan-concurrent",
        status: "succeeded",
        progress: 1,
        requestedPlatformsJson: JSON.stringify(["qidian"]),
        snapshots: {
          create: {
            id: "snapshot-concurrent",
            platform: "qidian",
            listKey: "new_book",
            listLabel: "新书榜",
            channel: "general",
            sourceUrl: "https://example.com/list-concurrent",
            items: {
              create: {
                id: "book-concurrent",
                rank: 1,
                title: "并发测试作品",
                sourceUrl: "https://example.com/book-concurrent",
              },
            },
          },
        },
        reports: {
          create: {
            id: "report-concurrent",
            summary: "并发测试已有报告",
            structuredDataJson: JSON.stringify({ signals: [], analyzedItemIds: ["book-concurrent"] }),
          },
        },
      },
    });

    const results = await Promise.all([
      marketRadarService.startAnalysis("scan-concurrent", { selectedItemIds: ["book-concurrent"] }),
      marketRadarService.startAnalysis("scan-concurrent", { selectedItemIds: ["book-concurrent"] }),
    ]);

    assert.deepEqual(results.map((run) => run.status), ["analyzing", "analyzing"]);
    assert.equal(scheduledAnalyses, 1);
  } finally {
    global.setImmediate = oldImmediate;
  }
});

test("the SQLite migration preserves existing report references and permits a second report", () => {
  const migrationDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "market-radar-migration-test-"));
  try {
    const db = new Database(path.join(migrationDirectory, "migration.db"));
    db.exec(`
      PRAGMA foreign_keys = ON;
      CREATE TABLE "MarketScanRun" ("id" TEXT NOT NULL PRIMARY KEY);
      CREATE TABLE "MarketTrendReport" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "runId" TEXT NOT NULL,
        "summary" TEXT NOT NULL,
        "structuredDataJson" TEXT NOT NULL,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "MarketTrendReport_runId_fkey" FOREIGN KEY ("runId") REFERENCES "MarketScanRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE
      );
      CREATE UNIQUE INDEX "MarketTrendReport_runId_key" ON "MarketTrendReport"("runId");
      CREATE INDEX "MarketTrendReport_createdAt_idx" ON "MarketTrendReport"("createdAt");
      CREATE TABLE "MarketCreativeBrief" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "reportId" TEXT NOT NULL,
        CONSTRAINT "MarketCreativeBrief_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "MarketTrendReport" ("id") ON DELETE CASCADE ON UPDATE CASCADE
      );
      CREATE TABLE "MarketSavedTopic" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "reportId" TEXT NOT NULL,
        CONSTRAINT "MarketSavedTopic_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "MarketTrendReport" ("id") ON DELETE CASCADE ON UPDATE CASCADE
      );
      INSERT INTO "MarketScanRun" ("id") VALUES ('scan-migration');
      INSERT INTO "MarketTrendReport" ("id", "runId", "summary", "structuredDataJson") VALUES ('report-existing', 'scan-migration', 'existing', '{}');
      INSERT INTO "MarketCreativeBrief" ("id", "reportId") VALUES ('brief-existing', 'report-existing');
      INSERT INTO "MarketSavedTopic" ("id", "reportId") VALUES ('topic-existing', 'report-existing');
    `);

    const migrationSql = fs.readFileSync(path.resolve(__dirname, "../src/prisma/migrations.sqlite/20260922120000_market_radar_multiple_reports/migration.sql"), "utf8");
    db.exec(migrationSql);
    db.prepare('INSERT INTO "MarketTrendReport" ("id", "runId", "summary", "structuredDataJson") VALUES (?, ?, ?, ?)')
      .run("report-second", "scan-migration", "second", "{}");

    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM "MarketTrendReport" WHERE "runId" = ?').get("scan-migration").count, 2);
    assert.equal(db.prepare('SELECT "reportId" FROM "MarketCreativeBrief" WHERE "id" = ?').get("brief-existing").reportId, "report-existing");
    assert.equal(db.prepare('SELECT "reportId" FROM "MarketSavedTopic" WHERE "id" = ?').get("topic-existing").reportId, "report-existing");
    db.close();
  } finally {
    fs.rmSync(migrationDirectory, { recursive: true, force: true });
  }
});
