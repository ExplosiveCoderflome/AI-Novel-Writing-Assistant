import test from "node:test";
import assert from "node:assert/strict";
import { buildRelationshipGraphModel } from "../src/pages/novels/components/characterWorkspace/characterRelationshipGraphModel.ts";
import { CARD_HEIGHT, CARD_WIDTH, COLUMN_STEP, ROW_STEP } from "../src/pages/novels/components/characterWorkspace/relationshipGraph/orderedLayout.ts";
import { relationshipRoute, gutterPath } from "../src/pages/novels/components/characterWorkspace/relationshipGraph/edgeRouting.ts";

const cast = [
  { id: "lin", name: "林小北", castRole: "protagonist" },
  { id: "zhou", name: "周海", castRole: "pressure_source" },
  { id: "zhao", name: "赵铁柱", castRole: "ally" },
  { id: "chen", name: "陈默", castRole: "protagonist" },
  { id: "fang", name: "方雨桐", castRole: "ally" },
];
const relations = [
  ["chen", "lin"], ["chen", "zhao"], ["chen", "fang"], ["chen", "zhou"],
  ["zhou", "lin"], ["zhao", "lin"], ["fang", "lin"], ["fang", "zhao"],
].map(([sourceCharacterId, targetCharacterId]) => ({sourceCharacterId, targetCharacterId, surfaceRelation: "合作"}));
const input = { characters: cast, staticRelations: relations, dynamicRelations: [], mode: "all", selectedCharacterId: "" };

test("two leads share the first row and saved relationships retain their direction", () => {
  const {nodes, edges} = buildRelationshipGraphModel(input);
  assert.deepEqual(nodes.map(n => n.id), ["chen", "lin", "fang", "zhao", "zhou"]);
  assert.equal(nodes[0].y, nodes[1].y);
  assert.equal(nodes[2].y, nodes[3].y);
  assert.ok(nodes[0].y < nodes[2].y && nodes[2].y < nodes[4].y);
  assert.deepEqual(edges.map(e => [e.source, e.target]), relations.map(r => [r.sourceCharacterId, r.targetCharacterId]));
  const refreshed = buildRelationshipGraphModel({...input, characters: [...cast].reverse(), staticRelations: [...relations].reverse(), selectedCharacterId:"zhou"});
  assert.deepEqual(nodes.map(n => [n.id,n.x,n.y]), refreshed.nodes.map(n => [n.id,n.x,n.y]));
});

test("large casts wrap without overlap, including unconnected characters and duplicate names", () => {
  const characters = [...cast, ...Array.from({length:36}, (_,i) => ({ id: "extra-" + i, name: "小林" }))];
  const {nodes} = buildRelationshipGraphModel({...input, characters});
  assert.equal(nodes.length, characters.length);
  assert.ok(new Set(nodes.filter(n => n.character.name === "小林").map(n => n.y)).size > 1);
  for (const [i, a] of nodes.entries()) {
    for (const b of nodes.slice(i+1)) assert.ok(Math.abs(a.x-b.x) > CARD_WIDTH || Math.abs(a.y-b.y) > CARD_HEIGHT);
  }
  const reversed = buildRelationshipGraphModel({...input, characters:[...characters].reverse()});
  assert.deepEqual(nodes, reversed.nodes);
});

test("current-character mode keeps the focus on the left and the direct connections on the right", () => {
  for (const id of ["chen","zhou"]) {
    const {nodes, edges} = buildRelationshipGraphModel({...input, mode:"current",selectedCharacterId:id});
    const root = nodes.find(n => n.id === id);
    assert.equal(nodes.length, edges.length + 1);
    assert.ok(nodes.filter(n => n !== root).every(n => n.x > root.x));
    assert.ok(edges.every(e => e.source === id));
  }
});

test("arrows face the destination and longer links turn outside intervening cards", () => {
  const origin = {x:0, y:0};
  const route = (x,y) => relationshipRoute(origin, {x,y}, false);
  assert.deepEqual(route(-COLUMN_STEP,0), {source:"left",target:"right",path:"curve"});
  assert.deepEqual(route(0,ROW_STEP), {source:"bottom",target:"top",path:"curve"});
  assert.deepEqual(route(2*COLUMN_STEP,0), {source:"top",target:"top",path:"step"});
  assert.deepEqual(route(0,2*ROW_STEP), {source:"left",target:"left",path:"step"});
  const distant = route(2*COLUMN_STEP,2*ROW_STEP);
  assert.deepEqual(distant, {source:"right",target:"top",path:"gutter"});
  const from = {x:CARD_WIDTH/2, y:0};
  const to = {x:2*COLUMN_STEP, y:2*ROW_STEP-CARD_HEIGHT/2};
  assert.equal(gutterPath(from,to,distant)[0], `M ${from.x},0 H ${COLUMN_STEP/2} V ${1.5*ROW_STEP} H ${to.x} V ${to.y}`);
});
