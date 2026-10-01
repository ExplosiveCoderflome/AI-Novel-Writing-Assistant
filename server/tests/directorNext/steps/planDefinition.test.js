const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { directorProductionPlan } = require("../../../dist/modules/director/steps/planDefinition");

test("the production plan matches the inventoried planning and chapter batch graph", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../../../../docs/superpowers/inventory/director-rebuild/01-step-graph.md"), "utf8");
  const rows = source.split(/\r?\n/).filter((line) => line.startsWith("| `"));
  const stepIds = ["story_macro", "book_contract", "world_setup", "character_setup", "volume_strategy", "volume_beat_sheet", "volume_chapter_list", "chapter_detail_bundle", "execution_contract_sync", "chapter_batch"];
  const declared = rows.map((row) => row.split("|").slice(1, -1).map((value) => value.trim()))
    .filter((cells) => stepIds.includes(cells[1].replaceAll("`", "")))
    .map((cells) => ({
      id: cells[1].replaceAll("`", ""),
      label: cells[2],
      requires: [...cells[3].matchAll(/`([^`]+)`/g)].map((match) => match[1]),
      produces: cells[4].replaceAll("`", ""),
      needs: cells[5] === "`none`" ? [] : [cells[5].replaceAll("`", "")],
      gateable: cells[6] === "true",
      overwrites: cells[7] === "无" ? [] : cells[7].split("、"),
    }));
  assert.equal(declared.length, 10);
  assert.deepEqual(directorProductionPlan.steps, declared);
  // The chapter pipeline owns draft production; the director only observes batch closure.
  assert.deepEqual(directorProductionPlan.externalArtifacts, ["novel_seed", "chapter_draft"]);
});

test("production steps have one artifact producer and cannot be changed during a run", () => {
  assert.equal(new Set(directorProductionPlan.steps.map((step) => step.produces)).size, 10);
  assert.equal(Object.isFrozen(directorProductionPlan.steps), true);
  assert.equal(Object.isFrozen(directorProductionPlan.steps[0].requires), true);
});
