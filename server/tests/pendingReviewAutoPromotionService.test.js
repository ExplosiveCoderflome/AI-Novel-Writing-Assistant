const test = require("node:test");
const assert = require("node:assert/strict");

const {
  PendingReviewAutoPromotionService,
} = require("../dist/services/novel/state/PendingReviewAutoPromotionService.js");
const {
  buildStateProposalSubjectKey,
} = require("../dist/services/novel/state/stateProposalSubjectKey.js");

function row(overrides = {}) {
  const payload = overrides.payload ?? {};
  return {
    id: overrides.id ?? "proposal-1",
    novelId: "novel-1",
    chapterId: overrides.chapterId ?? null,
    sourceSnapshotId: null,
    sourceType: "chapter_background_sync",
    sourceStage: "chapter_execution",
    proposalType: overrides.proposalType ?? "relation_state_update",
    riskLevel: overrides.riskLevel ?? "medium",
    status: overrides.status ?? "pending_review",
    summary: overrides.summary ?? "proposal summary",
    payloadJson: JSON.stringify(payload),
    evidenceJson: JSON.stringify(overrides.evidence ?? ["evidence"]),
    validationNotesJson: JSON.stringify(overrides.validationNotes ?? []),
    createdAt: new Date(overrides.createdAt ?? "2026-06-02T00:00:00.000Z"),
    updatedAt: new Date(overrides.updatedAt ?? overrides.createdAt ?? "2026-06-02T00:00:00.000Z"),
  };
}

function buildProposalStore(rows, calls = {}) {
  return {
    async findMany(args) {
      calls.findMany = (calls.findMany ?? 0) + 1;
      const where = args?.where ?? {};
      if (where.id) {
        return rows.filter((item) => item.id === where.id && (!where.status || item.status === where.status));
      }
      return rows
        .filter((item) => item.novelId === where.novelId)
        .filter((item) => item.status === where.status)
        .filter((item) => where.proposalType?.in?.includes(item.proposalType))
        .filter((item) => !where.createdAt?.gt || item.createdAt > where.createdAt.gt)
        .filter((item) => !where.createdAt?.lte || item.createdAt <= where.createdAt.lte)
        .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime())
        .slice(0, args?.take ?? rows.length);
    },
    async update(args) {
      calls.update = (calls.update ?? 0) + 1;
      calls.lastUpdate = args;
      const item = rows.find((candidate) => candidate.id === args.where.id);
      if (item) {
        item.status = args.data.status;
        item.validationNotesJson = args.data.validationNotesJson;
      }
      return item;
    },
  };
}

test("stateProposalSubjectKey groups supported proposal payloads", () => {
  assert.equal(
    buildStateProposalSubjectKey({
      proposalType: "relation_state_update",
      payload: { sourceCharacterId: "Char-A", targetCharacterId: "Char-B" },
    }),
    "relation_state_update:char-a:char-b",
  );
  assert.equal(
    buildStateProposalSubjectKey({
      proposalType: "information_disclosure",
      payload: { holderType: "reader", holderRefId: null, fact: "  Secret Door  " },
    }),
    "information_disclosure:reader:global:secret door",
  );
  assert.equal(
    buildStateProposalSubjectKey({
      proposalType: "character_state_update",
      payload: { characterId: "char-1" },
    }),
    null,
  );
});

test("PendingReviewAutoPromotionService preview protects baseline and skips open conflicts", async () => {
  const rows = [
    row({
      id: "before-baseline",
      createdAt: "2026-05-30T00:00:00.000Z",
      payload: { sourceCharacterId: "char-1", targetCharacterId: "char-2" },
    }),
    row({
      id: "relation-old",
      createdAt: "2026-06-02T00:00:00.000Z",
      payload: { sourceCharacterId: "char-1", targetCharacterId: "char-2", chapterOrder: 3 },
    }),
    row({
      id: "relation-latest",
      createdAt: "2026-06-03T00:00:00.000Z",
      payload: { sourceCharacterId: "char-1", targetCharacterId: "char-2", chapterOrder: 4 },
    }),
    row({
      id: "conflict-hit",
      proposalType: "information_disclosure",
      chapterId: "chapter-conflict",
      createdAt: "2026-06-04T00:00:00.000Z",
      payload: { holderType: "reader", holderRefId: null, fact: "the door is alive", chapterOrder: 5 },
    }),
    row({
      id: "too-new",
      proposalType: "information_disclosure",
      createdAt: "2026-06-25T00:00:00.000Z",
      payload: { holderType: "reader", holderRefId: null, fact: "late fact", chapterOrder: 7 },
    }),
    row({
      id: "malformed",
      createdAt: "2026-06-05T00:00:00.000Z",
      payload: { sourceCharacterId: "", targetCharacterId: "char-3" },
    }),
  ];
  const service = new PendingReviewAutoPromotionService({
    proposalStore: buildProposalStore(rows),
    conflictStore: {
      async findMany() {
        return [{
          id: "conflict-1",
          chapterId: "chapter-conflict",
          conflictType: "continuity",
          conflictKey: "chapter-conflict",
          title: "章节冲突",
          summary: "关系与信息冲突",
          severity: "high",
          affectedCharacterIdsJson: null,
          evidenceJson: null,
          resolutionHint: null,
          lastSeenChapterOrder: 5,
        }];
      },
    },
    now: () => new Date("2026-07-01T00:00:00.000Z"),
  });

  const result = await service.preview("novel-1", {
    since: "2026-06-01T00:00:00.000Z",
    eligibleAfterDays: 14,
    runLimit: 10,
  });

  assert.deepEqual(result.promotable.map((item) => item.proposalId), ["relation-latest"]);
  assert.deepEqual(result.superseded.map((item) => item.proposalId), ["relation-old"]);
  assert.deepEqual(result.conflictSkipped.map((item) => item.proposalId), ["conflict-hit"]);
  assert.equal(result.malformedCount, 1);
  assert.equal(result.promotable.some((item) => item.proposalId === "before-baseline"), false);
  assert.equal(result.promotable.some((item) => item.proposalId === "too-new"), false);
});

test("PendingReviewAutoPromotionService dryRun does not write", async () => {
  const rows = [
    row({
      id: "relation-latest",
      createdAt: "2026-06-03T00:00:00.000Z",
      payload: { sourceCharacterId: "char-1", targetCharacterId: "char-2" },
    }),
  ];
  const service = new PendingReviewAutoPromotionService({
    proposalStore: {
      async findMany() {
        return rows;
      },
      async update() {
        throw new Error("dryRun should not update proposals");
      },
    },
    conflictStore: { async findMany() { return []; } },
    stateCommitService: {
      async commitExistingProposals() {
        throw new Error("dryRun should not commit proposals");
      },
    },
    ledgerEventService: {
      async recordEvent() {
        throw new Error("dryRun should not record ledger events");
      },
    },
    now: () => new Date("2026-07-01T00:00:00.000Z"),
  });

  const result = await service.apply("novel-1", {
    since: "2026-06-01T00:00:00.000Z",
    dryRun: true,
    eligibleAfterDays: 14,
  });

  assert.deepEqual(result.promotable.map((item) => item.proposalId), ["relation-latest"]);
  assert.equal(result.dryRun, true);
});

test("PendingReviewAutoPromotionService apply supersedes older proposals and commits latest", async () => {
  const calls = {};
  const rows = [
    row({
      id: "relation-old",
      createdAt: "2026-06-02T00:00:00.000Z",
      payload: { sourceCharacterId: "char-1", targetCharacterId: "char-2" },
      validationNotes: ["requires manual review"],
    }),
    row({
      id: "relation-latest",
      createdAt: "2026-06-03T00:00:00.000Z",
      payload: { sourceCharacterId: "char-1", targetCharacterId: "char-2" },
    }),
  ];
  const ledgerEvents = [];
  const service = new PendingReviewAutoPromotionService({
    proposalStore: buildProposalStore(rows, calls),
    conflictStore: { async findMany() { return []; } },
    stateCommitService: {
      async commitExistingProposals(input) {
        calls.commit = input;
        return {
          versionRecord: null,
          committed: input.proposalIds.map((id) => ({ id })),
          pendingReview: [],
          rejected: [],
        };
      },
    },
    ledgerEventService: {
      async recordEvent(input) {
        ledgerEvents.push(input);
      },
    },
    warn: (_message, details) => {
      calls.warnDetails = details;
    },
    now: () => new Date("2026-07-01T00:00:00.000Z"),
  });

  const result = await service.apply("novel-1", {
    since: "2026-06-01T00:00:00.000Z",
    dryRun: false,
    eligibleAfterDays: 14,
    runLimit: 10,
  });

  assert.deepEqual(result.promotable.map((item) => item.proposalId), ["relation-latest"]);
  assert.deepEqual(result.superseded.map((item) => item.proposalId), ["relation-old"]);
  assert.equal(rows[0].status, "rejected");
  assert.match(rows[0].validationNotesJson, /已被更新提案覆盖/);
  assert.deepEqual(calls.commit.proposalIds, ["relation-latest"]);
  assert.equal(ledgerEvents.length, 1);
  assert.equal(ledgerEvents[0].type, "pending_review_auto_promotion");
  assert.equal(calls.warnDetails.promotedCount, 1);
  assert.equal(calls.warnDetails.supersededCount, 1);
});

