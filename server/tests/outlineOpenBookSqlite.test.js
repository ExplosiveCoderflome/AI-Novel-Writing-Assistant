const test=require('node:test'), assert=require('node:assert/strict'), fs=require('node:fs'), os=require('node:os'), path=require('node:path');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'a2-open-'));
Object.assign(process.env,{NODE_ENV:'test',AI_NOVEL_RUNTIME:'desktop',AI_NOVEL_APP_DATA_DIR:dir,DATABASE_URL:'file:'+path.join(dir,'a2.db'),DIRECTOR_NEXT_ENABLED:'true'});
const {prisma}=require('../dist/db/prisma');
const {ensureRuntimeDatabaseReady}=require('../dist/db/runtimeMigrations');
const {OutlineOpenBookService}=require('../dist/modules/planning/outline/openBook');
const {createEmptyOutlineDocument}=require('@ai-novel/shared/types/outline');
const {normalizeVolumeWorkspaceDocument}=require('../dist/services/novel/volume/volumeWorkspaceDocument');
let n=0;
async function fixture(){const id='p'+(++n),d=createEmptyOutlineDocument('雾港');d.story.premise='未来来信';d.volumes=[{nodeId:'v',title:'初来',summary:'作者卷纲',order:0,planningDepth:'rough',chapterNodeIds:['c']}];d.chapters=[{nodeId:'c',volumeNodeId:'v',order:0,title:'来信',summary:'作者章纲',purpose:'埋疑',planningDepth:'rough',characterNodeIds:['a'],payoffNodeIds:[]}];d.characters=[{nodeId:'a',name:'林',goal:'寻找',appearanceNodeIds:[]},{nodeId:'b',name:'林',appearanceNodeIds:[]}];await prisma.outlineProject.create({data:{id,title:d.story.title,currentVersion:1,currentRevisionId:id+'r'}});await prisma.outlineRevision.create({data:{id:id+'r',projectId:id,version:1,documentJson:JSON.stringify(d),sourceType:'manual'}});return {id,d,input:{revisionId:id+'r',expectedProjectVersion:1,bookSettings:{title:'雾港',estimatedChapterCount:3,defaultChapterLength:3000},volumeQuotas:{v:3},allowOptimize:[]}};}
const service=new OutlineOpenBookService(prisma,async()=>{});
test.before(()=>ensureRuntimeDatabaseReady());test.after(()=>prisma.$disconnect());
test('preview is read-only and confirm maps formal identities and version-only fields',async()=>{const f=await fixture();const count=await prisma.novel.count();const preview=await service.preview(f.id,f.input);assert.equal(await prisma.novel.count(),count);const b=await service.confirm(f.id,{...f.input,requestHash:preview.requestHash,idempotencyKey:f.id});assert.equal(b.replayed,false);assert.equal(b.setupState.rag,'queued');const novel=await prisma.novel.findUniqueOrThrow({where:{id:b.novelId}});assert.equal(novel.directorVersion,'v2');assert.equal(novel.estimatedChapterCount,3);assert.equal(await prisma.chapter.count({where:{novelId:b.novelId}}),1);assert.equal(await prisma.character.count({where:{novelId:b.novelId}}),2);assert.equal(await prisma.payoffLedgerItem.count({where:{novelId:b.novelId}}),0);const version=await prisma.volumePlanVersion.findFirstOrThrow({where:{novelId:b.novelId,status:'active'}});const w=normalizeVolumeWorkspaceDocument(b.novelId,version.contentJson);assert.equal(w.strategyPlan,null);assert.equal(w.volumes[0].status,'chapter_list_partial');assert.deepEqual(w.volumes[0].chapters[0].plannedCharacterIds,[b.mapping.characters[0].characterId]);assert.equal(w.volumes[0].chapters[0].chapterId,b.mapping.chapters[0].chapterId);assert.equal(w.volumes[0].chapters[0].summary,'作者章纲');assert.equal((await prisma.chapter.findUniqueOrThrow({where:{id:b.mapping.chapters[0].chapterId}})).content,'');});
test('same-key replay, changed request and two-key concurrency create at most one book',async()=>{const f=await fixture(),p=await service.preview(f.id,f.input),r={...f.input,requestHash:p.requestHash,idempotencyKey:f.id};const results=await Promise.allSettled([service.confirm(f.id,r),service.confirm(f.id,{...r,idempotencyKey:f.id+'other'})]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(await prisma.outlineBookBinding.count({where:{projectId:f.id}}),1);const winner=await prisma.outlineBookBinding.findUniqueOrThrow({where:{projectId:f.id}});assert.equal((await service.confirm(f.id,{...r,idempotencyKey:winner.requestKey})).replayed,true);const changed={...f.input,bookSettings:{...f.input.bookSettings,title:'别名'}};const p2=await service.preview(f.id,changed);await assert.rejects(()=>service.confirm(f.id,{...changed,requestHash:p2.requestHash,idempotencyKey:winner.requestKey}),e=>e.code==='OUTLINE_OPEN_REQUEST_CONFLICT');});
test('failure at character, chapter, volume version, relation and binding boundaries rolls back every asset',async()=>{for(const table of ['Character','Chapter','VolumePlanVersion','VolumePlan','VolumeChapterPlan','OutlineBookBinding']){const f=await fixture(),p=await service.preview(f.id,f.input);await prisma.$executeRawUnsafe(`CREATE TRIGGER fail_a2 BEFORE INSERT ON "${table}" BEGIN SELECT RAISE(ABORT, 'injected fault'); END`);try{await assert.rejects(()=>service.confirm(f.id,{...f.input,requestHash:p.requestHash,idempotencyKey:f.id}));assert.equal(await prisma.novel.count({where:{id:'outline-novel-'+f.id}}),0);assert.equal((await prisma.outlineProject.findUniqueOrThrow({where:{id:f.id}})).boundNovelId,null);assert.equal(await prisma.outlineBookBinding.count({where:{projectId:f.id}}),0);}finally{await prisma.$executeRawUnsafe('DROP TRIGGER fail_a2');}}});
test('post-create setup failure stays replayable and retry targets original book',async()=>{const f=await fixture();let fail=true,calls=0;const s=new OutlineOpenBookService(prisma,async()=>{calls++;if(fail)throw Error('injected setup failure');});const p=await s.preview(f.id,f.input),r={...f.input,requestHash:p.requestHash,idempotencyKey:f.id};const b=await s.confirm(f.id,r);assert.equal(b.setupState.rag,'pending');fail=false;const retry=await s.retrySetup(f.id);assert.equal(retry.novelId,b.novelId);assert.equal(retry.setupState.rag,'queued');assert.equal((await s.confirm(f.id,r)).replayed,true);assert.equal(calls,2);});
test('historical revision freezes source; stale expected project version rejects before creation',async()=>{const f=await fixture();await prisma.outlineProject.update({where:{id:f.id},data:{currentVersion:2}});await assert.rejects(()=>service.preview(f.id,f.input),e=>e.code==='OUTLINE_VERSION_CONFLICT');const input={...f.input,expectedProjectVersion:2};const p=await service.preview(f.id,input);assert.equal(p.revisionVersion,1);assert.ok(p.warnings.length);const b=await service.confirm(f.id,{...input,requestHash:p.requestHash,idempotencyKey:f.id});assert.equal(b.revisionVersion,1);await prisma.outlineProject.update({where:{id:f.id},data:{currentVersion:3}});assert.equal((await service.getBinding(f.id)).revisionVersion,1);});

test('A2 V2 handoff uses server binding, stays single chapter and leaves unbound launch unchanged',async()=>{
 const {prepareOutlineHandoff}=require('../dist/app/director/outlineOpening');
 const f=await fixture(),p=await service.preview(f.id,f.input),b=await service.confirm(f.id,{...f.input,requestHash:p.requestHash,idempotencyKey:f.id});
 const make=()=>({novelId:b.novelId,driver:'auto',planVersion:'director-next-production-v1',chapterRange:{from:1,to:1},launchInput:{storyInput:'不能覆盖的客户端想法',estimatedChapterCount:999,worldMode:'skip'}});
 const manual={...make(),planVersion:require('../dist/app/director/productionKernel/manual/contract').MANUAL_CHAPTER_PLAN_VERSION};await prepareOutlineHandoff(manual);assert.equal(manual.planVersion,require('../dist/app/director/productionKernel/manual/contract').MANUAL_CHAPTER_PLAN_VERSION);assert.equal(manual.driver,'auto');
 const c=make();assert.equal(await prepareOutlineHandoff(c),true);assert.equal(c.planVersion,'outline-open-book-v1');assert.equal(c.driver,'assisted');assert.equal(c.launchInput.estimatedChapterCount,3);assert.equal(c.launchInput.storyInput,'未来来信');assert.equal(c.launchInput.outlineBinding.bindingId,b.bindingId);
 await assert.rejects(()=>prepareOutlineHandoff({...make(),chapterRange:{from:1,to:2}}),e=>e.code==='OUTLINE_SINGLE_CHAPTER_REQUIRED');
 await assert.rejects(()=>prepareOutlineHandoff({...make(),chapterRange:{from:2,to:2}}),e=>e.code==='OUTLINE_PREVIOUS_CHAPTER_REQUIRED');
 await prisma.novel.create({data:{id:'legacy-a2',title:'旧书',directorVersion:'v2'}});const legacy={...make(),novelId:'legacy-a2'};const before=JSON.stringify(legacy);assert.equal(await prepareOutlineHandoff(legacy),false);assert.equal(JSON.stringify(legacy),before);
});
test('transactional source guard rejects stale policies and preserved-field overwrite without touching saved planning',async()=>{
 const {readOutlinePlanningState,withOutlinePlanningState}=require('../dist/modules/planning/outline/constraints');
 const {persistActiveVolumeWorkspace}=require('../dist/services/novel/volume/volumeWorkspacePersistence');
 const f=await fixture(),p=await service.preview(f.id,f.input),b=await service.confirm(f.id,{...f.input,requestHash:p.requestHash,idempotencyKey:f.id});
 const state=await readOutlinePlanningState(prisma,b.novelId);const w=structuredClone(state.baseline);w.volumes[0].chapters[0].summary='改写';
 await assert.rejects(()=>prisma.$transaction(tx=>persistActiveVolumeWorkspace(tx,b.novelId,w,w.activeVersionId)),e=>e.code==='OUTLINE_PRESERVED_FIELD');
 await prisma.outlineBookBinding.update({where:{id:b.bindingId},data:{policyVersion:2}});
 await withOutlinePlanningState(state,async()=>{await assert.rejects(()=>prisma.$transaction(tx=>persistActiveVolumeWorkspace(tx,b.novelId,state.baseline,state.baseline.activeVersionId)),e=>e.code==='OUTLINE_POLICY_CONFLICT');});
 assert.equal((await prisma.volumeChapterPlan.findUniqueOrThrow({where:{id:b.mapping.chapters[0].planId}})).summary,'作者章纲');
});

test('policy CAS edits only adopted running fields and never source revision or chapter prose',async()=>{
 const {OutlinePolicyService}=require('../dist/modules/planning/outline/openBook');const ps=new OutlinePolicyService(prisma);
 const f=await fixture(),p=await service.preview(f.id,f.input),b=await service.confirm(f.id,{...f.input,requestHash:p.requestHash,idempotencyKey:f.id});const chapterId=b.mapping.chapters[0].chapterId;
 await prisma.chapter.update({where:{id:chapterId},data:{content:'人工调整的实际正文'}});
 const result=await ps.update(f.id,{expectedPolicyVersion:1,changes:[{nodeId:'c',field:'summary',value:'用户调整的运行章纲'}]});assert.equal(result.policyVersion,2);
 assert.equal((await prisma.volumeChapterPlan.findUniqueOrThrow({where:{id:b.mapping.chapters[0].planId}})).summary,'用户调整的运行章纲');assert.equal((await prisma.chapter.findUniqueOrThrow({where:{id:chapterId}})).content,'人工调整的实际正文');
 assert.equal(JSON.parse((await prisma.outlineRevision.findUniqueOrThrow({where:{id:f.input.revisionId}})).documentJson).chapters[0].summary,'作者章纲');
 await assert.rejects(()=>ps.update(f.id,{expectedPolicyVersion:1,changes:[{nodeId:'c',field:'summary',value:'过期结果'}]}),e=>e.code==='OUTLINE_POLICY_CONFLICT');
 const {prepareOutlineHandoff}=require('../dist/app/director/outlineOpening');const c={novelId:b.novelId,driver:'assisted',planVersion:'director-next-production-v1',chapterRange:{from:2,to:2},launchInput:{storyInput:'旧输入',estimatedChapterCount:3,worldMode:'skip'}};await prepareOutlineHandoff(c);assert.equal(c.launchInput.outlineBinding.policyVersion,2);
 const {readOutlinePlanningState,buildOutlinePlanningPayload,withOutlinePlanningState}=require('../dist/modules/planning/outline/constraints');const state=await readOutlinePlanningState(prisma,b.novelId,{from:1,to:1});assert.equal(buildOutlinePlanningPayload(state).chapter.summary,'用户调整的运行章纲');const nextState=await readOutlinePlanningState(prisma,b.novelId,{from:2,to:2});assert.equal(buildOutlinePlanningPayload(nextState).previousActualResult.content,'人工调整的实际正文');await prisma.chapter.update({where:{id:chapterId},data:{updatedAt:new Date(Date.now()+1000)}});await withOutlinePlanningState(nextState,()=>prisma.$transaction(tx=>require('../dist/modules/planning/outline/constraints').assertOutlineWorkspaceWrite(tx,b.novelId,nextState.baseline)));await prisma.chapter.update({where:{id:chapterId},data:{content:'准备期间又修改前章'}});await withOutlinePlanningState(nextState,()=>assert.rejects(()=>prisma.$transaction(tx=>require('../dist/services/novel/volume/volumeWorkspacePersistence').persistActiveVolumeWorkspace(tx,b.novelId,nextState.baseline,nextState.baseline.activeVersionId)),e=>e.code==='OUTLINE_PREVIOUS_CHAPTER_CHANGED'));
});
test('planned ledger stays non-factual until evidence links a stable actual item, and rereads edited prose',async()=>{
 const f=await fixture();f.d.payoffs=[{nodeId:'pay',title:'铜钥匙',kind:'mystery',setupDescription:'收到铜钥匙',payoffDescription:'打开远期门',setupChapterNodeIds:['c'],payoffChapterNodeIds:['c'],relatedNodeIds:[]}];f.d.chapters[0].payoffNodeIds=['pay'];await prisma.outlineRevision.update({where:{id:f.input.revisionId},data:{documentJson:JSON.stringify(f.d)}});
 const p=await service.preview(f.id,f.input),b=await service.confirm(f.id,{...f.input,requestHash:p.requestHash,idempotencyKey:f.id});const key=b.mapping.payoffs[0].ledgerKey;
 const runner=require('../dist/prompting/core/promptRunner'),original=runner.runStructuredPrompt;let calls=0,captured;
 runner.runStructuredPrompt=async request=>{calls++;captured=request;return {output:{items:[{ledgerKey:'ai-label',title:'铜钥匙',summary:'正文已见钥匙',scopeType:'book',currentStatus:'setup',targetStartChapterOrder:99,targetEndChapterOrder:99,setupChapterOrder:1,firstSeenChapterOrder:1,lastTouchedChapterOrder:1,sourceRefs:[{kind:'outline_plan',refId:key,refLabel:'铜钥匙'}],evidence:[{summary:'见钥匙',quote:'邮包中有一把铜钥匙',chapterOrder:1}],riskSignals:[]}]}};};
 try{
 const {PayoffLedgerSyncService}=require('../dist/services/payoff/PayoffLedgerSyncService');const ledger=new PayoffLedgerSyncService();let read=await ledger.getPayoffLedger(b.novelId);assert.equal(calls,0);assert.equal(read.items.length,0);assert.equal(read.plans[0].state,'planned');
 await ledger.syncLedger(b.novelId,{chapterOrder:1});assert.equal(calls,0,'no written prose means no model call or actual ledger');const {OutlinePolicyService}=require('../dist/modules/planning/outline/openBook');await new OutlinePolicyService(prisma).update(f.id,{expectedPolicyVersion:1,changes:[{nodeId:'pay',field:'title',value:'铜钥匙（运行修改）'}]});const workspace=JSON.parse((await prisma.volumePlanVersion.findFirstOrThrow({where:{novelId:b.novelId,status:'active'}})).contentJson);assert.match(workspace.volumes[0].chapters[0].payoffRefs[0],/运行修改/);
 const chapterId=b.mapping.chapters[0].chapterId;await prisma.chapter.update({where:{id:chapterId},data:{content:'用户编辑：邮包中有一把铜钥匙。'}});
 const actual=await ledger.syncLedger(b.novelId,{chapterOrder:1,sourceChapterId:chapterId});assert.equal(actual.items.length,1);assert.equal(actual.items[0].ledgerKey,key);assert.equal(actual.items[0].targetStartChapterOrder,1);assert.equal(actual.items[0].targetEndChapterOrder,1);assert.equal(actual.items[0].setupChapterId,chapterId);assert.equal(actual.items[0].payoffChapterId,null);assert.equal(actual.plans[0].state,'linked');assert.equal(actual.plans[0].ledgerItemId,actual.items[0].id);assert.match(captured.promptInput.writtenChapterEvidence[0].content,/用户编辑/);const projected=await require('../dist/app/director/workspace').readDirectorLedgers(b.novelId);assert.equal(projected.warnings.length,0);assert.equal(projected.payoffs[0].sourceRefs[0].kind,'outline_plan');assert.equal(projected.payoffs[0].evidence[0].quote,'邮包中有一把铜钥匙');assert.equal(captured.asset.id,'novel.payoff_ledger.outline_sync');
 const again=await ledger.syncLedger(b.novelId,{chapterOrder:1,sourceChapterId:chapterId});assert.equal(again.items[0].id,actual.items[0].id);assert.equal(await prisma.payoffLedgerItem.count({where:{novelId:b.novelId}}),1);
 }finally{runner.runStructuredPrompt=original;}
});
test('adopted volume without strategy recovers only strategy and preserves all source planning and prose',async()=>{
 const f=await fixture(),p=await service.preview(f.id,f.input),b=await service.confirm(f.id,{...f.input,requestHash:p.requestHash,idempotencyKey:f.id});
 const {NovelVolumeService}=require('../dist/services/novel/volume/NovelVolumeService');const volumes=new NovelVolumeService();let calls=0;
 volumes.generateVolumes=async(_novel,input)=>{calls++;assert.equal(input.scope,'strategy');assert.equal(input.respectExistingVolumeCount,true);return {...input.draftWorkspace,volumes:[],beatSheets:[],strategyPlan:{recommendedVolumeCount:1,hardPlannedVolumeCount:1,readerRewardLadder:'回报',escalationLadder:'压力',midpointShift:'转向',notes:'仅补战略',volumes:[{sortOrder:1,planningMode:'hard',roleLabel:'开篇',coreReward:'回报',escalationFocus:'压力',uncertaintyLevel:'low'}],uncertainties:[]}};};
 const rows=async()=>({volumes:await prisma.volumePlan.findMany({where:{novelId:b.novelId}}),plans:await prisma.volumeChapterPlan.findMany({where:{volume:{novelId:b.novelId}}}),chapters:await prisma.chapter.findMany({where:{novelId:b.novelId}})}),before=await rows();
 const {readOutlinePlanningState,withOutlinePlanningState}=require('../dist/modules/planning/outline/constraints');const state=await readOutlinePlanningState(prisma,b.novelId);
 const result=await withOutlinePlanningState(state,()=>volumes.recoverVolumeStrategy(b.novelId));assert.equal(result.strategyPlan.notes,'仅补战略');assert.equal(calls,1);assert.deepEqual(await rows(),before);assert.equal(result.volumes[0].chapters[0].summary,'作者章纲');assert.equal(result.volumes[0].title,'初来');
});
test('A2 beat-sheet save never hydrates future chapter canonical defaults outside its range',async()=>{
 const f=await fixture();f.d.volumes[0].chapterNodeIds.push('c2');f.d.chapters.push({...f.d.chapters[0],nodeId:'c2',order:1,title:'后章',summary:'保持后章原纲'});await prisma.outlineRevision.update({where:{id:f.input.revisionId},data:{documentJson:JSON.stringify(f.d)}});
 const p=await service.preview(f.id,f.input),b=await service.confirm(f.id,{...f.input,requestHash:p.requestHash,idempotencyKey:f.id});
 const {NovelVolumeService}=require('../dist/services/novel/volume/NovelVolumeService'),volumes=new NovelVolumeService(),volumeId=b.mapping.volumes[0].volumeId;
 const before=await volumes.getVolumes(b.novelId,{hydrateCanonical:false});
 volumes.generateVolumes=async(_id,input)=>({...input.draftWorkspace,beatSheets:[{volumeId,volumeSortOrder:1,status:'generated',beats:[{key:'opening',label:'开篇',title:'开篇',summary:'开篇目标',chapterSpanHint:'1-3',mustDeliver:['推进线索']}]}]});
 const {withOutlineOpeningSteps}=require('../dist/app/director/outlineOpening');const handlers=withOutlineOpeningSteps({volume_beat_sheet:async()=>{throw Error('unexpected default handler');}},volumes);
 await handlers.volume_beat_sheet({runId:'beat-a2',contract:{novelId:b.novelId,chapterRange:{from:1,to:1},scope:'chapters:1-1',modelConfig:{route:'openai',model:'stub',version:'test'},launchInput:{storyInput:'未来来信',estimatedChapterCount:3,worldMode:'skip',outlineBinding:b,provider:'openai',model:'stub',targetMode:'opening',targetVolumeId:volumeId}}});
 const after=await volumes.getVolumes(b.novelId,{hydrateCanonical:false});const creative=c=>{const{createdAt,updatedAt,...rest}=c;return rest;};assert.deepEqual(creative(after.volumes[0].chapters[1]),creative(before.volumes[0].chapters[1]));assert.equal(after.beatSheets.length,1);const {readOutlinePlanningState,withOutlinePlanningState}=require('../dist/modules/planning/outline/constraints');const state=await readOutlinePlanningState(prisma,b.novelId);await withOutlinePlanningState(state,async()=>{const read=await volumes.getVolumes(b.novelId);assert.deepEqual(creative(read.volumes[0].chapters[1]),creative(before.volumes[0].chapters[1]));});
});

test('V2 saved workspace exposes adopted revision and independent payoff plans without writing or generating',async()=>{
 const {readDirectorWorkspace,readDirectorLedgers}=require('../dist/app/director/workspace');
 const f=await fixture();f.d.payoffs=[{nodeId:'plan-ui',title:'跨卷计划',kind:'mystery',setupDescription:'首章埋设',payoffDescription:'远期解释',setupChapterNodeIds:['c'],payoffChapterNodeIds:['c'],relatedNodeIds:[]}];
 await prisma.outlineRevision.update({where:{id:f.input.revisionId},data:{documentJson:JSON.stringify(f.d)}});
 const preview=await service.preview(f.id,f.input),binding=await service.confirm(f.id,{...f.input,requestHash:preview.requestHash,idempotencyKey:f.id});
 const snapshot=async()=>({book:await prisma.novel.findUnique({where:{id:binding.novelId}}),binding:await prisma.outlineBookBinding.findUnique({where:{id:binding.bindingId}}),actual:await prisma.payoffLedgerItem.count({where:{novelId:binding.novelId}})}),before=await snapshot();
 const workspace=await readDirectorWorkspace(binding.novelId);assert.equal(workspace.outlineBinding.revisionId,f.input.revisionId);assert.equal(workspace.outlineBinding.plannedPayoffs[0].state,'planned');assert.equal(workspace.outlinePreparation.storyMacro,null);assert.equal(workspace.outlinePreparation.hasBookContract,false);assert.deepEqual(await snapshot(),before);
 const ledger=await readDirectorLedgers(binding.novelId);assert.equal(ledger.payoffs.length,0);
 const legacy='ui-legacy-'+f.id;await prisma.novel.create({data:{id:legacy,title:'普通书'}});assert.equal((await readDirectorWorkspace(legacy)).outlineBinding,undefined);
});

test('story-only opening reviews the runtime volume slot created after launch and rejects missing or ambiguous slots',async()=>{
 const {resolveSavedReviewContexts}=require('../dist/app/director/projections/confirmationRoutes');
 const f=await fixture();f.d.volumes=[];f.d.chapters=[];await prisma.outlineRevision.update({where:{id:f.input.revisionId},data:{documentJson:JSON.stringify(f.d)}});f.input.volumeQuotas={};
 const preview=await service.preview(f.id,f.input),binding=await service.confirm(f.id,{...f.input,requestHash:preview.requestHash,idempotencyKey:f.id});
 const contract={novelId:binding.novelId,runId:'runtime-review',chapterRange:null,launchInput:{outlineBinding:binding}},control={status:'waiting_gate',version:4,gate:{artifactTypes:['volume_beat_sheet','volume_chapter_list']}};
 await assert.rejects(()=>resolveSavedReviewContexts({contract,control}),/缺少唯一/);
 const slot={volumeId:'saved-runtime-volume',chapterQuota:3,from:1,to:3};
 await prisma.outlineBookBinding.update({where:{id:binding.bindingId},data:{mappingJson:JSON.stringify({...binding.mapping,runtimeVolumes:[slot]})}});
 const contexts=await resolveSavedReviewContexts({contract,control});assert.equal(contexts.length,2);assert.ok(contexts.every(context=>context.volumeId===slot.volumeId && context.novelId===binding.novelId && context.runId===contract.runId));
 await prisma.outlineBookBinding.update({where:{id:binding.bindingId},data:{mappingJson:JSON.stringify({...binding.mapping,runtimeVolumes:[slot,{...slot,volumeId:'ambiguous'}]})}});
 await assert.rejects(()=>resolveSavedReviewContexts({contract,control}),/缺少唯一/);
});


test('story-only outline opens atomically without invented volumes and registers runtime quotas once', async () => {
 const f = await fixture();
 f.d.volumes = []; f.d.chapters = []; f.d.characters = []; f.input.volumeQuotas = {};
 await prisma.outlineRevision.update({where:{id:f.input.revisionId},data:{documentJson:JSON.stringify(f.d)}});
 const source = JSON.stringify(f.d), preview = await service.preview(f.id,f.input);
 assert.deepEqual(preview.counts,{volumes:0,chapters:0,characters:0,payoffs:0});
 const request = {...f.input,requestHash:preview.requestHash,idempotencyKey:f.id};
 const binding = await service.confirm(f.id,request);
 assert.deepEqual(binding.mapping,{volumes:[],chapters:[],characters:[],payoffs:[]});
 assert.equal(await prisma.chapter.count({where:{novelId:binding.novelId}}),0);
 assert.equal(await prisma.volumePlan.count({where:{novelId:binding.novelId}}),0);
 const version = await prisma.volumePlanVersion.findFirstOrThrow({where:{novelId:binding.novelId,status:'active'}});
 assert.deepEqual(normalizeVolumeWorkspaceDocument(binding.novelId,version.contentJson).volumes,[]);
 const {prepareOutlineHandoff,withOutlineOpeningSteps} = require('../dist/app/director/outlineOpening');
 const contract = {novelId:binding.novelId,driver:'auto',planVersion:'director-next-production-v1',chapterRange:null,scope:'novel',
  launchInput:{storyInput:'客户端旧想法',estimatedChapterCount:99,worldMode:'skip'}};
 await prepareOutlineHandoff(contract);
 assert.equal(contract.launchInput.storyInput,f.d.story.premise);
 assert.equal(contract.launchInput.estimatedChapterCount,3);
 const {NovelVolumeService} = require('../dist/services/novel/volume/NovelVolumeService');
 const volumes = new NovelVolumeService();
 let calls = 0;
 const handlers = withOutlineOpeningSteps({volume_strategy:async () => {
  calls++;
  if (calls === 1) {
   const workspace = normalizeVolumeWorkspaceDocument(binding.novelId,version.contentJson);
   const time = new Date(0).toISOString();
   workspace.volumes = [1,2].map(order => ({id:`${f.id}-runtime-${order}`,sortOrder:order,title:`补充卷${order}`,summary:'待逐章细化',status:'skeleton',chapters:[],createdAt:time,updatedAt:time}));
   await prisma.$transaction(tx => require('../dist/services/novel/volume/volumeWorkspacePersistence').persistActiveVolumeWorkspace(tx,binding.novelId,require('../dist/services/novel/volume/volumeWorkspaceDocument').buildVolumeWorkspaceDocument(workspace),version.id));
  }
  return {artifact:{scope:'novel',status:'draft',protectedUserContent:false,contentRef:'runtime-strategy',contentHash:'fixture'}};
 }},volumes);
 const context = {runId:'no-volume-'+f.id,contract};
 await handlers.volume_strategy(context);
 const registered = await service.getBinding(f.id);
 assert.deepEqual(registered.mapping.runtimeVolumes,[
  {volumeId:`${f.id}-runtime-1`,chapterQuota:1,from:1,to:1},
  {volumeId:`${f.id}-runtime-2`,chapterQuota:2,from:2,to:3},
 ]);
 await handlers.volume_strategy(context);
 assert.deepEqual((await service.getBinding(f.id)).mapping,registered.mapping);
 assert.equal((await service.confirm(f.id,request)).novelId,binding.novelId);
 assert.equal(await prisma.novel.count({where:{id:binding.novelId}}),1);
 assert.equal(await prisma.chapter.count({where:{novelId:binding.novelId}}),0,'strategy must not create prose chapters');
 assert.equal((await prisma.outlineRevision.findUniqueOrThrow({where:{id:f.input.revisionId}})).documentJson,source);
});

test('single-chapter handoffs reach a designated stopping chapter without preparing the next or exceeding the book', async () => {
 const f = await fixture();
 for (const order of [1,2]) {
  const nodeId = 'c'+(order+1); f.d.volumes[0].chapterNodeIds.push(nodeId);
  f.d.chapters.push({...f.d.chapters[0],nodeId,order,title:`第${order+1}章`,summary:`保留第${order+1}章原纲`});
 }
 await prisma.outlineRevision.update({where:{id:f.input.revisionId},data:{documentJson:JSON.stringify(f.d)}});
 const p = await service.preview(f.id,f.input), b = await service.confirm(f.id,{...f.input,requestHash:p.requestHash,idempotencyKey:f.id});
 const {prepareOutlineHandoff} = require('../dist/app/director/outlineOpening');
 const contract = order => ({novelId:b.novelId,driver:'auto',planVersion:'director-next-production-v1',chapterRange:{from:order,to:order},
  launchInput:{storyInput:'旧输入',estimatedChapterCount:999,worldMode:'skip'}});
 const last = b.mapping.chapters[2].chapterId;
 const before = await prisma.chapter.findUniqueOrThrow({where:{id:last}});
 await assert.rejects(() => prepareOutlineHandoff(contract(2)),e => e.code==='OUTLINE_PREVIOUS_CHAPTER_REQUIRED');
 await prepareOutlineHandoff(contract(1));
 await prisma.chapter.update({where:{id:b.mapping.chapters[0].chapterId},data:{content:'第1章人工确认的实际正文'}});
 const second = contract(2); await prepareOutlineHandoff(second);
 assert.deepEqual(second.chapterRange,{from:2,to:2});
 assert.equal(second.driver,'assisted'); assert.equal(second.launchInput.estimatedChapterCount,3);
 await prisma.chapter.update({where:{id:b.mapping.chapters[1].chapterId},data:{content:'第2章完成，指定停在这里'}});
 const {readOutlinePlanningState,buildOutlinePlanningPayload} = require('../dist/modules/planning/outline/constraints');
 const state = await readOutlinePlanningState(prisma,b.novelId,second.chapterRange);
 assert.deepEqual(state.range,{from:2,to:2});
 assert.equal(buildOutlinePlanningPayload(state).previousActualResult.content,'第1章人工确认的实际正文');
 assert.deepEqual(await prisma.chapter.findUniqueOrThrow({where:{id:last}}),before);
 await assert.rejects(() => prepareOutlineHandoff({...contract(2),chapterRange:{from:2,to:3}}),e => e.code==='OUTLINE_SINGLE_CHAPTER_REQUIRED');
 await assert.rejects(() => prepareOutlineHandoff(contract(4)),e => e.code==='OUTLINE_RANGE_INVALID');
 assert.equal(await prisma.directorNextRun.count({where:{novelId:b.novelId}}),0,'handoff validation must not schedule the next run');
});

test('ordinary foreshadow backfill and same-title outline links keep distinct stable identities across repeated syncs', async () => {
 const f = await fixture();
 f.d.payoffs = [{nodeId:'planned-key',title:'铜钥匙',kind:'mystery',setupDescription:'邮包里的钥匙',payoffDescription:'打开远期门',setupChapterNodeIds:['c'],payoffChapterNodeIds:['c'],relatedNodeIds:[]}];
 await prisma.outlineRevision.update({where:{id:f.input.revisionId},data:{documentJson:JSON.stringify(f.d)}});
 const p = await service.preview(f.id,f.input), b = await service.confirm(f.id,{...f.input,requestHash:p.requestHash,idempotencyKey:f.id});
 const chapterId = b.mapping.chapters[0].chapterId, key = b.mapping.payoffs[0].ledgerKey;
 await prisma.chapter.update({where:{id:chapterId},data:{content:'邮包中有一把铜钥匙。守卫也拿出另一把铜钥匙。'}});
 const ordinary = {ledgerKey:'ordinary-guard-key',title:'铜钥匙',summary:'守卫手中另一把钥匙',scopeType:'book',currentStatus:'setup',setupChapterOrder:1,
  firstSeenChapterOrder:1,lastTouchedChapterOrder:1,sourceRefs:[{kind:'foreshadow_state',refId:'guard-key',refLabel:'守卫的钥匙',chapterId,chapterOrder:1}],
  evidence:[{summary:'守卫的钥匙',quote:'守卫也拿出另一把铜钥匙',chapterId,chapterOrder:1}],riskSignals:[]};
 const planned = {...ordinary,ledgerKey:'model-key',summary:'邮包钥匙已埋设',sourceRefs:[{kind:'outline_plan',refId:key,refLabel:'铜钥匙'}],
  evidence:[{summary:'邮包中的钥匙',quote:'邮包中有一把铜钥匙',chapterId,chapterOrder:1}]};
 const runner = require('../dist/prompting/core/promptRunner'), original = runner.runStructuredPrompt;
 let output = [ordinary]; runner.runStructuredPrompt = async () => ({output:{items:output}});
 try {
  const {PayoffLedgerSyncService} = require('../dist/services/payoff/PayoffLedgerSyncService'), ledger = new PayoffLedgerSyncService();
  const sync = () => ledger.syncLedger(b.novelId,{chapterOrder:1,sourceChapterId:chapterId});
  let result = await sync(); const ordinaryId = result.items[0].id;
  assert.equal(result.plans[0].state,'planned'); assert.equal(result.items.length,1);
  output = [planned,ordinary]; result = await sync();
  const plannedId = result.plans[0].ledgerItemId;
  assert.equal(result.items.length,2); assert.notEqual(plannedId,ordinaryId);
  assert.equal(result.items.find(x=>x.id===ordinaryId).sourceRefs[0].kind,'foreshadow_state');
  assert.equal(result.items.find(x=>x.id===plannedId).sourceRefs[0].refId,key);
  output = [{...ordinary,ledgerKey:'another-model-label'},planned]; result = await sync();
  assert.equal(result.items.length,2); assert.equal(result.plans[0].ledgerItemId,plannedId);
  assert.equal(result.items.find(x=>x.ledgerKey==='ordinary-guard-key').id,ordinaryId);
  output = [planned]; await sync();
  output = [ordinary]; result = await sync();
  assert.equal(result.items.length,2); assert.equal(result.plans[0].ledgerItemId,plannedId);
  const saved = await prisma.payoffLedgerItem.findMany({where:{novelId:b.novelId}});
  assert.equal(saved.length,2);
  assert.equal(saved.find(x=>x.id===ordinaryId).summary,ordinary.summary);
  assert.equal(saved.find(x=>x.id===plannedId).summary,planned.summary);
  assert.equal(JSON.parse(saved.find(x=>x.id===plannedId).sourceRefsJson)[0].refId,key);
  assert.equal((await service.getBinding(f.id)).plannedPayoffs[0].ledgerItemId,plannedId);
 } finally { runner.runStructuredPrompt = original; }
});
