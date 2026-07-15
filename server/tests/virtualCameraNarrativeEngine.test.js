const test = require("node:test");
const assert = require("node:assert/strict");
const { VirtualCameraNarrativeEngine } = require("../dist/services/world/VirtualCameraNarrativeEngine.js");

test("VirtualCameraNarrativeEngine - Spatiotemporal Leakage Filtering", () => {
  const engine = new VirtualCameraNarrativeEngine();

  const viewport = {
    locationId: "loc_parlor",
    locationName: "正堂客厅",
    elevation: 20,
    temperature: 22.0,
    lux: 250,
    localFlora: 0.1,
    activeCharacters: ["林黛玉", "薛宝钗"]
  };

  const adjacentLocationIds = ["loc_courtyard", "loc_study"];

  const events = [
    {
      locationId: "loc_parlor",
      intensity: 1.0,
      description: "林黛玉和薛宝钗坐在一起吃茶谈论诗作"
    },
    {
      locationId: "loc_courtyard",
      intensity: 4.5, // High intensity -> leaks through!
      description: "焦大在庭院里大声喝醉撒泼，摔碎了酒坛子"
    },
    {
      locationId: "loc_study",
      intensity: 2.0, // Low intensity -> does not leak
      description: "贾宝玉在书房里静悄悄地写字"
    }
  ];

  const filtered = engine.filterCameraEvents(viewport, adjacentLocationIds, events);

  // Direct events check
  assert.equal(filtered.directEvents.length, 1);
  assert.equal(filtered.directEvents[0], "林黛玉和薛宝钗坐在一起吃茶谈论诗作");

  // Leakages check
  assert.equal(filtered.leakages.length, 1);
  assert.match(filtered.leakages[0], /焦大在庭院里大声喝醉撒泼/);
  assert.match(filtered.leakages[0], /渗漏过界/);
});

test("VirtualCameraNarrativeEngine - Markdown Context Feed Rendering", () => {
  const engine = new VirtualCameraNarrativeEngine();

  const viewport = {
    locationId: "loc_parlor",
    locationName: "正堂客厅",
    elevation: 20,
    temperature: 22.0,
    lux: 250,
    localFlora: 0.1,
    activeCharacters: ["林黛玉"]
  };

  const feed = engine.renderCameraFeedTemplate({
    viewport,
    directEvents: ["林黛玉在吃茶"],
    leakages: ["焦大在喝酒 (渗漏过界)"]
  });

  assert.match(feed, /# VIRTUAL CAMERA OBSERVATION FEED/);
  assert.match(feed, /Location:\*\* 正堂客厅/);
  assert.match(feed, /Temp 22.0°C \| Illumination 250 Lux/);
  assert.match(feed, /Active Agents present:\*\* 林黛玉/);
  assert.match(feed, /- 林黛玉在吃茶/);
  assert.match(feed, /- \[Distal Sound\/Light\] 焦大在喝酒 \(渗漏过界\)/);
});

test("VirtualCameraNarrativeEngine - TimeConsistencyChecker Logic", () => {
  const engine = new VirtualCameraNarrativeEngine();

  const characterStates = [
    { name: "林黛玉", isAlive: true, locationId: "loc_parlor" },
    { name: "焦大", isAlive: false, locationId: "loc_courtyard" } // Deceased!
  ];

  // A. Alive characters speaking -> should pass
  const passRes = engine.checkConsistency("林黛玉笑着说：我们去园子里走走吧。", characterStates);
  assert.equal(passRes.pass, true);
  assert.equal(passRes.issues.length, 0);

  // B. Deceased characters speaking -> should fail
  const failRes = engine.checkConsistency("焦大在一旁怒斥道：你们这群奴才欺人太甚！", characterStates);
  assert.equal(failRes.pass, false);
  assert.equal(failRes.issues.length, 1);
  assert.match(failRes.issues[0], /时空逻辑悖论: 角色 焦大 已死亡/);
});
