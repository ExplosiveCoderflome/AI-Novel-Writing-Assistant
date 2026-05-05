const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..", "..");

function readSource(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

test("auto director control-plane routes enqueue commands instead of executing heavy director chains", () => {
  const routeFiles = [
    "server/src/routes/novelWorkflows.ts",
    "server/src/routes/novelDirector.ts",
    "server/src/routes/tasks.ts",
  ];
  const forbiddenCalls = [
    [/\.continueTask\s*\(/, "NovelDirectorService.continueTask"],
    [/\.confirmCandidate\s*\(/, "NovelDirectorService.confirmCandidate"],
    [/\.startTakeover\s*\(/, "NovelDirectorService.startTakeover"],
    [/\.repairChapterTitles\s*\(/, "NovelDirectorService.repairChapterTitles"],
    [/\.executeChapterTitleRepair\s*\(/, "NovelDirectorService.executeChapterTitleRepair"],
    [/runDirectorStructuredOutlinePhase\s*\(/, "runDirectorStructuredOutlinePhase"],
    [/runChapterExecutionNode\s*\(/, "runChapterExecutionNode"],
    [/invokeStructuredLlm\s*\(/, "invokeStructuredLlm"],
  ];
  for (const relativePath of routeFiles) {
    const source = readSource(relativePath);
    for (const [pattern, label] of forbiddenCalls) {
      assert.equal(
        pattern.test(source),
        false,
        `${relativePath} must not call ${label} directly`,
      );
    }
  }
});

test("candidate confirmation is queued through director commands", () => {
  const routeSource = readSource("server/src/routes/novelDirector.ts");
  const commandSource = readSource("server/src/services/novel/director/DirectorCommandService.ts");
  const executionSource = readSource("server/src/services/novel/director/DirectorExecutionService.ts");
  const pipelineSource = readSource("server/src/services/novel/director/DirectorPipelineEngine.ts");
  const apiSource = readSource("client/src/api/novelDirector.ts");

  assert.match(
    routeSource,
    /"\/confirm"[\s\S]*enqueueConfirmCandidateCommand[\s\S]*res\.status\(202\)/,
  );
  assert.match(commandSource, /commandType:\s*"confirm_candidate"/);
  assert.match(commandSource, /buildDirectorWorkflowSeedPayload/);
  assert.match(executionSource, /pipelineEngine\.dispatch/);
  assert.match(
    pipelineSource,
    /pipelineCommand\.intent === "confirm_candidate"[\s\S]*confirmCandidate/,
  );
  assert.match(apiSource, /ApiResponse<DirectorCommandAcceptedResponse>/);
});

test("chapter title repair is queued through director commands", () => {
  const routeSource = readSource("server/src/routes/novelWorkflows.ts");
  const commandSource = readSource("server/src/services/novel/director/DirectorCommandService.ts");
  const pipelineSource = readSource("server/src/services/novel/director/DirectorPipelineEngine.ts");
  const hookSource = readSource("client/src/hooks/useDirectorChapterTitleRepair.ts");

  assert.match(
    routeSource,
    /repair-chapter-titles[\s\S]*enqueueChapterTitleRepairCommand[\s\S]*res\.status\(202\)/,
  );
  assert.match(commandSource, /commandType:\s*"repair_chapter_titles"/);
  assert.match(commandSource, /preserveLastError:\s*true/);
  assert.match(
    pipelineSource,
    /pipelineCommand\.intent === "repair_chapter_titles"[\s\S]*executeChapterTitleRepair/,
  );
  assert.doesNotMatch(
    hookSource,
    /invalidateQueries\(\{\s*queryKey:\s*queryKeys\.novels\.volumeWorkspace/,
    "Submitting title repair should not immediately refetch the full volume workspace.",
  );
});

test("director worker remains a separate entrypoint from the web api", () => {
  const rootPackage = JSON.parse(readSource("package.json"));
  const serverPackage = JSON.parse(readSource("server/package.json"));
  assert.match(rootPackage.scripts["dev:raw"], /dev:director-worker:wait/);
  assert.match(rootPackage.scripts["dev:desktop:raw"], /dev:director-worker:wait/);
  assert.match(serverPackage.scripts["dev:director-worker"], /src\/workers\/directorWorker\.ts/);
  assert.match(serverPackage.scripts["start:director-worker"], /dist\/workers\/directorWorker\.js/);
});

test("director command migrations keep queue indexes aligned across database providers", () => {
  const migrationPaths = [
    "server/src/prisma/migrations/20260429213000_director_run_commands/migration.sql",
    "server/src/prisma/migrations.sqlite/20260429213000_director_run_commands/migration.sql",
  ];
  const schemaPaths = [
    "server/src/prisma/schema.prisma",
    "server/src/prisma/schema.sqlite.prisma",
  ];

  for (const relativePath of migrationPaths) {
    const source = readSource(relativePath);
    assert.match(source, /CREATE TABLE "DirectorRunCommand"/);
    assert.match(source, /"commandType"/);
    assert.match(source, /"idempotencyKey"/);
    assert.match(source, /"payloadJson"/);
    assert.match(source, /DirectorRunCommand_taskId_commandType_idempotencyKey_key/);
    assert.match(source, /DirectorRunCommand_status_runAfter_updatedAt_idx/);
    assert.match(source, /DirectorRunCommand_taskId_status_updatedAt_idx/);
    assert.match(source, /DirectorRunCommand_leaseOwner_leaseExpiresAt_idx/);
    assert.match(source, /ON DELETE CASCADE/);
  }

  for (const relativePath of schemaPaths) {
    const source = readSource(relativePath);
    assert.match(source, /model DirectorRunCommand/);
    assert.match(source, /directorCommands\s+DirectorRunCommand\[\]/);
    assert.match(source, /@@unique\(\[taskId, commandType, idempotencyKey\]\)/);
    assert.match(source, /@@index\(\[leaseOwner, leaseExpiresAt\]\)/);
  }
});

test("director worker commands force a real continuation instead of trusting stale running task state", () => {
  const source = readSource("server/src/services/novel/director/DirectorPipelineEngine.ts");
  assert.doesNotMatch(
    source,
    /executeContinueTask\s*\(\s*command\.taskId\s*,\s*payload\s*\)/,
    "Director Worker must not pass command payload through unchanged because stale running tasks can swallow the command.",
  );
  assert.match(source, /pipelineCommand\.intent === "continue"/);
  assert.match(source, /pipelineCommand\.intent === "resume_from_checkpoint"/);
  assert.match(source, /pipelineCommand\.intent === "retry"/);
  assert.match(source, /pipelineCommand\.intent === "approve_gate"/);
  assert.match(
    source,
    /executeContinueTask\s*\(\s*pipelineCommand\.taskId\s*,\s*\{[\s\S]*\.\.\.pipelineCommand\.payload[\s\S]*forceResume:\s*true[\s\S]*\}\s*\)/,
    "Director Worker command execution must force continuation after a command has been leased.",
  );
});

test("candidate generation and refinement routes only enqueue commandized work", () => {
  const routeSource = readSource("server/src/routes/novelDirector.ts");
  const apiSource = readSource("client/src/api/novelDirector.ts");

  assert.match(routeSource, /"\/candidates"[\s\S]*enqueueGenerateCandidatesCommand[\s\S]*res\.status\(202\)/);
  assert.match(routeSource, /"\/refine"[\s\S]*enqueueRefineCandidatesCommand[\s\S]*res\.status\(202\)/);
  assert.match(routeSource, /"\/patch-candidate"[\s\S]*enqueuePatchCandidateCommand[\s\S]*res\.status\(202\)/);
  assert.match(routeSource, /"\/refine-titles"[\s\S]*enqueueRefineTitlesCommand[\s\S]*res\.status\(202\)/);
  assert.doesNotMatch(routeSource, /\.generateCandidates\s*\(/);
  assert.doesNotMatch(routeSource, /\.refineCandidates\s*\(/);
  assert.doesNotMatch(routeSource, /\.patchCandidate\s*\(/);
  assert.doesNotMatch(routeSource, /\.refineCandidateTitleOptions\s*\(/);
  assert.match(apiSource, /generateDirectorCandidates[\s\S]*Promise<ApiResponse<DirectorCommandAcceptedResponse>>/);
  assert.match(apiSource, /refineDirectorCandidates[\s\S]*Promise<ApiResponse<DirectorCommandAcceptedResponse>>/);
  assert.match(apiSource, /patchDirectorCandidate[\s\S]*Promise<ApiResponse<DirectorCommandAcceptedResponse>>/);
  assert.match(apiSource, /refineDirectorCandidateTitles[\s\S]*Promise<ApiResponse<DirectorCommandAcceptedResponse>>/);
});

test("policy update and waiting approval approval are explicit director commands", () => {
  const directorRouteSource = readSource("server/src/routes/novelDirector.ts");
  const workflowsRouteSource = readSource("server/src/routes/novelWorkflows.ts");
  const apiSource = readSource("client/src/api/novelDirector.ts");

  assert.match(directorRouteSource, /"\/runtime\/:taskId\/policy"[\s\S]*enqueuePolicyUpdateCommand[\s\S]*res\.status\(202\)/);
  assert.match(directorRouteSource, /continuationMode === "resume"[\s\S]*enqueueApproveGateCommand/);
  assert.match(workflowsRouteSource, /continuationMode === "resume"[\s\S]*enqueueApproveGateCommand/);
  assert.match(apiSource, /updateDirectorRuntimePolicy[\s\S]*Promise<ApiResponse<DirectorCommandAcceptedResponse>>/);
  assert.match(apiSource, /approveDirectorGate[\s\S]*Promise<ApiResponse<DirectorCommandAcceptedResponse>>/);
});

test("director continue command does not run workspace artifact analysis as a default preflight", () => {
  const source = readSource("server/src/services/novel/director/novelDirectorContinueRuntime.ts");
  assert.doesNotMatch(
    source,
    /analyzeWorkspace\s*\(/,
    "Continue/resume must not run full workspace analysis by default because it rewrites the artifact ledger and can block API reads on SQLite.",
  );
});

test("sqlite runtime is configured for reader-friendly worker writes", () => {
  const prismaSource = readSource("server/src/db/prisma.ts");
  const pragmaSource = readSource("server/src/db/sqlitePragmas.ts");
  assert.match(prismaSource, /configureSqliteRuntimePragmas/);
  assert.match(pragmaSource, /journal_mode\s*=\s*WAL/);
  assert.match(pragmaSource, /synchronous\s*=\s*NORMAL/);
});

test("director runtime persistence writes deltas instead of replaying full snapshots", () => {
  const storeSource = readSource("server/src/services/novel/director/runtime/DirectorRuntimeStore.ts");
  const persistenceSource = readSource("server/src/services/novel/director/runtime/DirectorRuntimePersistence.ts");
  assert.doesNotMatch(
    storeSource,
    /seedPayloadJson:\s*stringifySeedPayload/,
    "Runtime progress must not rewrite the workflow task seed payload on every node update.",
  );
  assert.match(persistenceSource, /buildDirectorRuntimePersistenceDelta/);
  assert.match(persistenceSource, /for \(const step of delta\.steps\)/);
  assert.match(persistenceSource, /for \(const event of delta\.events\)/);
  assert.match(persistenceSource, /const normalizedArtifacts = delta\.artifacts\.map/);
  assert.match(persistenceSource, /for \(const normalized of normalizedArtifacts\)/);
  assert.doesNotMatch(
    persistenceSource,
    /for \(const step of snapshot\.steps\)/,
    "Persistent runtime writes must not replay every known step on each heartbeat.",
  );
});

test("novel edit page avoids bulk workspace refresh during director execution", () => {
  const source = readSource("client/src/pages/novels/NovelEdit.tsx");
  assert.doesNotMatch(
    source,
    /Promise\.all\(\[[\s\S]*queryKeys\.novels\.volumeWorkspace\(id\)[\s\S]*queryKeys\.novels\.worldSlice\(id\)[\s\S]*\]\)/,
    "Director status changes must not bulk-refresh all novel workspace resources in parallel.",
  );
  assert.match(source, /activeAutoDirectorTask\.status === "queued" \|\| activeAutoDirectorTask\.status === "running"/);
  assert.match(source, /invalidateVisibleWorkspaceData/);
});

test("waiting approval continue is an explicit one-shot gate confirmation", () => {
  const novelEditSource = readSource("client/src/pages/novels/NovelEdit.tsx");
  const taskCenterSource = readSource("client/src/pages/tasks/TaskCenterPage.tsx");
  const continueRuntimeSource = readSource("server/src/services/novel/director/novelDirectorContinueRuntime.ts");
  const pipelineSource = readSource("server/src/services/novel/director/novelDirectorPipelineRuntime.ts");
  const orchestratorSource = readSource("server/src/services/novel/director/novelDirectorRuntimeOrchestrator.ts");

  assert.match(
    novelEditSource,
    /activeAutoDirectorTask\.status === "waiting_approval"[\s\S]*continuationMode:\s*"resume"/,
    "Novel edit waiting approval continue must send resume instead of an empty continue command.",
  );
  assert.match(
    taskCenterSource,
    /selectedTask\.status === "waiting_approval" \? "resume" : undefined/,
    "Task Center waiting approval continue must send resume instead of an empty continue command.",
  );
  assert.match(
    continueRuntimeSource,
    /approveCurrentGate\s*=\s*input\?\.continuationMode === "resume"/,
    "Director continue runtime must turn resume into a current-gate approval signal.",
  );
  assert.match(pipelineSource, /approveCurrentGate\?: boolean/);
  assert.match(orchestratorSource, /approveCurrentGate\?: boolean/);
  assert.match(orchestratorSource, /matchesPendingApprovedGate/);
  assert.match(orchestratorSource, /status !== "waiting_approval"/);
  assert.match(orchestratorSource, /mode:\s*"auto_safe_scope"/);
  assert.doesNotMatch(
    orchestratorSource,
    /updatePolicy\s*\(/,
    "One-shot gate confirmation must not persistently switch the whole runtime policy.",
  );
});
