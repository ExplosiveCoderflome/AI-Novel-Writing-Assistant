const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const childProcess = require("node:child_process");

const repoRoot = path.resolve(__dirname, "..", "..");
const serverRoot = path.resolve(repoRoot, "server");

function pnpmExecutable() {
  return process.platform === "win32" ? "pnpm.cmd" : "pnpm";
}

function setupTempSqliteDatabase(tempDir) {
  const databasePath = path.join(tempDir, "p0b-real-chain.db");
  const databaseUrl = `file:${databasePath.replace(/\\/g, "/")}`;
  childProcess.execFileSync(pnpmExecutable(), ["--filter", "@ai-novel/server", "prisma:push"], {
    cwd: repoRoot,
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
    },
    stdio: ["ignore", "ignore", "pipe"],
    shell: true,
  });
  return databaseUrl;
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
  const { NovelDirectorService } = require(path.join(repoRoot, "server", "dist", "services", "novel", "director", "NovelDirectorService.js"));
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
      const volumeChapter = await prisma.volumeChapterPlan.create({
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
      if (scenario === "director_resume") {
        await novelService.updateVolumes(novel.id, {
          strategyPlan: {
            recommendedVolumeCount: 1,
            hardPlannedVolumeCount: 1,
            readerRewardLadder: "pressure -> survival -> counter-pressure",
            escalationLadder: "palace pressure -> faction threat -> identity clue",
            midpointShift: "The protagonist stops reacting and starts setting traps.",
            notes: "Real Prisma resume fixture for persisted volume strategy.",
            volumes: [{
              sortOrder: 1,
              planningMode: "hard",
              roleLabel: "Opening pressure volume",
              coreReward: "The protagonist wins the first survival foothold.",
              escalationFocus: "Court pressure and Zhao Gao clues tighten together.",
              uncertaintyLevel: "low",
            }],
            uncertainties: [],
          },
          volumes: [{
            id: volume.id,
            sortOrder: 1,
            title: "Opening Volume",
            summary: "The protagonist survives the first palace pressure chain.",
            openingHook: "She wakes up inside the Qin palace with no allies.",
            mainPromise: "Survive the palace order and expose the first Zhao Gao shadow.",
            primaryPressureSource: "Palace hierarchy",
            coreSellingPoint: "Identity reversal under court pressure",
            escalationMode: "Pressure, probe, counter-pressure",
            protagonistChange: "From passive survival to active setup.",
            midVolumeRisk: "A false ally almost exposes her.",
            climax: "She finds the first Zhao Gao clue.",
            payoffType: "Survival foothold",
            nextVolumeHook: "The clue points to a wider historical conspiracy.",
            resetPoint: null,
            openPayoffs: ["Zhao Gao clue", "hidden identity"],
            status: "active",
            chapters: [{
              id: volumeChapter.id,
              chapterOrder: 1,
              title: "First Pressure",
              summary: "She learns the palace rules and pays the first cost.",
              purpose: "Open the survival pressure chain.",
              targetWordCount: 3000,
              taskSheet: "Establish pressure, then plant the Zhao Gao clue.",
              payoffRefs: ["Zhao Gao clue"],
            }],
          }],
        });
      }
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

    const crypto = require("node:crypto");
    const stablePayload = {
      expectation: "建立身份压迫与第一次求生压力",
      targetWordCount: 3000,
      conflictLevel: null,
      revealLevel: null,
      mustAvoid: null,
      taskSheet: "先建立压迫，再埋赵高伏笔。",
      sceneCards: null,
      hook: null,
    };
    const contractHash = crypto.createHash("sha256").update(JSON.stringify(stablePayload)).digest("hex");

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
        rawPlanJson: JSON.stringify({ executionContractHash: contractHash }),
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

    if (scenario === "director_resume") {
      const directorService = new NovelDirectorService();
      const taskId = "task_p0b_director_resume";
      const pipelineRuns = [];
      const scheduledRuns = [];
      const directorInput = {
        idea: "A worker wakes up in the Qin palace and must survive court pressure.",
        batchId: "batch_p0b_director_resume",
        round: 1,
        candidate: {
          id: "candidate_p0b_director_resume",
          workingTitle: "Qin Palace Survival",
          logline: "A modern worker survives a Qin palace identity trap while approaching the Zhao Gao truth.",
          positioning: "Historical pressure survival",
          sellingPoint: "Identity reversal plus palace pressure",
          coreConflict: "She must survive the palace rules without exposing the ultimate identity clue.",
          protagonistPath: "From passive survivor to active operator.",
          endingDirection: "The first Zhao Gao clue opens a wider conspiracy.",
          hookStrategy: "Each survival move reveals one deeper historical shadow.",
          progressionLoop: "Pressure, survive, probe, counter-pressure.",
          whyItFits: "Clear beginner-friendly pressure chain.",
          toneKeywords: ["historical", "pressure", "survival"],
          targetChapterCount: 20,
        },
        workflowTaskId: taskId,
        provider: "deepseek",
        model: "deepseek-chat",
        temperature: 0.7,
        runMode: "auto_to_ready",
        writingMode: "original",
        projectMode: "ai_led",
        narrativePov: "third_person",
        pacePreference: "fast",
        emotionIntensity: "high",
        aiFreedom: "medium",
        estimatedChapterCount: 20,
      };
      const resumeTarget = {
        novelId: novel.id,
        taskId,
        stage: "outline",
        volumeId,
      };

      await prisma.novelWorkflowTask.create({
        data: {
          id: taskId,
          novelId: novel.id,
          lane: "auto_director",
          title: "Real Prisma director resume",
          status: "failed",
          progress: 0.52,
          currentStage: "outline",
          currentItemKey: "volume_strategy",
          currentItemLabel: "Volume strategy was persisted before interruption",
          checkpointType: "volume_strategy_ready",
          checkpointSummary: "Volume strategy persisted before resume.",
          resumeTargetJson: JSON.stringify(resumeTarget),
          seedPayloadJson: JSON.stringify({
            novelId: novel.id,
            directorInput,
            directorSession: {
              runMode: "auto_to_ready",
              phase: "volume_strategy",
              isBackgroundRunning: false,
              lockedScopes: ["basic", "story_macro", "character", "outline", "structured", "chapter", "pipeline"],
              reviewScope: null,
            },
            resumeTarget,
          }),
          lastError: "Simulated interruption after volume strategy persistence.",
        },
      });

      directorService.continueCandidateStageTask = async () => false;
      directorService.assertHighMemoryDirectorStartAllowed = async () => undefined;
      directorService.scheduleBackgroundRun = (scheduledTaskId, runner) => {
        scheduledRuns.push({ taskId: scheduledTaskId, runner });
      };
      directorService.runDirectorPipeline = async (input) => {
        pipelineRuns.push(input);
      };

      await directorService.continueTask(taskId);
      await Promise.all(scheduledRuns.map((item) => item.runner()));

      const refreshedTask = await prisma.novelWorkflowTask.findUnique({ where: { id: taskId } });
      const persistedWorkspace = await novelService.getVolumes(novel.id);
      const persistedResumeTarget = refreshedTask?.resumeTargetJson
        ? JSON.parse(refreshedTask.resumeTargetJson)
        : null;

      console.log(JSON.stringify({
        scenario,
        workspaceSource: persistedWorkspace.source,
        persistedStrategy: Boolean(persistedWorkspace.strategyPlan),
        persistedVolumeCount: persistedWorkspace.volumes.length,
        scheduledRunCount: scheduledRuns.length,
        pipelineStartPhase: pipelineRuns[0]?.startPhase ?? null,
        pipelineScope: pipelineRuns[0]?.scope ?? null,
        pipelineVolumeId: typeof pipelineRuns[0]?.scope === "string" && pipelineRuns[0].scope.startsWith("volume:")
          ? pipelineRuns[0].scope.slice("volume:".length)
          : null,
        taskStatus: refreshedTask?.status ?? null,
        taskStage: refreshedTask?.currentStage ?? null,
        taskItemKey: refreshedTask?.currentItemKey ?? null,
        resumeTargetStage: persistedResumeTarget?.stage ?? null,
        resumeTargetVolumeId: persistedResumeTarget?.volumeId ?? null,
      }));
      return;
    }

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
  const tempRoot = path.join(serverRoot, ".tmp");
  fs.mkdirSync(tempRoot, { recursive: true });
  const tempDir = fs.mkdtempSync(path.join(tempRoot, "p0b-"));
  try {
    const databaseUrl = setupTempSqliteDatabase(tempDir);
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
    const jsonLine = stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .reverse()
      .find((line) => line.startsWith("{"));
    if (!jsonLine) {
      throw new Error(`Child scenario did not write a JSON result. stdout=${stdout}`);
    }
    return JSON.parse(jsonLine);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

test("legacy project migration feeds shared review context through manual audit on a real sqlite chain", () => {
  const result = runScenario("legacy");

  assert.equal(result.scenario, "legacy");
  assert.equal(result.workspaceSource, "volume");
  assert.equal(result.hasReviewContext, true);
  assert.equal(result.hasWriteContext, true);
  assert.match(result.volumeMission ?? "", /压迫|求生|赵高/);
  assert.ok(result.structureObligations.some((item) => /建立宫廷压迫/.test(item)));
  assert.ok(result.participantNames.includes("刘雪婷"));
});

test("volume workspace projects feed the same shared review context through manual audit on a real sqlite chain", () => {
  const result = runScenario("volume");

  assert.equal(result.scenario, "volume");
  assert.equal(result.workspaceSource, "volume");
  assert.equal(result.hasReviewContext, true);
  assert.equal(result.hasWriteContext, true);
  assert.match(result.volumeMission ?? "", /压迫|求生|赵高/);
  assert.ok(result.structureObligations.some((item) => /推进求生动机/.test(item)));
  assert.ok(result.participantNames.includes("刘雪婷"));
});

test("persisted volume strategy resumes auto director into structured outline on a real sqlite chain", () => {
  const result = runScenario("director_resume");

  assert.equal(result.scenario, "director_resume");
  assert.equal(result.workspaceSource, "volume");
  assert.equal(result.persistedStrategy, true);
  assert.ok(result.persistedVolumeCount > 0);
  assert.equal(result.scheduledRunCount, 1);
  assert.equal(result.pipelineStartPhase, "structured_outline");
  assert.notEqual(result.pipelineStartPhase, "volume_strategy");
  assert.equal(result.pipelineScope, `volume:${result.resumeTargetVolumeId}`);
  assert.equal(result.pipelineVolumeId, result.resumeTargetVolumeId);
  assert.equal(result.taskStatus, "running");
  assert.match(result.taskStage ?? "", /节奏|结构化大纲/);
  assert.equal(result.taskItemKey, "beat_sheet");
  assert.equal(result.resumeTargetStage, "structured");
});
