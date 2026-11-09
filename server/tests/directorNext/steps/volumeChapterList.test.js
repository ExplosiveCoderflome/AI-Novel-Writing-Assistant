const test = require('node:test');
const assert = require('node:assert/strict');
const { createVolumeChapterListStepHandler } = require('../../../dist/modules/director/steps/planning/volumeChapterList');
const { artifactContentHash } = require('../../../dist/modules/director/infrastructure/artifactContentHash');

const context = {runId:'run',contract:{novelId:'novel',scope:'volume:v1'}};
const workspace = {novelId:'novel',volumes:[{id:'v1',status:'active',chapters:[]},{id:'v2',status:'active',chapters:[{id:'old'}]}],beatSheets:[{volumeId:'v1',beats:[{key:'opening'}]}]};
const generated = {...workspace,volumes:[{id:'v1',status:'active',chapters:[{id:'plan',chapterOrder:1,beatKey:'opening',summary:'概要，无执行合同'}]},workspace.volumes[1]]};
const saved = {...generated,activeVersionId:'saved'};
const input = {workspace,targetVolumeId:'v1',provider:'openai',model:'saved-model',temperature:0.3,guidance:'沿用读者期待',estimatedChapterCount:6};
function setup({seed=input,draft=generated,result=saved,fail=null,titleDebt=null,progressEvents=[]}={}) {
  const calls=[];
  const handler=createVolumeChapterListStepHandler({
    inputProvider:async()=>seed,
    onProgress:async(context,progress)=>{calls.push(['progress',context,progress]);},
    volumeService:{
      generateVolumes:async(...args)=>{calls.push(['generate',...args]);if(fail==='generate')throw new Error('生成失败');for(const event of progressEvents)await args[1].onPhaseStart(event);if(titleDebt)args[1].onChapterTitleDiversityDebt(titleDebt);return draft;},
      updateVolumesWithOptions:async(...args)=>{calls.push(['save',...args]);if(fail==='save')throw new Error('保存失败');return result;},
    },contentHash:content=>{calls.push(['hash',content]);return artifactContentHash(content);},
  });
  return {handler,calls};
}
test('chapter-list adapter generates one full target volume, saves without execution sync and hashes persisted plans',async()=>{
  const {handler,calls}=setup();
  const result=await handler(context);
  const {onChapterTitleDiversityDebt,onPhaseStart,...generationOptions}=calls[0][2];
  assert.equal(typeof onChapterTitleDiversityDebt,'function');
  assert.deepEqual([calls[0][0],calls[0][1],generationOptions],['generate','novel',{scope:'chapter_list',generationMode:'full_volume',targetVolumeId:'v1',draftWorkspace:workspace,provider:'openai',model:'saved-model',temperature:0.3,guidance:input.guidance,estimatedChapterCount:6,taskId:'run',entrypoint:'director_next',persistIntermediateDocuments:true}]);
  assert.deepEqual(calls[1],['save','novel',generated,{emitEvent:false,syncPayoffLedger:false,syncToChapterExecution:false,memoryTelemetry:{taskId:'run',stage:'structured_outline',itemKey:'chapter_list',scope:'chapter_list',entrypoint:'director_next',volumeId:'v1'}}]);
  assert.deepEqual(calls[2],['hash',saved.volumes[0].chapters]);
  assert.deepEqual(result.artifact,{scope:'volume:v1',status:'draft',protectedUserContent:false,contentRef:'volume_chapter_list:novel:v1',contentHash:artifactContentHash(saved.volumes[0].chapters)});
  assert.equal(result.debts,undefined);
});

test('chapter-list progress forwards actual batch counts before saving the artifact',async()=>{
  const initial={volumeId:'v1',completedChapters:0,totalChapters:6,label:'正在拆分开卷'};
  const batch={...initial,completedChapters:3,label:'开卷章节已生成'};
  const final={...initial,completedChapters:6,label:'章节生成完成'};
  const {handler,calls}=setup({progressEvents:[{label:'整理上下文'},{chapterProgress:initial},{chapterProgress:batch},{chapterProgress:final}]});
  await handler(context);
  assert.deepEqual(calls.filter(call=>call[0]==='progress'),[initial,batch,final].map(progress=>['progress',context,progress]));
  assert.deepEqual(calls.map(call=>call[0]),['generate','progress','progress','progress','save','hash']);
});
test('chapter-list adapter saves usable plans and records title quality debt without blocking',async()=>{
  const {handler,calls}=setup({titleDebt:{volumeId:'v1',issue:'标题轻微同构',chapterOrder:1}});
  const result=await handler(context);
  assert.deepEqual(result.debts,[{chapterOrder:1,code:'CHAPTER_TITLE_DIVERSITY',action:'continue_with_warning'}]);
  assert.equal(calls.filter(call=>call[0]==='save').length,1);
  assert.equal(result.artifact.status,'draft');
  assert.equal(result.artifact.contentHash,artifactContentHash(saved.volumes[0].chapters));
});
test('input must belong to this book and have the selected volume and beat sheet',async()=>{
  for (const seed of [{...input,targetVolumeId:'unknown'},{...input,workspace:{...workspace,novelId:'other'}},{...input,workspace:{...workspace,beatSheets:[]}},{...input,workspace:{...workspace,beatSheets:[{volumeId:'v1',beats:[]}]}}]) {
    const {handler,calls}=setup({seed});
    await assert.rejects(()=>handler(context),/当前小说|目标卷|节奏板/);
    assert.equal(calls.length,0);
  }
});
test('empty, wrong-volume, cross-book and partial generation must not be saved as complete',async()=>{
  for (const draft of [workspace,{...generated,novelId:'other'},{...generated,volumes:[workspace.volumes[1]]},...['chapter_list_partial','chapter_list_partial:active'].map(status=>({...generated,volumes:[{...generated.volumes[0],status}]}))]) {
    const {handler,calls}=setup({draft});
    await assert.rejects(()=>handler(context),/当前小说|章节列表/);
    assert.equal(calls.some(call=>call[0]==='save'),false);
  }
});
test('only successfully persisted complete chapter lists can become artifacts',async()=>{
  for (const result of [workspace,{...saved,novelId:'other'},{...saved,volumes:[{...saved.volumes[0],status:'chapter_list_partial:active'}]}]) {
    const {handler,calls}=setup({result});
    await assert.rejects(()=>handler(context),/当前小说|章节列表/);
    assert.equal(calls.some(call=>call[0]==='hash'),false);
  }
});
test('generation and persistence errors produce no artifact hash',async()=>{
  for (const fail of ['generate','save']) {
    const {handler,calls}=setup({fail});
    await assert.rejects(()=>handler(context),/失败/);
    assert.equal(calls.some(call=>call[0]==='hash'),false);
  }
});
