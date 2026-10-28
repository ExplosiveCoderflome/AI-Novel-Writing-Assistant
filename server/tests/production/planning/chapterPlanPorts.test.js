const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {fixture,view}=require('./chapterFixture.cjs');
const file=path.resolve(__dirname,'../../../dist/services/planner/chapter/index.js'),api=fs.existsSync(file)?require(file):{};
test('chapter planning prepares complete native input without dispatch or persistence and projects its normalized result',async()=>{
 assert.equal(typeof api.prepareChapterPlan,'function','chapter preparation needs a readonly native request port');
 const f=fixture(),prepared=await api.prepareChapterPlan('novel-1','chapter-1',f.options,f.deps);
 assert.equal(f.state.models,0);assert.equal(f.state.persisted,0);
 const baseline=require('./fixtures/chapterPlanBaseline.json');assert.deepEqual(view(prepared.request),baseline.request);
 const restored=JSON.parse(JSON.stringify(prepared));
 const result=await api.executePreparedChapterPlan(restored,async request=>{assert.deepEqual(view(request),baseline.request);return{output:f.output}});
 assert.deepEqual(api.projectChapterPlan(restored,result),baseline.persist);
 assert.deepEqual(api.projectChapterPlan(restored,result).participants,['阿青']);
 assert.equal(f.state.persisted,0);
});
test('the existing chapter facade preserves the captured native request and committed payload after extraction',async t=>{
 const f=fixture(),captured=f.install(t),baseline=require('./fixtures/chapterPlanBaseline.json');
 await new (require('../../../dist/services/planner/PlannerService').PlannerService)().generateChapterPlan('novel-1','chapter-1',f.options);
 assert.deepEqual(captured,baseline);assert.equal(f.state.models,1);assert.equal(f.state.persisted,1);
});
test('strict chapter preparation propagates unavailable source context before dispatch or persistence',async()=>{
 assert.equal(typeof api.prepareChapterPlan,'function');const f=fixture();f.state.payoffError=true;
 await assert.rejects(()=>api.prepareChapterPlan('novel-1','chapter-1',f.options,f.deps),/ledger source unavailable/);
 assert.equal(f.state.models,0);assert.equal(f.state.persisted,0);
});
