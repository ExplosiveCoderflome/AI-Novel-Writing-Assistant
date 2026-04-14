const test = require("node:test");
const assert = require("node:assert/strict");
const { randomBytes } = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const childProcess = require("node:child_process");
const { URL } = require("node:url");

const repoRoot = path.resolve(__dirname, "..", "..");
const serverRoot = path.resolve(repoRoot, "server");
const pnpmCommand = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const postgresDatabaseUrl = resolvePostgresDatabaseUrl();
const skipReason = postgresDatabaseUrl
  ? undefined
  : "TEST_POSTGRES_DATABASE_URL or postgres DATABASE_URL is not set";

function resolvePostgresDatabaseUrl() {
  const candidates = [process.env.TEST_POSTGRES_DATABASE_URL, process.env.DATABASE_URL];
  for (const candidate of candidates) {
    if (candidate && /^postgres(?:ql)?:\/\//i.test(candidate)) {
      return candidate;
    }
  }
  return null;
}

function buildAdminDatabaseUrl(databaseUrl) {
  const url = new URL(databaseUrl);
  url.searchParams.delete("schema");
  return url.toString();
}

function buildSchemaDatabaseUrl(databaseUrl, schemaName) {
  const url = new URL(databaseUrl);
  url.searchParams.set("schema", schemaName);
  return url.toString();
}

function execPrisma(args, envOverrides, input) {
  return childProcess.execFileSync(
    pnpmCommand,
    ["--filter", "@ai-novel/server", "exec", "prisma", ...args],
    {
      cwd: repoRoot,
      env: {
        ...process.env,
        ...envOverrides,
      },
      input,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    },
  );
}

function withIsolatedSchema(run) {
  if (!postgresDatabaseUrl) {
    throw new Error("postgres database URL is not configured");
  }

  const schemaName = `p0b_${randomBytes(8).toString("hex")}`;
  const adminDatabaseUrl = buildAdminDatabaseUrl(postgresDatabaseUrl);
  const databaseUrl = buildSchemaDatabaseUrl(postgresDatabaseUrl, schemaName);
  let schemaCreated = false;

  try {
    execPrisma(["db", "execute", "--stdin"], { DATABASE_URL: adminDatabaseUrl }, `CREATE SCHEMA IF NOT EXISTS "${schemaName}";`);
    schemaCreated = true;
    execPrisma(["migrate", "deploy", "--schema", "src/prisma/schema.prisma"], { DATABASE_URL: databaseUrl });
    return run(databaseUrl);
  } finally {
    if (schemaCreated) {
      execPrisma(["db", "execute", "--stdin"], { DATABASE_URL: adminDatabaseUrl }, `DROP SCHEMA IF EXISTS "${schemaName}" CASCADE;`);
    }
  }
}

function writeChildScript(tempDir) {
  const scriptPath = path.join(tempDir, "run-p0b-real-chain.cjs");
  const script = `
const path = require("node:path");

async function main() {
  const repoRoot = process.cwd();

  global.prisma = undefined;

  const { prisma } = require(path.join(repoRoot, "server", "dist", "db", "prisma.js"));
  const { NovelService } = require(path.join(repoRoot, "server", "dist", "services", "novel", "NovelService.js"));
  const { NovelCoreReviewService } = require(path.join(repoRoot, "server", "dist", "services", "novel", "novelCoreReviewService.js"));
  const { NovelWorldSliceService } = require(path.join(repoRoot, "server", "dist", "services", "novel", "storyWorldSlice", "NovelWorldSliceService.js"));
  const { NovelContinuationService } = require(path.join(repoRoot, "server", "dist", "services", "novel", "NovelContinuationService.js"));
  const { StyleBindingService } = require(path.join(repoRoot, "server", "dist", "services", "styleEngine", "StyleBindingService.js"));
  const { ragServices } = require(path.join(repoRoot, "server", "dist", "services", "rag", "index.js"));
  const { auditService } = require(path.join(repoRoot, "server", "dist", "services", "audit", "AuditService.js"));

  const original = {
    ensureStoryWorldSlice: NovelWorldSliceService.prototype.ensureStoryWorldSlice,
    buildChapterContextPack: NovelContinuationService.prototype.buildChapterContextPack,
    resolveForGeneration: StyleBindingService.prototype.resolveForGeneration,
    buildContextBlock: ragServices.hybridRetrievalService.buildContextBlock,
    auditChapter: auditService.auditChapter,
  };

  NovelWorldSliceService.prototype.ensureStoryWorldSlice = async () => null;
  NovelContinuationService.prototype.buildChapterContextPack = async () => ({
    enabled: false,
    sourceType: null,
    sourceId: null,
    sourceTitle: "",
    systemRule: "",
    humanBlock: "",
    antiCopyCorpus: [],
  });
  StyleBindingService.prototype.resolveForGeneration = async () => ({
    matchedBindings: [],
    compiledBlocks: null,
  });
  ragServices.hybridRetrievalService.buildContextBlock = async () => "";

  const scenario = process.env.P0B_SCENARIO ?? "legacy";
  let capturedContextPackage = null;
  auditService.auditChapter = async (_novelId, _chapterId, _scope, options = {}) => {
    capturedContextPackage = options.contextPackage ?? null;
    return {
      score: {
        coherence: 86,
        repetition: 12,
        pacing: 83,
        voice: 80,
        engagement: 84,
        overall: 84,
      },
      issues: [],
      auditReports: [],
    };
  };

  try {
    const novelService = new NovelService();
    const reviewService = new NovelCoreReviewService();

    const novel = await prisma.novel.create({
      data: {
        title: scenario === "legacy" ? "旧项目测试小说" : "卷级项目测试小说",
        description: "P0-B 真实链路回归测试",
        targetAudience: "新手读者",
        bookSellingPoint: "身份反差 + 朝堂压迫",
        first30ChapterPromise: "尽快建立主角困局与第一轮反压",
        narrativePov: "third_person",
        pacePreference: "fast",
        emotionIntensity: "high",
        outline: "现代打工人穿越到秦朝，被迫在宫廷中求生并逐步靠近赵高真相。",
        structuredOutline: null,
        estimatedChapterCount: 20,
      },
    });

    const chapter = await prisma.chapter.create({
      data: {
        novelId: novel.id,
        order: 1,
        title: "第1章",
        content: "刘雪婷刚穿越进宫，先意识到自己成了一个谁都能踩一脚的小太监。",
        expectation: "建立身份压迫与第一次求生压力",
        targetWordCount: 3000,
        taskSheet: "先建立压迫，再埋赵高伏笔。",
      },
    });

    let volumeId = null;
    let workspaceSource = null;
    if (scenario === "legacy") {
      const workspace = await novelService.migrateLegacyVolumes(novel.id);
      workspaceSource = workspace.source;
      volumeId = workspace.volumes[0]?.id ?? null;
    } else {
      const volume = await prisma.volumePlan.create({
        data: {
          novelId: novel.id,
          sortOrder: 1,
          title: "第一卷",
          summary: "主角被卷入宫廷压迫链，开始辨认赵高阴影。",
          mainPromise: "建立宫廷压迫与身份反差，完成第一次求生反压。",
          climax: "主角第一次意识到自己可能与赵高有更深关联。",
          openPayoffsJson: JSON.stringify(["赵高线索", "宫廷身份伏笔"]),
        },
      });
      await prisma.volumeChapterPlan.create({
        data: {
          volumeId: volume.id,
          chapterOrder: 1,
          title: "第1章",
          summary: "建立身份压迫与第一次求生压力",
          purpose: "建立压迫",
          targetWordCount: 3000,
          taskSheet: "先建立压迫，再埋赵高伏笔。",
        },
      });
      const workspace = await novelService.getVolumes(novel.id);
      workspaceSource = workspace.source;
      volumeId = volume.id;
    }

    if (!volumeId) {
      throw new Error("volumeId missing");
    }

    const protagonist = await prisma.character.create({
      data: {
        novelId: novel.id,
        name: "刘雪婷",
        role: "主角",
        gender: "female",
        currentState: "刚进宫，极度被动",
        currentGoal: "先活下来，再搞清自己为何会变成太监",
      },
    });

    await prisma.characterVolumeAssignment.create({
      data: {
        novelId: novel.id,
        characterId: protagonist.id,
        volumeId,
        roleLabel: "伪装求生者",
        responsibility: "撑住第一轮压迫并找出赵高线索",
        plannedChapterOrdersJson: JSON.stringify([1]),
        isCore: true,
      },
    });

    await prisma.storyMacroPlan.create({
      data: {
        novelId: novel.id,
        storyInput: "打工人刘雪婷穿越到秦朝成为太监，最后发现自己竟然就是赵高。",
        expansionJson: JSON.stringify({
          expanded_premise: "现代打工人刘雪婷穿越成秦宫太监，在求生中逐步接近赵高真相。",
          protagonist_core: "现代价值观与宫廷生存法则冲突。",
        }),
        decompositionJson: JSON.stringify({
          selling_point: "身份反差与历史阴影叠加的高压成长线",
          core_conflict: "主角必须在宫廷压迫中活下来并靠近赵高真相",
          main_hook: "她最终发现自己就是赵高",
          progression_loop: "受压 -> 求生 -> 试探反压 -> 更深陷宫廷",
          growth_path: "从被动求生到主动设局",
          major_payoffs: ["第一次反压", "赵高线索浮现"],
          ending_flavor: "高压反转",
        }),
        issuesJson: JSON.stringify([]),
        lockedFieldsJson: JSON.stringify({}),
        constraintEngineJson: JSON.stringify({
          hard_constraints: ["不能丢失宫廷压迫感", "不能过早揭露赵高真相"],
        }),
        stateJson: JSON.stringify({
          currentPhase: 0,
          progress: 0,
          protagonistState: "刚入宫",
        }),
      },
    });

    await prisma.bookContract.create({
      data: {
        novelId: novel.id,
        readingPromise: "看主角如何在宫廷压迫中一步步活成权力怪物。",
        protagonistFantasy: "从最底层反向吞掉宫廷秩序。",
        coreSellingPoint: "现代打工人穿越成太监，最终发现自己竟是赵高。",
        chapter3Payoff: "主角初步摸清宫廷生存规则。",
        chapter10Payoff: "主角完成第一轮求生反压并拿到赵高线索。",
        chapter30Payoff: "主角逼近身份真相。",
        escalationLadder: "宫廷压迫 -> 势力试探 -> 身份真相逼近",
        relationshipMainline: "主角与宫廷权力人物的互相利用",
        absoluteRedLinesJson: JSON.stringify(["不能写成轻松穿越喜剧"]),
      },
    });

    await prisma.storyPlan.create({
      data: {
        novelId: novel.id,
        chapterId: chapter.id,
        level: "chapter",
        status: "active",
        planRole: "pressure",
        phaseLabel: "起势",
        title: "第1章计划",
        objective: "推进求生压力并埋下赵高线索",
        participantsJson: JSON.stringify(["刘雪婷"]),
        revealsJson: JSON.stringify(["赵高线索的阴影首次出现"]),
        riskNotesJson: JSON.stringify(["不要过早揭示终极身份"]),
        mustAdvanceJson: JSON.stringify(["建立宫廷压迫", "推进求生动机"]),
        mustPreserveJson: JSON.stringify(["身份反差", "历史阴影"]),
        hookTarget: "结尾留下更大的宫廷威胁",
        scenes: {
          create: [{
            sortOrder: 1,
            title: "入宫受压",
            objective: "建立压迫与主角困境",
            conflict: "宫廷秩序对主角的第一轮碾压",
            reveal: "赵高阴影被暗示",
            emotionBeat: "惊惧与强撑",
          }],
        },
      },
    });

    await reviewService.auditChapter(novel.id, chapter.id, "plot", {});

    console.log(JSON.stringify({
      scenario,
      workspaceSource,
      hasReviewContext: Boolean(capturedContextPackage?.chapterReviewContext),
      hasWriteContext: Boolean(capturedContextPackage?.chapterWriteContext),
      volumeMission: capturedContextPackage?.chapterReviewContext?.volumeWindow?.missionSummary ?? null,
      structureObligations: capturedContextPackage?.chapterReviewContext?.structureObligations ?? [],
      participantNames: (capturedContextPackage?.chapterWriteContext?.participants ?? []).map((item) => item.name),
    }));
  } finally {
    auditService.auditChapter = original.auditChapter;
    NovelWorldSliceService.prototype.ensureStoryWorldSlice = original.ensureStoryWorldSlice;
    NovelContinuationService.prototype.buildChapterContextPack = original.buildChapterContextPack;
    StyleBindingService.prototype.resolveForGeneration = original.resolveForGeneration;
    ragServices.hybridRetrievalService.buildContextBlock = original.buildContextBlock;
    await prisma.$disconnect();
    global.prisma = undefined;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
`;

  fs.writeFileSync(scriptPath, script, "utf8");
  return scriptPath;
}

function runScenario(scenario) {
  return withIsolatedSchema((databaseUrl) => {
    const tempRoot = path.join(serverRoot, ".tmp");
    fs.mkdirSync(tempRoot, { recursive: true });
    const tempDir = fs.mkdtempSync(path.join(tempRoot, "p0b-"));
    try {
      const scriptPath = writeChildScript(tempDir);
      const stdout = childProcess.execFileSync(process.execPath, [scriptPath], {
        cwd: repoRoot,
        env: {
          ...process.env,
          DATABASE_URL: databaseUrl,
          P0B_SCENARIO: scenario,
        },
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
      return JSON.parse(stdout.trim());
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
}

test("legacy project migration feeds shared review context through manual audit on a real postgres chain", { skip: skipReason }, () => {
  const result = runScenario("legacy");

  assert.equal(result.scenario, "legacy");
  assert.equal(result.workspaceSource, "legacy");
  assert.equal(result.hasReviewContext, true);
  assert.equal(result.hasWriteContext, true);
  assert.match(result.volumeMission ?? "", /压迫|求生|赵高/);
  assert.ok(result.structureObligations.some((item) => /建立宫廷压迫/.test(item)));
  assert.ok(result.participantNames.includes("刘雪婷"));
});

test("volume workspace projects feed the same shared review context through manual audit on a real postgres chain", { skip: skipReason }, () => {
  const result = runScenario("volume");

  assert.equal(result.scenario, "volume");
  assert.equal(result.workspaceSource, "volume");
  assert.equal(result.hasReviewContext, true);
  assert.equal(result.hasWriteContext, true);
  assert.match(result.volumeMission ?? "", /压迫|求生|赵高/);
  assert.ok(result.structureObligations.some((item) => /推进求生动机/.test(item)));
  assert.ok(result.participantNames.includes("刘雪婷"));
});
