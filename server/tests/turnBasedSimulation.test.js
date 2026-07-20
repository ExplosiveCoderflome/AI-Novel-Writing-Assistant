const test = require("node:test");
const assert = require("node:assert/strict");
const { SandboxLlmScheduler } = require("../dist/llm/sandboxLlmScheduler.js");
const { TensionAndConflictEngine } = require("../dist/services/world/TensionAndConflictEngine.js");

test("SandboxLlmScheduler - Sequential Execution and Priority Queueing", async () => {
  // Concurrency = 1, interval = 10ms for quick test
  const scheduler = new SandboxLlmScheduler({ maxConcurrency: 1, requestIntervalMs: 10 });
  const start = Date.now();
  const runSequence = [];

  // Submit three tasks.
  // Task A: Low priority (3), submitted first
  // Task B: High priority (1), submitted second
  // Task C: Normal priority (2), submitted third
  // All submitted in the same tick 0
  const taskAPromise = scheduler.schedule("client_A", 0, 3, async () => {
    runSequence.push("A");
    return "A_done";
  });

  const taskBPromise = scheduler.schedule("client_B", 0, 1, async () => {
    runSequence.push("B");
    return "B_done";
  });

  const taskCPromise = scheduler.schedule("client_C", 0, 2, async () => {
    runSequence.push("C");
    return "C_done";
  });

  // Await all
  const results = await Promise.all([taskAPromise, taskBPromise, taskCPromise]);

  assert.deepEqual(results, ["A_done", "B_done", "C_done"]);
  
  // Sequence check:
  // First task scheduled is popped immediately before others arrive (concurrency slot 1 is free).
  // So "A" runs first because it starts processing before B and C are queued/sorted.
  // Then slot is busy. B and C are queued.
  // When A finishes, the queue is sorted. High priority (1) "B" should run next, followed by Normal (2) "C".
  assert.deepEqual(runSequence, ["A", "B", "C"]);
});

test("TensionAndConflictEngine - sortActionsByInitiative", () => {
  const engine = new TensionAndConflictEngine();

  const actions = [
    { characterId: "char_lin", actionType: "ATTACK", intentionSpeed: 50 }, // Weight: 30
    { characterId: "char_xue", actionType: "FLEE", intentionSpeed: 50 },   // Weight: 40
    { characterId: "char_bao", actionType: "DEFEND", intentionSpeed: 50 }  // Weight: 50
  ];

  const charactersState = [
    { id: "char_lin", name: "林黛玉", customProperties: { agility: 10 } },
    { id: "char_xue", name: "薛宝钗", customProperties: { agility: 20 } },
    { id: "char_bao", name: "贾宝玉", customProperties: { agility: 10 } }
  ];

  const sorted = engine.sortActionsByInitiative(actions, charactersState);

  assert.equal(sorted.length, 3);
  // DEFEND (bao) priority is highest, FLEE (xue) is second, ATTACK (lin) is lowest
  assert.equal(sorted[0].characterId, "char_bao");
  assert.equal(sorted[1].characterId, "char_xue");
  assert.equal(sorted[2].characterId, "char_lin");
});

test("TensionAndConflictEngine - resolveInitiativeChain (Causality & Turn-based Logic)", () => {
  const engine = new TensionAndConflictEngine();

  // Test Case A: B flees out of room瀟湘館 (loc_1) before A's attack lands
  const charactersState = [
    { id: "char_lin", name: "林黛玉", locationId: "loc_1", stress: 2, hunger: 20, energy: 80, sanity: 80, customProperties: { agility: 5 } },
    { id: "char_xue", name: "薛宝钗", locationId: "loc_1", stress: 2, hunger: 20, energy: 80, sanity: 80, customProperties: { agility: 25 } }
  ];

  // Actions sorted by initiative: FLEE (xue) resolves first, ATTACK (lin) second
  const sortedActions = [
    { characterId: "char_xue", actionType: "FLEE", targetLocationId: "loc_2" },
    { characterId: "char_lin", actionType: "ATTACK", targetId: "char_xue" }
  ];

  const customConflictSchemas = [
    { conflictType: "battle", arbitrationRule: "力量境界比拼" }
  ];

  const { narrativeLogs } = engine.resolveInitiativeChain(sortedActions, charactersState, customConflictSchemas);

  // Assertion check:
  // 1. 薛宝钗 successfully fled to loc_2
  assert.equal(charactersState.find(c => c.id === "char_xue").locationId, "loc_2");
  // 2. 林黛玉's attack missed because 薛宝钗 is no longer in loc_1
  assert.ok(narrativeLogs.some(log => log.includes("冲突落空") && log.includes("林黛玉") && log.includes("薛宝钗")));
});

test("TensionAndConflictEngine - resolveInitiativeChain with Custom Conflict Rules and Properties", () => {
  const engine = new TensionAndConflictEngine();

  const charactersState = [
    { id: "char_lin", name: "林黛玉", locationId: "loc_1", stress: 2, hunger: 20, energy: 80, sanity: 80, customProperties: { intelligence: 30 } },
    { id: "char_xue", name: "薛宝钗", locationId: "loc_1", stress: 2, hunger: 20, energy: 80, sanity: 80, customProperties: { intelligence: 10 } }
  ];

  // Actions sorted: COURT_DEBATE (lin against xue)
  const sortedActions = [
    { characterId: "char_lin", actionType: "COURT_DEBATE", targetId: "char_xue" }
  ];

  const customConflictSchemas = [
    { conflictType: "COURT_DEBATE", conflictLabel: "公堂辩论", arbitrationRule: "依据 intelligence 判定输赢" }
  ];

  const { narrativeLogs } = engine.resolveInitiativeChain(sortedActions, charactersState, customConflictSchemas);

  // Assertion check:
  // Since Lin has 30 intelligence vs Xue's 10, Lin should win.
  // The result should include "公堂辩论中" or debate narrative
  assert.ok(narrativeLogs.some(log => log.includes("冲突结算") && log.includes("林黛玉") && log.includes("薛宝钗")));
});

