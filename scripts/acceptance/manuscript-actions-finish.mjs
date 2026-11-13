/**
 * Finish manuscript acceptance: API manual-save + restore_original (deterministic)
 * + properly snapshotted FIXTURE rewrite for adopt/reject. Screenshots 1920x1080.
 */
import puppeteer from "/tmp/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js";
import fs from "fs";
import path from "path";
import { createHash, randomUUID } from "crypto";
import { createRequire } from "module";
import { join } from "path";

const novelId = "cmwexl5vx001669jsj42m21ys";
const projectId = "03f81d18-187f-45f7-b9ef-e985ed031777";
const unitId = "2cbcc637-db13-4d0f-9a6b-1028d1002a9f";
const out = "/opt/cursor/artifacts/acceptance/screenshots";
const API = "http://127.0.0.1:3000/api";
const log = [];
const note = (m) => {
  log.push(m);
  console.log(m);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sha256 = (s) => createHash("sha256").update(s).digest("hex");

async function j(method, url, body) {
  const r = await fetch(url, {
    method,
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }
  if (!r.ok || data.success === false) throw new Error(`${method} ${url} ${r.status} ${text.slice(0, 500)}`);
  return data.data ?? data;
}

let ws = await j("GET", `${API}/manuscripts/by-novel/${novelId}/workspace?unitId=${unitId}`);
const unit = ws.currentUnit;
const project = ws.project;
note(`before save rev=${unit.workingRevision} hash=${unit.contentHash} content=${JSON.stringify(unit.content)}`);

const manualContent = `${unit.content}\n【手改验收行】`;
const saveReceipt = await j("POST", `${API}/manuscripts/${projectId}/units/${unitId}/manual-save`, {
  expectedStructureVersion: project.structureVersion,
  baseUnitRevision: unit.workingRevision,
  baseContentHash: unit.contentHash,
  baselineOutlineRevisionId: project.baselineOutlineRevisionId,
  baseWorkingOutlineRevisionId: project.workingOutlineRevisionId ?? null,
  requestKey: randomUUID(),
  content: manualContent,
});
note(`manualSave receipt=${JSON.stringify(saveReceipt)}`);

ws = await j("GET", `${API}/manuscripts/by-novel/${novelId}/workspace?unitId=${unitId}`);
note(`after save marker=${(ws.currentUnit.content || "").includes("【手改验收行】")} rev=${ws.currentUnit.workingRevision}`);

const exportText = await (await fetch(`${API}/manuscripts/${projectId}/novel-export`)).text();
note(`export includesManual=${exportText.includes("【手改验收行】")} len=${exportText.length}`);

// Deterministic restore_original proposal (product path, no model)
const restoreProposal = await j("POST", `${API}/manuscripts/${projectId}/units/${unitId}/restore-original-preview`, {
  expectedStructureVersion: ws.project.structureVersion,
  baseUnitRevision: ws.currentUnit.workingRevision,
  baseContentHash: ws.currentUnit.contentHash,
  baselineOutlineRevisionId: ws.project.baselineOutlineRevisionId,
  baseWorkingOutlineRevisionId: ws.project.workingOutlineRevisionId ?? null,
  requestKey: randomUUID(),
});
note(`restoreProposal id=${restoreProposal.id} status=${restoreProposal.status} candidates=${restoreProposal.candidates?.length} label=${restoreProposal.candidates?.[0]?.label}`);

const require = createRequire("/agent/repos/AI-Novel-Writing-Assistant/server/package.json");
const { PrismaClient } = require("@prisma/client");
const { PrismaBetterSqlite3 } = require("@prisma/adapter-better-sqlite3");
const { takeManuscriptSnapshot } = require(join("/agent/repos/AI-Novel-Writing-Assistant/server", "dist/modules/novel/manuscript/application/ManuscriptWorkspaceService"));

async function withPrisma(fn) {
  const prisma = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: "file:/tmp/ai-novel-ui-Tzbi/ui.db" }) });
  try {
    return await fn(prisma);
  } finally {
    await prisma.$disconnect();
  }
}

const results = {
  novelId,
  projectId,
  unitId,
  manualSave: { receipt: saveReceipt, contentHasMarker: (ws.currentUnit.content || "").includes("【手改验收行】") },
  exportIncludesManual: exportText.includes("【手改验收行】"),
  restoreProposal: { id: restoreProposal.id, status: restoreProposal.status, note: "product restore_original deterministic, not paid model" },
};

const browser = await puppeteer.launch({
  executablePath: "/usr/bin/google-chrome-stable",
  headless: true,
  args: ["--no-sandbox", "--disable-gpu", "--window-size=1920,1080"],
  defaultViewport: { width: 1920, height: 1080 },
});
const page = await browser.newPage();
page.setDefaultTimeout(60000);
const dismiss = async () => {
  await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => (b.textContent || "").trim() === "关闭")?.click());
  await sleep(250);
};
const shot = async (name) => {
  const file = path.join(out, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  note(`SHOT ${name}`);
};
const text = async () => page.evaluate(() => document.body.innerText);
const clickEnabled = async (substr) =>
  page.evaluate((substr) => {
    const btn = [...document.querySelectorAll("button")].find((b) => (b.textContent || "").includes(substr) && !b.disabled);
    if (!btn) {
      const any = [...document.querySelectorAll("button")].find((b) => (b.textContent || "").includes(substr));
      return { ok: false, disabled: !!any?.disabled, found: !!any };
    }
    btn.click();
    return { ok: true };
  }, substr);

await page.goto(`http://127.0.0.1:5173/novels/${novelId}/revision?unitId=${unitId}`, { waitUntil: "networkidle2" });
await sleep(2500);
await dismiss();
let t = await text();
results.afterManualSaveUi = {
  hasMarker: t.includes("【手改验收行】"),
  hasRestoreCandidate: t.includes("恢复导入时原稿") || t.includes("恢复"),
  snippet: t.replace(/\n+/g, " | ").slice(0, 600),
};
await shot("ms-06b-manual-saved-and-restore-candidate");

// Adopt restore
let clickRes = await clickEnabled("采纳并保存本章");
note(`adopt restore click=${JSON.stringify(clickRes)}`);
await sleep(3500);
await dismiss();
t = await text();
results.afterRestoreAdoptUi = { msg: t.includes("候选已采纳") || t.includes("已采纳"), hasMarker: t.includes("【手改验收行】") };
await shot("ms-08b-after-restore-adopt");
results.afterRestoreAdoptDb = await withPrisma(async (prisma) => {
  const prop = await prisma.manuscriptRevisionProposal.findUnique({ where: { id: restoreProposal.id } });
  const u = await prisma.manuscriptUnit.findUnique({ where: { id: unitId } });
  const seg = await prisma.shortStorySegment.findUnique({ where: { id: u.segmentId } });
  return { status: prop.status, contentHasMarker: (seg.content || "").includes("【手改验收行】"), contentPreview: (seg.content || "").slice(0, 80) };
});
note(`adoptDb ${JSON.stringify(results.afterRestoreAdoptDb)}`);

clickRes = await clickEnabled("撤回最新采纳");
note(`undo click=${JSON.stringify(clickRes)}`);
await sleep(3500);
await dismiss();
await shot("ms-09b-after-undo");
results.afterUndoDb = await withPrisma(async (prisma) => {
  const prop = await prisma.manuscriptRevisionProposal.findUnique({ where: { id: restoreProposal.id } });
  const undo = await prisma.manuscriptRevisionProposal.findFirst({ where: { projectId, kind: "undo" }, orderBy: { createdAt: "desc" } });
  const u = await prisma.manuscriptUnit.findUnique({ where: { id: unitId } });
  const seg = await prisma.shortStorySegment.findUnique({ where: { id: u.segmentId } });
  return { originalStatus: prop.status, undoId: undo?.id || null, contentHasMarker: (seg.content || "").includes("【手改验收行】") };
});
note(`undoDb ${JSON.stringify(results.afterUndoDb)}`);

// Seed FIXTURE rewrite with exact snapshot
const fixture = await withPrisma(async (prisma) => {
  const snapshot = await takeManuscriptSnapshot(prisma, projectId, unitId);
  const u = await prisma.manuscriptUnit.findUniqueOrThrow({ where: { id: unitId } });
  const seg = await prisma.shortStorySegment.findUniqueOrThrow({ where: { id: u.segmentId } });
  const proposalId = randomUUID();
  const candidateId = randomUUID();
  const content = `${seg.content}\n【FIXTURE候选·非真模型】`;
  await prisma.manuscriptRevisionProposal.create({
    data: {
      id: proposalId,
      projectId,
      unitId,
      kind: "rewrite",
      status: "pending",
      baseStructureVersion: snapshot.structureVersion,
      baseUnitRevision: snapshot.unitRevision,
      baseContentHash: snapshot.contentHash,
      baselineOutlineRevisionId: snapshot.baselineRevisionId,
      baseWorkingOutlineRevisionId: snapshot.workingRevisionId,
      dependenciesJson: JSON.stringify({ snapshot, fixture: true, note: "NOT_REAL_MODEL" }),
      operationsJson: JSON.stringify({
        candidates: [
          {
            id: candidateId,
            label: "FIXTURE候选（非真模型）",
            content,
            summary: "验收夹具提案，非付费模型输出。",
            rationale: "确定性预置",
            riskNotes: ["fixture 不是真模型"],
            semanticTags: ["fixture"],
            diffChunks: [
              { type: "equal", text: seg.content },
              { type: "insert", text: "\n【FIXTURE候选·非真模型】" },
            ],
          },
        ],
      }),
      requestKey: `fixture-${proposalId}`,
      payloadHash: sha256(`fixture-${proposalId}`),
      promptId: "fixture.not_real_model",
      promptVersion: "fixture",
    },
  });
  return { proposalId, candidateId, snapshot };
});
results.fixtureSeed = { proposalId: fixture.proposalId, note: "FIXTURE_NOT_REAL_MODEL", snapshotKeys: Object.keys(fixture.snapshot) };

await page.goto(`http://127.0.0.1:5173/novels/${novelId}/revision?unitId=${unitId}`, { waitUntil: "networkidle2" });
await sleep(2500);
await dismiss();
t = await text();
results.fixtureUi = {
  visible: t.includes("FIXTURE"),
  staleWarning: t.includes("不能直接覆盖"),
  pendingOk: t.includes("FIXTURE") && !t.includes("不能直接覆盖"),
};
await shot("ms-07b-fixture-pending-valid");

clickRes = await clickEnabled("采纳并保存本章");
note(`fixture adopt click=${JSON.stringify(clickRes)}`);
await sleep(3500);
await dismiss();
await shot("ms-08c-fixture-adopt");
results.fixtureAdoptDb = await withPrisma(async (prisma) => {
  const prop = await prisma.manuscriptRevisionProposal.findUnique({ where: { id: fixture.proposalId } });
  const u = await prisma.manuscriptUnit.findUnique({ where: { id: unitId } });
  const seg = await prisma.shortStorySegment.findUnique({ where: { id: u.segmentId } });
  return { status: prop.status, hasFixtureContent: (seg.content || "").includes("【FIXTURE候选·非真模型】") };
});
note(`fixtureAdoptDb ${JSON.stringify(results.fixtureAdoptDb)}`);

clickRes = await clickEnabled("撤回最新采纳");
note(`fixture undo click=${JSON.stringify(clickRes)}`);
await sleep(3500);
await dismiss();
await shot("ms-09c-fixture-undo");
results.fixtureUndoDb = await withPrisma(async (prisma) => {
  const prop = await prisma.manuscriptRevisionProposal.findUnique({ where: { id: fixture.proposalId } });
  const u = await prisma.manuscriptUnit.findUnique({ where: { id: unitId } });
  const seg = await prisma.shortStorySegment.findUnique({ where: { id: u.segmentId } });
  return { status: prop.status, stillHasFixture: (seg.content || "").includes("【FIXTURE候选·非真模型】") };
});
note(`fixtureUndoDb ${JSON.stringify(results.fixtureUndoDb)}`);

// Reject path: seed another valid fixture
const rejectSeed = await withPrisma(async (prisma) => {
  const snapshot = await takeManuscriptSnapshot(prisma, projectId, unitId);
  const u = await prisma.manuscriptUnit.findUniqueOrThrow({ where: { id: unitId } });
  const seg = await prisma.shortStorySegment.findUniqueOrThrow({ where: { id: u.segmentId } });
  const proposalId = randomUUID();
  const candidateId = randomUUID();
  await prisma.manuscriptRevisionProposal.create({
    data: {
      id: proposalId,
      projectId,
      unitId,
      kind: "rewrite",
      status: "pending",
      baseStructureVersion: snapshot.structureVersion,
      baseUnitRevision: snapshot.unitRevision,
      baseContentHash: snapshot.contentHash,
      baselineOutlineRevisionId: snapshot.baselineRevisionId,
      baseWorkingOutlineRevisionId: snapshot.workingRevisionId,
      dependenciesJson: JSON.stringify({ snapshot, fixture: true, note: "NOT_REAL_MODEL" }),
      operationsJson: JSON.stringify({
        candidates: [
          {
            id: candidateId,
            label: "FIXTURE待拒绝（非真模型）",
            content: `${seg.content}\n【应被拒绝】`,
            summary: "夹具拒绝路径",
            rationale: "fixture",
            riskNotes: ["fixture"],
            semanticTags: ["fixture"],
            diffChunks: [{ type: "insert", text: "\n【应被拒绝】" }],
          },
        ],
      }),
      requestKey: `fixture-reject-${proposalId}`,
      payloadHash: sha256(`fixture-reject-${proposalId}`),
      promptId: "fixture.not_real_model",
      promptVersion: "fixture",
    },
  });
  return { proposalId };
});

await page.goto(`http://127.0.0.1:5173/novels/${novelId}/revision?unitId=${unitId}`, { waitUntil: "networkidle2" });
await sleep(2500);
await dismiss();
await shot("ms-10b-fixture-reject-pending");
clickRes = await clickEnabled("放弃候选");
note(`reject click=${JSON.stringify(clickRes)}`);
await sleep(2500);
await dismiss();
await shot("ms-11b-fixture-after-reject");
results.fixtureRejectDb = await withPrisma(async (prisma) => {
  const prop = await prisma.manuscriptRevisionProposal.findUnique({ where: { id: rejectSeed.proposalId } });
  return { status: prop.status };
});
note(`rejectDb ${JSON.stringify(results.fixtureRejectDb)}`);

await browser.close();
fs.writeFileSync("/opt/cursor/artifacts/acceptance/manuscript-actions-results.json", JSON.stringify(results, null, 2));
fs.writeFileSync("/opt/cursor/artifacts/acceptance/manuscript-actions-log.txt", log.join("\n") + "\n");
console.log(JSON.stringify(results, null, 2));
