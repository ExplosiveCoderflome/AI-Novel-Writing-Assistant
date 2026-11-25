const test = require("node:test");
const assert = require("node:assert/strict");
const { require: loadTypeScript } = require("tsx/cjs/api");
const { stages, stageSteps, locateFlowStep } = loadTypeScript("../../client/src/pages/promptWorkbench/creationFlow/flowDefinition.ts", __filename);
const { layoutBookMap } = loadTypeScript("../../client/src/pages/promptWorkbench/creationFlow/overview/bookMapLayout.ts", __filename);
const { tourStops, closedTour, tourPlayback } = loadTypeScript("../../client/src/pages/promptWorkbench/creationFlow/overview/tourPlayback.ts", __filename);
const { readCreationFlowTemplate } = require("../dist/prompting/workbench/creationFlow");
const { creationTemplateInputs } = require("../dist/prompting/workbench/creationFlow/templateInputs");

test("every creative flow station resolves its connections and reads all official messages without a book", () => {
  assert.equal(stages.length, 5);
  const steps = stages.flatMap(stageSteps);
  const ids = new Set(steps.map(step => step.id));
  assert.equal(ids.size, steps.length);
  const keys = new Set();
  for (const stage of stages) {
    const trunk = new Set(stage.main.map(step => step.id));
    for (const branch of stage.branches ?? []) {
      assert.ok(trunk.has(branch.from));
      if (branch.join) assert.ok(trunk.has(branch.join));
    }
  }
  for (const step of steps) {
    if (step.destination) assert.ok(ids.has(step.destination));
    assert.equal(Boolean(step.templates?.length), step.kind === "ai", step.title);
    for (const [key] of step.templates ?? []) keys.add(key);
  }
  assert.deepEqual(keys, new Set(Object.keys(creationTemplateInputs)));
  for (const key of keys) {
    const { messages, version } = readCreationFlowTemplate(key);
    assert.ok(version, key);
    for (const role of ["system", "human"]) assert.ok(messages.some(m => m.role === role), key);
    for (const message of messages) {
      assert.ok(message.content.trim(), key);
      assert.doesNotMatch(message.content, /\bundefined\b|\[object Object\]/, key);
    }
  }
  const review = readCreationFlowTemplate("novel.chapter.acceptance_assessment");
  const verify = readCreationFlowTemplate("verify-repair");
  assert.equal(verify.id, review.id);
  assert.match(verify.messages.at(-1).content, /局部修文复验清单/);
  assert.ok(verify.messages.length > review.messages.length);
  assert.equal(readCreationFlowTemplate("constructor"), null);
});

test("guided reading follows the whole mainline, stops on the finished book and can replay", () => {
  assert.deepEqual(tourStops.map(s => s.step.id), stages.flatMap(stage => stage.main.map(step => step.id)));
  assert.equal(tourPlayback(closedTour, { read: "draft" }), closedTour);
  let playback = tourPlayback(closedTour, "toggle");
  for (let i = 0; i < tourStops.length - 1; i++) {
    assert.deepEqual(playback, { index: i, playing: true });
    playback = tourPlayback(playback, { elapsedAt: i });
  }
  assert.equal(tourStops[playback.index].step.id, "finish");
  assert.equal(playback.playing, false);
  assert.deepEqual(tourPlayback(playback, "toggle"), { index: 0, playing: true });
});

test("seeking, reading a prompt and exiting cannot be undone by a pending tour timer", () => {
  const start = tourPlayback(closedTour, "toggle");
  const seek = tourPlayback(start, { seek: 5 });
  assert.deepEqual(seek, { index: 5, playing: false });
  const resume = tourPlayback(seek, "toggle");
  assert.equal(tourPlayback(resume, { elapsedAt: 0 }), resume);
  const read = tourPlayback(resume, { read: "draft" });
  assert.equal(read.playing, false);
  assert.equal(tourStops[read.index].step.id, "draft");
  assert.equal(tourPlayback(read, { elapsedAt: read.index }), read);
  assert.deepEqual(tourPlayback(read, { read: "repair" }), read);
  const end = tourPlayback(read, "end");
  assert.equal(tourPlayback(end, { elapsedAt: read.index }), closedTour);
});

for (const expanded of [false, true]) {
  test(`whole-book map connects its visible steps and reader in ${expanded ? "expanded" : "mainline"} view`, () => {
    const { stations, links } = layoutBookMap(stages, expanded);
    const visible = new Set(stations.map(s => s.step.id));
    const expected = stages.flatMap(stage => expanded ? stageSteps(stage) : stage.main);
    assert.deepEqual(visible, new Set(expected.map(s => s.id)));
    const pairs = new Set(links.map(l => l.source + ">" + l.target));
    assert.equal(pairs.size, links.length);
    for (const { source, target } of links) {
      assert.ok(visible.has(source) && visible.has(target), source + ">" + target);
    }
    const handoffs = links.filter(l => l.kind === "handoff").map(l => [l.source, l.target]);
    assert.deepEqual(handoffs, stages.slice(1).map((stage, i) => [stages[i].main.at(-1).id, stage.main[0].id]));
    assert.deepEqual(links.filter(l => l.kind === "return").map(l => [l.source, l.target]), [
      [expanded ? "next-chapter" : "extract", "mission"],
      [expanded ? "next-volume" : "extract", "beats"],
    ]);
    for (const stage of stages) {
      for (const branch of expanded ? stage.branches ?? [] : []) {
        assert.ok(pairs.has(branch.from + ">" + branch.steps[0].id));
      }
    }
    for (const { step, stage, side } of stations) {
      const entry = locateFlowStep(step.id);
      assert.equal(entry.stage, stage);
      assert.equal(entry.optional, side);
      const target = step.destination ?? entry.next?.id;
      if (target) assert.ok(pairs.has(step.id + ">" + target));
    }
    const reached = new Set();
    const pending = [stages[0].main[0].id];
    while (pending.length) {
      const id = pending.pop();
      if (reached.has(id)) continue;
      reached.add(id);
      pending.push(...links.filter(l => l.source === id).map(l => l.target));
    }
    assert.deepEqual(reached, visible);
  });
}
