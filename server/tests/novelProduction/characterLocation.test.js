const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const {initializeTemporarySqliteDatabase} = require('../testInfrastructure/tempSqliteDatabase.cjs');

test('character locations inherit per actor with real SQLite version and novel fences', () => {
  const server = path.resolve(__dirname, '../..');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'v2-character-location-'));
  const databaseUrl = initializeTemporarySqliteDatabase(dir, 'test.db');
  const script = path.join(dir, 'locations.cjs');
  fs.writeFileSync(script, String.raw`
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const server = process.env.TEST_SERVER_ROOT;
const {prisma} = require(path.join(server, 'dist/db/prisma'));
const {CharacterLocationService, CHARACTER_LOCATION_ARTIFACT_TYPE} = require(path.join(server, 'dist/services/novel/characters/locations'));
const {buildChapterArtifactContentHash:hash} = require(path.join(server, 'dist/services/novel/runtime/artifactSync/ChapterArtifactContentVersion'));
const service = new CharacterLocationService();
let sequence = 0;
test.after(async () => prisma.$disconnect());
async function fixture(version='v2') {
  const n='n'+(++sequence), a=n+'a', b=n+'b';
  await prisma.novel.create({data:{id:n,title:'测试书',directorVersion:version}});
  await prisma.character.createMany({data:[{id:a,novelId:n,name:'甲',role:'主角',currentLocation:'旧档案村庄'}, {id:b,novelId:n,name:'乙',role:'配角',currentLocation:'山庄'}]});
  const characters=await prisma.character.findMany({where:{novelId:n}});
  async function chapter(order,content) {
    return prisma.chapter.create({data:{id:n+'c'+order,novelId:n,order,title:'测试章',content}});
  }
  async function apply(c, deltas) {
    return service.applyFinalChapter({novelId:n,chapterId:c.id,content:c.content,contentHash:hash(c.content),deltas});
  }
  const delta=(id,location,evidence,extra={})=>({characterId:id,characterName:id===a?'甲':'乙',fromLocation:null,locationName:location,movementType:'move',timeContext:'present',continuityStatus:'consistent',evidence,explanation:'正文支持移动。',...extra});
  const read=(order=12)=>service.readBeforeChapter({novelId:n,chapterOrder:order,characters});
  return {n,a,b,characters,chapter,apply,delta,read};
}
test('POV switch preserves the offstage actor and source proof',async()=>{
  const f=await fixture();
  const c10=await f.chapter(10,'甲被押进牢房。');
  const c11=await f.chapter(11,'乙走进客栈。');
  await f.apply(c10,[f.delta(f.a,'牢房','甲被押进牢房。')]);
  await f.apply(c11,[f.delta(f.b,'客栈','乙走进客栈。')]);
  const states=await f.read();
  assert.equal(states.get(f.a).currentLocation,'牢房');
  assert.equal(states.get(f.b).currentLocation,'客栈');
  assert.equal(states.get(f.a).sourceChapterOrder,10);
  assert.equal(states.get(f.a).evidence,'甲被押进牢房。');
  assert.equal((await prisma.character.findUnique({where:{id:f.a}})).currentLocation,'旧档案村庄','do not rewrite the base profile');
});
test('flashback, dream, plan and hearsay do not move a character',async()=>{
  for(const context of ['flashback','dream','plan','hearsay']){
    const f=await fixture(), c10=await f.chapter(10,'甲被押进牢房。'), c11=await f.chapter(11,'甲想着客栈。');
    await f.apply(c10,[f.delta(f.a,'牢房',c10.content)]);
    await f.apply(c11,[f.delta(f.a,'客栈',c11.content,{timeContext:context})]);
    assert.equal((await f.read()).get(f.a).currentLocation,'牢房',context);
  }
});
test('unexplained relocation, uncertainty and fabricated evidence keep last valid location with a concern',async()=>{
  for(const extra of [{continuityStatus:'unexplained'}, {movementType:'uncertain'}, {evidence:'根本不在正文的原句'}]){
    const f=await fixture(), c10=await f.chapter(10,'甲被押进牢房。'), c11=await f.chapter(11,'甲在客栈说话。');
    await f.apply(c10,[f.delta(f.a,'牢房',c10.content)]);
    await f.apply(c11,[f.delta(f.a,'客栈',c11.content,extra)]);
    const state=(await f.read()).get(f.a);
    assert.equal(state.currentLocation,'牢房');
    assert.ok(state.concern,'the next chapter must see unresolved relocation, not silently trust it');
  }
});
test('valid present movement and nested location refinement can advance location',async()=>{
  const f=await fixture(), c10=await f.chapter(10,'甲被押进牢房。'), c11=await f.chapter(11,'守卫把甲带到牢房院中。');
  await f.apply(c10,[f.delta(f.a,'牢房',c10.content)]);
  await f.apply(c11,[f.delta(f.a,'牢房院中',c11.content,{fromLocation:'牢房'})]);
  assert.equal((await f.read()).get(f.a).currentLocation,'牢房院中');
});
test('contradictory duplicate actors are held rather than last-entry-wins',async()=>{
  const f=await fixture(), c=await f.chapter(10,'甲留在村庄。乙说甲到客栈了。');
  await f.apply(c,[f.delta(f.a,'村庄','甲留在村庄。'),f.delta(f.a,'客栈','乙说甲到客栈了。')]);
  const state=(await f.read()).get(f.a);
  assert.equal(state.currentLocation,'旧档案村庄');
  assert.ok(state.concern);
});
test('future, obsolete and foreign role records cannot contaminate earlier chapters',async()=>{
  const f=await fixture(), other=await fixture();
  const c10=await f.chapter(10,'甲被押进牢房。'), c11=await f.chapter(11,'甲走进客栈。'), c12=await f.chapter(12,'甲来到山庄。');
  await f.apply(c10,[f.delta(f.a,'牢房',c10.content)]);
  await f.apply(c11,[f.delta(f.a,'客栈',c11.content),f.delta(other.a,'海外',c11.content)]);
  await f.apply(c12,[f.delta(f.a,'山庄',c12.content)]);
  assert.equal((await f.read(11)).get(f.a).currentLocation,'牢房');
  await prisma.chapter.update({where:{id:c11.id},data:{content:'修文后甲仍在牢房。'}});
  const state=(await f.read(12)).get(f.a);
  assert.equal(state.currentLocation,'牢房','obsolete version must be excluded');
  assert.equal((await f.read(12)).has(other.a),false);
});
test('version mismatch and V1 calls refuse all writes; same version recovery is idempotent',async()=>{
  const f=await fixture(), c=await f.chapter(10,'甲被押进牢房。');
  await f.apply(c,[f.delta(f.a,'牢房',c.content)]);
  await f.apply(c,[f.delta(f.a,'牢房',c.content)]);
  assert.equal(await prisma.chapterArtifactSyncCheckpoint.count({where:{novelId:f.n,artifactType:CHARACTER_LOCATION_ARTIFACT_TYPE}}),1);
  await prisma.chapter.update({where:{id:c.id},data:{content:'甲离开牢房。'}});
  await assert.rejects(f.apply(c,[f.delta(f.a,'牢房',c.content)]),/版本/);
  const v1=await fixture('v1'), old=await v1.chapter(10,'甲到客栈。');
  await assert.rejects(v1.apply(old,[v1.delta(v1.a,'客栈',old.content)]),/V2/);
  assert.equal(await prisma.chapterArtifactSyncCheckpoint.count({where:{novelId:v1.n}}),0);
});
test('pagination reaches the offstage actor and sorts by story order rather than write time',async()=>{
  const f=await fixture(), first=await f.chapter(1,'甲被押进牢房。');
  await f.apply(first,[f.delta(f.a,'牢房',first.content)]);
  for(let order=2;order<=54;order++){
    const c=await f.chapter(order,'乙留在客栈。');
    await f.apply(c,[f.delta(f.b,'客栈',c.content,{movementType:'stay'})]);
  }
  await f.apply(first,[f.delta(f.a,'牢房',first.content)]);
  const states=await f.read(55);
  assert.equal(states.get(f.a).currentLocation,'牢房');
  assert.equal(states.get(f.b).sourceChapterOrder,54);
});
test('quality-debt provenance holds otherwise consistent movement without blocking the chapter',async()=>{
  const f=await fixture(), c10=await f.chapter(10,'甲被押进牢房。'), c11=await f.chapter(11,'甲走出牢房来到客栈。');
  await f.apply(c10,[f.delta(f.a,'牢房',c10.content)]);
  await service.applyFinalChapter({novelId:f.n,chapterId:c11.id,content:c11.content,contentHash:hash(c11.content),
    contentProvenance:'debt',deltas:[f.delta(f.a,'客栈',c11.content)]});
  const state=(await f.read()).get(f.a);
  assert.equal(state.currentLocation,'牢房');
  assert.ok(state.concern.includes('客栈'),'unconfirmed candidate location must remain available as guidance');
});
test('real unified consumer forwards final output and provenance without any location-specific model call',async()=>{
  const {ChapterArtifactDeltaService}=require(path.join(server,'dist/services/novel/runtime/ChapterArtifactDeltaService'));
  const {chapterArtifactDeltaOutputSchema}=require(path.join(server,'dist/prompting/prompts/novel/chapterArtifactDelta.prompts'));
  const f=await fixture(), c=await f.chapter(10,'甲被押进牢房。');
  const output=chapterArtifactDeltaOutputSchema.parse({summary:'甲在牢房。',stateDeltas:{},syncPlan:{reason:'回填定稿位置'},confidence:0.95,
    characterLocationDeltas:[f.delta(f.a,'牢房',c.content)]});
  const delta=new ChapterArtifactDeltaService();
  await delta.applyChapterArtifactConsumer({novelId:f.n,chapterId:c.id,content:c.content,contentHash:hash(c.content),
    consumer:'character_locations',artifactSyncPolicy:'director_v2',contentProvenance:'confirmed',output});
  assert.equal((await f.read()).get(f.a).currentLocation,'牢房');
  const changed=await f.chapter(11,'甲走出牢房来到客栈。');
  output.characterLocationDeltas=[f.delta(f.a,'客栈',changed.content)];
  await delta.applyChapterArtifactConsumer({novelId:f.n,chapterId:changed.id,content:changed.content,contentHash:hash(changed.content),
    consumer:'character_locations',artifactSyncPolicy:'director_v2',contentProvenance:'debt',output});
  assert.equal((await f.read()).get(f.a).currentLocation,'牢房');
  await assert.rejects(delta.applyChapterArtifactConsumer({novelId:f.n,chapterId:changed.id,content:changed.content,contentHash:hash(changed.content),
    consumer:'character_locations',output}),/V2/);
});
`);
  try {
    const testEnvironment={...process.env,TEST_SERVER_ROOT:server,NODE_ENV:'test',DATABASE_URL:databaseUrl,DATABASE_PROVIDER:'sqlite',AI_NOVEL_RUNTIME:'desktop',AI_NOVEL_APP_DATA_DIR:dir};
    delete testEnvironment.NODE_TEST_CONTEXT;
    execFileSync(process.execPath,['--test',script],{env:testEnvironment,encoding:'utf8',stdio:'pipe'});
  } catch(error) {
    throw new Error(`${error.stdout || ''}\n${error.stderr || ''}`);
  }
});
