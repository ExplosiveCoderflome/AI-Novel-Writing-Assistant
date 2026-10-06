const test = require('node:test');
const assert = require('node:assert/strict');
const { createVolumeStrategyStepHandler } = require('../../../dist/modules/director/steps/planning/volumeStrategy');
const { artifactContentHash } = require('../../../dist/modules/director/infrastructure/artifactContentHash');

const context={runId:'run',contract:{novelId:'novel',scope:'book'}};
const input={provider:'openai',model:'saved-model',temperature:0.3,estimatedChapterCount:80};
const drafts=['strategy','strategy_critique','skeleton'].map(stage=>({novelId:'novel',volumes:[{id:'v1',title:'第一卷',chapters:[]}],stage}));
const saved={...drafts[2],version:2};

function setup({failAt=null,output=saved,chapterCount=80}={}) {
  const calls=[];
  const handler=createVolumeStrategyStepHandler({
    inputProvider:async ctx=>{calls.push(['input',ctx]);return {...input,estimatedChapterCount:chapterCount};},
    contentHash:artifactContentHash,
    volumeService:{
      generateVolumes:async(id,options)=>{calls.push(['generate',id,options]);if(options.scope===failAt)throw new Error('generation failed');return drafts.find(doc=>doc.stage===options.scope);},
      updateVolumes:async(...args)=>{calls.push(['save',...args]);return output;},
    },
  });
  return {handler,calls};
}

test('volume strategy delegates all three phases and records only the saved document',async()=>{
  const {handler,calls}=setup();
  const result=await handler(context);
  assert.deepEqual(calls.map(call=>call[0]),['input','generate','generate','generate','save']);
  assert.equal(calls[0][1],context);
  const base={...input,taskId:'run',entrypoint:'director_next',persistIntermediateDocuments:false};
  assert.deepEqual(calls[1],['generate','novel',{...base,scope:'strategy',respectExistingVolumeCount:false}]);
  assert.deepEqual(calls[2],['generate','novel',{...base,scope:'strategy_critique',draftWorkspace:drafts[0]}]);
  assert.deepEqual(calls[3],['generate','novel',{...base,scope:'skeleton',draftWorkspace:drafts[1]}]);
  assert.deepEqual(calls[4],['save','novel',{...drafts[2],syncToChapterExecution:false}]);
  assert.deepEqual(result.artifact,{scope:'book',status:'draft',protectedUserContent:false,contentRef:'volume_strategy:novel',contentHash:artifactContentHash(saved)});
});

test('volume skeleton succeeds with no chapter execution contracts',async()=>{
  const {handler}=setup();
  assert.ok((await handler(context)).artifact);
});

test('failed critique does not save a partially generated strategy as complete',async()=>{
  const {handler,calls}=setup({failAt:'strategy_critique'});
  await assert.rejects(()=>handler(context),/generation failed/);
  assert.equal(calls.some(call=>call[0]==='save'),false);
});

test('missing saved volumes cannot become a ledger artifact',async()=>{
  const {handler}=setup({output:{novelId:'novel',volumes:[]}});
  await assert.rejects(()=>handler(context),/分卷策略未保存/);
});

test('invalid chapter counts fail before model invocation',async()=>{
  for(const chapterCount of [0,-1,1.5,NaN]) {
    const {handler,calls}=setup({chapterCount});
    await assert.rejects(()=>handler(context),/目标章节数/);
    assert.equal(calls.some(call=>call[0]==='generate'),false);
  }
});
