const test = require('node:test');
const assert = require('node:assert/strict');
const { createWorldSetupStepHandler } = require('../../../dist/modules/director/steps/planning/worldSetup');
const { artifactContentHash } = require('../../../dist/modules/director/infrastructure/artifactContentHash');

const context = { runId: 'run', contract: {novelId:'novel',scope:'book'}, facts: {artifacts:[],debts:[],stopSignal:null} };
const input = { storyInput:'守门人守护移动之城', storyMacroContext:'主线：追寻记忆', bookContractContext:'每次开门付出代价', provider:'openai', model:'saved-model', temperature:0.4, openingOnly:true };
const block = {novelWorldId:'world',rawSlice:{coreWorldFrame:'移动之城',appliedRules:[{id:'rule',name:'黎明移动'}]}};

function setup({existing=false, result=block, seed=input, failure=null}={}) {
  const calls=[];
  const handler=createWorldSetupStepHandler({
    inputProvider:async ctx=> {calls.push(['input',ctx.runId]); return seed;}, contentHash:artifactContentHash,
    worldService:{
      hasActiveWorld:async id=> {calls.push(['exists',id]);return existing;},
      generateWorldFromNovelTheme:async (...args)=> {calls.push(['generate',...args]); if(failure) throw failure;},
      getWorldContextBlock:async (...args)=> {calls.push(['context',...args]);return result;},
    },
  });
  return {handler,calls};
}

test('explicit world skip records the disabled contract without touching world assets',async()=>{
  const {handler,calls}=setup({seed:{...input,worldMode:'skip'}});const result=await handler(context);
  assert.deepEqual(calls,[['input','run']]);assert.equal(result.artifact.contentRef,'world_skeleton:novel:disabled');
  assert.equal(result.artifact.status,'confirmed');assert.equal(result.artifact.protectedUserContent,true);
});
test('reuse-only world mode does not generate when there is no existing world',async()=>{
  const {handler,calls}=setup({seed:{...input,worldMode:'reuse'}});await assert.rejects(()=>handler(context),/可复用/);
  assert.equal(calls.some(c=>c[0]==='generate'),false);
});

test('world adapter generates through the gateway and hashes the saved story slice', async()=>{
  const {handler,calls}=setup();
  const result=await handler(context);
  assert.deepEqual(calls.map(call=>call[0]),['input','exists','generate','context']);
  assert.deepEqual(calls[2],['generate','novel',{saveToLibrary:false,provider:'openai',model:'saved-model',temperature:0.4,storyMacroContext:input.storyMacroContext,bookContractContext:input.bookContractContext,openingOnly:true}]);
  assert.deepEqual(calls[3],['context','novel',{purpose:'character',forceRefresh:false,storyInput:input.storyInput,provider:'openai',model:'saved-model',temperature:0.4}]);
  assert.deepEqual(result.artifact,{scope:'book',status:'draft',protectedUserContent:false,contentRef:'world_skeleton:novel',contentHash:artifactContentHash(block.rawSlice)});
});

test('an existing world is reused without generation and conservatively protected',async()=>{
  const {handler,calls}=setup({existing:true});
  const result=await handler(context);
  assert.equal(calls.some(call=>call[0]==='generate'),false);
  assert.equal(result.artifact.protectedUserContent,true);
  assert.equal(result.artifact.status,'confirmed');
});

test('world preparation cannot report an artifact when no saved context exists',async()=>{
  const {handler}=setup({result:null});
  await assert.rejects(()=>handler(context),/本书世界上下文未保存/);
});

test('missing upstream contexts fail before invoking generation',async()=>{
  for(const field of ['storyInput','storyMacroContext','bookContractContext']) {
    const {handler,calls}=setup({seed:{...input,[field]:'  '}});
    await assert.rejects(()=>handler(context),/世界准备缺少/);
    assert.deepEqual(calls.map(call=>call[0]),['input']);
  }
});

test('generation failures propagate without falling through to success',async()=>{
  const failure=new Error('model unavailable');
  const {handler,calls}=setup({failure});
  await assert.rejects(()=>handler(context),error=>error===failure);
  assert.equal(calls.some(call=>call[0]==='context'),false);
});
