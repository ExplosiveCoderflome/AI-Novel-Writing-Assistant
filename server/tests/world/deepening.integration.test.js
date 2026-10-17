const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {initializeTemporarySqliteDatabase} = require('../testInfrastructure/tempSqliteDatabase.cjs');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'world-answer-integration-'));
process.env.DATABASE_URL = initializeTemporarySqliteDatabase(directory, 'isolated.db');
process.env.NODE_ENV = 'test';
process.env.AI_NOVEL_RUNTIME = 'desktop';
process.env.AI_NOVEL_APP_DATA_DIR = directory;
const {prisma} = require('../../dist/db/prisma');
const runner = require('../../dist/prompting/core/promptRunner');
const {WorldService} = require('../../dist/services/world/WorldService');
const {getWorldStructure,getWorldOverview} = require('../../dist/services/world/worldStructureWorkspace');
const {normalizeWorldStructuredData} = require('../../dist/services/world/worldStructure');
const {readWorldAnswerIntegration} = require('@ai-novel/shared/types/world');
const original = runner.runStructuredPrompt;
let nextId = 0, calls = [], generate;
runner.runStructuredPrompt = async input => {
  calls.push(input);
  const raw = await generate(input);
  const parsed = input.asset.outputSchema.parse(raw);
  return {output: input.asset.postValidate(parsed,input.promptInput,{}),meta:{},context:{}};
};
test.after(async()=>{runner.runStructuredPrompt=original;await prisma.$disconnect()});
test.beforeEach(()=>{calls=[];generate=async input=>({answers:input.promptInput.answers.map(row=>({questionId:row.questionId,summary:'通行规则已补入规则中心'})),
  changes:{rules:{axioms:[{id:'permit-rule',name:'通行证',summary:'由三家商会轮流签发'}]}}})});
async function fixture(legacy=false) {
  const id='world-'+(++nextId);
  const structure=normalizeWorldStructuredData({profile:{identity:'海港世界',coreConflict:'原有核心冲突'},
    rules:{axioms:[{id:'old-rule',name:'旧规则',summary:'必须保留'}]},
    forces:[{id:'guild',name:'商会',summary:'既有组织'}],locations:[{id:'harbor',name:'海港',x:25,y:60,controllingForceIds:['guild']}],
    relations:{locationControls:[{id:'control',forceId:'guild',locationId:'harbor',relation:'治理'}]}});
  await prisma.world.create({data:{id,name:'隔离世界',structureJson:JSON.stringify(structure),bindingSupportJson:'{}',version:1}});
  const question=await prisma.worldDeepeningQA.create({data:{id:id+'-question',worldId:id,question:'通行证如何签发？',
    targetLayer:'foundation',targetField:'角色定位',status:legacy?'integrated':'pending',
    ...(legacy?{answer:'三家商会轮流签发',integratedSummary:'Q:旧问题\nA:旧回答'}:{})}});
  const service=new WorldService();service.queueRagUpsert=()=>{};
  return {id,structure,question,service,answers:[{questionId:question.id,answer:'三家商会轮流签发'}]};
}
async function saved(id) {return prisma.world.findUniqueOrThrow({where:{id}})}

test('AI integration updates handbook and overview, preserves unrelated assets, commits receipt and snapshot, and replays without AI',async()=>{
  const f=await fixture();
  const response=await f.service.answerDeepeningQuestions(f.id,f.answers,{provider:'ollama',model:'local-model'});
  assert.equal(calls[0].asset.id,'world.deepening.integrate_answers');
  assert.equal(calls[0].options.provider,'ollama');assert.equal(calls[0].options.model,'local-model');
  const handbook=await getWorldStructure(f.id);
  assert.equal(handbook.structure.rules.axioms.find(row=>row.id==='permit-rule').summary,'由三家商会轮流签发');
  assert.deepEqual(handbook.structure.locations,f.structure.locations);
  assert.deepEqual(handbook.structure.relations,f.structure.relations);
  assert.equal(handbook.structure.profile.coreConflict,'原有核心冲突');
  assert.ok(handbook.structure.rules.axioms.some(row=>row.id==='old-rule'));
  assert.ok(JSON.stringify(await getWorldOverview(f.id,{queueWorldUpsert(){}})).includes('由三家商会轮流签发'));
  assert.equal(response[0].status,'integrated');assert.equal(readWorldAnswerIntegration(response[0].integratedSummary).summary,'通行规则已补入规则中心');
  assert.equal((await saved(f.id)).version,2);
  const snapshots=await prisma.worldSnapshot.findMany({where:{worldId:f.id}});
  assert.equal(snapshots.length,1);assert.ok(snapshots[0].data.includes('permit-rule'));
  await f.service.answerDeepeningQuestions(f.id,f.answers);
  assert.equal(calls.length,1);assert.equal((await saved(f.id)).version,2);
});
test('legacy integrated Q/A receipts can be explicitly integrated into structured settings',async()=>{
  const f=await fixture(true);await f.service.answerDeepeningQuestions(f.id,f.answers);
  assert.equal(calls.length,1);assert.ok((await getWorldStructure(f.id)).structure.rules.axioms.some(row=>row.id==='permit-rule'));
});
test('model failure leaves the saved world, answers and snapshots untouched',async()=>{
  const f=await fixture();generate=async()=>{throw Error('模型不可用')};
  await assert.rejects(f.service.answerDeepeningQuestions(f.id,f.answers),/模型不可用/);
  assert.equal((await saved(f.id)).version,1);
  assert.equal((await prisma.worldDeepeningQA.findUnique({where:{id:f.question.id}})).status,'pending');
  assert.equal(await prisma.worldSnapshot.count({where:{worldId:f.id}}),0);
});
test('a concurrent handbook edit rejects stale AI output instead of overwriting it',async()=>{
  const f=await fixture(), normal=generate;
  generate=async input=>{await prisma.world.update({where:{id:f.id},data:{structureJson:JSON.stringify({...f.structure,profile:{...f.structure.profile,summary:'作者新保存'}})}});return normal(input)};
  await assert.rejects(f.service.answerDeepeningQuestions(f.id,f.answers),error=>error.statusCode===409);
  assert.equal((await getWorldStructure(f.id)).structure.profile.summary,'作者新保存');
  assert.equal((await prisma.worldDeepeningQA.findUnique({where:{id:f.question.id}})).status,'pending');
});
test('a concurrent answer edit rolls back the handbook write and retains the newer answer',async()=>{
  const f=await fixture(), normal=generate;
  generate=async input=>{await prisma.worldDeepeningQA.update({where:{id:f.question.id},data:{answer:'作者新回答',updatedAt:new Date(Date.now()+1000)}});return normal(input)};
  await assert.rejects(f.service.answerDeepeningQuestions(f.id,f.answers),error=>error.statusCode===409);
  assert.equal((await saved(f.id)).version,1);assert.equal((await saved(f.id)).structureJson,JSON.stringify(f.structure));
  assert.equal((await prisma.worldDeepeningQA.findUnique({where:{id:f.question.id}})).answer,'作者新回答');
});
test('snapshot persistence failure rolls back handbook and integrated status together',async()=>{
  const f=await fixture();
  await prisma.$executeRawUnsafe(`CREATE TRIGGER fail_snapshot_${nextId} BEFORE INSERT ON WorldSnapshot WHEN NEW.worldId = '${f.id}' BEGIN SELECT RAISE(ABORT, 'snapshot unavailable'); END`);
  await assert.rejects(f.service.answerDeepeningQuestions(f.id,f.answers));
  assert.equal((await saved(f.id)).version,1);
  assert.equal((await prisma.worldDeepeningQA.findUnique({where:{id:f.question.id}})).status,'pending');
});
test('unknown questions and duplicate IDs fail before model invocation',async()=>{
  const f=await fixture();
  await assert.rejects(f.service.answerDeepeningQuestions(f.id,[{questionId:'other-book',answer:'回答'}]),error=>error.statusCode===400);
  await assert.rejects(f.service.answerDeepeningQuestions(f.id,[...f.answers,...f.answers]),error=>error.statusCode===400);
  assert.equal(calls.length,0);
});
test('malformed stored structure is not replaced by an empty normalized world',async()=>{
  const f=await fixture();await prisma.world.update({where:{id:f.id},data:{structureJson:'broken-json'}});
  await assert.rejects(f.service.answerDeepeningQuestions(f.id,f.answers),error=>error.statusCode===409);
  assert.equal(calls.length,0);assert.equal((await saved(f.id)).structureJson,'broken-json');
});
test('missing answer summaries and invalid relation references are never saved as integrated',async()=>{
  const f=await fixture();generate=async()=>({answers:[],changes:{profile:{summary:'错误结果'}}});
  await assert.rejects(f.service.answerDeepeningQuestions(f.id,f.answers));
  generate=async input=>({answers:input.promptInput.answers.map(row=>({questionId:row.questionId,summary:'关系'})),
    changes:{relations:{locationControls:[{id:'broken-link',forceId:'missing',locationId:'harbor',relation:'控制'}]}}});
  await assert.rejects(f.service.answerDeepeningQuestions(f.id,f.answers),/无效实体或关系/);
  assert.equal((await saved(f.id)).version,1);
});

test('null optional affiliations and leaders preserve saved values without requiring JSON repair',async()=>{
  const f=await fixture();
  const structure={...f.structure,forces:f.structure.forces.map(row=>({...row,leader:'作者保留的负责人'}))};
  await prisma.world.update({where:{id:f.id},data:{structureJson:JSON.stringify(structure)}});
  generate=async input=>({answers:input.promptInput.answers.map(row=>({questionId:row.questionId,summary:'商会轮流签发通行证'})),
    changes:{forces:[{id:'guild',summary:'三家商会轮流签发通行证',factionId:null,leader:null}]}});
  await f.service.answerDeepeningQuestions(f.id,f.answers);
  const force=(await getWorldStructure(f.id)).structure.forces.find(row=>row.id==='guild');
  assert.equal(force.leader,'作者保留的负责人');assert.equal(force.factionId,null);
  assert.equal(calls.length,1);
  assert.doesNotThrow(()=>require('zod').toJSONSchema(calls[0].asset.outputSchema));
});

test('unknown faction, representative and controlling force references cannot be accepted as integrated',async()=>{
  const f=await fixture();
  for(const changes of [
    {forces:[{id:'guild',factionId:'missing-faction'}]},
    {factions:[{id:'new-faction',name:'新阵营',representativeForceIds:['missing-force']}]},
    {locations:[{id:'harbor',controllingForceIds:['missing-force']}]},
  ]) {
    generate=async input=>({answers:input.promptInput.answers.map(row=>({questionId:row.questionId,summary:'应拒绝的引用'})),changes});
    await assert.rejects(f.service.answerDeepeningQuestions(f.id,f.answers),error=>error.statusCode===422);
    assert.equal((await saved(f.id)).version,1);
    assert.equal((await prisma.worldDeepeningQA.findUnique({where:{id:f.question.id}})).status,'pending');
    assert.equal(await prisma.worldSnapshot.count({where:{worldId:f.id}}),0);
  }
});
