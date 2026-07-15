const test = require("node:test");
const assert = require("node:assert/strict");
const { ChronologyBranchEngine } = require("../dist/services/world/ChronologyBranchEngine.js");
const { prisma } = require("../dist/db/prisma.js");

test("ChronologyBranchEngine - Zero-Copy Snapshot Inheritance Routing", async () => {
  const engine = new ChronologyBranchEngine();

  // 1. Back up original methods
  const original = {
    branchFindUnique: prisma.sandboxBranch.findUnique,
    snapshotFindUnique: prisma.sandboxSnapshot.findUnique,
    branchCreate: prisma.sandboxBranch.create
  };

  // Mock DB state
  const mockBranches = [
    { id: "parent-branch", novelId: "novel-123", name: "Main", parentBranchId: null, parentForkTick: null },
    { id: "child-branch", novelId: "novel-123", name: "Universe B", parentBranchId: "parent-branch", parentForkTick: 5 }
  ];

  const mockSnapshots = [
    { id: "snap-p5", branchId: "parent-branch", tickIndex: 5, stateJson: '{"tick": 5, "origin": "parent"}' },
    { id: "snap-c6", branchId: "child-branch", tickIndex: 6, stateJson: '{"tick": 6, "origin": "child"}' }
  ];

  prisma.sandboxBranch.findUnique = async ({ where }) => {
    return mockBranches.find(b => b.id === where.id) || null;
  };

  prisma.sandboxSnapshot.findUnique = async ({ where }) => {
    const { branchId, tickIndex } = where.branchId_tickIndex;
    return mockSnapshots.find(s => s.branchId === branchId && s.tickIndex === tickIndex) || null;
  };

  prisma.sandboxBranch.create = async ({ data }) => {
    const record = { id: `branch-new-${Date.now()}`, ...data, createdAt: new Date() };
    mockBranches.push(record);
    return record;
  };

  try {
    // A. Query Tick 6 on Child branch -> should return Child snapshot
    const snap6 = await engine.getSnapshot("child-branch", 6);
    assert.ok(snap6);
    assert.equal(snap6.id, "snap-c6");

    // B. Query Tick 5 on Child branch -> should climb to Parent and return Parent snapshot (Zero-copy inheritance)
    const snap5 = await engine.getSnapshot("child-branch", 5);
    assert.ok(snap5);
    assert.equal(snap5.id, "snap-p5");

    // C. Query Tick 7 on Child branch -> does not exist anywhere -> returns null
    const snap7 = await engine.getSnapshot("child-branch", 7);
    assert.equal(snap7, null);

    // D. Fork branch test
    const newBranch = await engine.forkBranch("novel-123", "Universe C", "child-branch", 6);
    assert.ok(newBranch);
    assert.equal(newBranch.parentBranchId, "child-branch");
    assert.equal(newBranch.parentForkTick, 6);

  } finally {
    // Restore prisma methods
    prisma.sandboxBranch.findUnique = original.branchFindUnique;
    prisma.sandboxSnapshot.findUnique = original.snapshotFindUnique;
    prisma.sandboxBranch.create = original.branchCreate;
  }
});

test("ChronologyBranchEngine - Future Causality Pruning", async () => {
  const engine = new ChronologyBranchEngine();

  // 1. Back up original methods
  const original = {
    branchFindUnique: prisma.sandboxBranch.findUnique,
    snapshotDeleteMany: prisma.sandboxSnapshot.deleteMany,
    chronologyDeleteMany: prisma.sandboxChronology.deleteMany,
    chapterUpdateMany: prisma.chapter.updateMany
  };

  // Mock states
  let mockSnapshots = [
    { id: "s5", branchId: "child-branch", tickIndex: 5 },
    { id: "s6", branchId: "child-branch", tickIndex: 6 },
    { id: "s7", branchId: "child-branch", tickIndex: 7 }
  ];

  let mockChronologies = [
    { id: "c5", branchId: "child-branch", tickIndex: 5 },
    { id: "c6", branchId: "child-branch", tickIndex: 6 },
    { id: "c7", branchId: "child-branch", tickIndex: 7 }
  ];

  let chaptersUpdated = false;

  prisma.sandboxBranch.findUnique = async ({ where }) => {
    return { id: "child-branch", novelId: "novel-123" };
  };

  prisma.sandboxSnapshot.deleteMany = async ({ where }) => {
    const initialCount = mockSnapshots.length;
    mockSnapshots = mockSnapshots.filter(
      s => !(s.branchId === where.branchId && s.tickIndex >= where.tickIndex.gte)
    );
    return { count: initialCount - mockSnapshots.length };
  };

  prisma.sandboxChronology.deleteMany = async ({ where }) => {
    const initialCount = mockChronologies.length;
    mockChronologies = mockChronologies.filter(
      c => !(c.branchId === where.branchId && c.tickIndex >= where.tickIndex.gte)
    );
    return { count: initialCount - mockChronologies.length };
  };

  prisma.chapter.updateMany = async ({ where, data }) => {
    chaptersUpdated = true;
    return { count: 2 };
  };

  try {
    // Prune history at Tick 6 -> should delete ticks 6 and 7
    const result = await engine.pruneBranchFuture("child-branch", 6);
    
    assert.equal(result.snapshotsDeleted, 2);
    assert.equal(result.chronologiesDeleted, 2);
    
    // Tick 5 should remain
    assert.equal(mockSnapshots.length, 1);
    assert.equal(mockSnapshots[0].id, "s5");

    assert.equal(mockChronologies.length, 1);
    assert.equal(mockChronologies[0].id, "c5");

    // Chapters status should have been updated to needs_repair
    assert.equal(chaptersUpdated, true);

  } finally {
    prisma.sandboxBranch.findUnique = original.branchFindUnique;
    prisma.sandboxSnapshot.deleteMany = original.snapshotDeleteMany;
    prisma.sandboxChronology.deleteMany = original.chronologyDeleteMany;
    prisma.chapter.updateMany = original.chapterUpdateMany;
  }
});
