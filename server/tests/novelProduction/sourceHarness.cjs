const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

// Only explicit doubles can cross the module boundary: no production DB or LLM imports.
function loadRuntimeSource(filename, imports) {
  const sourcePath = path.resolve(__dirname, "../../src/services/novel/runtime", filename);
  const source = ts.transpileModule(fs.readFileSync(sourcePath, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: sourcePath,
  }).outputText;
  const exports = {};
  const evaluate = vm.runInThisContext(
    `(function(require, exports) {\n${source}\n})`, { filename: sourcePath },
  );
  evaluate((id) => {
    if (!Object.hasOwn(imports, id)) throw new Error(`Unmocked production dependency: ${id}`);
    return imports[id];
  }, exports);
  return exports;
}

function createPipelineHarness({
  content = "original draft",
  scores = [90],
  repairError,
  repairContent = "repair candidate",
  acceptanceMeta = {},
  acceptanceAssessment,
  recheckAssessment,
  auditHasBlockingIssues = false,
  timelineStatus,
  stopAt,
  artifactSyncStatus = "completed",
  completedArtifacts,
} = {}) {
  const events = [];
  const committedContents = [];
  const syncedContents = [];
  const reviewBaselines = [];
  let persisted = content;
  let reviewIndex = 0;
  let budget = 0;
  let approved = false;
  let finalizedResult;
  const selectionModule = loadRuntimeSource("selection/ChapterRepairCandidateSelection.ts", {
    "node:crypto": { createHash: require("node:crypto").createHash },
  });
  const { runPipelineChapterWithRuntime } = loadRuntimeSource("chapterRuntimePipeline.ts", {
    "../../styleEngine/styleGenerationSanitizer": { detectForbiddenStyleEntities: () => [] },
    "./chapterEmptyContentError": { assertChapterContentNotEmpty: (value) => value, isChapterEmptyContentError: () => false },
    "./repair/chapterRepairRuntime": {
      runChapterRepairText: async () => {
        events.push("repair");
        if (repairError) throw repairError;
        return { content: repairContent };
      },
    },
    "../chapterPatchRepairService": { ChapterPatchRepairFailedError: class extends Error {} },
    "./selection/ChapterRepairCandidateSelection": selectionModule,
    "./repair/ChapterRepairEligibility": loadRuntimeSource("repair/ChapterRepairEligibility.ts", {}),
    "./proseQuality": loadRuntimeSource("proseQuality/ProseQualityDetector.ts", {}),
    "./artifactSync/ChapterArtifactSyncResult": {
      ChapterArtifactSyncBoundaryError: class extends Error {
        constructor(result) { super(result.reason); this.result = result; }
      },
    },
  });
  const deps = {
    loadFinalizedChapterResult: async () => finalizedResult && { content: persisted, result: finalizedResult },
    persistFinalizedChapterResult: async (_novel, _chapter, value, result) => {
      assertFinalContent(value);
      events.push("finalized_checkpoint");
      finalizedResult = JSON.parse(JSON.stringify(result));
    },
    validateRequest: () => ({}),
    ensureNovelCharacters: async () => {},
    assemble: async () => ({ novel: { title: "Novel" }, chapter: { title: "Chapter", content: persisted }, contextPackage: {} }),
    generateDraftFromWriter: async () => { events.push("writer"); return { content: "generated draft" }; },
    saveDraftAndArtifacts: async (_novel, _chapter, value) => {
      persisted = value;
      events.push("save");
      if (stopAt === "after_save") throw new Error("after_save");
    },
    finalizeChapterContent: async ({ content: value, repairReviewBaseline }) => {
      reviewBaselines.push(repairReviewBaseline);
      events.push("acceptance");
      if (stopAt === "recheck" && reviewIndex > 0) throw new Error("recheck");
      const score = scores[Math.min(reviewIndex++, scores.length - 1)];
      return {
        finalContent: value,
        runtimePackage: {
          novelId: "n", chapterId: "c",
          audit: { score: { coherence: score, repetition: score, engagement: score, overall: score }, openIssues: [], reports: [], hasBlockingIssues: auditHasBlockingIssues },
          context: {}, meta: { acceptanceStatus: score >= 80 ? "accepted" : "repairable", ...acceptanceMeta },
          ...(timelineStatus ? { timelineCheck: { status: timelineStatus } } : {}),
        },
        needsRepair: score < 80,
        ...(acceptanceAssessment ? { acceptanceResult: { assessment: reviewIndex > 1 && recheckAssessment ? recheckAssessment : acceptanceAssessment } } : {}),
      };
    },
    commitFinalizedChapterContent: async ({ evaluation }) => {
      events.push("terminal_commit");
      committedContents.push(evaluation.finalContent);
    },
    markChapterGenerationState: async (_id, state) => {
      events.push(state);
      if (state === "approved") approved = true;
    },
    markChapterNeedsRepair: async () => events.push("needs_repair"),
    syncFinalChapterArtifacts: async (_novel, _chapter, value) => {
      events.push("artifact_sync");
      syncedContents.push(value);
      if (stopAt === "artifact_sync") throw new Error("artifact_sync");
      return {
        status: artifactSyncStatus,
        contentHash: value,
        completedArtifacts: completedArtifacts ?? (artifactSyncStatus === "completed" ? ["artifact_delta"] : []),
        reason: artifactSyncStatus === "completed" ? undefined : `artifact sync ${artifactSyncStatus}`,
      };
    },
  };
  function assertFinalContent(value) {
    if (value !== persisted) throw new Error("checkpoint must describe the retained saved draft");
  }
  return {
    events,
    reviewBaselines,
    get content() { return persisted; },
    get budget() { return budget; },
    get approved() { return approved; },
    get committedContents() { return [...committedContents]; },
    get syncedContents() { return [...syncedContents]; },
    resume: () => { stopAt = undefined; artifactSyncStatus = "completed"; },
    run: (options = {}, hooks = {}) => runPipelineChapterWithRuntime(deps, "n", "c", options, {
      onRetryConsumed: async () => { budget++; }, ...hooks,
    }),
  };
}

module.exports = { loadRuntimeSource, createPipelineHarness };
