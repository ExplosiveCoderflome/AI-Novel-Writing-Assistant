const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

const sourceRoot = path.resolve(__dirname, "../src");
function compiled(relativePath) {
  return ts.transpileModule(fs.readFileSync(path.join(sourceRoot, relativePath), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
}

// Inspect emitted imports so type-only contracts do not create false dependency edges.
function dependencyClosure(relativePath, seen = new Set()) {
  const file = path.resolve(sourceRoot, relativePath);
  if (seen.has(file)) return seen;
  seen.add(file);
  for (const match of compiled(path.relative(sourceRoot, file)).matchAll(/require\("(\.[^"]+)"\)/g)) {
    const base = path.resolve(path.dirname(file), match[1]);
    const dependency = [base + ".ts", path.join(base, "index.ts")].find(fs.existsSync);
    if (dependency) dependencyClosure(path.relative(sourceRoot, dependency), seen);
  }
  return seen;
}

test("context requirement inference is executable without business or broker dependencies", () => {
  const exports = {};
  vm.runInNewContext(compiled("prompting/context/promptContextRequirements.ts"), {
    exports,
    require: (name) => assert.fail(`Requirement inference loaded ${name}`),
  });
  const explicit = [{ group: "explicit", required: false, priority: 1 }];
  assert.equal(exports.derivePromptContextRequirements({ contextRequirements: explicit, contextPolicy: {} }), explicit);
  const requirements = exports.derivePromptContextRequirements({
    contextPolicy: { requiredGroups: ["book", "chapter"], preferredGroups: ["style"] },
  });
  assert.deepEqual(Array.from(requirements, ({ group, required, priority }) => [group, required, priority]), [
    ["book", true, 100], ["chapter", true, 99], ["style", false, 50],
  ]);
  assert.doesNotMatch(compiled("prompting/templates/PromptTemplateOverrideService.ts"), /require\(".*promptContextResolution"\)/);
});

test("event publication and side effect enqueue facades do not load business handlers", () => {
  for (const entry of ["events/publisher.ts", "events/sideEffects/queue.ts"]) {
    const dependencies = [...dependencyClosure(entry)].map((file) => path.relative(sourceRoot, file).replaceAll("\\", "/"));
    assert.equal(dependencies.some((file) => file.startsWith("services/")), false, dependencies.join("\n"));
    assert.equal(dependencies.some((file) => /handlers\/|NovelSideEffect(JobHandlers|Worker)\.ts$/.test(file)), false, dependencies.join("\n"));
  }
});

test("fact projection defaults to a read port instead of constructing execution orchestration", () => {
  const summary = compiled("services/novel/director/projections/DirectorFactSummaryService.ts");
  const reader = compiled("services/novel/director/projections/DirectorFactReader.ts");
  assert.match(summary, /new DirectorFactReader_1\.DirectorFactReader\(\)/);
  assert.doesNotMatch(summary + reader, /DirectorCoreStepModuleRuntime|NovelDirectorPipelineRuntime|NovelDirectorRuntimeOrchestrator|NovelDirectorAutoExecutionRuntime|NovelContextService/);
});

test("state and character resource version checks use only artifact contracts", () => {
  for (const entry of [
    "services/novel/state/StateCommitService.ts",
    "services/novel/characterResource/CharacterResourceLedgerService.ts",
    "services/novel/director/runtime/DirectorStateProposalResolutionService.ts",
  ]) {
    assert.doesNotMatch(compiled(entry), /require\("[^"\n]*artifactSync"\)/);
    assert.match(compiled(entry), /artifactSync\/contracts/);
  }
  const contracts = [...dependencyClosure("services/novel/runtime/artifactSync/contracts/index.ts")];
  assert.equal(contracts.some((file) => /RecoveryService|Extraction|CheckpointStore/.test(file)), false);
});

test("manual chapter removal policy runs without persistence or production dependencies", () => {
  const exports = {};
  vm.runInNewContext(compiled("services/novel/chapterEditor/domain/manualChapterPolicy.ts"), {
    exports,
    require: (name) => assert.fail(`Manual chapter policy loaded ${name}`),
  });
  const placeholder = {
    generationState: "planned", chapterStatus: "unplanned", content: null,
    expectation: null, taskSheet: null, sceneCards: null, repairHistory: null, riskFlags: null,
  };
  assert.equal(exports.canRemoveManualChapter(placeholder), true);
  for (const field of ["content", "expectation", "taskSheet", "sceneCards", "repairHistory", "riskFlags"]) {
    assert.equal(exports.canRemoveManualChapter({ ...placeholder, [field]: "已有创作内容" }), false, field);
  }
  assert.equal(exports.canRemoveManualChapter({ ...placeholder, generationState: "drafted" }), false);
  assert.equal(exports.canRemoveManualChapter({ ...placeholder, chapterStatus: "planned" }), false);
});

test("manual chapter orchestration delegates transactions without loading production execution", () => {
  const application = compiled("services/novel/chapterEditor/application/ManualChapterService.ts");
  assert.match(application, /persistence\/ManualChapterStore/);
  assert.doesNotMatch(application, /require\("[^"\n]*db\/prisma"\)|\$transaction/);
  assert.doesNotMatch(application, /ChapterProduction|NovelDirectorPipelineRuntime|NovelDirectorRuntimeOrchestrator/);
  const store = compiled("services/novel/chapterEditor/persistence/ManualChapterStore.ts");
  assert.doesNotMatch(store, /ChapterArtifactProjectionService|novelChapterArtifacts|novelCoreSupport|NovelSideEffectJobHandlers|NovelSideEffectWorker/);
  const crud = compiled("services/novel/novelCoreCrudService.ts");
  assert.match(crud, /require\("\.\/chapterEditor"\)/);
  assert.doesNotMatch(crud, /chapterEditor\/(application|persistence|domain)\//);
});

test("timeline finalization consumes its module persistence facade", () => {
  const finalizer = compiled("services/novel/runtime/ChapterTimelineFinalizationService.ts");
  const imports = [...finalizer.matchAll(/require\("([^"]+)"\)/g)].map((match) => match[1]);
  assert.ok(finalizer.includes("TimelineFinalizationStore"), "finalization must delegate persistence to TimelineFinalizationStore");
  assert.ok(imports.some((name) => name.endsWith("modules/timeline")), imports.join("\n"));
  assert.equal(imports.some((name) => /db\/prisma$|modules\/timeline\/persistence\//.test(name)), false, imports.join("\n"));
  const store = compiled("modules/timeline/persistence/TimelineFinalizationStore.ts");
  assert.doesNotMatch(store, /ChapterTimelineFinalizationService|NovelDirector|require\("[^"\n]*services\//);
});

test("catalog and proposal entrypoints keep database concerns in their owned modules", () => {
  const crud = compiled("services/novel/novelCoreCrudService.ts");
  assert.match(crud, /require\("\.\/catalog"\)/);
  assert.doesNotMatch(crud, /listLatestVisibleAutoDirectorTasksByNovelIds|listLatestCreationStudioTasksByNovelIds/);
  for (const entry of [
    "services/novel/state/StateCommitService.ts",
    "services/novel/characterResource/application/CharacterResourceApplicationService.ts",
  ]) {
    assert.doesNotMatch(compiled(entry), /require\("[^"\n]*db\/prisma"\)|payloadJson|JSON\.parse/);
  }
});
