/**
 * 1920x1080 isolated browser re-verification.
 * Marks A3 product panel as ABSENT; harness panel is fixture-only.
 * Manuscript revision uses real product UI + optional fixture rewrite proposal.
 */
import puppeteer from "/tmp/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js";
import fs from "fs";
import path from "path";
import { createHash, randomUUID } from "crypto";
import { createRequire } from "module";
import { createServer } from "http";

const out = "/opt/cursor/artifacts/acceptance/screenshots";
fs.mkdirSync(out, { recursive: true });
const log = [];
const note = (msg) => {
  log.push(`[${new Date().toISOString()}] ${msg}`);
  console.log(msg);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sha256 = (s) => createHash("sha256").update(s).digest("hex");

const browser = await puppeteer.launch({
  executablePath: "/usr/bin/google-chrome-stable",
  headless: true,
  args: ["--no-sandbox", "--disable-gpu", "--window-size=1920,1080"],
  defaultViewport: { width: 1920, height: 1080 },
});
const page = await browser.newPage();
page.setDefaultTimeout(60000);

async function dismiss() {
  await page.evaluate(() => {
    const close = [...document.querySelectorAll("button")].find((b) => (b.textContent || "").trim() === "关闭");
    close?.click();
  });
  await sleep(350);
}
async function shot(name) {
  const file = path.join(out, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  note(`SHOT ${name} url=${page.url()} -> ${file}`);
  return file;
}
async function bodyText() {
  return page.evaluate(() => document.body.innerText);
}
async function clickText(substr, exact = false) {
  const ok = await page.evaluate(
    ({ substr, exact }) => {
      const btn = [...document.querySelectorAll("button,a,label,[role='button']")].find((el) => {
        const t = (el.textContent || "").replace(/\s+/g, " ").trim();
        return exact ? t === substr : t.includes(substr);
      });
      if (!btn) return false;
      btn.click();
      return true;
    },
    { substr, exact },
  );
  note(`CLICK ${substr} ok=${ok}`);
  return ok;
}

const results = {
  a3: {},
  manuscript: {},
  penName: {},
};

// ========== A3 correction ==========
await page.goto("http://127.0.0.1:5173/outlines", { waitUntil: "networkidle2" });
await sleep(1200);
await dismiss();
let t = await bodyText();
results.a3.outlinesListUrl = page.url();
results.a3.outlinesListHasFeedbackPanel = /大纲反馈|逐项采纳|FeedbackRun|text_feedback|采纳建议/.test(t);
await shot("a3-01-outlines-list");

const outlineId = "ac7aeac7-018b-4047-a9f2-0dee8c548be4";
await page.goto(`http://127.0.0.1:5173/outlines/${outlineId}`, { waitUntil: "networkidle2" });
await sleep(1800);
await dismiss();
t = await bodyText();
results.a3.outlineWorkspaceUrl = page.url();
results.a3.outlineWorkspaceSnippet = t.replace(/\n+/g, " | ").slice(0, 500);
results.a3.outlineWorkspaceHasFeedbackPanel = /大纲反馈|逐项采纳|FeedbackRun|章节反馈|采纳并|拒绝建议/.test(t);
results.a3.productPanelVerdict =
  "ABSENT: client has no outline feedback panel; /outlines/:id is OutlineWorkspace only";
await shot("a3-02-outline-workspace-NO-feedback-panel");

// Prior mislabeled ui-13 URL
const chapterUrl =
  "http://127.0.0.1:5173/novels/cmwewu6wd00008wjsphcy0q1y/chapters/cmwewuiab00009jjs12rjaqo6";
await page.goto(chapterUrl, { waitUntil: "networkidle2" });
await sleep(1800);
await dismiss();
t = await bodyText();
results.a3.priorUi13Url = chapterUrl;
results.a3.priorUi13IsChapterEditor = page.url().includes("/chapters/") && t.includes("首要问题");
results.a3.priorUi13HasPendingZero = t.includes("待处理 0");
results.a3.priorUi13IsOutlineFeedback = false;
await shot("a3-03-prior-ui13-was-chapter-editor");

// Unbound novel: no feedback entry
await page.goto("http://127.0.0.1:5173/novels/cmwewu6wd00008wjsphcy0q1y/edit", { waitUntil: "networkidle2" });
await sleep(1500);
await dismiss();
t = await bodyText();
results.a3.unboundNovelUrl = page.url();
results.a3.unboundHasFeedbackEntry = /大纲反馈|章节反馈入口|逐项采纳/.test(t);
await shot("a3-04-unbound-novel-no-feedback-entry");

// Fixture harness panel (NOT product UI)
await page.goto("http://127.0.0.1:8765/", { waitUntil: "networkidle2" });
await sleep(800);
t = await bodyText();
results.a3.harnessUrl = page.url();
results.a3.harnessIsFixtureNotProduct = t.includes("非产品");
results.a3.harnessShowsFailed = t.includes("failed");
results.a3.harnessShowsCompleted = t.includes("completed");
results.a3.harnessShowsAdopted = t.includes("adopted");
results.a3.harnessShowsRejected = t.includes("rejected");
results.a3.harnessShowsPendingOrUnbound = t.includes("未绑定");
await shot("a3-05-api-fixture-harness-panel-NOT-product");

// ========== Pen name ==========
await page.goto("http://127.0.0.1:5173/novels/cmwewu6wd00008wjsphcy0q1y/edit", { waitUntil: "networkidle2" });
await sleep(1800);
await dismiss();
await page.evaluate(() => document.querySelector("#basic-pen-name")?.scrollIntoView({ block: "center" }));
await sleep(300);
const pen = await page.$eval("#basic-pen-name", (el) => el.value).catch(() => null);
results.penName.fieldValue = pen;
results.penName.url = page.url();
await shot("penname-01-field-1920");

await page.goto("http://127.0.0.1:5173/novels", { waitUntil: "networkidle2" });
await sleep(1200);
await dismiss();
await page.evaluate(() => {
  const covers = [...document.querySelectorAll('button[aria-label="生成封面"]')];
  const preferred = covers.find((btn) => {
    let root = btn;
    for (let i = 0; i < 12 && root; i++) {
      if ((root.textContent || "").includes("云端验收封面笔名")) return true;
      root = root.parentElement;
    }
    return false;
  });
  (preferred || covers.at(-1))?.click();
});
await sleep(1200);
t = await bodyText();
results.penName.coverMsg = t.match(/本张封面会写入作者笔名：[^\n]+|当前未填写作者笔名[^\n]+/)?.[0] || null;
await shot("penname-02-cover-dialog-1920");

// ========== Manuscript revision ==========
await page.goto("http://127.0.0.1:5173/novels", { waitUntil: "networkidle2" });
await sleep(1000);
await dismiss();
t = await bodyText();
results.manuscript.importEntryVisible = t.includes("导入原稿修订") || (await page.$('a[href="/novels/import-manuscript"]')) != null;
await shot("ms-01-novel-list-flag-on");

await page.goto("http://127.0.0.1:5173/novels/import-manuscript", { waitUntil: "networkidle2" });
await sleep(1500);
await dismiss();
t = await bodyText();
results.manuscript.importPageEnabled = t.includes("建立一份可追溯的修订副本") && !t.includes("原稿修订入口未开启");
await shot("ms-02-import-page");

// Fill form
await page.select("select.manuscript-field", "short_story").catch(async () => {
  await page.evaluate(() => {
    const sel = [...document.querySelectorAll("select")].find((s) => [...s.options].some((o) => o.value === "short_story"));
    if (sel) {
      sel.value = "short_story";
      sel.dispatchEvent(new Event("change", { bubbles: true }));
    }
  });
});
await page.click('input[placeholder="为修订副本取个名字"]', { clickCount: 3 });
await page.type('input[placeholder="为修订副本取个名字"]', "云端短篇原稿修订验收");
await clickText("粘贴全文");
await sleep(300);
await page.focus('textarea[aria-label="原稿全文"]');
await page.evaluate(() => {
  const ta = document.querySelector('textarea[aria-label="原稿全文"]');
  if (ta) {
    ta.value = "第一节：雨\n雨落在窗沿，她没有关窗。\n\n第二节：信\n她拆开信封，纸页空白。";
    ta.dispatchEvent(new Event("input", { bubbles: true }));
  }
});
await sleep(300);
await clickText("识别目录与分章");
await sleep(5000);
await dismiss();
t = await bodyText();
results.manuscript.afterSplitSnippet = t.replace(/\n+/g, " | ").slice(0, 600);
await shot("ms-03-after-split");

await clickText("确认全部区域");
await sleep(500);
await clickText("校验并保存分章");
await sleep(3000);
await dismiss();
await page.evaluate(() => {
  const boxes = [...document.querySelectorAll('input[type="checkbox"]')];
  const final = boxes.find((b) => (b.parentElement?.textContent || "").includes("确认全量分章"));
  if (final && !final.disabled) {
    final.checked = true;
    final.dispatchEvent(new Event("change", { bubbles: true }));
    final.click();
  }
});
await sleep(400);
await clickText("创建修订副本");
await sleep(5000);
await dismiss();
results.manuscript.afterCreateUrl = page.url();
t = await bodyText();
results.manuscript.isRevisionPage =
  page.url().includes("/revision") && (t.includes("原稿修订") || t.includes("与原稿对照") || t.includes("保存当前手改"));
results.manuscript.isShortStoryStudio = page.url().includes("/story") || t.includes("短篇工作室") || t.includes("预览修改范围");
results.manuscript.revisionSnippet = t.replace(/\n+/g, " | ").slice(0, 700);
await shot("ms-04-revision-workspace");

if (results.manuscript.isRevisionPage) {
  await clickText("与原稿对照", true);
  await sleep(900);
  t = await bodyText();
  results.manuscript.compareShowsOriginal = t.includes("原稿，只读") || t.includes("当前工作稿");
  await shot("ms-05-original-compare");

  await clickText("当前稿", true);
  await sleep(500);
  // Manual edit via contenteditable / chapter editor
  await page.evaluate(() => {
    const editable = document.querySelector('[contenteditable="true"]') || document.querySelector("textarea:not([readonly])");
    if (!editable) return;
    if ("value" in editable) {
      editable.focus();
      editable.value = `${editable.value}\n【手改验收行】`;
      editable.dispatchEvent(new Event("input", { bubbles: true }));
    } else {
      editable.focus();
      const text = `${editable.textContent || ""}\n【手改验收行】`;
      editable.textContent = text;
      editable.dispatchEvent(new InputEvent("input", { bubbles: true, data: "【手改验收行】" }));
    }
  });
  await sleep(600);
  await clickText("保存当前手改");
  await sleep(3000);
  await dismiss();
  t = await bodyText();
  results.manuscript.manualSaveSnippet = t.replace(/\n+/g, " | ").slice(0, 500);
  await shot("ms-06-after-manual-save");

  // Export via API (product has novel-export endpoint; capture response)
  const novelId = page.url().match(/\/novels\/([^/]+)\/revision/)?.[1];
  results.manuscript.novelId = novelId;
  if (novelId) {
    const ws = await page.evaluate(async (id) => {
      const r = await fetch(`/api/manuscripts/by-novel/${id}/workspace`);
      return r.json();
    }, novelId);
    results.manuscript.workspaceProjectId = ws?.data?.project?.id;
    results.manuscript.dbConfirm = {
      narrativeForm: ws?.data?.project?.narrativeForm,
      unitCount: ws?.data?.units?.length,
      hasSource: !!ws?.data?.source,
      currentContentHasManual: (ws?.data?.currentUnit?.content || "").includes("【手改验收行】"),
    };
    if (ws?.data?.project?.id) {
      const exportText = await page.evaluate(async (projectId) => {
        const r = await fetch(`/api/manuscripts/${projectId}/novel-export`);
        return { status: r.status, text: await r.text() };
      }, ws.data.project.id);
      results.manuscript.export = {
        status: exportText.status,
        includesManual: exportText.text.includes("【手改验收行】"),
        length: exportText.text.length,
        preview: exportText.text.slice(0, 200),
      };
      note(`EXPORT status=${exportText.status} len=${exportText.text.length}`);
    }
  }
}

await browser.close();

// ========== Seed fixture rewrite proposal (not real model) + second browser pass for adopt/undo ==========
const require = createRequire("/agent/repos/AI-Novel-Writing-Assistant/server/package.json");
const { PrismaClient } = require("@prisma/client");
const { PrismaBetterSqlite3 } = require("@prisma/adapter-better-sqlite3");
const Database = require("better-sqlite3");

async function seedFixtureProposal(novelId) {
  process.env.DATABASE_URL = "file:/tmp/ai-novel-ui-Tzbi/ui.db";
  process.env.AI_NOVEL_DATABASE_MODE = "sqlite";
  // Use raw sqlite + prisma adapter against same UI DB
  const prisma = new PrismaClient({
    adapter: new PrismaBetterSqlite3({ url: "file:/tmp/ai-novel-ui-Tzbi/ui.db" }),
  });
  try {
    const project = await prisma.manuscriptProject.findFirst({ where: { novelId } });
    if (!project) throw new Error("no manuscript project");
    const unit = await prisma.manuscriptUnit.findFirst({ where: { projectId: project.id, status: "active" }, orderBy: { displayOrder: "asc" } });
    if (!unit) throw new Error("no unit");
    const segment = unit.segmentId ? await prisma.shortStorySegment.findUnique({ where: { id: unit.segmentId } }) : null;
    const content = segment?.content ?? "";
    const fixtureContent = `${content}\n【FIXTURE候选·非真模型】`;
    const snapshot = {
      structureVersion: project.structureVersion,
      unitRevision: unit.workingRevision,
      contentHash: unit.contentHash,
      baselineRevisionId: project.baselineOutlineRevisionId,
      workingRevisionId: null,
    };
    // simple word-level diff chunks
    const diffChunks = [
      { type: "equal", text: content },
      { type: "insert", text: "\n【FIXTURE候选·非真模型】" },
    ];
    const candidateId = randomUUID();
    const proposalId = randomUUID();
    const requestKey = `fixture-${proposalId}`;
    await prisma.manuscriptRevisionProposal.create({
      data: {
        id: proposalId,
        projectId: project.id,
        unitId: unit.id,
        kind: "rewrite",
        status: "pending",
        baseStructureVersion: snapshot.structureVersion,
        baseUnitRevision: snapshot.unitRevision,
        baseContentHash: snapshot.contentHash,
        baselineOutlineRevisionId: snapshot.baselineRevisionId,
        baseWorkingOutlineRevisionId: snapshot.workingRevisionId,
        dependenciesJson: JSON.stringify({ snapshot, fixture: true, note: "NOT_REAL_MODEL" }),
        operationsJson: JSON.stringify({
          input: { operation: "polish", instruction: "fixture" },
          candidates: [
            {
              id: candidateId,
              label: "FIXTURE候选（非真模型）",
              content: fixtureContent,
              summary: "验收夹具提案，非付费模型输出。",
              rationale: "确定性预置，用于采纳/撤回。",
              riskNotes: ["这是 fixture，不是真模型"],
              semanticTags: ["fixture"],
              diffChunks,
            },
          ],
        }),
        requestKey,
        payloadHash: sha256(requestKey),
        promptId: "fixture.not_real_model",
        promptVersion: "fixture",
      },
    });
    return { projectId: project.id, unitId: unit.id, proposalId, candidateId, novelId };
  } finally {
    await prisma.$disconnect();
  }
}

if (results.manuscript.novelId && results.manuscript.isRevisionPage) {
  try {
    const seeded = await seedFixtureProposal(results.manuscript.novelId);
    results.manuscript.fixtureProposal = { ...seeded, note: "FIXTURE_NOT_REAL_MODEL" };
    note(`SEEDED fixture proposal ${seeded.proposalId}`);

    const browser2 = await puppeteer.launch({
      executablePath: "/usr/bin/google-chrome-stable",
      headless: true,
      args: ["--no-sandbox", "--disable-gpu", "--window-size=1920,1080"],
      defaultViewport: { width: 1920, height: 1080 },
    });
    const page2 = await browser2.newPage();
    page2.setDefaultTimeout(60000);
    const dismiss2 = async () => {
      await page2.evaluate(() => {
        [...document.querySelectorAll("button")].find((b) => (b.textContent || "").trim() === "关闭")?.click();
      });
      await sleep(300);
    };
    const shot2 = async (name) => {
      const file = path.join(out, `${name}.png`);
      await page2.screenshot({ path: file, fullPage: false });
      note(`SHOT ${name} url=${page2.url()}`);
    };
    const click2 = async (substr) =>
      page2.evaluate((substr) => {
        const btn = [...document.querySelectorAll("button")].find((b) => (b.textContent || "").includes(substr));
        btn?.click();
        return !!btn;
      }, substr);

    await page2.goto(`http://127.0.0.1:5173/novels/${seeded.novelId}/revision?unitId=${seeded.unitId}`, {
      waitUntil: "networkidle2",
    });
    await sleep(2500);
    await dismiss2();
    let t2 = await page2.evaluate(() => document.body.innerText);
    results.manuscript.fixtureVisible = t2.includes("FIXTURE") || t2.includes("非真模型") || t2.includes("验收夹具");
    await shot2("ms-07-fixture-proposal-pending");

    await click2("采纳并保存本章");
    await sleep(3500);
    await dismiss2();
    t2 = await page2.evaluate(() => document.body.innerText);
    results.manuscript.fixtureAdoptMsg = t2.includes("候选已采纳") || t2.includes("【FIXTURE候选");
    await shot2("ms-08-fixture-after-adopt");

    // DB confirm adopt
    const prisma = new PrismaClient({
      adapter: new PrismaBetterSqlite3({ url: "file:/tmp/ai-novel-ui-Tzbi/ui.db" }),
    });
    const prop = await prisma.manuscriptRevisionProposal.findUnique({ where: { id: seeded.proposalId } });
    results.manuscript.fixtureAdoptDbStatus = prop?.status;
    const unit = await prisma.manuscriptUnit.findUnique({ where: { id: seeded.unitId } });
    const seg = unit?.segmentId ? await prisma.shortStorySegment.findUnique({ where: { id: unit.segmentId } }) : null;
    results.manuscript.fixtureAdoptContentHasMarker = (seg?.content || "").includes("【FIXTURE候选·非真模型】");

    await click2("撤回最新采纳");
    await sleep(3000);
    await dismiss2();
    t2 = await page2.evaluate(() => document.body.innerText);
    results.manuscript.fixtureUndoMsg = t2.includes("撤回") || t2.includes("最新采纳已撤回");
    await shot2("ms-09-fixture-after-undo");
    const prop2 = await prisma.manuscriptRevisionProposal.findUnique({ where: { id: seeded.proposalId } });
    const undoRow = await prisma.manuscriptRevisionProposal.findFirst({
      where: { projectId: seeded.projectId, kind: "undo" },
      orderBy: { createdAt: "desc" },
    });
    results.manuscript.fixtureAfterUndo = {
      originalProposalStatus: prop2?.status,
      undoExists: !!undoRow,
      contentStillHasFixture: ((await prisma.shortStorySegment.findUnique({ where: { id: unit.segmentId } }))?.content || "").includes(
        "【FIXTURE候选·非真模型】",
      ),
    };
    await prisma.$disconnect();

    // Also reject path: seed another pending and reject
    const prisma3 = new PrismaClient({
      adapter: new PrismaBetterSqlite3({ url: "file:/tmp/ai-novel-ui-Tzbi/ui.db" }),
    });
    const unit2 = await prisma3.manuscriptUnit.findUnique({ where: { id: seeded.unitId } });
    const project2 = await prisma3.manuscriptProject.findUnique({ where: { id: seeded.projectId } });
    const seg2 = await prisma3.shortStorySegment.findUnique({ where: { id: unit2.segmentId } });
    const rejectId = randomUUID();
    const candId = randomUUID();
    await prisma3.manuscriptRevisionProposal.create({
      data: {
        id: rejectId,
        projectId: seeded.projectId,
        unitId: seeded.unitId,
        kind: "rewrite",
        status: "pending",
        baseStructureVersion: project2.structureVersion,
        baseUnitRevision: unit2.workingRevision,
        baseContentHash: unit2.contentHash,
        baselineOutlineRevisionId: project2.baselineOutlineRevisionId,
        dependenciesJson: JSON.stringify({
          snapshot: {
            structureVersion: project2.structureVersion,
            unitRevision: unit2.workingRevision,
            contentHash: unit2.contentHash,
            baselineRevisionId: project2.baselineOutlineRevisionId,
            workingRevisionId: null,
          },
          fixture: true,
        }),
        operationsJson: JSON.stringify({
          candidates: [
            {
              id: candId,
              label: "FIXTURE待拒绝（非真模型）",
              content: `${seg2.content}\n【应被拒绝】`,
              summary: "夹具拒绝路径",
              rationale: "fixture",
              riskNotes: ["fixture"],
              semanticTags: ["fixture"],
              diffChunks: [{ type: "insert", text: "\n【应被拒绝】" }],
            },
          ],
        }),
        requestKey: `fixture-reject-${rejectId}`,
        payloadHash: sha256(`fixture-reject-${rejectId}`),
        promptId: "fixture.not_real_model",
        promptVersion: "fixture",
      },
    });
    await prisma3.$disconnect();

    await page2.goto(`http://127.0.0.1:5173/novels/${seeded.novelId}/revision?unitId=${seeded.unitId}`, {
      waitUntil: "networkidle2",
    });
    await sleep(2500);
    await dismiss2();
    await shot2("ms-10-fixture-reject-candidate");
    await click2("放弃候选");
    await sleep(2000);
    await dismiss2();
    await shot2("ms-11-fixture-after-reject");
    const prisma4 = new PrismaClient({
      adapter: new PrismaBetterSqlite3({ url: "file:/tmp/ai-novel-ui-Tzbi/ui.db" }),
    });
    const rejected = await prisma4.manuscriptRevisionProposal.findUnique({ where: { id: rejectId } });
    results.manuscript.fixtureRejectDbStatus = rejected?.status;
    await prisma4.$disconnect();
    await browser2.close();
  } catch (error) {
    results.manuscript.fixtureError = String(error?.stack || error);
    note(`FIXTURE_ERROR ${error}`);
  }
}

fs.writeFileSync("/opt/cursor/artifacts/acceptance/browser-ui-reverify-log.txt", log.join("\n") + "\n");
fs.writeFileSync("/opt/cursor/artifacts/acceptance/browser-ui-reverify-results.json", JSON.stringify(results, null, 2));
note("DONE");
console.log(JSON.stringify(results, null, 2));
