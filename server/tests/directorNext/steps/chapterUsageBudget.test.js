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
