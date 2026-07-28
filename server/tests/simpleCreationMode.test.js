const test = require("node:test");
const assert = require("node:assert/strict");
const { buildWorkflowSeedPayload } = require("../dist/services/novel/director/runtime/novelDirectorHelpers.js");
const { directorCandidateResponseSchema } = require("../dist/services/novel/director/runtime/novelDirectorSchemas.js");
const { isSimpleCreationWriteAllowed } = require("../dist/modules/novel/http/simpleCreationWriteGuard.js");

function candidate(title) {
  return {
    workingTitle: title,
    titleOptions: [],
    logline: "主角必须解决一个足以推动长篇故事的危机。",
    positioning: "清晰的长篇类型定位",
    sellingPoint: "稳定兑现读者期待",
    coreConflict: "主角与长期阻力持续对抗",
    protagonistPath: "从被动求生走向主动承担",
    endingDirection: "完成核心承诺",
    hookStrategy: "用迫近危险和连续兑现推动追读",
    progressionLoop: "发现问题、作出选择、承担后果并升级目标",
    whyItFits: "承接用户的一句话灵感",
    toneKeywords: ["紧张", "成长"],
    targetChapterCount: 120,
  };
}

test("simple creation seed preserves the experience and genre choices", () => {
  const seed = buildWorkflowSeedPayload({
    idea: "一座城市只剩七天。",
    creationExperience: "simple",
    genreTagIds: ["suspense", "urban"],
    runMode: "full_book_autopilot",
  });
  assert.equal(seed.creationExperience, "simple");
  assert.deepEqual(seed.genreTagIds, ["suspense", "urban"]);
  assert.equal(seed.runMode, "full_book_autopilot");
});

test("director candidate contract requires exactly two directions", () => {
  assert.equal(directorCandidateResponseSchema.safeParse({
    candidates: [candidate("方向一"), candidate("方向二")],
  }).success, true);
  assert.equal(directorCandidateResponseSchema.safeParse({
    candidates: [candidate("只有一个方向")],
  }).success, false);
});

test("simple creation write boundary allows reads, exports and irreversible conversion only", () => {
  assert.equal(isSimpleCreationWriteAllowed("GET", "/book/simple-shelf"), true);
  assert.equal(isSimpleCreationWriteAllowed("GET", "/book/export"), true);
  assert.equal(isSimpleCreationWriteAllowed("POST", "/book/export-as-document"), true);
  assert.equal(isSimpleCreationWriteAllowed("POST", "/book/creation-experience/professional"), true);
  assert.equal(isSimpleCreationWriteAllowed("PUT", "/book"), false);
  assert.equal(isSimpleCreationWriteAllowed("DELETE", "/book/chapters/chapter-1"), false);
  assert.equal(isSimpleCreationWriteAllowed("POST", "/book/chapters/chapter-1/generate"), false);
});
