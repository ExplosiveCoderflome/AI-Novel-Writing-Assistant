const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'director-assets-'));
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'file:' + path.join(dir, 'assets.db').replace(/\\/g, '/');
const {prisma} = require('../../../dist/db/prisma');
const {readExistingAssets} = require('../../../dist/app/director/existingAssets');
const {StoryMacroPlanService} = require('../../../dist/services/novel/storyMacro/StoryMacroPlanService');
const {inferExistingAssets} = require('../../../dist/modules/director/application/assetInference');
const {createGateOrchestrator} = require('../../../dist/modules/director/domain/gateOrchestrator');
const {directorProductionPlan} = require('../../../dist/modules/director/steps/planDefinition');
const contract = {runId:'run', novelId:'book', scope:'book', driver:'assisted', chapterRange:null,
  stepIdsInScope:['volume_strategy','volume_beat_sheet'], modelConfig:{route:'openai',model:'stub'},
  launchInput:{storyInput:'测试',estimatedChapterCount:10,worldMode:'skip',targetMode:'opening'}};

test('takeover does not confirm an existing skeleton without a strategy or skip its prerequisite', async () => {
  const methods = [[prisma.novel,'findUniqueOrThrow'],[prisma.bookContract,'findUnique'],
    [prisma.character,'findMany'],[prisma.volumePlanVersion,'findFirst'],[prisma.chapter,'findMany'],
    [StoryMacroPlanService.prototype,'getPlan']];
  const originals = methods.map(([owner,key]) => owner[key]);
  let strategyPlan = null;
  prisma.novel.findUniqueOrThrow = async () => ({worldId:null});
  prisma.bookContract.findUnique = async () => ({id:'contract'});
  prisma.character.findMany = async () => [{id:'character'}];
  prisma.chapter.findMany = async () => [{id:'body',order:1,content:'保留已有正文'}];
  StoryMacroPlanService.prototype.getPlan = async () => null;
  prisma.volumePlanVersion.findFirst = async () => ({id:'version',contentJson:JSON.stringify({
    volumes:[{id:'volume',sortOrder:1,title:'保留的卷',chapters:[]}],strategyPlan})});
  try {
    const assets = await inferExistingAssets(contract,{read:readExistingAssets,contentHash:()=> 'saved'});
    assert.equal(assets.some(asset => asset.type === 'volume_strategy' && asset.status === 'confirmed'),false);
    assert.equal(assets.find(asset => asset.type === 'chapter_draft').protectedUserContent,true);
    const facts = {artifacts:[...assets,{type:'story_macro',scope:'book',status:'confirmed'}].map(a=>({...a,version:1})),debts:[],stopSignal:null};
    assert.deepEqual(createGateOrchestrator().next({plan:directorProductionPlan,contract,facts}),{kind:'run_step',stepId:'volume_strategy'});
    strategyPlan = {volumes:[]};
    assert.equal((await readExistingAssets(contract)).some(asset => asset.type === 'volume_strategy'),false);
    strategyPlan = {volumes:[{sortOrder:1,planningMode:'hard',roleLabel:'开篇',coreReward:'回报',escalationFocus:'压力',uncertaintyLevel:'low'}]};
    assert.equal((await readExistingAssets(contract)).find(asset => asset.type === 'volume_strategy').usable,true);
  } finally {methods.forEach(([owner,key],i)=>{owner[key]=originals[i];});}
});
