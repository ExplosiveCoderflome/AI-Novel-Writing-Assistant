const test=require('node:test');const assert=require('node:assert/strict');
const {parsePipelineDirectorSnapshot}=require('../../../dist/services/novel/production/directorBridge');

test('100000-token budget allows the observed 86009-token chapter and stops exactly at the new boundary',()=>{
 const {beginChapterUsage,observeChapterUsage}=require('../../../dist/services/novel/production/usage');
 const snapshot={runId:'new-run',decisions:[]};
 beginChapterUsage(snapshot,'c16',16,165911);
 assert.deepEqual(observeChapterUsage(snapshot,'c16',251920),{totalTokens:86009,exceeded:false});
 assert.equal(observeChapterUsage(snapshot,'c16',165911+99999).exceeded,false);
 assert.equal(observeChapterUsage(snapshot,'c16',165911+100000).exceeded,true);
});
test('chapter usage checkpoints survive serialization and reject impossible counts',()=>{
 const snapshot={runId:'new-run',decisions:[],chapterUsage:[{chapterId:'c1',chapterOrder:1,startJobTokens:100,totalTokens:80000}]};
 assert.deepEqual(parsePipelineDirectorSnapshot(JSON.parse(JSON.stringify(snapshot))),snapshot);
 assert.throws(()=>parsePipelineDirectorSnapshot({...snapshot,chapterUsage:[{...snapshot.chapterUsage[0],startJobTokens:-1}]}),/invalid director/);
});
test('a saved chapter end freezes attribution and rejects inconsistent persisted boundaries',()=>{
 const {observeChapterUsage,beginChapterUsage}=require('../../../dist/services/novel/production/usage');
 const snapshot={runId:'new-run',decisions:[],chapterUsage:[{chapterId:'c1',chapterOrder:1,startJobTokens:500,totalTokens:70000,endJobTokens:70500}]};
 const restored=parsePipelineDirectorSnapshot(JSON.parse(JSON.stringify(snapshot)));
 assert.deepEqual(restored,snapshot);
 assert.deepEqual(observeChapterUsage(restored,'c1',100500),{totalTokens:70000,exceeded:false});
 assert.throws(()=>observeChapterUsage(restored,'c1',70499),/计数倒退/);
 assert.throws(()=>beginChapterUsage(restored,'c1',1,100500),/已闭合/);
 assert.throws(()=>parsePipelineDirectorSnapshot({...snapshot,chapterUsage:[{...snapshot.chapterUsage[0],endJobTokens:70499}]}),/invalid director/);
});
test('chapter budget retains its baseline on recovery and counts only this chapter',()=>{
 const {beginChapterUsage,observeChapterUsage,DIRECTOR_CHAPTER_TOKEN_LIMIT}=require('../../../dist/services/novel/production/usage');
 const snapshot={runId:'new-run',decisions:[]};
 assert.equal(beginChapterUsage(snapshot,'c1',1,500),true);
 assert.equal(beginChapterUsage(snapshot,'c1',1,20000),false);
 assert.equal(snapshot.chapterUsage[0].startJobTokens,500);
 assert.equal(observeChapterUsage(snapshot,'c1',500+DIRECTOR_CHAPTER_TOKEN_LIMIT-1).exceeded,false);
 assert.equal(observeChapterUsage(snapshot,'c1',500+DIRECTOR_CHAPTER_TOKEN_LIMIT).exceeded,true);
 assert.throws(()=>observeChapterUsage(snapshot,'c1',499),/计数/);
 assert.throws(()=>beginChapterUsage(snapshot,'c1',2,90000),/身份/);
 assert.throws(()=>observeChapterUsage(snapshot,'unknown',90000),/检查点/);
});
test('chapter budget excludes chapter-batch planning while preserving the job counter boundary',()=>{
 const {beginChapterUsage,observeChapterUsage,finalizeChapterUsage}=require('../../../dist/services/novel/production/usage');
 const snapshot={runId:'new-run',decisions:[]};
 beginChapterUsage(snapshot,'c1',1,100,20);
 assert.equal(observeChapterUsage(snapshot,'c1',1150,70).totalTokens,1000);
 assert.equal(finalizeChapterUsage(snapshot,'c1',1150,70).totalTokens,1000);
 assert.equal(snapshot.chapterUsage[0].endJobTokens,1150);
 assert.equal(snapshot.chapterUsage[0].endChapterBatchTokens,70);
});

const counters=(totalTokens,promptTokens,completionTokens,cacheHitTokens)=>({totalTokens,promptTokens,completionTokens,cacheHitTokens});
test('effective chapter usage deducts cache hits and counts output once',()=>{
 const {beginChapterUsage,observeChapterUsage}=require('../../../dist/services/novel/production/usage');
 const snapshot={runId:'effective-run',decisions:[]};
 beginChapterUsage(snapshot,'c1',1,counters(1000,800,200,300),counters(0,0,0,0));
 const observed=observeChapterUsage(snapshot,'c1',counters(106589,87193,19396,24620),counters(0,0,0,0));
 assert.equal(observed.totalTokens,105589);
 assert.equal(observed.exceeded,false);
 assert.equal(snapshot.chapterUsage[0].effectiveTokens,81269);
 assert.equal(snapshot.chapterUsage[0].completionTokens,19196);
 assert.equal(snapshot.chapterUsage[0].cacheHitTokens,24320);
 assert.deepEqual(parsePipelineDirectorSnapshot(JSON.parse(JSON.stringify(snapshot))),snapshot);
});
test('closed effective usage never subtracts future planning twice or attributes later calls',()=>{
 const {beginChapterUsage,observeChapterUsage,finalizeChapterUsage}=require('../../../dist/services/novel/production/usage');
 const snapshot={runId:'effective-run',decisions:[]};
 beginChapterUsage(snapshot,'c1',1,counters(0,0,0,0),counters(0,0,0,0));
 finalizeChapterUsage(snapshot,'c1',counters(1150,900,250,100),counters(50,40,10,5));
 const frozen=JSON.parse(JSON.stringify(snapshot));
 assert.equal(snapshot.chapterUsage[0].totalTokens,1100);
 assert.equal(snapshot.chapterUsage[0].effectiveTokens,1005);
 assert.equal(observeChapterUsage(snapshot,'c1',counters(1150,900,250,100),counters(50,40,10,5)).totalTokens,1100);
 assert.equal(observeChapterUsage(snapshot,'c1',counters(3000,2400,600,500),counters(200,160,40,20)).totalTokens,1100);
 assert.deepEqual(snapshot,frozen);
 assert.deepEqual(parsePipelineDirectorSnapshot(snapshot),snapshot);
});
test('closed legacy usage freezes its saved planning boundary on recovery',()=>{
 const {beginChapterUsage,observeChapterUsage,finalizeChapterUsage}=require('../../../dist/services/novel/production/usage');
 const snapshot={runId:'legacy-run',decisions:[]};
 beginChapterUsage(snapshot,'c1',1,100,20);
 finalizeChapterUsage(snapshot,'c1',1150,70);
 assert.equal(observeChapterUsage(snapshot,'c1',2000).totalTokens,1000);
 assert.equal(observeChapterUsage(snapshot,'c1',2000,400).totalTokens,1000);
});
test('old checkpoints keep raw accounting even when live component usage becomes available',()=>{
 const {observeChapterUsage}=require('../../../dist/services/novel/production/usage');
 const snapshot={runId:'legacy-run',decisions:[],chapterUsage:[{chapterId:'c1',chapterOrder:1,startJobTokens:0,totalTokens:89892}]};
 const observed=observeChapterUsage(snapshot,'c1',counters(89892,70000,19892,50000));
 assert.equal(observed.totalTokens,89892);
 assert.equal(snapshot.chapterUsage[0].effectiveTokens,undefined);
});
test('effective accounting rejects cache rollback and impossible cache counts',()=>{
 const {beginChapterUsage,observeChapterUsage}=require('../../../dist/services/novel/production/usage');
 const snapshot={runId:'effective-run',decisions:[]};
 beginChapterUsage(snapshot,'c1',1,counters(100,80,20,30));
 assert.throws(()=>observeChapterUsage(snapshot,'c1',counters(200,160,40,29)),/计数/);
 assert.throws(()=>beginChapterUsage({runId:'x',decisions:[]},'c1',1,counters(100,80,20,81)),/计数/);
});
test('provider total-only usage remains charged conservatively instead of creating free budget',()=>{
 const {beginChapterUsage,observeChapterUsage}=require('../../../dist/services/novel/production/usage');
 const snapshot={runId:'partial-run',decisions:[]};
 beginChapterUsage(snapshot,'c1',1,counters(0,0,0,0));
 const observed=observeChapterUsage(snapshot,'c1',counters(100001,0,0,0));
 assert.equal(observed.exceeded,true);assert.equal(snapshot.chapterUsage[0].effectiveTokens,100001);
 assert.equal(snapshot.chapterUsage[0].unclassifiedTokens,100001);
 assert.deepEqual(parsePipelineDirectorSnapshot(snapshot),snapshot);
});
test('budget authorization covers the next step without resetting consumed usage or other chapters',()=>{
 const {readPausedChapterBudget,authorizeChapterBudget}=require('../../../dist/services/novel/production/usage');
 const snapshot={runId:'legacy-run',decisions:[{issueCode:'runtime.token_budget_exceeded',chapterOrder:3,action:'pause_for_manual'}],
  chapterUsage:[{chapterId:'c2',chapterOrder:2,startJobTokens:0,totalTokens:50000,endJobTokens:50000},
   {chapterId:'c3',chapterOrder:3,startJobTokens:50000,totalTokens:89892}]};
 const view=readPausedChapterBudget(snapshot,'job');
 assert.equal(view.usedTokens,89892);assert.equal(view.reserveTokens,16000);assert.ok(view.recommendedLimit>105892);
 const grant={jobId:'job',chapterId:'c3',metric:'raw_tokens_v1',tokenLimit:view.recommendedLimit};
 assert.throws(()=>authorizeChapterBudget(snapshot,'job',{...grant,tokenLimit:105892}),/额度/);
 assert.throws(()=>authorizeChapterBudget(snapshot,'job',{...grant,chapterId:'c2'}),/章节/);
 assert.throws(()=>authorizeChapterBudget(snapshot,'job',{...grant,metric:'uncached_tokens_v1'}),/计量/);
 const before=JSON.parse(JSON.stringify(snapshot));
 authorizeChapterBudget(snapshot,'job',grant);
 assert.equal(snapshot.chapterUsage[1].tokenLimit,view.recommendedLimit);
 assert.equal(snapshot.chapterUsage[1].startJobTokens,50000);assert.equal(snapshot.chapterUsage[1].totalTokens,89892);
 assert.deepEqual(snapshot.chapterUsage[0],before.chapterUsage[0]);assert.deepEqual(snapshot.decisions,before.decisions);
});
test('budget authorization cannot resolve a separate quality-first manual pause',()=>{
 const {readPausedChapterBudget}=require('../../../dist/services/novel/production/usage');
 const snapshot={runId:'run',decisions:[{issueCode:'runtime.token_budget_exceeded',chapterOrder:1,action:'pause_for_manual'},
  {issueCode:'quality.chapter_below_threshold',chapterOrder:1,action:'pause_for_manual'}],
  chapterUsage:[{chapterId:'c1',chapterOrder:1,startJobTokens:0,totalTokens:100000}]};
 assert.equal(readPausedChapterBudget(snapshot,'job'),null);
});
