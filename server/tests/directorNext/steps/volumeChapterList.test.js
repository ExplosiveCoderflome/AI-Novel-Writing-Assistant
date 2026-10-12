const test = require('node:test');
const assert = require('node:assert/strict');
const { createVolumeChapterListStepHandler } = require('../../../dist/modules/director/steps/planning/volumeChapterList');
const { artifactContentHash } = require('../../../dist/modules/director/infrastructure/artifactContentHash');

const context = {runId:'run',contract:{novelId:'novel',scope:'volume:v1'}};
const workspace = {novelId:'novel',volumes:[{id:'v1',status:'active',chapters:[]},{id:'v2',status:'active',chapters:[{id:'old'}]}],beatSheets:[{volumeId:'v1',beats:[{key:'opening'}]}]};
const generated = {...workspace,volumes:[{id:'v1',status:'active',chapters:[{id:'plan',chapterOrder:1,beatKey:'opening',summary:'概要，无执行合同'}]},workspace.volumes[1]]};
const saved = {...generated,activeVersionId:'saved'};
const input = {workspace,targetVolumeId:'v1',provider:'openai',model:'saved-model',temperature:0.3,guidance:'沿用读者期待'};
function setup({seed=input,draft=generated,result=saved,fail=null}={}) {
  const calls=[];
  const handler=createVolumeChapterListStepHandler({
    inputProvider:async()=>seed,
    volumeService:{
      generateVolumes:async(...args)=>{calls.push(['generate',...args]);if(fail==='generate')throw new Error('生成失败');return draft;},
      updateVolumesWithOptions:async(...args)=>{calls.push(['save',...args]);if(fail==='save')throw new Error('保存失败');return result;},
    },contentHash:content=>{calls.push(['hash',content]);return artifactContentHash(content);},
  });
  return {handler,calls};
}
test('chapter-list adapter generates one full target volume, saves without execution sync and hashes persisted plans',async()=>{
  const {handler,calls}=setup();
  const result=await handler(context);
  assert.deepEqual(calls[0],['generate','novel',{scope:'chapter_list',generationMode:'full_volume',targetVolumeId:'v1',draftWorkspace:workspace,provider:'openai',model:'saved-model',temperature:0.3,guidance:input.guidance,taskId:'run',entrypoint:'director_next',persistIntermediateDocuments:false}]);
  assert.deepEqual(calls[1],['save','novel',generated,{emitEvent:false,syncPayoffLedger:false,syncToChapterExecution:false,memoryTelemetry:{taskId:'run',stage:'structured_outline',itemKey:'chapter_list',scope:'chapter_list',entrypoint:'director_next',volumeId:'v1'}}]);
  assert.deepEqual(calls[2],['hash',saved.volumes[0].chapters]);
  assert.deepEqual(result.artifact,{scope:'volume:v1',status:'draft',protectedUserContent:false,contentRef:'volume_chapter_list:novel:v1',contentHash:artifactContentHash(saved.volumes[0].chapters)});
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
