const test = require('node:test');
const assert = require('node:assert/strict');
const { createVolumeBeatSheetStepHandler } = require('../../../dist/modules/director/steps/planning/volumeBeatSheet');
const { artifactContentHash } = require('../../../dist/modules/director/infrastructure/artifactContentHash');

const context={runId:'run',contract:{novelId:'novel',scope:'volume:v1'}};
const workspace={novelId:'novel',volumes:[{id:'v1',chapters:[]},{id:'v2',chapters:[]}],beatSheets:[{volumeId:'v2',beats:[{key:'existing'}]}]};
const generated={...workspace,beatSheets:[...workspace.beatSheets,{volumeId:'v1',beats:[{key:'opening',summary:'守门人遇到来客'}]}]};
const saved={...generated,activeVersionId:'saved-version'};
const input={workspace,targetVolumeId:'v1',provider:'openai',model:'saved-model',temperature:0.3,guidance:'保存的开篇规划要求'};

function setup({seed=input,draft=generated,result=saved,generationFailure=null,saveFailure=null}={}) {
  const calls=[];
  const handler=createVolumeBeatSheetStepHandler({
    inputProvider:async ctx=>{calls.push(['input',ctx]);return seed;},
    volumeService:{
      generateVolumes:async(...args)=>{calls.push(['generate',...args]);if(generationFailure)throw generationFailure;return draft;},
      updateVolumesWithOptions:async(...args)=>{calls.push(['save',...args]);if(saveFailure)throw saveFailure;return result;},
    },
    contentHash:value=>{calls.push(['hash',value]);return artifactContentHash(value);},
  });
  return {handler,calls};
}

test('beat sheet adapter targets the selected volume and records the persisted sheet',async()=>{
  const {handler,calls}=setup();
  const result=await handler(context);
  assert.deepEqual(calls.map(call=>call[0]),['input','generate','save','hash']);
  assert.equal(calls[0][1],context);
  assert.deepEqual(calls[1],['generate','novel',{scope:'beat_sheet',targetVolumeId:'v1',draftWorkspace:workspace,provider:'openai',model:'saved-model',temperature:0.3,guidance:input.guidance,taskId:'run',entrypoint:'director_next',persistIntermediateDocuments:false}]);
  assert.deepEqual(calls[2],['save','novel',generated,{emitEvent:false,syncPayoffLedger:false,syncToChapterExecution:false,memoryTelemetry:{taskId:'run',stage:'structured_outline',itemKey:'beat_sheet',scope:'beat_sheet',entrypoint:'director_next',volumeId:'v1'}}]);
  const sheet=saved.beatSheets.find(sheet=>sheet.volumeId==='v1');
  assert.deepEqual(calls[3],['hash',sheet]);
  assert.deepEqual(result.artifact,{scope:'volume:v1',status:'draft',protectedUserContent:false,contentRef:'volume_beat_sheet:novel:v1',contentHash:artifactContentHash(sheet)});
  assert.deepEqual(workspace.beatSheets,[{volumeId:'v2',beats:[{key:'existing'}]}]);
});

test('route preparation does not require chapter details or execution contracts',async()=>{
  assert.ok((await setup().handler(context)).artifact);
});

test('missing target and cross-book input fail before model invocation',async()=>{
  for(const seed of [{...input,targetVolumeId:'unknown'},{...input,workspace:{...workspace,novelId:'other'}}]) {
    const {handler,calls}=setup({seed});
    await assert.rejects(()=>handler(context),/目标卷|当前小说/);
    assert.equal(calls.some(call=>call[0]==='generate'),false);
  }
});

test('a sheet for another volume or an empty target sheet cannot be saved as completion',async()=>{
  for(const draft of [workspace,{...generated,beatSheets:[{volumeId:'v1',beats:[]}]}]) {
    const {handler,calls}=setup({draft});
    await assert.rejects(()=>handler(context),/目标卷节奏板/);
    assert.equal(calls.some(call=>call[0]==='save'),false);
  }
});

test('saved results must still contain the target sheet in the current book',async()=>{
  for(const result of [workspace,{...saved,novelId:'other'}]) {
    const {handler,calls}=setup({result});
    await assert.rejects(()=>handler(context),/目标卷节奏板|当前小说/);
    assert.equal(calls.some(call=>call[0]==='hash'),false);
  }
});

test('generation and save failures never produce an artifact hash',async()=>{
  for(const option of ['generationFailure','saveFailure']) {
    const failure=new Error(option);
    const {handler,calls}=setup({[option]:failure});
    await assert.rejects(()=>handler(context),error=>error===failure);
    assert.equal(calls.some(call=>call[0]==='hash'),false);
  }
});
