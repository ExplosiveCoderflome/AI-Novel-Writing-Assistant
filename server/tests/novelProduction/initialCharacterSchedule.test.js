const test = require('node:test');
const assert = require('node:assert/strict');
const {createVolumeChapterListPrompt} = require('../../dist/prompting/prompts/novel/volume/chapterList.prompts');
const {buildVolumeWorkspaceDocument, normalizeVolumeWorkspaceDocument} = require('../../dist/services/novel/volume/volumeWorkspaceDocument');
const {mergeChapterList} = require('../../dist/services/novel/volume/volumeGenerationHelpers');

const config = {targetChapterCount:1,targetBeatKey:'open_hook',targetBeatLabel:'开卷抓手'};
const output = {beatKey:'open_hook',beatLabel:'开卷抓手',chapterCount:1,
  chapters:[{beatKey:'open_hook',title:'药铺开门',summary:'青禾拒绝交出药方，选择留下救治伤者。',plannedCharacterIds:['qing']}]};

test('V2 chapter split requires a known character schedule while V1 retains its output contract', () => {
  const asset = createVolumeChapterListPrompt({...config,characterIds:['qing','master']});
  assert.deepEqual(asset.outputSchema.parse(output).chapters[0].plannedCharacterIds,['qing']);
  assert.equal(asset.outputSchema.safeParse({...output,chapters:[{...output.chapters[0],plannedCharacterIds:['foreign']}]}).success,false);
  const {plannedCharacterIds,...old}=output.chapters[0];
  assert.equal(asset.outputSchema.safeParse({...output,chapters:[old]}).success,false);
  assert.deepEqual(asset.outputSchema.parse({...output,chapters:[{...old,plannedCharacterIds:[]}]}).chapters[0].plannedCharacterIds,[]);
  const legacy=createVolumeChapterListPrompt(config);
  assert.equal(legacy.version,'v9');
  assert.equal(legacy.outputSchema.safeParse({...output,chapters:[old]}).success,true);
  assert.equal(Object.hasOwn(legacy.outputSchema.parse(output).chapters[0],'plannedCharacterIds'),false);
});

test('initial schedules survive chapter merge and version serialization without filling unknown chapters', () => {
  const document=buildVolumeWorkspaceDocument({novelId:'book',volumes:[{id:'v',title:'第一卷',sortOrder:1,chapters:[]}],
    beatSheets:[{volumeId:'v',volumeSortOrder:1,status:'generated',beats:[{key:'open_hook',label:'开卷抓手',summary:'开门',chapterSpanHint:'1章',mustDeliver:['开门']}]}]});
  const merged=mergeChapterList(document,'v',document.beatSheets[0],[output]);
  const restored=normalizeVolumeWorkspaceDocument('book',JSON.stringify(merged));
  assert.deepEqual(restored.volumes[0].chapters[0].plannedCharacterIds,['qing']);
  const unknown=normalizeVolumeWorkspaceDocument('book',{volumes:[{id:'v',title:'卷',chapters:[{id:'p',title:'药铺',summary:'青禾走来'}]}]});
  assert.equal(Object.hasOwn(unknown.volumes[0].chapters[0],'plannedCharacterIds'),false);
});

test('V2 different beats share the same stable rules and character catalog before dynamic chapter context', () => {
  const {preparePromptExecution}=require('../../dist/prompting/core/promptRunner');
  const characters=[{id:'master',name:'师父',role:'导师',castRole:'mentor'},{id:'qing',name:'青禾',role:'药师',castRole:'protagonist'}];
  const promptInput={novel:{characters},retryReason:null};
  const first=preparePromptExecution({asset:createVolumeChapterListPrompt({...config,characterIds:['qing','master']}),promptInput});
  const later=preparePromptExecution({asset:createVolumeChapterListPrompt({targetChapterCount:3,targetBeatKey:'climax',targetBeatLabel:'卷末决战',characterIds:['qing','master'],isBookFinale:true}),promptInput:{...promptInput,novel:{characters:characters.slice().reverse().map(c=>({...c,currentState:'后来变化'}))}}});
  assert.deepEqual(first.messages.slice(0,2).map(m=>m.content),later.messages.slice(0,2).map(m=>m.content));
  assert.notEqual(first.messages[2].content,later.messages[2].content);
});

test('chapter task context carries the initial schedule as a refinable plan with identity mapping', () => {
  const {buildVolumeChapterDetailContextBlocks}=require('../../dist/prompting/prompts/novel/volume/contextBlocks');
  const chapter={id:'p',chapterOrder:1,title:'开门',summary:'救治伤者',payoffRefs:[],plannedCharacterIds:['qing']};
  const volume={id:'v',title:'第一卷',chapters:[chapter],openPayoffs:[]};
  const input={novel:{characters:[{id:'qing',name:'青禾',role:'药师'}]},workspace:{volumes:[volume]},
    storyMacroPlan:null,strategyPlan:null,targetVolume:volume,targetChapter:chapter,targetBeatSheet:null,detailMode:'task_sheet'};
  const blocks=buildVolumeChapterDetailContextBlocks(input);
  const schedule=blocks.find(block=>block.id==='character_initial_schedule');
  assert.ok(schedule); assert.equal(schedule.required,true);
  assert.match(schedule.content,/qing/); assert.match(schedule.content,/青禾/); assert.match(schedule.content,/细化/);
  assert.equal(buildVolumeChapterDetailContextBlocks({...input,targetChapter:{...chapter,plannedCharacterIds:undefined}}).some(b=>b.id==='character_initial_schedule'),false);
});
