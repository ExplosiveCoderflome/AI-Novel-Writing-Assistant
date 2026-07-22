const test = require("node:test");
const assert = require("node:assert/strict");
const { CharacterAgentSimulator } = require("../dist/services/world/CharacterAgentSimulator.js");

test("CharacterAgentSimulator - Ebbinghaus Memory Decay", () => {
  const simulator = new CharacterAgentSimulator();
  
  const memories = [
    {
      id: "mem1",
      fact: "林黛玉葬花于桃林",
      salience: 0.8,
      tickCreated: 0,
      lastUpdatedTick: 0
    },
    {
      id: "mem2",
      fact: "贾宝玉丢了通灵宝玉",
      salience: 0.2, // Borderline salience
      tickCreated: 0,
      lastUpdatedTick: 0
    }
  ];

  // Decay memories by 5 ticks
  const updatedMemories = simulator.decayMemories(memories, 5, 0.05);

  // mem1 should decay but remain active
  const mem1 = updatedMemories.find(m => m.id === "mem1");
  assert.ok(mem1, "mem1 should still exist");
  assert.ok(mem1.salience < 0.8, "mem1 salience should have decreased");
  assert.equal(mem1.lastUpdatedTick, 5);

  // mem2 should have dropped below 0.15 (0.2 * e^(-0.05 * 5) = 0.2 * 0.778 = 0.155? Let's check with 10 ticks to guarantee drop)
  const updatedMemories10 = simulator.decayMemories(memories, 10, 0.05);
  const mem2 = updatedMemories10.find(m => m.id === "mem2");
  assert.equal(mem2, undefined, "mem2 should be forgotten after 10 ticks");
});

test("CharacterAgentSimulator - Rumor Spatial Diffusion & Distortion", () => {
  const simulator = new CharacterAgentSimulator();
  
  const rumor = {
    id: "rumor1",
    content: "贾家面临抄家危险",
    originatorId: "char_leng_zi_xing",
    currentLocationId: "loc_rong_guo_fu",
    intensity: 1.5,
    distortionCount: 0,
    facts: ["贾家抄家"]
  };

  const adjacencyMap = {
    "loc_rong_guo_fu": ["loc_ning_guo_fu", "loc_street"]
  };

  // Run rumor diffusion with 100% distortion rate to force mutations
  const diffusedRumors = simulator.diffuseRumor(rumor, adjacencyMap, 1.0);

  assert.equal(diffusedRumors.length, 2);
  
  const ningRumor = diffusedRumors.find(r => r.currentLocationId === "loc_ning_guo_fu");
  assert.ok(ningRumor, "Rumor should diffuse to Ning Guo Fu");
  assert.equal(ningRumor.distortionCount, 1);
  assert.ok(ningRumor.intensity > 1.5, "Diffused rumor intensity should increase");
  assert.ok(ningRumor.facts[0].includes("传言夸大"), "Facts should be mutated");
  assert.match(ningRumor.content, /(据传闻，|有人亲眼目睹，|十万火急！据说|江湖传言，)/);
});

test("CharacterAgentSimulator - LOD 2 Behavior Tree Decision", () => {
  const simulator = new CharacterAgentSimulator();
  
  const tiredAgent = {
    id: "agent1",
    name: "焦大",
    lod: 2,
    currentLocationId: "loc_gate",
    hunger: 30,
    energy: 15, // Extremely low energy
    sanity: 50,
    customPropertiesJson: "{}",
    memories: []
  };

  const tiredDecision = simulator.evaluateLOD2Decision(tiredAgent, []);
  assert.equal(tiredDecision.action, "REST");

  const starvingAgent = {
    id: "agent2",
    name: "小厮",
    lod: 2,
    currentLocationId: "loc_kitchen",
    hunger: 85, // Starving
    energy: 60,
    sanity: 50,
    customPropertiesJson: "{}",
    memories: []
  };

  const starvingDecision = simulator.evaluateLOD2Decision(starvingAgent, []);
  assert.equal(starvingDecision.action, "FORAGE");
});

test("CharacterAgentSimulator - LOD 1 LLM Decision Scheduling", () => {
  const simulator = new CharacterAgentSimulator();
  
  const normalAgent = {
    id: "focal1",
    name: "林黛玉",
    lod: 1,
    currentLocationId: "loc_xiaoxiang",
    hunger: 10,
    energy: 80,
    sanity: 80,
    customPropertiesJson: "{}",
    memories: []
  };

  // Normal stats, low tension, no rival -> should not schedule
  const shouldNot = simulator.shouldScheduleLOD1LLMDecision(normalAgent, 20, false);
  assert.equal(shouldNot, false);

  // High tension -> should schedule
  const shouldTension = simulator.shouldScheduleLOD1LLMDecision(normalAgent, 75, false);
  assert.equal(shouldTension, true);

  // Rival present -> should schedule
  const shouldRival = simulator.shouldScheduleLOD1LLMDecision(normalAgent, 20, true);
  assert.equal(shouldRival, true);
});
