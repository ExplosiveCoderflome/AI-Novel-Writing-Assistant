/**
 * Short-story manuscript: API import (reliable) + 1920x1080 browser on /revision.
 * Fixture rewrite proposals marked NOT_REAL_MODEL.
 */
import puppeteer from "/tmp/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js";
import fs from "fs";
import path from "path";
import { createHash, randomUUID } from "crypto";
import { createRequire } from "module";
import { join } from "path";

const out = "/opt/cursor/artifacts/acceptance/screenshots";
fs.mkdirSync(out, { recursive: true });
const log = [];
const note = (m) => {
  log.push(m);
  console.log(m);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sha256 = (s) => createHash("sha256").update(s).digest("hex");
const API = "http://127.0.0.1:3000/api";

async function j(method, url, body) {
  const r = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  if (!r.ok || (data && data.success === false)) {
    throw new Error(`${method} ${url} -> ${r.status} ${typeof data === "string" ? data : JSON.stringify(data)}`);
  }
  return data.data ?? data;
}

const title = `云端短篇原稿修订验收-${Date.now().toString(36)}`;
const pastedText = "第一节：雨\n雨落在窗沿，她没有关窗。\n\n第二节：信\n她拆开信封，纸页空白。";
const requestKey = randomUUID();

note("IMPORT create");
const created = await j("POST", `${API}/manuscripts/imports`, {
  title,
  pastedText,
  encoding: "utf-8",
  narrativeForm: "short_story",
  requestKey,
});
note(`session=${created.sessionId} project=${created.projectId}`);

let session = await j("GET", `${API}/manuscripts/imports/${created.sessionId}`);
note(`session status=${session.status} version=${session.version} units=${session.units?.length}`);

session = await j("POST", `${API}/manuscripts/imports/${created.sessionId}/split`, {
  expectedSessionVersion: session.version,
  sourceHash: session.source.sourceHash,
  mode: "rules",
});
note(`after split status=${session.status} units=${session.units.length} unresolved=${session.coverage?.unresolvedCount}`);

// Confirm all units
const units = session.units.map((u) => ({ ...u, needsReview: false }));
session = await j("PUT", `${API}/manuscripts/imports/${created.sessionId}/partition`, {
  expectedSessionVersion: session.version,
  sourceHash: session.source.sourceHash,
  units,
});
note(`after partition status=${session.status} unresolved=${session.coverage?.unresolvedCount} complete=${session.coverage?.complete}`);

const confirm = await j("POST", `${API}/manuscripts/imports/${created.sessionId}/confirm`, {
  expectedSessionVersion: session.version,
  sourceHash: session.source.sourceHash,
  coverageHash: session.coverage.coverageHash,
  title,
  requestKey: randomUUID(),
});
note(`confirm novelId=${confirm.novelId} projectId=${confirm.projectId}`);

let workspace = await j("GET", `${API}/manuscripts/by-novel/${confirm.novelId}/workspace`);
note(
  `workspace form=${workspace.project.narrativeForm} units=${workspace.units.length} sourceChars=${workspace.source.charCount} title=${workspace.project.title || workspace.source?.originalFileName}`,
);

const require = createRequire("/agent/repos/AI-Novel-Writing-Assistant/server/package.json");
const { PrismaClient } = require("@prisma/client");
const { PrismaBetterSqlite3 } = require("@prisma/adapter-better-sqlite3");

async function withPrisma(fn) {
  const prisma = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: "file:/tmp/ai-novel-ui-Tzbi/ui.db" }) });
  try {
    return await fn(prisma);
  } finally {
    await prisma.$disconnect();
  }
}

async function seedFixture(kindLabel) {
  return withPrisma(async (prisma) => {
    const project = await prisma.manuscriptProject.findUniqueOrThrow({ where: { id: confirm.projectId } });
    const unit = await prisma.manuscriptUnit.findFirstOrThrow({
      where: { projectId: project.id, status: "active" },
      orderBy: { displayOrder: "asc" },
    });
    const seg = await prisma.shortStorySegment.findUniqueOrThrow({ where: { id: unit.segmentId } });
    const proposalId = randomUUID();
    const candidateId = randomUUID();
    const content = `${seg.content}\n【${kindLabel}】`;
    await prisma.manuscriptRevisionProposal.create({
      data: {
        id: proposalId,
        projectId: project.id,
        unitId: unit.id,
        kind: "rewrite",
        status: "pending",
        baseStructureVersion: project.structureVersion,
        baseUnitRevision: unit.workingRevision,
        baseContentHash: unit.contentHash,
        baselineOutlineRevisionId: project.baselineOutlineRevisionId,
        dependenciesJson: JSON.stringify({
          snapshot: {
            structureVersion: project.structureVersion,
            unitRevision: unit.workingRevision,
            contentHash: unit.contentHash,
            baselineRevisionId: project.baselineOutlineRevisionId,
            workingRevisionId: null,
          },
          fixture: true,
          note: "NOT_REAL_MODEL",
        }),
        operationsJson: JSON.stringify({
          candidates: [
            {
              id: candidateId,
              label: `FIXTURE·${kindLabel}（非真模型）`,
              content,
              summary: "验收夹具提案，非付费模型输出。",
              rationale: "确定性预置",
              riskNotes: ["fixture 不是真模型"],
              semanticTags: ["fixture"],
              diffChunks: [
                { type: "equal", text: seg.content },
                { type: "insert", text: `\n【${kindLabel}】` },
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
    return { proposalId, candidateId, unitId: unit.id, projectId: project.id };
  });
}

const results = {
  title,
  novelId: confirm.novelId,
  projectId: confirm.projectId,
  import: { sessionId: created.sessionId, units: workspace.units.map((u) => ({ id: u.id, title: u.title, displayOrder: u.displayOrder })) },
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
  await sleep(300);
};
const shot = async (name) => {
  const file = path.join(out, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  note(`SHOT ${name} ${page.url()}`);
};
const text = async () => page.evaluate(() => document.body.innerText);
const click = async (substr) =>
  page.evaluate((substr) => {
    const el = [...document.querySelectorAll("button,a")].find((b) => (b.textContent || "").replace(/\s+/g, " ").trim().includes(substr));
    el?.click();
    return !!el;
  }, substr);

// Contrast: short story studio vs revision
await page.goto(`http://127.0.0.1:5173/novels/${confirm.novelId}/story`, { waitUntil: "networkidle2" });
await sleep(1500);
await dismiss();
let t = await text();
results.studioUrl = page.url();
results.studioLooksLikeStudio = t.includes("预览修改范围") || t.includes("直接编辑") || t.includes("用一句话修改");
await shot("ms-studio-contrast-NOT-revision");

await page.goto(`http://127.0.0.1:5173/novels/${confirm.novelId}/revision`, { waitUntil: "networkidle2" });
await sleep(2500);
await dismiss();
t = await text();
results.revisionUrl = page.url();
results.isRevisionPage = page.url().includes("/revision") && (t.includes("原稿修订") || t.includes("与原稿对照") || t.includes("保存当前手改"));
results.revisionSnippet = t.replace(/\n+/g, " | ").slice(0, 800);
await shot("ms-04-revision-workspace");

if (!results.isRevisionPage) {
  note("FAIL not on revision page");
  fs.writeFileSync("/opt/cursor/artifacts/acceptance/manuscript-browser-results.json", JSON.stringify(results, null, 2));
  await browser.close();
  process.exit(2);
}

await click("与原稿对照");
await sleep(1000);
t = await text();
results.compareOk = t.includes("原稿，只读") || t.includes("当前工作稿");
await shot("ms-05-original-compare");

await click("当前稿");
await sleep(500);

// Manual edit: use React-friendly setter on contenteditable
const edited = await page.evaluate(() => {
  const editable = document.querySelector('[contenteditable="true"]');
  if (!editable) return { ok: false, reason: "no contenteditable" };
  editable.focus();
  const sel = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(editable);
  range.collapse(false);
  sel.removeAllRanges();
  sel.addRange(range);
  const ok = document.execCommand("insertText", false, "\n【手改验收行】");
  return { ok, len: (editable.textContent || "").length, hasMarker: (editable.textContent || "").includes("【手改验收行】") };
});
note(`manual edit ${JSON.stringify(edited)}`);
await sleep(500);
const saveClicked = await click("保存当前手改");
note(`saveClicked=${saveClicked}`);
await sleep(3500);
await dismiss();
await shot("ms-06-after-manual-save");

workspace = await j("GET", `${API}/manuscripts/by-novel/${confirm.novelId}/workspace`);
results.manualSaveDb = {
  contentHasMarker: (workspace.currentUnit?.content || "").includes("【手改验收行】"),
  workingRevision: workspace.currentUnit?.workingRevision,
};
note(`manualSaveDb ${JSON.stringify(results.manualSaveDb)}`);

const exportRes = await fetch(`${API}/manuscripts/${confirm.projectId}/novel-export`);
const exportText = await exportRes.text();
results.export = {
  status: exportRes.status,
  length: exportText.length,
  includesManual: exportText.includes("【手改验收行】"),
  preview: exportText.slice(0, 180),
};
note(`export ${JSON.stringify(results.export)}`);

// Seed fixture adopt
const adoptSeed = await seedFixture("FIXTURE候选·非真模型");
results.fixtureAdoptSeed = { ...adoptSeed, note: "FIXTURE_NOT_REAL_MODEL" };
await page.goto(`http://127.0.0.1:5173/novels/${confirm.novelId}/revision?unitId=${adoptSeed.unitId}`, { waitUntil: "networkidle2" });
await sleep(2500);
await dismiss();
t = await text();
results.fixtureVisible = t.includes("FIXTURE") || t.includes("非真模型");
await shot("ms-07-fixture-proposal-pending");
await click("采纳并保存本章");
await sleep(3500);
await dismiss();
await shot("ms-08-fixture-after-adopt");
results.fixtureAdoptDb = await withPrisma(async (prisma) => {
  const prop = await prisma.manuscriptRevisionProposal.findUnique({ where: { id: adoptSeed.proposalId } });
  const unit = await prisma.manuscriptUnit.findUnique({ where: { id: adoptSeed.unitId } });
  const seg = await prisma.shortStorySegment.findUnique({ where: { id: unit.segmentId } });
  return { status: prop.status, contentHasFixture: (seg.content || "").includes("【FIXTURE候选·非真模型】") };
});
note(`adoptDb ${JSON.stringify(results.fixtureAdoptDb)}`);

await click("撤回最新采纳");
await sleep(3500);
await dismiss();
await shot("ms-09-fixture-after-undo");
results.fixtureUndoDb = await withPrisma(async (prisma) => {
  const prop = await prisma.manuscriptRevisionProposal.findUnique({ where: { id: adoptSeed.proposalId } });
  const undo = await prisma.manuscriptRevisionProposal.findFirst({
    where: { projectId: adoptSeed.projectId, kind: "undo" },
    orderBy: { createdAt: "desc" },
  });
  const unit = await prisma.manuscriptUnit.findUnique({ where: { id: adoptSeed.unitId } });
  const seg = await prisma.shortStorySegment.findUnique({ where: { id: unit.segmentId } });
  return {
    originalStatus: prop.status,
    undoId: undo?.id || null,
    contentHasFixture: (seg.content || "").includes("【FIXTURE候选·非真模型】"),
  };
});
note(`undoDb ${JSON.stringify(results.fixtureUndoDb)}`);

// Reject path
const rejectSeed = await seedFixture("应被拒绝");
await page.goto(`http://127.0.0.1:5173/novels/${confirm.novelId}/revision?unitId=${rejectSeed.unitId}`, { waitUntil: "networkidle2" });
await sleep(2500);
await dismiss();
await shot("ms-10-fixture-reject-candidate");
await click("放弃候选");
await sleep(2500);
await dismiss();
await shot("ms-11-fixture-after-reject");
results.fixtureRejectDb = await withPrisma(async (prisma) => {
  const prop = await prisma.manuscriptRevisionProposal.findUnique({ where: { id: rejectSeed.proposalId } });
  return { status: prop.status };
});
note(`rejectDb ${JSON.stringify(results.fixtureRejectDb)}`);

// Pen name re-shot with explicit novel cover targeting via API confirm
await page.goto("http://127.0.0.1:5173/novels/cmwewu6wd00008wjsphcy0q1y/edit", { waitUntil: "networkidle2" });
await sleep(1800);
await dismiss();
await page.evaluate(() => document.querySelector("#basic-pen-name")?.scrollIntoView({ block: "center" }));
await sleep(400);
results.penNameField = await page.$eval("#basic-pen-name", (el) => el.value).catch(() => null);
await shot("penname-01-field-1920");

// Open cover from novel preview/workspace that is the penName novel
await page.goto("http://127.0.0.1:5173/novels", { waitUntil: "networkidle2" });
await sleep(1200);
await dismiss();
const coverOpen = await page.evaluate(() => {
  const cards = [...document.querySelectorAll("article,li,div")].filter((el) => (el.textContent || "").includes("云端验收封面笔名") && el.querySelector('button[aria-label="生成封面"]'));
  // pick smallest containing card
  cards.sort((a, b) => a.textContent.length - b.textContent.length);
  const btn = cards[0]?.querySelector('button[aria-label="生成封面"]');
  btn?.click();
  return { found: !!btn, cardCount: cards.length };
});
note(`coverOpen ${JSON.stringify(coverOpen)}`);
await sleep(1500);
t = await text();
results.penNameCoverMsg = t.match(/本张封面会写入作者笔名：[^\n]+|当前未填写作者笔名[^\n]+/)?.[0] || t.replace(/\n+/g, " | ").slice(0, 300);
await shot("penname-02-cover-dialog-1920");

await browser.close();
fs.writeFileSync("/opt/cursor/artifacts/acceptance/manuscript-browser-results.json", JSON.stringify(results, null, 2));
fs.writeFileSync("/opt/cursor/artifacts/acceptance/manuscript-browser-log.txt", log.join("\n") + "\n");
note("DONE");
console.log(JSON.stringify(results, null, 2));
