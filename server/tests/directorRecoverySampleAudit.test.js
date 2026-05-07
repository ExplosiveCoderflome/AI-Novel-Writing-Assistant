const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");

const {
  buildDirectorRecoverySampleAudit,
} = require("../dist/services/novel/director/directorRecoverySampleAudit.js");

function hash(value) {
  return crypto.createHash("sha256").update(value.trim()).digest("hex");
}

test("director recovery sample audit classifies real-data recovery fixtures", () => {
  const audit = buildDirectorRecoverySampleAudit({
    tasks: [
      {
        id: "task-takeover-recovery",
        novelId: "novel-1",
        status: "running",
        pendingManualRecovery: true,
        currentStage: "AI 自动导演",
        currentItemKey: "takeover",
        currentItemLabel: "自动导演接管任务已提交",
        seedPayloadJson: "{}",
        resumeTargetJson: JSON.stringify({ stage: "basic" }),
        lastError: "missing context",
        updatedAt: "2026-04-29T00:00:00.000Z",
      },
      {
        id: "task-chapter_range",
        novelId: "novel-2",
        status: "waiting_approval",
        pendingManualRecovery: false,
        checkpointType: "chapter_batch_ready",
        currentStage: "chapter_execution",
        currentItemKey: "chapter_execution",
        currentItemLabel: "waiting",
        seedPayloadJson: JSON.stringify({
          directorInput: { runMode: "auto_to_execution" },
          directorSession: { phase: "chapter_batch_ready" },
          autoExecution: { mode: "chapter_range", nextChapterOrder: 1 },
        }),
        resumeTargetJson: JSON.stringify({ stage: "chapter" }),
        updatedAt: "2026-04-29T00:01:00.000Z",
      },
      {
        id: "task-fk",
        novelId: "novel-4",
        status: "failed",
        pendingManualRecovery: true,
        currentStage: "chapter_sync",
        currentItemKey: "chapter_sync",
        currentItemLabel: "sync failed",
        seedPayloadJson: JSON.stringify({
          directorInput: { runMode: "auto_to_ready" },
          directorSession: { phase: "structured_outline" },
        }),
        resumeTargetJson: JSON.stringify({ stage: "structured" }),
        lastError: "Invalid `prisma.directorArtifactDependency.upsert()` invocation Foreign key constraint violated",
        updatedAt: "2026-04-29T00:07:00.000Z",
      },
      {
        id: "task-old-fk",
        novelId: "novel-2",
        status: "failed",
        pendingManualRecovery: true,
        currentStage: "chapter_sync",
        currentItemKey: "chapter_sync",
        currentItemLabel: "old sync failed",
        seedPayloadJson: JSON.stringify({
          directorInput: { runMode: "auto_to_ready" },
          directorSession: { phase: "structured_outline" },
        }),
        resumeTargetJson: JSON.stringify({ stage: "structured" }),
        lastError: "Invalid `prisma.directorArtifactDependency.upsert()` invocation Foreign key constraint violated",
        updatedAt: "2026-04-29T00:00:30.000Z",
      },
      {
        id: "task-timeout",
        novelId: "novel-3",
        status: "failed",
        pendingManualRecovery: false,
        currentStage: "chapter_list",
        currentItemKey: "chapter_list",
        currentItemLabel: "timeout",
        seedPayloadJson: JSON.stringify({
          directorInput: { runMode: "auto_to_execution" },
        }),
        resumeTargetJson: JSON.stringify({ stage: "basic" }),
        lastError: "[STRUCTURED_OUTPUT:transport_error] Request timed out.",
        updatedAt: "2026-04-29T00:08:00.000Z",
      },
    ],
    commands: [
      {
        id: "cmd-1",
        taskId: "task-takeover-recovery",
        novelId: "novel-1",
        commandType: "takeover",
        status: "failed",
        payloadJson: JSON.stringify({
          takeoverRequest: {
            novelId: "novel-1",
            entryStep: "structured",
          },
        }),
        updatedAt: "2026-04-29T00:02:00.000Z",
      },
      {
        id: "cmd-confirm",
        taskId: "task-chapter_range",
        novelId: "novel-2",
        commandType: "confirm_candidate",
        status: "failed",
        payloadJson: JSON.stringify({ candidateId: "candidate-1" }),
        updatedAt: "2026-04-29T00:09:00.000Z",
      },
      {
        id: "cmd-title",
        taskId: "task-chapter_range",
        novelId: "novel-2",
        commandType: "repair_chapter_titles",
        status: "stale",
        payloadJson: JSON.stringify({}),
        updatedAt: "2026-04-29T00:10:00.000Z",
      },
      {
        id: "cmd-retry",
        taskId: "task-timeout",
        novelId: "novel-3",
        commandType: "retry",
        status: "failed",
        payloadJson: JSON.stringify({}),
        updatedAt: "2026-04-29T00:11:00.000Z",
      },
      {
        id: "cmd-cancel",
        taskId: "task-timeout",
        novelId: "novel-3",
        commandType: "cancel",
        status: "succeeded",
        payloadJson: JSON.stringify({}),
        updatedAt: "2026-04-29T00:12:00.000Z",
      },
    ],
    jobs: [
      {
        id: "job-1",
        novelId: "novel-2",
        status: "failed",
        currentStage: "generating_chapters",
        currentItemLabel: "chapter 1",
        startOrder: 1,
        endOrder: 10,
        completedCount: 7,
        totalCount: 10,
        updatedAt: "2026-04-29T00:03:00.000Z",
      },
    ],
    artifacts: [
      {
        id: "chapter_draft:chapter:chapter-1:Chapter:chapter-1",
        novelId: "novel-2",
        artifactType: "chapter_draft",
        targetType: "chapter",
        targetId: "chapter-1",
        version: 1,
        status: "active",
        source: "user_edited",
        contentTable: "Chapter",
        contentId: "chapter-1",
        contentHash: hash("old chapter content"),
        protectedUserContent: true,
        updatedAt: "2026-04-29T00:04:00.000Z",
      },
    ],
    chapters: [
      {
        id: "chapter-1",
        novelId: "novel-2",
        order: 1,
        title: "Chapter 1",
        content: "new chapter content",
        updatedAt: "2026-04-29T00:05:00.000Z",
      },
    ],
    draftChapters: [
      {
        id: "chapter-1",
        novelId: "novel-2",
        order: 1,
        title: "Chapter 1",
        content: "new chapter content",
        updatedAt: "2026-04-29T00:05:00.000Z",
      },
      {
        id: "chapter-2",
        novelId: "novel-2",
        order: 2,
        title: "Chapter 2",
        content: "draft without ledger baseline",
        updatedAt: "2026-04-29T00:06:00.000Z",
      },
    ],
  });

  assert.equal(audit.counts.autoDirectorTasks, 5);
  assert.equal(audit.counts.takeoverCommands, 1);
  assert.equal(audit.counts.confirmCandidateCommands, 1);
  assert.equal(audit.counts.titleRepairCommands, 1);
  assert.equal(audit.counts.retryOrResumeCommands, 1);
  assert.equal(audit.counts.cancelCommands, 1);
  assert.equal(audit.counts.failedOrStaleCommands, 4);
  assert.equal(audit.counts.recoveryTasks, 4);
  assert.equal(audit.counts.chapterBatchTasks, 1);
  assert.equal(audit.counts.waitingTasks, 1);
  assert.equal(audit.counts.contextlessTakeoverRecoveryTasks, 1);
  assert.equal(audit.counts.diagnosedTasks, 5);
  assert.equal(audit.counts.diagnosedCommands, 4);
  assert.equal(audit.counts.manualEditCandidates, 1);
  assert.equal(audit.counts.manualEditHashChanged, 1);
  assert.equal(audit.counts.draftBaselineArtifacts, 1);
  assert.equal(audit.counts.untrackedDraftChapters, 1);
  assert.equal(audit.samples.recoveryTasks[0].id, "task-takeover-recovery");
  assert.equal(audit.samples.contextlessTakeoverRecoveryTasks[0].id, "task-takeover-recovery");
  assert.equal(audit.samples.chapterBatchTasks[0].runMode, "auto_to_execution");
  assert.deepEqual(
    audit.samples.taskDiagnostics.map((diagnosis) => diagnosis.code),
    [
      "artifact_dependency_fk_failure",
      "contextless_takeover_recovery",
      "llm_transport_failure",
      "manual_approval_gate",
      "superseded_by_newer_auto_director_task",
    ],
  );
  assert.equal(
    audit.samples.taskDiagnostics.find((diagnosis) => diagnosis.taskId === "task-fk").category,
    "historical_compatibility",
  );
  assert.equal(
    audit.samples.taskDiagnostics.find((diagnosis) => diagnosis.taskId === "task-old-fk").supersededByTaskId,
    "task-chapter_range",
  );
  assert.deepEqual(
    audit.samples.commandDiagnostics.map((diagnosis) => diagnosis.code),
    [
      "candidate_confirmation_command_needs_recovery",
      "takeover_command_failed",
      "recovery_command_failed",
      "title_repair_failure_isolated",
    ],
  );
  assert.equal(audit.samples.manualEditCandidates[0].hashChanged, true);
  assert.equal(audit.samples.untrackedDraftChapters[0].chapterId, "chapter-2");
});

test("director recovery sample audit checks draft baselines separately from protected artifacts", () => {
  const audit = buildDirectorRecoverySampleAudit({
    tasks: [],
    commands: [],
    jobs: [],
    artifacts: [],
    chapters: [],
    draftBaselineArtifacts: [
      {
        id: "chapter_draft:chapter:chapter-1:Chapter:chapter-1",
        novelId: "novel-2",
        artifactType: "chapter_draft",
        targetType: "chapter",
        targetId: "chapter-1",
        version: 1,
        status: "active",
        source: "inventory_backfill",
        contentTable: "Chapter",
        contentId: "chapter-1",
        contentHash: hash("chapter with ordinary ledger baseline"),
        protectedUserContent: false,
        updatedAt: "2026-04-29T00:04:00.000Z",
      },
    ],
    draftChapters: [
      {
        id: "chapter-1",
        novelId: "novel-2",
        order: 1,
        title: "Chapter 1",
        content: "chapter with ordinary ledger baseline",
        updatedAt: "2026-04-29T00:05:00.000Z",
      },
      {
        id: "chapter-2",
        novelId: "novel-2",
        order: 2,
        title: "Chapter 2",
        content: "draft without ledger baseline",
        updatedAt: "2026-04-29T00:06:00.000Z",
      },
    ],
  });

  assert.equal(audit.counts.protectedOrStaleArtifacts, 0);
  assert.equal(audit.counts.draftBaselineArtifacts, 1);
  assert.equal(audit.counts.untrackedDraftChapters, 1);
  assert.equal(audit.samples.untrackedDraftChapters[0].chapterId, "chapter-2");
});
