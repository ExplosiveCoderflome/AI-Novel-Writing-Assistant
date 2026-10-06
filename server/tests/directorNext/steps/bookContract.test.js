const test = require('node:test');
const assert = require('node:assert/strict');
const { createBookContractStepHandler } = require('../../../dist/modules/director/steps/planning/bookContract');
const { artifactContentHash } = require('../../../dist/modules/director/infrastructure/artifactContentHash');
const context={runId:'run',contract:{novelId:'novel',scope:'book'}};
const input={novelId:'stale',taskId:'old',entrypoint:'auto_director',promptInput:{idea:'保存的想法'},model:'saved-model'};
const draft={readingPromise:'读者期待'};
const saved={id:'contract',novelId:'novel',...draft};

function setup({generationFailure=null,saveFailure=null,result=saved}={}) {
  const calls=[];
  const handler=createBookContractStepHandler({
    inputProvider:async ctx=>{calls.push(['input',ctx]);return input;},
    generationService:{generate:async value=>{calls.push(['generate',value]);if(generationFailure)throw generationFailure;return draft;}},
    bookContractService:{upsert:async(...args)=>{calls.push(['save',...args]);if(saveFailure)throw saveFailure;return result;}},
    contentHash:value=>{calls.push(['hash',value]);return artifactContentHash(value);},
  });
  return {handler,calls};
}

test('book contract adapter generates, saves and hashes the persisted result',async()=>{
  const {handler,calls}=setup();
  const result=await handler(context);
  assert.deepEqual(calls.map(call=>call[0]),['input','generate','save','hash']);
  assert.equal(calls[0][1],context);
  assert.deepEqual(calls[1][1],{...input,novelId:'novel',taskId:'run',entrypoint:'director_next'});
  assert.equal(input.novelId,'stale');
  assert.deepEqual(calls[2],['save','novel',draft]);
  assert.deepEqual(calls[3],['hash',saved]);
  assert.deepEqual(result.artifact,{scope:'book',status:'draft',protectedUserContent:false,contentRef:'book_contract:novel',contentHash:artifactContentHash(saved)});
});

test('generation failure never invokes persistence',async()=>{
  const failure=new Error('model unavailable');
  const {handler,calls}=setup({generationFailure:failure});
  await assert.rejects(()=>handler(context),error=>error===failure);
  assert.equal(calls.some(call=>call[0]==='save'),false);
});

test('save failure cannot produce an artifact hash',async()=>{
  const failure=new Error('save failed');
  const {handler,calls}=setup({saveFailure:failure});
  await assert.rejects(()=>handler(context),error=>error===failure);
  assert.equal(calls.some(call=>call[0]==='hash'),false);
});

test('invalid or cross-book saved results cannot enter the ledger',async()=>{
  for(const result of [{...saved,id:''},{...saved,novelId:'another-book'}]) {
    const {handler,calls}=setup({result});
    await assert.rejects(()=>handler(context),/书级创作约定未正确保存/);
    assert.equal(calls.some(call=>call[0]==='hash'),false);
  }
});
