const test = require("node:test");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

// Regression coverage for issue #199: when the user leaves the chapter count
// on "AI 推荐", the confirm request carries no estimatedChapterCount. The
// server must still hand a concrete chapter count to the new-book launch:
// first by recovering the value stored in the workflow task seed, and as a
// final guard by normalizing through the shared default in
// launchNewDirectorBook so open_run never receives an empty count.
test("confirm falls back to the seed chapter count and new-book launch normalizes a missing count", () => {
  const root = path.resolve(__dirname, "../..");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "director-chapter-count-fallback-"));
  const script = path.join(dir, "verify.cjs");
  fs.writeFileSync(script, String.raw`
const assert = require("node:assert/strict");
const path = require("node:path");
const server = path.join(process.env.DIRECTOR_NEXT_REPO_ROOT, "server");
const { prisma } = require(path.join(server, "dist/db/prisma"));
const { ensureRuntimeDatabaseReady } = require(path.join(server, "dist/db/runtimeMigrations"));
const { NovelWorkflowService } = require(path.join(server, "dist/services/novel/workflow/NovelWorkflowService"));
const { DirectorCommandService } = require(path.join(server, "dist/services/novel/director/commands/DirectorCommandService"));
const { launchNewDirectorBook } = require(path.join(server, "dist/app/director/newBook"));
const { getDirectorProductionServices } = require(path.join(server, "dist/app/director/services"));

const candidate = {
  id: "cand-1",
  workingTitle: "雾桥来客",
  logline: "九十年代初，一个朝鲜表演团来到中国小城。",
  positioning: "年代群像",
  sellingPoint: "异国表演团与小城众生相",
  coreConflict: "去留之间的人情与时代洪流",
  protagonistPath: "从旁观者到参与者",
  endingDirection: "团圆与告别并存",
  hookStrategy: "首演之夜的意外",
  progressionLoop: "每场演出牵出一段往事",
  whyItFits: "与起始想法高度贴合",
  toneKeywords: ["温情", "年代感"],
  targetChapterCount: 200,
};

(async () => {
  await ensureRuntimeDatabaseReady();

  // Scenario 1 (#199): the confirm request itself has no estimatedChapterCount
  // (the client drops it when the count stays on "AI 推荐"), but the workflow
  // task seed still holds the basicForm value. The stored confirm command must
  // carry the recovered count.
  const workflow = new NovelWorkflowService();
  const task = await workflow.bootstrapTask({
    lane: "auto_director",
    title: "雾桥来客",
    seedPayload: {
      directorVersion: "v2",
      idea: "九十年代初，一个朝鲜表演团来到中国小城。",
      basicForm: { estimatedChapterCount: 150, title: "雾桥来客" },
      batches: [{
        id: "batch-1",
        round: 1,
        roundLabel: "第 1 轮",
        idea: "九十年代初，一个朝鲜表演团来到中国小城。",
        candidates: [candidate],
        createdAt: new Date().toISOString(),
      }],
    },
  });
  const commandService = new DirectorCommandService(workflow);
  await commandService.enqueueConfirmCandidateCommand({
    workflowTaskId: task.id,
    directorVersion: "v2",
    idea: "九十年代初，一个朝鲜表演团来到中国小城。",
    candidate,
    provider: "test-provider",
    model: "test-model",
  });
  const commandRow = await prisma.directorRunCommand.findFirst({
    where: { taskId: task.id, commandType: "confirm_candidate" },
    orderBy: { createdAt: "desc" },
  });
  assert.ok(commandRow, "confirm command must be stored");
  const storedPayload = JSON.parse(commandRow.payloadJson);
  assert.equal(
    storedPayload.confirmRequest.estimatedChapterCount,
    150,
    "confirm payload must recover estimatedChapterCount from the task seed basicForm (#199)",
  );

  // Scenario 2 (#199): neither the request nor the candidate carries a chapter
  // count. The new-book launch must normalize to the shared default (80, via
  // normalizeDirectorTargetChapterCount) instead of opening a run with an
  // empty count.
  const candidateWithoutCount = { ...candidate, id: "cand-2" };
  delete candidateWithoutCount.targetChapterCount;
  const { novel } = await launchNewDirectorBook({
    idea: "九十年代初，一个朝鲜表演团来到中国小城。",
    candidate: candidateWithoutCount,
    provider: "test-provider",
    model: "test-model",
  }, "task-199-no-count", "original_opening");
  assert.equal(
    novel.estimatedChapterCount,
    80,
    "new novel must carry the normalized default chapter count when both inputs are missing (#199)",
  );
  const services = getDirectorProductionServices();
  const runIds = await services.http.runRepository.listRunIds({ novelId: novel.id, limit: 1 });
  assert.ok(runIds.length > 0, "open_run must create a run for the new novel");
  const contract = await services.http.runRepository.getContract(runIds[0]);
  assert.equal(
    contract.launchInput.estimatedChapterCount,
    80,
    "open_run launchInput must always carry a concrete chapter count (#199)",
  );

  await prisma.$disconnect();
})().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exitCode = 1;
});
`);
  execFileSync(process.execPath, [script], {
    cwd: root,
    env: {
      ...process.env,
      NODE_ENV: "test",
      AI_NOVEL_RUNTIME: "desktop",
      AI_NOVEL_APP_DATA_DIR: dir,
      DIRECTOR_NEXT_REPO_ROOT: root,
      DATABASE_URL: "file:" + path.join(dir, "fallback.db").replace(/\\/g, "/"),
    },
    stdio: "pipe",
  });
});
