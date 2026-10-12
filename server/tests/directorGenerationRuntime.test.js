const test = require('node:test');
const assert = require('node:assert/strict');
const { ChapterStreamGenerationOrchestrator } = require('../dist/services/novel/runtime/ChapterStreamGenerationOrchestrator');
const { ChapterPipelineRuntimeAdapter } = require('../dist/services/novel/runtime/ChapterPipelineRuntimeAdapter');
const pipeline = require('../dist/services/novel/runtime/chapterRuntimePipeline');
const { chapterGenerationFeed } = require('../dist/services/novel/production/observation');
const { prisma } = require('../dist/db/prisma');
const runner = require('../dist/prompting/core/promptRunner');
const resolution = require('../dist/prompting/context/promptContextResolution');
const context = require('../dist/prompting/prompts/novel/context/chapterContextBlocks');
const { NovelContinuationService } = require('../dist/services/novel/NovelContinuationService');
const { ChapterWritingGraph } = require('../dist/services/novel/chapterWritingGraph');

const assembled = {novel:{id:'n',title:'书'},chapter:{id:'c',order:2,title:'章',content:null},contextPackage:{}};

test('the actual draft consumer publishes chunks before completion and then the normalized text', async () => {
  const frames=[];
  const consumer = new ChapterStreamGenerationOrchestrator({chapterWritingGraph:{
    createChapterStream:async()=>({stream:(async function*(){yield {content:'开'}; yield {content:[{type:'text',text:'篇'}]};})(),
      onDone:async text=> {assert.equal(text,'开篇');return {finalContent:'开篇补全'};}}),
  }});
  const result = await consumer.generateDraftFromWriter({novelId:'n',chapterId:'c',request:{},assembled,
    onDraftProgress:(content,state)=>frames.push({content,state})});
  assert.equal(result.content,'开篇补全');
  assert.deepEqual(frames,[{content:'开',state:'writing'},{content:'开篇',state:'writing'},
    {content:'开篇',state:'checking'},{content:'开篇补全',state:'checking'}]);
});

test('the pipeline adapter exposes a saved preview only after the save succeeds, and reports interruption', async () => {
  const original = pipeline.runPipelineChapterWithRuntime;
  const frames=[];
  const unsubscribe=chapterGenerationFeed.subscribe('n',value=>frames.push(value));
  let committed=false;
  const adapter = new ChapterPipelineRuntimeAdapter({streamOrchestrator:{prepareRuntimeChapter:async()=>({request:{},assembled}),
    markChapterStatus:async()=>{},generateDraftFromWriter:async input=>{
      input.onDraftProgress('草稿','writing'); return {content:'草稿'};
    }},contentFinalizationService:{commitFinalizedChapterContent:async()=>{committed=true;}}});
  try {
    pipeline.runPipelineChapterWithRuntime=async deps=>{
      await deps.generateDraftFromWriter({novelId:'n',chapterId:'c',request:{},assembled});
      assert.equal(chapterGenerationFeed.read('n').state,'checking');
      assert.equal(committed,false);
      await deps.commitFinalizedChapterContent({novelId:'n',chapterId:'c',request:{},contextPackage:{},evaluation:{finalContent:'正式正文'}});
      assert.equal(committed,true);
      return {pass:true};
    };
    await adapter.runPipelineChapter('n','c');
    assert.equal(frames.at(-1).state,'saved');
    assert.equal(frames.at(-1).content,'正式正文');
    committed=false;
    adapter.deps.contentFinalizationService.commitFinalizedChapterContent=async()=>{throw new Error('save failed');};
    await assert.rejects(adapter.runPipelineChapter('n','c'), /save failed/);
    assert.equal(frames.at(-1).state,'interrupted');
    assert.equal(frames.at(-1).content,'草稿');
  } finally {pipeline.runPipelineChapterWithRuntime=original;unsubscribe();}
});

test('length continuation streams onto the same draft with exactly one continuation call', async () => {
  const restore=[];
  const replace=(target,key,value)=>{const old=target[key];restore.push(()=>target[key]=old);target[key]=value;};
  const frames=[], calls=[], saves=[];
  replace(prisma.novel,'findUnique',async()=>null);
  replace(context,'buildChapterWriterContextBlocks',()=>[]);
  replace(resolution,'resolvePromptContextBlocksForAsset',async input=>({blocks:input.fallbackBlocks}));
  replace(NovelContinuationService.prototype,'rewriteIfTooSimilar',async input=>({content:input.content,rewritten:false,maxSimilarity:0}));
  replace(runner,'runTextPrompt',async()=>{throw new Error('continuation must be streamed');});
  replace(runner,'streamTextPrompt',async input=>{
    calls.push(input);
    const text=input.promptInput.mode==='draft' ? '初稿' : '续文';
    return {stream:(async function*(){for(const char of text) yield {content:char};})(),complete:Promise.resolve({output:text})};
  });
  try {
    const graph=new ChapterWritingGraph({enforceOpeningDiversity:async(_n,_o,_t,content)=>({content,rewritten:false,maxSimilarity:0}),
      saveDraftAndArtifacts:async(...args)=>saves.push(args),logInfo:()=>{},logWarn:()=>{}});
    const stream=await graph.createChapterStream({novelId:'n',novelTitle:'书',chapter:assembled.chapter,options:{},
      contextPackage:{chapterWriteContext:{chapterMission:{targetWordCount:3000}},chapter:{targetWordCount:3000},continuation:{}},
      onDraftProgress:(content,state)=>frames.push({content,state})});
    let draft='';for await(const chunk of stream.stream) draft+=chunk.content;
    const saved=await stream.onDone(draft);
    assert.equal(saved.finalContent,'初稿\n\n续文');
    assert.equal(saves.length,1);
    assert.equal(calls.length,2);
    assert.deepEqual(calls.map(call=>call.options.stage),['writer_draft','writer_extend']);
    assert.ok(frames.some(frame=>frame.content==='初稿\n\n续' && frame.state==='writing'));
    assert.ok(frames.some(frame=>frame.content==='初稿\n\n续文' && frame.state==='writing'));
  } finally {restore.reverse().forEach(fn=>fn());}
});
