const test=require('node:test');const assert=require('node:assert/strict');
const {parsePipelinePayload,stringifyPipelinePayload}=require('../../../dist/services/novel/pipelineJobState');
test('director ownership and structured issue decisions survive pipeline payload persistence',()=>{
 const directorNext={runId:'next-run',decisions:[{issueCode:'quality.chapter_below_threshold',action:'continue_with_warning',reason:'保留正文',locked:false,policySource:'task_snapshot',retryExhaustedAction:'continue_with_warning',chapterOrder:2}]};
 const restored=parsePipelinePayload(stringifyPipelinePayload({directorNext}));assert.deepEqual(restored.directorNext,directorNext);
 assert.equal(restored.workflowTaskId,undefined);
});
test('malformed director ownership cannot silently become a legacy job',()=>{
 assert.throws(()=>parsePipelinePayload(JSON.stringify({directorNext:{runId:'',decisions:[]}})),/director/i);
});
test('explicit recovery cursor preserves issue history and cannot exceed saved decisions',()=>{
 const directorNext={runId:'run',decisions:[],resolvedDecisionCount:0};
 assert.deepEqual(parsePipelinePayload(stringifyPipelinePayload({directorNext})).directorNext,directorNext);
 assert.throws(()=>parsePipelinePayload(JSON.stringify({directorNext:{...directorNext,resolvedDecisionCount:1}})),/director/i);
});
test('legacy payloads retain their existing shape without new director metadata',()=>{
 const saved=JSON.parse(stringifyPipelinePayload({model:'legacy'}));assert.equal('directorNext' in saved,false);assert.equal(parsePipelinePayload(JSON.stringify(saved)).model,'legacy');
});

test('pipeline startup reuses its own completed or manual-pending job and never adopts a foreign job',async()=>{
 const support=require('../../../dist/services/novel/novelCoreSupport');support.ensureNovelCharacters=async()=>{};
 const {prisma}=require('../../../dist/db/prisma');
 const {NovelCorePipelineService}=require('../../../dist/services/novel/novelCorePipelineService');
 const service=new NovelCorePipelineService(async(id,payload)=>{assert.equal(id,'novel');assert.equal(payload.directorNext.runId,'run');});service.resolveIssuePolicySnapshot=async()=>({maxAutomaticRetries:1,issueActions:{}});
 const scheduled=[];service.schedulePipelineExecution=(...args)=>scheduled.push(args);
 const options={startOrder:1,endOrder:2,directorNext:{runId:'run',decisions:[]}};
 for(const job of [{id:'own',status:'succeeded',pendingManualRecovery:false},{id:'own',status:'queued',pendingManualRecovery:true}]) {
  prisma.generationJob.findMany=async()=>[{...job,payload:stringifyPipelinePayload({directorNext:options.directorNext})}];
  assert.equal((await service.startPipelineJob('novel',options)).id,'own');
 }
 assert.equal(scheduled.length,0);
 prisma.generationJob.findMany=async()=>[{id:'foreign',status:'running',payload:'{}'}];
 await assert.rejects(()=>service.startPipelineJob('novel',options),/其他运行/);
});
test('automatic resume preserves a manual pause that appeared after the caller read the job',async()=>{
 const {prisma}=require('../../../dist/db/prisma');const {NovelCorePipelineService}=require('../../../dist/services/novel/novelCorePipelineService');
 const service=new NovelCorePipelineService();const calls=[];service.schedulePipelineExecution=()=>calls.push('schedule');
 prisma.generationJob.findUnique=async()=>({id:'job',status:'queued'});
 prisma.generationJob.updateMany=async input=>{calls.push(input);return {count:0};};
 await service.resumePipelineJob('job',{preserveManualRecovery:true});
 assert.equal(calls.length,1);assert.equal(calls[0].where.pendingManualRecovery,false);assert.equal(calls.includes('schedule'),false);
});
test('director autopilot never expands beyond its authorized range using mutable book defaults',async()=>{
 const {prisma}=require('../../../dist/db/prisma');const {NovelPipelineExecutor}=require('../../../dist/services/novel/production/NovelPipelineExecutor');
 const {novelEventBus}=require('../../../dist/events');novelEventBus.emit=async()=>{};
 const updates=[];const state={id:'job',status:'running',cancelRequestedAt:null,completedCount:0,totalCount:1,payload:stringifyPipelinePayload({directorNext:{runId:'run',decisions:[]}})};
 prisma.generationJob.findUnique=async()=>state;prisma.generationJob.update=async input=>{updates.push(input.data);Object.assign(state,input.data);return state;};
 const {buildChapterArtifactContentHash}=require('../../../dist/services/novel/runtime/artifactSync');
 prisma.novel.findUnique=async()=>({id:'novel',title:'测试书',estimatedChapterCount:100});
 prisma.chapter.findMany=async()=>[1,2,3].map(order=>({id:'chapter-'+order,novelId:'novel',order,content:'已闭合正文',generationState:'approved',
  artifactSyncCheckpoints:[{contentHash:buildChapterArtifactContentHash('已闭合正文'),metadataJson:JSON.stringify({outcome:'completed'})}]}));
 const executor=new NovelPipelineExecutor({},undefined,async(id,payload)=>{assert.equal(id,'novel');assert.equal(payload.directorNext.runId,'run');});
 await executor.execute('job','novel',{startOrder:1,endOrder:3,skipCompleted:true,controlPolicy:{kickoffMode:'director_start',advanceMode:'full_book_autopilot',reviewCheckpoints:[]}});
 assert.equal(updates.find(row=>row.endOrder!==undefined).endOrder,3);assert.equal(state.status,'succeeded');
 assert.equal(state.completedCount,3);assert.equal(state.progress,1);
});
