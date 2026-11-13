/**
 * Isolated A3 outline-feedback API fixture harness (NO paid models).
 * Serves a clearly-labeled acceptance HTML that drives status/adopt/reject.
 * Product client has no feedback panel — this harness is NOT product UI.
 */
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:http";
import { createRequire } from "node:module";

const root = "/agent/repos/AI-Novel-Writing-Assistant/server";
process.chdir(root);
const require = createRequire(join(root, "package.json"));

const Sqlite = require("better-sqlite3");
const { PrismaClient } = require("@prisma/client");
const { PrismaBetterSqlite3 } = require("@prisma/adapter-better-sqlite3");
const { fullSchemaSql } = require(join(root, "tests/production/persistence/sqliteFixture.cjs"));
const { createEmptyOutlineDocument } = require("@ai-novel/shared/types/outline");
const { mapOutlineBook } = require(join(root, "dist/modules/planning/outline/openBook/domain/mapping"));
const { buildOutlineWorkspace } = require(join(root, "dist/modules/planning/outline/openBook/domain/assets"));
const { OutlineFeedbackService } = require(join(root, "dist/modules/planning/outline/feedback/application/OutlineFeedbackService"));

const dbPath = join(mkdtempSync(join(tmpdir(), "a3-harness-")), "fixture.sqlite");
const sqlite = new Sqlite(dbPath);
sqlite.exec(fullSchemaSql());
sqlite.close();
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
d.payoffs = [
  {
    nodeId: "key",
    title: "假钥匙",
    kind: "foreshadowing",
    setupDescription: "钥匙来历可疑",
    payoffDescription: "查明幕后交易",
    setupChapterNodeIds: ["s1"],
    payoffChapterNodeIds: ["s3"],
    relatedNodeIds: [],
  },
];
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
      { nodeId: "hero", field: "arcDirection" },
      { nodeId: "key", field: "payoffDescription" },
    ],
  },
  "b",
);
m.mapping.chapters.forEach((c, i) => (c.chapterId = `c${i + 1}`));
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
  require(join(root, "dist/services/novel/volume/volumeWorkspacePersistence")).persistActiveVolumeWorkspace(tx, "n", w, "wv"),
);

const queue = [];
let failOnce = false;
const service = new OutlineFeedbackService(
  db,
  async (input) => {
    if (String(JSON.stringify(input)).includes("DO_NOT_SEND_FULL_TEXT")) throw new Error("FULL_TEXT_LEAK");
    if (failOnce) {
      failOnce = false;
      throw new Error("fixture model failure");
    }
    return {
      operations: [
        {
          operationId: "a",
          kind: "update_fields",
          nodeId: "s2",
          fields: { summary: "追查假钥匙的来历" },
          reason: "承接本章发现",
          dependsOn: [],
        },
        {
          operationId: "b",
          kind: "update_fields",
          nodeId: "s3",
          fields: { purpose: "揭示幕后买家" },
          reason: "推进后续任务",
          dependsOn: [],
        },
      ],
    };
  },
  (work) => queue.push(work),
);
const drain = async () => {
  while (queue.length) await queue.shift()();
};

const log = [];
const step = async (name, fn) => {
  try {
    const data = await fn();
    log.push({ step: name, ok: true, data });
    console.log("OK", name);
    return data;
  } catch (error) {
    log.push({ step: name, ok: false, error: String(error?.message || error) });
    console.error("FAIL", name, error);
    throw error;
  }
};

// unbound: no entry / no analyzer
await step("unbound_notify_no_run", async () => {
  service.notify("unbound-novel", "no-chapter");
  await drain();
  const count = await db.outlineFeedbackRun.count();
  if (count !== 0) throw new Error("unbound created runs");
  return { runs: count, note: "未绑定小说无反馈入口/不触发分析" };
});

failOnce = true;
await step("failed_run", async () => {
  await service.settings("p", { mode: "chapter" });
  service.notify("n", "c1");
  await drain();
  const run = (await service.status("p")).runs[0];
  if (run.status !== "failed") throw new Error(`expected failed got ${run.status}`);
  return { runId: run.id, status: run.status, error: run.error };
});

await step("retry_to_completed", async () => {
  const failed = (await service.status("p")).runs[0];
  await service.retry("p", failed.id);
  await drain();
  const run = (await service.status("p")).runs[0];
  if (run.status !== "completed") throw new Error(`expected completed got ${run.status}`);
  return { runId: run.id, status: run.status, items: run.items.map((i) => ({ id: i.operationId, status: i.status })) };
});

await step("pending_manual_enqueue", async () => {
  const run = await service.enqueue("p", "c1", "manual-pending");
  if (run.status !== "pending") throw new Error(`expected pending got ${run.status}`);
  // leave one pending visible before drain for UI snapshot state file
  const before = await service.status("p");
  await drain();
  const after = await service.status("p");
  return {
    beforeDrainStatuses: before.runs.map((r) => r.status),
    afterDrain: after.runs.map((r) => ({ id: r.id, status: r.status, items: r.items.length })),
  };
});

const completed = (await service.status("p")).runs.find((r) => r.status === "completed" && r.items.some((i) => i.status === "pending"));
await step("adopt_one", async () => {
  const item = completed.items.find((i) => i.status === "pending");
  await service.decide("p", completed.id, [item.operationId], "adopted");
  const run = (await service.status("p")).runs.find((r) => r.id === completed.id);
  return {
    runId: completed.id,
    items: run.items.map((i) => ({ id: i.operationId, status: i.status })),
    outlineVersion: (await db.outlineProject.findUnique({ where: { id: "p" } })).currentVersion,
  };
});

await step("reject_one", async () => {
  const run0 = (await service.status("p")).runs.find((r) => r.id === completed.id);
  const pending = run0.items.find((i) => i.status === "pending");
  if (!pending) throw new Error("no pending item to reject");
  await service.decide("p", completed.id, [pending.operationId], "rejected");
  const run = (await service.status("p")).runs.find((r) => r.id === completed.id);
  return { items: run.items.map((i) => ({ id: i.operationId, status: i.status })) };
});

const finalStatus = await service.status("p");
const report = {
  label: "A3_API_FIXTURE_HARNESS_NOT_PRODUCT_UI",
  dbPath,
  sourceRoute: finalStatus.sourceRoute,
  settings: finalStatus.settings,
  runs: finalStatus.runs.map((r) => ({
    id: r.id,
    status: r.status,
    error: r.error,
    attempt: r.attempt,
    items: r.items.map((i) => ({ operationId: i.operationId, status: i.status, reason: i.reason })),
  })),
  steps: log,
};
writeFileSync("/opt/cursor/artifacts/acceptance/a3-api-fixture-result.json", JSON.stringify(report, null, 2));

const html = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"/><title>A3 API Fixture Harness（非产品UI）</title>
<style>
body{font-family:ui-sans-serif,system-ui;margin:24px;background:#111;color:#eee}
.banner{background:#7c2d12;padding:12px 16px;border-radius:8px;margin-bottom:16px}
h1{font-size:20px} h2{font-size:16px;margin-top:24px}
.card{background:#1c1c1c;padding:12px 16px;margin:8px 0;border-radius:8px}
.ok{color:#86efac}.fail{color:#fca5a5}.pending{color:#fde68a}
pre{white-space:pre-wrap;font-size:12px;line-height:1.45}
.badge{display:inline-block;padding:2px 8px;border-radius:4px;background:#333;margin-right:6px}
</style></head><body>
<div class="banner"><strong>验收夹具 · 非产品界面</strong> — 客户端未交付 /outlines/:id 大纲反馈面板；本页仅展示隔离 API fixture 的 pending/completed/failed 与采纳/拒绝结果，分析器为确定性 mock，未调用付费模型。</div>
<h1>大纲反馈 API Fixture 面板</h1>
<p>sourceRoute: <code>${finalStatus.sourceRoute}</code> · DB: <code>${dbPath}</code></p>
<h2>Runs</h2>
${finalStatus.runs
  .map(
    (r) => `<div class="card"><span class="badge ${r.status}">${r.status}</span> run <code>${r.id}</code> attempt=${r.attempt}
  ${r.error ? `<div class="fail">error: ${r.error}</div>` : ""}
  <ul>${r.items.map((i) => `<li><span class="badge ${i.status}">${i.status}</span> ${i.operationId}: ${i.reason || ""}</li>`).join("")}</ul>
</div>`,
  )
  .join("")}
<h2>Step log</h2>
<pre>${JSON.stringify(log, null, 2)}</pre>
</body></html>`;
writeFileSync("/opt/cursor/artifacts/acceptance/a3-api-fixture-panel.html", html);

const server = createServer((req, res) => {
  if (req.url === "/" || req.url?.startsWith("/index")) {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(html);
    return;
  }
  if (req.url === "/result.json") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(report));
    return;
  }
  res.writeHead(404);
  res.end("not found");
});
const port = 8765;
server.listen(port, "127.0.0.1", () => {
  console.log(`A3_HARNESS_READY http://127.0.0.1:${port}/`);
  writeFileSync("/opt/cursor/artifacts/acceptance/a3-harness-ready.txt", `http://127.0.0.1:${port}/\n${dbPath}\n`);
});
