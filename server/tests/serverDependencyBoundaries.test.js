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
