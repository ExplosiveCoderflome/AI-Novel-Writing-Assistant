const test=require('node:test');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const {initializeTemporarySqliteDatabase}=require('../testInfrastructure/tempSqliteDatabase.cjs');

test('V2 initial schedule backfill preserves plans, rejects stale writes and never reruns known schedules',()=>{
  const server=path.resolve(__dirname,'../..');
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'v2-initial-schedule-'));
  const databaseUrl=initializeTemporarySqliteDatabase(dir,'test.db');
  const script=path.join(dir,'check.cjs');
  fs.writeFileSync(script,String.raw`
const assert=require('node:assert/strict');
const path=require('node:path');
const load=p=>require(path.join(process.env.TEST_SERVER_ROOT,'dist',p));
const {prisma}=load('db/prisma');
const {InitialCharacterScheduleService}=load('services/novel/characters/appearances/planning/InitialCharacterScheduleService');
const {characterAppearanceService}=load('services/novel/characters/appearances');
const {normalizeVolumeWorkspaceDocument}=load('services/novel/volume/volumeWorkspaceDocument');
const runner=load('prompting/core/promptRunner');
let calls=0,hook=null;
runner.runStructuredPrompt=async input=>{
  calls++; if(hook) await hook();
  assert.equal(input.options.novelId,'book');
  assert.equal(input.options.taskId,'run');
  return {output:input.asset.outputSchema.parse({chapters:input.promptInput.chapters.map(c=>({planId:c.id,plannedCharacterIds:c.chapterOrder===2?[]:['qing']}))})};
};
const service=new InitialCharacterScheduleService();
(async()=>{try{
  await prisma.novel.create({data:{id:'book',title:'药铺',directorVersion:'v2',directorEpoch:2}});
  await prisma.character.create({data:{id:'qing',novelId:'book',name:'青禾',role:'药师'}});
  await prisma.directorNextRun.create({data:{id:'run',novelId:'book',driver:'auto',planVersion:'test',contractJson:'{}'}});
  await prisma.directorNextRunControl.create({data:{runId:'run',novelId:'book',status:'completed'}});
  const document=normalizeVolumeWorkspaceDocument('book',{volumes:[{id:'v',title:'卷',chapters:[
    {id:'p1',chapterOrder:1,title:'开门',summary:'青禾拒绝交方'},
    {id:'p2',chapterOrder:2,title:'远方',summary:'镜头转向其他地方'},
    {id:'p3',chapterOrder:3,title:'重逢',summary:'青禾重逢师父',plannedCharacterIds:[]},
    {id:'p4',chapterOrder:4,title:'细化',summary:'详细安排',taskSheet:'已有详细任务'},
  ]}]});
  await prisma.volumePlanVersion.create({data:{id:'version',novelId:'book',version:1,status:'active',contentJson:JSON.stringify(document)}});
  const before=await prisma.volumePlanVersion.findUnique({where:{id:'version'}});
  let result=await service.fill('book',{provider:'deepseek',model:'deepseek-flash'});
  assert.equal(result.updated,2); assert.equal(result.remaining,0); assert.equal(calls,1);
  let row=await prisma.volumePlanVersion.findUnique({where:{id:'version'}});
  let next=normalizeVolumeWorkspaceDocument('book',row.contentJson);
  assert.deepEqual(next.volumes[0].chapters.map(c=>c.plannedCharacterIds),[['qing'],[],[],undefined]);
  for(let i=0;i<4;i++) assert.equal(next.volumes[0].chapters[i].summary,document.volumes[0].chapters[i].summary);
  assert.equal(await prisma.chapter.count(),0,'backfill must not create execution chapters');
  result=await service.fill('book',{provider:'deepseek',model:'deepseek-flash'});
  assert.equal(result.updated,0); assert.equal(calls,1);
  await prisma.volumePlanVersion.update({where:{id:'version'},data:{contentJson:before.contentJson}});
  let release,started;
  const waiting=new Promise(resolve=>{started=resolve;});
  hook=async()=>{started();await new Promise(resolve=>{release=resolve;});};
  const pending=service.fill('book',{provider:'deepseek',model:'deepseek-flash'});
  await waiting;
  await assert.rejects(service.fill('book',{provider:'deepseek',model:'deepseek-flash'}),/正在补齐/);
  release(); await pending; hook=null;
  assert.equal(calls,2,'concurrent click cannot start another model call');
  await prisma.chapter.create({data:{id:'c1',novelId:'book',order:1,title:'开门'}});
  let projected=await characterAppearanceService.readNovel('book');
  assert.deepEqual(projected.chapters[0].plannedCharacterIds,['qing']);
  assert.equal(projected.chapters[0].planSource,'initial');
  await prisma.storyPlan.create({data:{novelId:'book',chapterId:'c1',level:'chapter',title:'空安排',objective:'视角移开',participantsJson:'[]'}});
  projected=await characterAppearanceService.readNovel('book');
  assert.deepEqual(projected.chapters[0].plannedCharacterIds,[]); assert.equal(projected.chapters[0].planSource,'task');
  // An obsolete snapshot cannot overwrite a new revision, mode or running generation.
  await prisma.volumePlanVersion.update({where:{id:'version'},data:{contentJson:before.contentJson}});
  hook=async()=>prisma.volumePlanVersion.update({where:{id:'version'},data:{contentJson:JSON.stringify({...document,source:'empty'})}});
  await assert.rejects(service.fill('book',{provider:'deepseek',model:'deepseek-flash'}),/规划.*变化/);
  assert.equal((await prisma.volumePlanVersion.findUnique({where:{id:'version'}})).contentJson,JSON.stringify({...document,source:'empty'}));
  hook=null;
  await prisma.directorNextRunControl.update({where:{runId:'run'},data:{status:'running'}});
  const count=calls; await assert.rejects(service.fill('book',{provider:'deepseek',model:'deepseek-flash'}),/创作.*停止|创作.*结束/); assert.equal(calls,count);
  await prisma.directorNextRunControl.update({where:{runId:'run'},data:{status:'completed'}});
  hook=async()=>prisma.novel.update({where:{id:'book'},data:{directorEpoch:3}});
  await assert.rejects(service.fill('book',{provider:'deepseek',model:'deepseek-flash'}),/归属.*变化/);
  hook=null;
  const longDocument=normalizeVolumeWorkspaceDocument('book',{volumes:[{id:'v',title:'卷',chapters:
    Array.from({length:27},(_,index)=>({id:'long-'+index,chapterOrder:index+10,title:'章节'+index,summary:'继续故事'}))}]});
  await prisma.volumePlanVersion.update({where:{id:'version'},data:{contentJson:JSON.stringify(longDocument)}});
  const batchCalls=calls;
  result=await service.fill('book',{provider:'deepseek',model:'deepseek-flash'});
  assert.equal(result.updated,24); assert.equal(result.remaining,3); assert.equal(calls,batchCalls+1);
  result=await service.fill('book',{provider:'deepseek',model:'deepseek-flash'});
  assert.equal(result.updated,3); assert.equal(result.remaining,0); assert.equal(calls,batchCalls+2);
  result=await service.fill('book',{provider:'deepseek',model:'deepseek-flash'});
  assert.equal(result.updated,0); assert.equal(calls,batchCalls+2,'completed batches never request AI again');
  await prisma.novel.update({where:{id:'book'},data:{directorVersion:'v1'}});
  const prior=calls; await assert.rejects(service.fill('book',{provider:'deepseek',model:'deepseek-flash'}),/V2|导演|模式/); assert.equal(calls,prior);
  console.log('initial schedule checks passed');
}finally{await prisma.$disconnect();}})().catch(error=>{console.error(error);process.exitCode=1;});
`);
  try{
    const result=execFileSync(process.execPath,[script],{cwd:server,encoding:'utf8',timeout:90000,
      env:{...process.env,DATABASE_PROVIDER:'sqlite',DATABASE_URL:databaseUrl,TEST_SERVER_ROOT:server,DIRECTOR_NEXT_ENABLED:'true'}});
    if(!result.includes('initial schedule checks passed')) throw Error(result);
  }finally{
    const resolved=path.resolve(dir);
    if(path.dirname(resolved)!==path.resolve(os.tmpdir())||!path.basename(resolved).startsWith('v2-initial-schedule-')) throw Error('Unsafe cleanup');
    fs.rmSync(resolved,{recursive:true,force:true});
  }
});
