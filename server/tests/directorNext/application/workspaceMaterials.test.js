const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {execFileSync} = require('node:child_process');

test('workspace shows the complete book world and saved character/story details without writing or borrowing another source', () => {
  const root = path.resolve(__dirname, '../../../..');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'director-materials-'));
  const script = path.join(dir, 'read.cjs');
  fs.writeFileSync(script, String.raw`
const assert = require('node:assert/strict');
const path = require('node:path');
const server = path.join(process.env.DIRECTOR_NEXT_REPO_ROOT, 'server');
const {prisma} = require(path.join(server, 'dist/db/prisma'));
const {ensureRuntimeDatabaseReady} = require(path.join(server, 'dist/db/runtimeMigrations'));
const {readDirectorWorkspace} = require(path.join(server, 'dist/app/director/workspace'));
const structure = {
  profile:{summary:'本书世界概况',identity:'江湖',tone:'冷峻',themes:['选择'],coreConflict:'城内权力争斗'},
  rules:{summary:'力量总纲',axioms:Array.from({length:8},(_,i)=>({id:'r'+i,name:'规则'+i,summary:'约束'+i,cost:'付出寿命',boundary:'不能复活',enforcement:'雷罚'})),taboo:['不可凭空得力'],sharedConsequences:['留下伤痕']},
  factions:[{id:'a',name:'本书阵营',position:'守城',doctrine:'守诺',goals:['阻止灾难'],methods:['守门'],representativeForceIds:['f']}],
  forces:[{id:'f',name:'本书势力',summary:'守门组织',baseOfPower:'城门',currentObjective:'封锁城门',pressure:'搜捕',narrativeRole:'施压'}],
  locations:[{id:'l',name:'本书地点',terrain:'城墙',summary:'夜间战场',narrativeFunction:'开篇冲突',risk:'伏击',entryConstraint:'持令入城',exitCost:'交出信物',controllingForceIds:['f']}],
  relations:{forceRelations:[],locationControls:[],locationConnections:[]},metadata:{schemaVersion:1}
};
const slice = {storyId:'book',worldId:'local',coreWorldFrame:'已保存范围',appliedRules:[],activeForces:[],activeLocations:[],activeElements:[],conflictCandidates:['城门争夺'],pressureSources:['追捕'],mysterySources:[],suggestedStoryAxes:[],recommendedEntryPoints:[],forbiddenCombinations:['不能提前揭开刀主'],storyScopeBoundary:'限定县城',metadata:{schemaVersion:1,builtAt:'2026-10-05T00:00:00Z',sourceWorldUpdatedAt:'2026-10-05T00:00:00Z',storyInputDigest:'digest',builtFromStructuredData:true,builderMode:'runtime'}};
(async()=>{
 await ensureRuntimeDatabaseReady();
 await prisma.world.create({data:{id:'sample',name:'外部样本',overviewSummary:'样本世界',structureJson:JSON.stringify({...structure,profile:{...structure.profile,summary:'外部样本新设定'}}),geography:'样本地理'}});
 await prisma.novel.create({data:{id:'book',title:'本书',worldId:'sample'}});
 await prisma.novelWorld.create({data:{id:'local',novelId:'book',sourceWorldId:'sample',title:'本书专属世界',structuredDataJson:JSON.stringify(structure),storySliceJson:JSON.stringify(slice)}});
 await prisma.character.create({data:{id:'hero',novelId:'book',name:'主角',role:'主角',background:'保存的经历',outerGoal:'救下家人',innerNeed:'学会信任',fear:'失去同伴',secret:'保存的秘密'}});
 await prisma.bookContract.create({data:{novelId:'book',readingPromise:'承诺',protagonistFantasy:'体验',coreSellingPoint:'看点',chapter3Payoff:'三章兑现',chapter10Payoff:'十章兑现',chapter30Payoff:'三十章兑现',escalationLadder:'逐步升级',relationshipMainline:'同伴信任',absoluteRedLinesJson:'["不滥杀无辜"]'}});
 await prisma.novel.create({data:{id:'manual',title:'独立本书'}});
 await prisma.novelWorld.create({data:{novelId:'manual',title:'独立世界',structuredDataJson:JSON.stringify(structure)}});
 await prisma.novel.create({data:{id:'legacy',title:'旧数据',worldId:'sample'}});
 await prisma.novel.create({data:{id:'broken',title:'损坏资料',worldId:'sample'}});
 await prisma.novelWorld.create({data:{novelId:'broken',title:'本书损坏资料',structuredDataJson:'{bad',storySliceJson:JSON.stringify({...slice,storyId:'another-book'})}});
 const snapshot=async()=>Promise.all([prisma.novel.findMany({orderBy:{id:'asc'}}),prisma.novelWorld.findMany({orderBy:{id:'asc'}}),prisma.world.findMany({orderBy:{id:'asc'}}),prisma.character.findMany({orderBy:{id:'asc'}}),prisma.bookContract.findMany({orderBy:{id:'asc'}})]);
 const before=await snapshot();
 for(let i=0;i<2;i++){
  const saved=await readDirectorWorkspace('book');
  assert.equal(saved.materials.world.name,'本书专属世界');
  assert.equal(saved.materials.world.source,'novel');
  assert.equal(saved.materials.world.summary,'本书世界概况');
  assert.equal(saved.materials.world.structure.rules.axioms.length,8);
  assert.equal(saved.materials.world.structure.locations[0].exitCost,'交出信物');
  assert.deepEqual(saved.materials.world.storySlice.forbiddenCombinations,['不能提前揭开刀主']);
  assert.equal(saved.materials.characters[0].background,'保存的经历');
  assert.equal(saved.materials.characters[0].innerNeed,'学会信任');
  assert.equal(saved.materials.story.chapter10Payoff,'十章兑现');
  assert.deepEqual(saved.materials.story.absoluteRedLines,['不滥杀无辜']);
 }
 assert.equal((await readDirectorWorkspace('manual')).materials.world.name,'独立世界');
 const legacy=(await readDirectorWorkspace('legacy')).materials.world;
 assert.equal(legacy.source,'library');assert.equal(legacy.legacyLayers.geography,'样本地理');
 const broken=(await readDirectorWorkspace('broken')).materials.world;
 assert.equal(broken.name,'本书损坏资料');assert.equal(broken.structure,null);assert.equal(broken.storySlice,null);
 assert.ok(broken.warnings.length>=2);assert.doesNotMatch(JSON.stringify(broken),/外部样本新设定/);
 assert.deepEqual(await snapshot(),before);
 await prisma.$disconnect();
})().catch(async error=>{console.error(error);await prisma.$disconnect();process.exitCode=1;});
`, 'utf8');
  execFileSync(process.execPath, [script], {cwd:root, env:{...process.env,NODE_ENV:'test',AI_NOVEL_RUNTIME:'desktop',AI_NOVEL_APP_DATA_DIR:dir,DIRECTOR_NEXT_REPO_ROOT:root,DATABASE_URL:'file:'+path.join(dir,'read.db').replace(/\\/g,'/')},stdio:'pipe'});
});
