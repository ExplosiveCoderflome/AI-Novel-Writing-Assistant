import test from 'node:test';
import assert from 'node:assert/strict';

async function project(world) {
  const {projectSavedWorldVisualization} = await import('../src/pages/directorNext/workspace/visualizations/worldProjection.ts');
  return projectSavedWorldVisualization(world);
}

const structure = {
  profile: {summary:'本书',identity:'县城',tone:'悬疑',themes:[],coreConflict:'追捕'},
  rules: {summary:'约束',axioms:[{id:'rule',name:'承雷',summary:'斩妖留下伤痕',cost:'伤势',boundary:'不可复活',enforcement:'雷罚'}],taboo:[],sharedConsequences:[]},
  factions: [{id:'faction',name:'守城派'}],
  forces: [{id:'guards',name:'捕房',type:'organization'},{id:'rebels',name:'反叛军',type:'faction'}],
  locations: [{id:'gate',name:'西门',x:17,y:61,directionHint:'west',terrain:'城墙',summary:'出口',risk:'追捕',controllingForceIds:['guards'],storyRelevance:'逃离'},
    {id:'market',name:'北集市',terrain:'街道',summary:'交易地点',risk:'',controllingForceIds:[]}],
  relations: {forceRelations:[{sourceForceId:'guards',targetForceId:'rebels',relation:'敌对'}, {sourceForceId:'guards',targetForceId:'missing',relation:'失效'}],
    locationControls:[],locationConnections:[{sourceLocationId:'gate',targetLocationId:'market',connectionType:'军道',distanceHint:'半日',narrativeUse:'巡逻封锁'},
    {sourceLocationId:'gate',targetLocationId:'deleted',connectionType:'道路'}]},
  metadata: {schemaVersion:1},
};

test('map preserves saved coordinates and routes while excluding dangling connections', async () => {
  const world = {id:'local',name:'本书世界',source:'novel',structure};
  const before = structuredClone(world);
  const result = await project(world);
  assert.equal(result.worldId, 'local');
  assert.deepEqual(result.geographyMap.nodes.map(n=>n.label), ['西门','北集市']);
  assert.equal(result.geographyMap.nodes[0].x, 17);
  assert.equal(result.geographyMap.nodes[0].directionHint, 'west');
  assert.equal(result.geographyMap.nodes[1].x, undefined);
  assert.equal(result.geographyMap.nodes[1].directionHint, undefined); // name is not a compass instruction
  assert.equal(result.geographyMap.edges.length, 1);
  assert.deepEqual(result.geographyMap.edges[0], {source:'gate',target:'market',relation:'军道',distanceHint:'半日',risk:'巡逻封锁'});
  assert.equal(result.factionGraph.edges.length, 1);
  assert.equal(result.factionGraph.nodes.length, 3);
  assert.deepEqual(world, before);
});

test('map never invents geography from summary text or connections from common ownership', async () => {
  assert.equal(await project(null), null);
  assert.equal(await project({name:'文字世界',summary:'北边城门通往南边城镇'}), null);
  const result = await project({id:'local',structure:{...structure,relations:{forceRelations:[],locationControls:[
    {forceId:'guards',locationId:'gate'},{forceId:'guards',locationId:'market'}],locationConnections:[]}}});
  assert.deepEqual(result.geographyMap.edges, []);
  assert.deepEqual(result.timeline, []);
});

test('large saved worlds retain every location and rule', async () => {
  const result = await project({id:'large',structure:{...structure,
    locations:Array.from({length:80},(_,i)=>({id:'l'+i,name:'地点'+i,controllingForceIds:[]})),
    rules:{...structure.rules,axioms:Array.from({length:40},(_,i)=>({name:'规则'+i,summary:'约束'+i}))}}});
  assert.equal(result.geographyMap.nodes.length, 80);
  assert.equal(result.powerTree.length, 40);
});
