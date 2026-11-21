const test = require("node:test");
const assert = require("node:assert/strict");
const { readCreationFlowTemplate } = require("../dist/prompting/workbench/creationFlow");
const { listRegisteredPromptAssets } = require("../dist/prompting/registry");
const { require: loadTypeScript } = require("tsx/cjs/api");
const flow = "../../client/src/pages/promptWorkbench/creationFlow/";
const { atlasScopes, relatedAtlasLocation } = loadTypeScript(flow + "atlas/atlasTopics.ts", __filename);
const { indexAtlasPrompts } = loadTypeScript(flow + "atlas/atlasIndex.ts", __filename);
const { stages, stageSteps } = loadTypeScript(flow + "flowDefinition.ts", __filename);
const { layoutBookMap, promptConnectionBounds } = loadTypeScript(flow + "overview/bookMapLayout.ts", __filename);
const { stepPromptRelations, relationsFor } = loadTypeScript(flow + "atlas/stepPromptRelations.ts", __filename);

test("step-to-prompt lines use the actual registered asset for every scene and explicit companion endpoints", () => {
  const map = layoutBookMap(stages, true);
  const pairs = list => list.map(({ stepId, promptId, kind }) => [stepId, promptId, kind].join("/")).sort();
  const expected = [];
  for (const step of stages.flatMap(stageSteps)) {
    for (const [scene] of step.templates ?? []) {
      expected.push([step.id, readCreationFlowTemplate(scene).id, "uses"].join("/"));
    }
  }
  for (const scope of atlasScopes) for (const topic of scope.topics) {
    for (const [id, , steps] of topic.prompts) for (const step of steps ?? []) {
      expected.push([step, id, "companion"].join("/"));
    }
  }
  assert.deepEqual(pairs(map.promptLinks), expected.sort());
  assert.deepEqual(pairs(stepPromptRelations), expected);
  assert.equal(new Set(expected).size, expected.length);
  for (const link of map.promptLinks) {
    const row = map.prompts.get(link.promptId);
    assert.equal(row.scope, link.scope);
    for (const focus of [link.stepId, link.promptId]) {
      assert.ok(relationsFor(focus).some(r => r.stepId === link.stepId && r.promptId === link.promptId));
      const bounds = promptConnectionBounds(map, focus);
      assert.ok(bounds.x <= row.x && bounds.y <= row.y && bounds.x + bounds.width >= row.x + row.width
        && bounds.y + bounds.height >= row.y + row.height);
    }
  }
  const review = relationsFor("review");
  assert.deepEqual(review.filter(r => r.kind === "uses").map(r => r.promptId), ["novel.chapter.acceptance_assessment"]);
  assert.deepEqual(review.filter(r => r.kind === "companion").map(r => r.promptId), ["audit.chapter.light", "audit.chapter.full", "novel.review.chapter"]);
  assert.deepEqual(relationsFor("novel.chapter.acceptance_assessment").map(r => r.stepId), ["review", "verify"]);
  assert.deepEqual(relationsFor("comic.panelScript"), []);
  const collapsed = layoutBookMap(stages, false);
  assert.deepEqual(collapsed.promptLinks, []);
  assert.equal(promptConnectionBounds(collapsed, "review"), undefined);
});

test("the expanded book map displays every prompt once outside the production route and includes it in fit-to-map", () => {
  const map = layoutBookMap(stages, true);
  const contains = (outer, inner) => inner.x >= outer.x && inner.y >= outer.y
    && inner.x + inner.width <= outer.x + outer.width && inner.y + inner.height <= outer.y + outer.height;
  const overlaps = (a, b) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
  assert.deepEqual(new Set(map.prompts.keys()), new Set(listRegisteredPromptAssets().map(a => a.id)));
  assert.equal(map.sections.length, atlasScopes.length);
  const rows = [...map.prompts.values()];
  const steps = new Set(map.stations.map(s => s.step.id));
  for (const [i, section] of map.sections.entries()) {
    assert.ok(contains(map.bounds, section), section.scope.id);
    assert.ok(!map.sections.slice(i + 1).some(other => overlaps(section, other)), section.scope.id);
    if (section.scope.id === "tools") {
      assert.ok(section.x + section.width < map.routeBounds.x);
    } else {
      assert.equal(section.x, map.covers.find(c => c.stage.id === section.scope.id).x);
      assert.ok(section.y > map.routeBounds.y + map.routeBounds.height);
    }
    for (const group of section.topics) {
      const bounds = { ...group, x: section.x + group.x, y: section.y + group.y };
      assert.ok(contains(section, bounds));
      for (const [id] of group.topic.prompts) {
        assert.ok(contains(bounds, map.prompts.get(id)), id);
        assert.ok(!steps.has(id), id);
      }
    }
  }
  assert.ok(rows.every((row, i) => !rows.slice(i + 1).some(other => overlaps(row, other))));
  const collapsed = layoutBookMap(stages, false);
  assert.equal(collapsed.sections.length, 0);
  assert.equal(collapsed.prompts.size, 0);
  assert.deepEqual(collapsed.bounds, collapsed.routeBounds);
});

test("each registered prompt belongs to one topic and exposes every registered version", () => {
  const catalog = listRegisteredPromptAssets().map(({ id, version }) => ({ id, version, key: id + "@" + version }));
  const topics = atlasScopes.flatMap(scope => scope.topics);
  assert.deepEqual(atlasScopes.map(scope => scope.id), [...stages.map(stage => stage.id), "tools"]);
  assert.equal(new Set(topics.map(topic => topic.id)).size, topics.length);
  const ids = topics.flatMap(topic => topic.prompts.map(([id]) => id));
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual(new Set(ids), new Set(catalog.map(item => item.id)));
  const indexed = indexAtlasPrompts(catalog);
  assert.deepEqual(indexed.map(prompt => prompt.id), ids);
  assert.deepEqual(new Set(indexed.flatMap(prompt => prompt.versions.map(v => v.key))), new Set(catalog.map(v => v.key)));
  for (const { id, versions } of indexed) {
    assert.ok(versions.every(v => v.id === id), id);
    assert.deepEqual(versions.map(v => v.version), versions.map(v => v.version).sort((a, b) => b.localeCompare(a, "en", { numeric: true })), id);
  }
  assert.deepEqual(indexAtlasPrompts([]), []);
});

test("every flow step opens a related topic, including the routes back to another chapter or volume", () => {
  const anchors = atlasScopes.flatMap(scope => scope.topics.flatMap(topic =>
    topic.steps.map(step => ({ step, location: { scope: scope.id, topic: topic.id } }))));
  const expected = stages.flatMap(stage => stageSteps(stage).map(step => step.id));
  assert.deepEqual(anchors.map(a => a.step).sort(), expected.sort());
  for (const { step, location } of anchors) {
    assert.deepEqual(relatedAtlasLocation("writing", step), location, step);
  }
  assert.equal(relatedAtlasLocation("writing", "next-volume").scope, "volumes");
  assert.equal(relatedAtlasLocation("writing", "next-chapter").scope, "preparation");
});

test("every registered prompt version has a complete readable official template", () => {
  const assets = listRegisteredPromptAssets();
  for (const asset of assets) {
    const key = `${asset.id}@${asset.version}`;
    const result = readCreationFlowTemplate(key);
    assert.ok(result, key);
    assert.equal(result.id, asset.id, key);
    assert.equal(result.version, asset.version, key);
    assert.ok(result.messages.length > 0, key);
    for (const message of result.messages) {
      assert.ok(message.content.trim(), key);
      assert.doesNotMatch(message.content, /\bundefined\b|\[object Object\]|\bNaN\b/, key);
    }
  }
  assert.equal(readCreationFlowTemplate("unregistered.prompt@v1"), null);
  assert.equal(readCreationFlowTemplate("novel.chapter.writer@missing"), null);
  assert.equal(readCreationFlowTemplate("verify-repair@v1"), null);
});
