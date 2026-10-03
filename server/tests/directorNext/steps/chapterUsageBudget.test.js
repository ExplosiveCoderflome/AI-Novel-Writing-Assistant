const test=require('node:test');const assert=require('node:assert/strict');
const {parsePipelineDirectorSnapshot}=require('../../../dist/services/novel/production/directorBridge');
test('chapter usage checkpoints survive serialization and reject impossible counts',()=>{
 const snapshot={runId:'new-run',decisions:[],chapterUsage:[{chapterId:'c1',chapterOrder:1,startJobTokens:100,totalTokens:80000}]};
 assert.deepEqual(parsePipelineDirectorSnapshot(JSON.parse(JSON.stringify(snapshot))),snapshot);
 assert.throws(()=>parsePipelineDirectorSnapshot({...snapshot,chapterUsage:[{...snapshot.chapterUsage[0],startJobTokens:-1}]}),/invalid director/);
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
