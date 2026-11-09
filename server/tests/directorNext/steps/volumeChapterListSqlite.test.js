const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const {spawnSync} = require('node:child_process');

test('V2 and manual full-volume requests resume persisted beats with the same scaled plan and budget', () => {
  const root = path.resolve(__dirname, '../../../..');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'volume-chapter-resume-'));
  const script = path.join(dir, 'verify.cjs');
  fs.writeFileSync(script, String.raw`
const assert=require('node:assert/strict'),path=require('node:path'),http=require('node:http');
const server=path.join(process.env.DIRECTOR_NEXT_REPO_ROOT,'server');
const {prisma}=require(path.join(server,'dist/db/prisma'));
const {ensureRuntimeDatabaseReady}=require(path.join(server,'dist/db/runtimeMigrations'));
const {NovelVolumeService}=require(path.join(server,'dist/services/novel/volume/NovelVolumeService'));
const {createDirectorProductionOptions}=require(path.join(server,'dist/app/director/productionComposition'));
const {createApp}=require(path.join(server,'dist/app'));
const runner=require(path.join(server,'dist/prompting/core/promptRunner'));

async function fixture(book) {
 await prisma.novel.create({data:{id:book,title:'断点测试',directorVersion:'v2',estimatedChapterCount:12}});
 const service=new NovelVolumeService();
 const seed={volumes:[
  {id:book+'-v1',sortOrder:1,title:'目标卷',chapters:[]},
  {id:book+'-v2',sortOrder:2,title:'作者卷',chapters:Array.from({length:6},(_,i)=>({id:book+'-old-'+i,chapterOrder:i+7,title:'保留章节'+i,summary:'保留概要',taskSheet:'作者任务'}))},
 ],beatSheets:[{volumeId:book+'-v1',volumeSortOrder:1,status:'generated',beats:[
  {key:'open_hook',label:'开卷',title:'追查',summary:'主角追查线索',chapterSpanHint:'1-4',mustDeliver:['线索']},
  {key:'midpoint_turn',label:'转向',title:'反击',summary:'主角发现代价',chapterSpanHint:'5-8',mustDeliver:['代价']},
 ]}]};
 await service.updateVolumesWithOptions(book,{volumes:seed.volumes},{emitEvent:false,syncPayoffLedger:false});
 await service.updateVolumesWithOptions(book,{beatSheets:seed.beatSheets},{emitEvent:false,syncPayoffLedger:false});
 await prisma.chapter.create({data:{id:book+'-prose',novelId:book,order:1,title:'正文',content:'作者手写正文'}});
 return service.getVolumes(book,{hydrateCanonical:false});
}
async function untouched(book) {
 return {
  other:(await prisma.volumeChapterPlan.findMany({where:{volumeId:book+'-v2'},orderBy:{chapterOrder:'asc'}}))
   .map(({updatedAt,...chapter})=>chapter), // Workspace order parking may touch row timestamps.
  prose:await prisma.chapter.findMany({where:{novelId:book},orderBy:{order:'asc'}}),
 };
}
let calls=[],failure='midpoint_turn';
runner.runStructuredPrompt=async ({promptInput,options})=>{
 if (options.scope==='rebalance') {
  if (failure==='rebalance') throw Error('rebalance interrupted');
  return {output:{decisions:[]}};
 }
 assert.equal(options.scope,'chapter_list','resume must not regenerate upstream planning');
 const key=promptInput.targetBeat.key;calls.push(key);
 assert.equal(promptInput.targetBeatChapterCount,3,'persisted progress must not redistribute the target budget');
 if (failure===key) throw Error('beat B interrupted');
 const titles=key==='open_hook' ? ['夜雨敲窗','密信失踪','城门封锁'] : ['追兵入巷','暗河渡险','旧友现身'];
 return {output:{beatKey:key,beatLabel:promptInput.targetBeat.label,chapterCount:3,
  chapters:titles.map(title=>({beatKey:key,title,summary:'主角取得线索并面对新的阻力。'}))}};
};
async function assertPartial(book,expectedCount) {
 const current=await new NovelVolumeService().getVolumes(book,{hydrateCanonical:false});
 const volume=current.volumes.find(v=>v.id===book+'-v1');
 assert.match(volume.status,/^chapter_list_partial/);
 assert.equal(volume.chapters.length,expectedCount);
 assert.deepEqual(current.beatSheets[0].beats.map(b=>b.chapterSpanHint),['1-3章','4-6章']);
 assert.equal(await prisma.directorNextArtifact.count({where:{novelId:book,type:'volume_chapter_list'}}),0,'partial work is not a completed artifact');
 return current;
}
(async()=>{
 await ensureRuntimeDatabaseReady();
 await fixture('v2');const before=await untouched('v2');
 const launchInput={storyInput:'断点测试',estimatedChapterCount:12,worldMode:'skip',targetMode:'selected_volume',targetVolumeId:'v2-v1',provider:'openai',model:'stub'};
 const options=createDirectorProductionOptions();
 const contract=options.contractFactory({runId:'original-run',novelId:'v2',driver:'auto',stepIdsInScope:['volume_chapter_list'],launchInput});
 const context={runId:'original-run',contract,facts:{artifacts:[],debts:[],stopSignal:null},control:{version:1}};
 const events=require(path.join(server,'dist/modules/director')).PrismaEventLog.prototype;
 events.append=async()=>{};
 await assert.rejects(()=>options.stepRegistry.get('volume_chapter_list')(context),/beat B interrupted/);
 assert.deepEqual(calls,['open_hook','midpoint_turn']);
 const partial=await assertPartial('v2',3);
 const prefix=partial.volumes[0].chapters;
 assert.deepEqual(await untouched('v2'),before);
 calls=[];failure=null;
 // A fresh composition re-reads the transactional workspace using the original run snapshot.
 const result=await createDirectorProductionOptions().stepRegistry.get('volume_chapter_list')(context);
 assert.deepEqual(calls,['midpoint_turn']);assert.ok(result.artifact);
 assert.equal(context.runId,'original-run');assert.deepEqual(contract.launchInput,launchInput);
 const finished=await new NovelVolumeService().getVolumes('v2',{hydrateCanonical:false});
 assert.equal(finished.volumes[0].chapters.length,6);
 assert.deepEqual(finished.volumes[0].chapters.slice(0,3).map(c=>c.id),prefix.map(c=>c.id));
 assert.deepEqual(await untouched('v2'),before);

 const app=http.createServer(createApp());
 await new Promise(resolve=>app.listen(0,'127.0.0.1',resolve));
 try {
  for (const scope of ['chapter_list','volume']) {
   const book='manual-'+scope;await fixture(book);const saved=await untouched(book);
   const generate=()=>fetch('http://127.0.0.1:'+app.address().port+'/api/novels/'+book+'/volumes/generate',{
    method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({scope,targetVolumeId:book+'-v1',estimatedChapterCount:12,provider:'openai',model:'stub'}),
   });
   failure='midpoint_turn';calls=[];
   assert.equal((await generate()).status,500);assert.deepEqual(calls,['open_hook','midpoint_turn']);
   await assertPartial(book,3);assert.deepEqual(await untouched(book),saved);
   // All chapters are durable even if the final neighbour rebalance subsequently fails.
   failure='rebalance';calls=[];
   assert.equal((await generate()).status,500);assert.deepEqual(calls,['midpoint_turn']);
   await assertPartial(book,6);assert.deepEqual(await untouched(book),saved);
   failure=null;calls=[];
   const response=await generate();const payload=await response.json();
   assert.equal(response.status,200,JSON.stringify(payload));assert.deepEqual(calls,[]);
   assert.equal(payload.data.volumes[0].chapters.length,6);
   assert.doesNotMatch(payload.data.volumes[0].status,/^chapter_list_partial/);
   assert.deepEqual(await untouched(book),saved);
  }
 } finally {await new Promise(resolve=>app.close(resolve));}
 await prisma.$disconnect();
})().catch(async error=>{console.error(error);await prisma.$disconnect();process.exitCode=1;});
`);
  const result = spawnSync(process.execPath, [script], {cwd:root, encoding:'utf8', timeout:90000, env:{...process.env,
    NODE_ENV:'test', AI_NOVEL_RUNTIME:'desktop', AI_NOVEL_APP_DATA_DIR:dir, DIRECTOR_NEXT_REPO_ROOT:root,
    DIRECTOR_NEXT_ENABLED:'true', DATABASE_URL:'file:'+path.join(dir,'resume.db').replace(/\\/g,'/'),
  }});
  assert.equal(result.status, 0, result.stderr+'\n'+result.stdout);
});
