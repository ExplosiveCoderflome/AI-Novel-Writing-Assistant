const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const promptRunner = require('../dist/prompting/core/promptRunner');
const { BookContractGenerationService, normalizeBookContract } = require('../dist/services/novel/bookContract');
const { directorBookContractPrompt, buildDirectorBookContractContextBlocks } = require('../dist/prompting/prompts/novel/directorPlanning.prompts');

const output = { readingPromise:' 期待 ', protagonistFantasy:' 成长 ', coreSellingPoint:' 看点 ',chapter3Payoff:' 三章 ',chapter10Payoff:' 十章 ',chapter30Payoff:' 三十章 ',escalationLadder:' 升级 ',relationshipMainline:' 关系 ',absoluteRedLines:[' a ','a','b','c','d','e','f','g',' '] };
const promptInput = {idea:'保存的故事输入',context:{targetAudience:'新手'},candidate:{workingTitle:'移动之城'},storyMacroPlan:null,targetChapterCount:80};

test('extracted generation preserves the registered prompt, context and model options',async t=>{
  const calls=[];
  t.mock.method(promptRunner,'runStructuredPrompt',async input=>{calls.push(input);return {output};});
  const result=await new BookContractGenerationService().generate({novelId:'novel',taskId:'task',promptInput,provider:'openai',model:'saved-model',temperature:0.8});
  assert.equal(calls.length,1);
  assert.equal(calls[0].asset,directorBookContractPrompt);
  assert.equal(calls[0].promptInput,promptInput);
  assert.deepEqual(calls[0].contextBlocks,buildDirectorBookContractContextBlocks(promptInput));
  assert.deepEqual(calls[0].options,{provider:'openai',model:'saved-model',temperature:0.4,novelId:'novel',taskId:'task',stage:'story_macro',itemKey:'book_contract',entrypoint:'auto_director'});
  assert.equal(result.readingPromise,'期待');
  assert.deepEqual(result.absoluteRedLines,['a','b','c','d','e','f']);
});

test('temperature defaults and lower user temperatures are unchanged',async t=>{
  const temperatures=[];
  t.mock.method(promptRunner,'runStructuredPrompt',async input=>{temperatures.push(input.options.temperature);return {output};});
  const service=new BookContractGenerationService();
  await service.generate({novelId:'novel',promptInput});
  await service.generate({novelId:'novel',promptInput,temperature:0.2,entrypoint:'director_next'});
  assert.deepEqual(temperatures,[0.4,0.2]);
});

test('generation errors propagate instead of creating an empty contract',async t=>{
  const failure=new Error('generation failed');
  t.mock.method(promptRunner,'runStructuredPrompt',async()=>{throw failure;});
  await assert.rejects(()=>new BookContractGenerationService().generate({novelId:'novel',promptInput}),error=>error===failure);
});

test('legacy normalization export delegates to the independently owned implementation',()=>{
  const legacy=require('../dist/services/novel/director/runtime/novelDirectorHelpers');
  assert.equal(legacy.normalizeBookContract,normalizeBookContract);
});

test('legacy phase preserves tracked generation and saves the generated draft',async t=>{
  const tracker=require('../dist/services/novel/director/projections/directorProgressTracker');
  const calls=[];
  t.mock.method(tracker,'runDirectorTrackedStep',async input=>{calls.push(['track',input.stage,input.itemKey]);return input.run();});
  t.mock.method(BookContractGenerationService.prototype,'generate',async input=>{calls.push(['generate',input]);return output;});
  const {runDirectorBookContractPhase}=require('../dist/services/novel/director/phases/novelDirectorStoryMacroPhase');
  const {toBookSpec,buildStoryInput}=require('../dist/services/novel/director/runtime/novelDirectorHelpers');
  const request={idea:'守门人',candidate:{workingTitle:'移动之城',positioning:'悬疑',sellingPoint:'会移动',coreConflict:'开门代价',protagonistPath:'找回记忆',endingDirection:'真相',hookStrategy:'来客',progressionLoop:'选择',targetChapterCount:80},model:'saved-model',temperature:0.2};
  const macro={id:'macro'};
  await runDirectorBookContractPhase({taskId:'task',novelId:'novel',request,storyMacroPlan:macro,callbacks:{},dependencies:{storyMacroService:{getPlan:async()=>{throw new Error('should not reread');}},bookContractService:{upsert:async(...args)=>calls.push(['save',...args])}}});
  assert.deepEqual(calls.map(call=>call[0]),['track','generate','save']);
  assert.deepEqual(calls[0],['track','story_macro','book_contract']);
  assert.equal(calls[1][1].promptInput.context,request);
  assert.equal(calls[1][1].promptInput.storyMacroPlan,macro);
  assert.equal(calls[1][1].promptInput.idea,buildStoryInput(request,toBookSpec(request.candidate,request.idea)));
  assert.deepEqual(calls[2],['save','novel',output]);
});

test('independent contract service does not import the legacy director runtime',()=>{
  const root=path.join(__dirname,'../src/services/novel/bookContract');
  for(const file of fs.readdirSync(root,{recursive:true}).filter(file=>file.endsWith('.ts'))) {
    assert.doesNotMatch(fs.readFileSync(path.join(root,file),'utf8'),/from\s+["'][^"']*\/director\//);
  }
});
