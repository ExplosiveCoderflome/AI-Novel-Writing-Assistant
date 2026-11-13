/**
 * A3 outline text-feedback fixture acceptance (NO paid model).
 * Uses OutlineFeedbackService with injected analyzer; records pending/completed/failed + adopt/reject + unbound gate.
 * This is NOT a browser panel pass — client has no dedicated /outlines/:id feedback list UI yet.
 */
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fs.existsSync(path.join(process.cwd(), "server/dist"))
  ? process.cwd()
  : "/agent/repos/AI-Novel-Writing-Assistant";
const serverRoot = path.join(repoRoot, "server");
process.chdir(serverRoot);
const require = createRequire(path.join(serverRoot, "package.json"));
const Sqlite = require("better-sqlite3");
const { PrismaClient } = require("@prisma/client");
const { PrismaBetterSqlite3 } = require("@prisma/adapter-better-sqlite3");
const { fullSchemaSql } = require("./tests/production/persistence/sqliteFixture.cjs");
const { createEmptyOutlineDocument } = require("@ai-novel/shared/types/outline");
const { mapOutlineBook } = require("./dist/modules/planning/outline/openBook/domain/mapping");
const { buildOutlineWorkspace } = require("./dist/modules/planning/outline/openBook/domain/assets");
const { OutlineFeedbackService } = require("./dist/modules/planning/outline/feedback/application/OutlineFeedbackService");

const report = { scope: "A3_outline_text_feedback", paidModel: false, clientUiPanel: "NOT_PRESENT", cases: [] };

async function buildFixture(analyzer) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "a3-accept-"));
  const dbPath = path.join(dir, "test.sqlite");
  const raw = new Sqlite(dbPath);
  raw.exec(fullSchemaSql());
  raw.close();
  const db = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: `file:${dbPath}` }) });
  await db.novel.create({ data: { id: "n", title: "书" } });
  for (let order = 1; order <= 3; order++) {
    await db.chapter.create({
      data: {
        id: `c${order}`,
        novelId: "n",
        order,
        title: `第${order}章`,
        content: order === 1 ? "DO_NOT_SEND_FULL_TEXT" : "",
        generationState: order === 1 ? "drafted" : "planned",
      },
    });
  }
  await db.chapterSummary.create({ data: { novelId: "n", chapterId: "c1", summary: "主角发现钥匙是假的" } });
  const d = createEmptyOutlineDocument("书");
  d.story.premise = "主角调查假钥匙交易";
  d.volumes = [{ nodeId: "v", order: 0, title: "卷", summary: "卷纲", planningDepth: "rough", chapterNodeIds: ["s1", "s2", "s3"] }];
  d.chapters = [1, 2, 3].map((x) => ({
    nodeId: `s${x}`,
    volumeNodeId: "v",
    order: x - 1,
    title: `第${x}章`,
    summary: `原章纲${x}`,
    purpose: "调查",
    planningDepth: "rough",
    characterNodeIds: [],
    payoffNodeIds: [],
  }));
  d.characters = [{ nodeId: "hero", name: "主角", arcDirection: "追求真相", appearanceNodeIds: ["s1", "s2", "s3"] }];
  d.payoffs = [];
  const m = mapOutlineBook(
    d,
    {
      revisionId: "r",
      expectedProjectVersion: 1,
      bookSettings: { title: "书", estimatedChapterCount: 3 },
      volumeQuotas: { v: 3 },
      allowOptimize: [
        { nodeId: "s2", field: "summary" },
        { nodeId: "s3", field: "purpose" },
      ],
    },
    "b",
  );
  m.mapping.chapters.forEach((c, i) => {
    c.chapterId = `c${i + 1}`;
  });
  const w = buildOutlineWorkspace("n", d, m.mapping, 3000, "wv");
  await db.outlineProject.create({ data: { id: "p", title: "书", currentVersion: 1, currentRevisionId: "r" } });
  await db.outlineRevision.create({ data: { id: "r", projectId: "p", version: 1, sourceType: "manual", documentJson: JSON.stringify(d) } });
  await db.outlineBookBinding.create({
    data: {
      id: "b",
      projectId: "p",
      revisionId: "r",
      revisionVersion: 1,
      sourceDocumentHash: m.sourceDocumentHash,
      novelId: "n",
      requestKey: "book",
      requestHash: m.requestHash,
      mappingJson: JSON.stringify(m.mapping),
      policyJson: JSON.stringify(m.policy),
      postCreateStateJson: "{}",
    },
  });
  await db.volumePlanVersion.create({ data: { id: "wv", novelId: "n", version: 1, status: "active", contentJson: JSON.stringify(w) } });
  await db.$transaction((tx) =>
    require("./dist/services/novel/volume/volumeWorkspacePersistence").persistActiveVolumeWorkspace(tx, "n", w, "wv"),
  );
  const queue = [];
  const service = new OutlineFeedbackService(
    db,
    async (input) => {
      if (JSON.stringify(input).includes("DO_NOT_SEND_FULL_TEXT")) throw new Error("LEAKED_FULL_TEXT");
      return analyzer(input);
    },
    (work) => queue.push(work),
  );
  return {
    db,
    service,
    queue,
    drain: async () => {
      while (queue.length) await queue.shift()();
    },
    dir,
  };
}

const ops = {
  operations: [
    { operationId: "a", kind: "update_fields", nodeId: "s2", fields: { summary: "追查假钥匙的来历" }, reason: "承接本章发现", dependsOn: [] },
    { operationId: "b", kind: "update_fields", nodeId: "s3", fields: { purpose: "揭示幕后买家" }, reason: "推进后续任务", dependsOn: [] },
  ],
};

try {
  // pending → completed + adopt/reject
  {
    const f = await buildFixture(async () => ops);
    const run = await f.service.enqueue("p", "c1", "manual");
    report.cases.push({ name: "enqueue_pending", status: run.status, ok: run.status === "pending" });
    await f.drain();
    const completed = (await f.service.status("p")).runs[0];
    report.cases.push({
      name: "drain_completed",
      status: completed.status,
      itemCount: completed.items.length,
      ok: completed.status === "completed" && completed.items.length === 2,
    });
    await f.service.decide("p", run.id, ["a"], "adopted");
    await f.service.decide("p", run.id, ["b"], "rejected");
    const after = (await f.service.status("p")).runs[0].items;
    report.cases.push({
      name: "adopt_and_reject",
      items: after.map((i) => ({ id: i.operationId, status: i.status })),
      ok: after.find((i) => i.operationId === "a")?.status === "adopted" && after.find((i) => i.operationId === "b")?.status === "rejected",
      db: {
        outlineVersions: await f.db.outlineRevision.count(),
        chapter1ContentUnchanged: (await f.db.chapter.findUnique({ where: { id: "c1" } })).content === "DO_NOT_SEND_FULL_TEXT",
      },
    });
    await f.db.$disconnect();
  }
  // failed + retry → completed
  {
    let fail = true;
    const f = await buildFixture(async () => {
      if (fail) throw new Error("fixture model failure");
      return { operations: [] };
    });
    await f.service.settings("p", { mode: "chapter" });
    f.service.notify("n", "c1");
    await f.drain();
    let run = (await f.service.status("p")).runs[0];
    report.cases.push({ name: "failed_visible", status: run.status, error: run.error, ok: run.status === "failed" && Boolean(run.error) });
    fail = false;
    await f.service.retry("p", run.id);
    await f.drain();
    run = (await f.service.status("p")).runs[0];
    report.cases.push({ name: "retry_completed", status: run.status, attempt: run.attempt, ok: run.status === "completed" });
    await f.db.$disconnect();
  }
  // unbound / manuscript blocked
  {
    const f = await buildFixture(async () => ops);
    f.service.notify("unbound", "no-chapter");
    await f.drain();
    await f.db.manuscriptProject.create({
      data: { id: "manuscript", novelId: "n", status: "ready", baselineOutlineRevisionId: "r", workingOutlineProjectId: "p" },
    });
    f.service.notify("n", "c1");
    await f.drain();
    let blocked = false;
    try {
      await f.service.enqueue("p", "c1", "blocked");
    } catch {
      blocked = true;
    }
    report.cases.push({
      name: "unbound_or_manuscript_no_entry",
      runCount: await f.db.outlineFeedbackRun.count(),
      enqueueBlocked: blocked,
      ok: (await f.db.outlineFeedbackRun.count()) === 0 && blocked,
    });
    await f.db.$disconnect();
  }
} catch (error) {
  report.fatal = String(error?.stack || error);
}

const outPath = "/opt/cursor/artifacts/acceptance/a3-feedback-fixture-result.json";
fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
console.log("wrote", outPath);
process.exit(report.fatal || report.cases.some((c) => !c.ok) ? 1 : 0);
