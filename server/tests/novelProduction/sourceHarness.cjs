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
  stopAt,
  artifactSyncStatus = "completed",
} = {}) {
  const events = [];
  const committedContents = [];
  const syncedContents = [];
  let persisted = content;
  let reviewIndex = 0;
  let budget = 0;
  let approved = false;
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
        return { content: "repair candidate" };
      },
    },
    "../chapterPatchRepairService": { ChapterPatchRepairFailedError: class extends Error {} },
    "./selection/ChapterRepairCandidateSelection": selectionModule,
    "./artifactSync/ChapterArtifactSyncResult": {
      ChapterArtifactSyncBoundaryError: class extends Error {
        constructor(result) { super(result.reason); this.result = result; }
      },
    },
  });
  const deps = {
    validateRequest: () => ({}),
    ensureNovelCharacters: async () => {},
    assemble: async () => ({ novel: { title: "Novel" }, chapter: { title: "Chapter", content: persisted }, contextPackage: {} }),
    generateDraftFromWriter: async () => { events.push("writer"); return { content: "generated draft" }; },
    saveDraftAndArtifacts: async (_novel, _chapter, value) => {
      persisted = value;
      events.push("save");
      if (stopAt === "after_save") throw new Error("after_save");
    },
    finalizeChapterContent: async ({ content: value }) => {
      events.push("acceptance");
      if (stopAt === "recheck" && reviewIndex > 0) throw new Error("recheck");
      const score = scores[Math.min(reviewIndex++, scores.length - 1)];
      return {
        finalContent: value,
        runtimePackage: {
          novelId: "n", chapterId: "c",
          audit: { score: { coherence: score, repetition: score, engagement: score, overall: score }, openIssues: [], reports: [] },
          context: {}, meta: { acceptanceStatus: score >= 80 ? "accepted" : "repairable" },
        },
        needsRepair: score < 80,
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
        completedArtifacts: artifactSyncStatus === "completed" ? ["artifact_delta"] : [],
        reason: artifactSyncStatus === "completed" ? undefined : `artifact sync ${artifactSyncStatus}`,
      };
    },
  };
  return {
    events,
    get content() { return persisted; },
    get budget() { return budget; },
    get approved() { return approved; },
    get committedContents() { return [...committedContents]; },
    get syncedContents() { return [...syncedContents]; },
    resume: () => { stopAt = undefined; },
    run: (options = {}, hooks = {}) => runPipelineChapterWithRuntime(deps, "n", "c", options, {
      onRetryConsumed: async () => { budget++; }, ...hooks,
    }),
  };
}

module.exports = { loadRuntimeSource, createPipelineHarness };
