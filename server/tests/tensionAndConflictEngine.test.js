const test = require("node:test");
const assert = require("node:assert/strict");
const { TensionAndConflictEngine } = require("../dist/services/world/TensionAndConflictEngine.js");

test("TensionAndConflictEngine - Local Tension Calculation", () => {
  const engine = new TensionAndConflictEngine();

  const location = {
    id: "loc_woods",
    hazardLevel: 3,        // 3 * 4 = 12
    securityModifier: 5    // Lawless modifier
  };

  // 1. Check lone agent
  const loneTension = engine.calculateLocalTension(location, [{ id: "agent1", stress: 8 }], []);
  assert.equal(loneTension, 17); // 12 + 5 = 17

  // 2. Multiple agents with relational tension
  const agents = [
    { id: "char_lin", stress: 7 },
    { id: "char_xue", stress: 6 }
  ];

  const relations = [
    { agentAId: "char_lin", agentBId: "char_xue", tension: 8 }
  ];

  // Formula: (7 * 6) * 8 * 0.01 + (3 * 4) + 5 = 3.36 + 12 + 5 = 20.36
  const localTension = engine.calculateLocalTension(location, agents, relations);
  assert.equal(localTension, 20.36);

  // 3. Overflow clamp verification
  const highStressAgents = [
    { id: "char_lin", stress: 10 },
    { id: "char_xue", stress: 10 },
    { id: "char_bao", stress: 10 }
  ];
  // Relational sum: (10*10)*10*0.01 + (10*10)*10*0.01 + (10*10)*10*0.01 = 10 + 10 + 10 = 30
  // Total: 30 + 12 + 5 = 47. If we push hazard to 25: 30 + 100 + 5 = 135 -> clamp 100
  const extremeLocation = { id: "extreme", hazardLevel: 25, securityModifier: 0 };
  const extremeTension = engine.calculateLocalTension(extremeLocation, highStressAgents, [
    { agentAId: "char_lin", agentBId: "char_xue", tension: 10 },
    { agentAId: "char_lin", agentBId: "char_bao", tension: 10 },
    { agentAId: "char_xue", agentBId: "char_bao", tension: 10 }
  ]);
  assert.equal(extremeTension, 100);
});

test("TensionAndConflictEngine - Global Tension Aggregation", () => {
  const engine = new TensionAndConflictEngine();

  // Test average of top 3 tensions: 90, 80, 70, (50 ignored)
  // Average: (90 + 80 + 70) / 3 = 240 / 3 = 80
  const localTensions = [90, 50, 80, 70];
  
  const globalTension = engine.calculateGlobalTension(localTensions, 5); // 80 + 5 = 85
  assert.equal(globalTension, 85);
});

test("TensionAndConflictEngine - Encounter Box Detection", () => {
  const engine = new TensionAndConflictEngine();

  const intentions = [
    {
      characterId: "char_lin",
      locationId: "loc_pavilion",
      actionGoal: "confront",
      isAggressive: true // Aggressive intent!
    },
    {
      characterId: "char_bao",
      locationId: "loc_pavilion",
      actionGoal: "read_poetry",
      isAggressive: false
    },
    {
      characterId: "char_jia",
      locationId: "loc_hall",
      actionGoal: "trade",
      isAggressive: false
    },
    {
      characterId: "char_wang",
      locationId: "loc_hall",
      actionGoal: "trade",
      isAggressive: false
    }
  ];

  const localTensions = {
    "loc_pavilion": 40,
    "loc_hall": 80 // High node tension!
  };

  const encounters = engine.detectEncounters(intentions, localTensions);

  // Should group loc_pavilion and loc_hall encounters
  assert.equal(encounters.length, 2);

  const pavilionEnc = encounters.find(e => e.locationId === "loc_pavilion");
  assert.ok(pavilionEnc);
  assert.equal(pavilionEnc.triggerArbitration, true);
  assert.match(pavilionEnc.reason, /Aggressive action/);

  const hallEnc = encounters.find(e => e.locationId === "loc_hall");
  assert.ok(hallEnc);
  assert.equal(hallEnc.triggerArbitration, true);
  assert.match(hallEnc.reason, /Node tension is critical/);
});

test("TensionAndConflictEngine - Pacing Scale Shift Rules", () => {
  const engine = new TensionAndConflictEngine();

  // High tension -> micro
  assert.equal(engine.determinePacingScale(75, [30, 40]), "micro");

  // Critical local node -> micro
  assert.equal(engine.determinePacingScale(40, [80, 20]), "micro");

  // Low tension -> macro
  assert.equal(engine.determinePacingScale(25, [20, 30]), "macro");

  // Normal tension -> normal
  assert.equal(engine.determinePacingScale(50, [40, 60]), "normal");
});

test("TensionAndConflictEngine - Custom Arbitration Rules", () => {
  const engine = new TensionAndConflictEngine();

  const agentA = {
    id: "char_lin",
    name: "林黛玉",
    combatPower: 2,
    status: { intelligence: 10 }
  };

  const agentB = {
    id: "char_xue",
    name: "薛宝钗",
    combatPower: 2,
    status: { intelligence: 9 }
  };

  // Run debate arbitration (intellectual rule)
  const debateResult = engine.arbitrateConflict("court_debate", agentA, agentB, "辩驳规则：依据 intelligence 判断输赢");
  
  assert.ok(debateResult.winnerId);
  assert.ok(debateResult.loserId);
  assert.match(debateResult.narrativeResult, /在公堂辩论中/);
  assert.match(debateResult.narrativeResult, /成功驳倒/);

  // Check stress changes: winner stress should drop (-2), loser stress should rise (+4)
  if (debateResult.winnerId === "char_lin") {
    assert.equal(debateResult.stressChangeA, -2);
    assert.equal(debateResult.stressChangeB, 4);
  } else {
    assert.equal(debateResult.stressChangeA, 4);
    assert.equal(debateResult.stressChangeB, -2);
  }
});
