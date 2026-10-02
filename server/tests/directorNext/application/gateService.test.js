const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {execFileSync} = require('node:child_process');

test('gate commands commit edited versions, invalidate only scoped planning, and roll back conflicts', () => {
  const repoRoot = path.resolve(__dirname, '../../../..');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'director-gates-'));
  const script = path.join(dir, 'verify.cjs');
  fs.writeFileSync(script, String.raw`
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = process.env.DIRECTOR_NEXT_REPO_ROOT;
const server = path.join(root, 'server');
const Database = require(require.resolve('better-sqlite3', {paths:[server]}));
const raw = new Database(process.env.DATABASE_URL.slice(5));
const migrations = path.join(server, 'src/prisma/migrations.sqlite');
for(const name of fs.readdirSync(migrations).filter(n=>n.startsWith('20261001')).sort()) raw.exec(fs.readFileSync(path.join(migrations,name,'migration.sql'),'utf8'));
raw.close();
const {prisma} = require(path.join(server,'dist/db/prisma'));
const infra = require(path.join(server,'dist/modules/director/infrastructure'));
const {FactsLoader, GateService, CommandService} = require(path.join(server,'dist/modules/director/application'));
const {definePlan} = require(path.join(server,'dist/modules/director/domain'));
const {contract} = require(path.join(server,'tests/directorNext/fixtures'));
(async()=>{
 const runs = new infra.PrismaRunRepository(prisma);
 const events = new infra.PrismaEventLog(prisma);
 const ledger = new infra.PrismaArtifactLedger(prisma);
 const debts = new infra.PrismaQualityDebtRepository(prisma);
 const plan = definePlan({version:'gates',externalArtifacts:['novel_seed'],steps:[
  {id:'macro',label:'macro',requires:['novel_seed'],produces:'story_macro',needs:[],gateable:true,overwrites:[]},
  {id:'cast',label:'cast',requires:['story_macro'],produces:'character_cast',needs:[],gateable:true,overwrites:[]},
  {id:'list',label:'list',requires:['character_cast'],produces:'chapter_list',needs:[],gateable:true,overwrites:[]}]});
 const factsLoader = new FactsLoader({runRepository:runs,artifactLedger:ledger,qualityDebtRepository:debts,eventLog:events});
 const gateService = new GateService({factsLoader,planRegistry:{get:()=>plan}});
 let seq=0, rejectEdit=false;
 const commands = new infra.PrismaCommandRepository(prisma,{readEditedArtifact:async()=>{if(rejectEdit)throw Error('saved content unavailable');return {contentRef:'saved:edited',contentHash:'edited-hash'};}});
 const service = new CommandService({runRepository:runs,commandRepository:commands,gateService,runtime:{nextId:()=> 'cmd-'+ ++seq},contractFactory:()=>{throw Error('unused');}});
 async function openGate(id,type,novel=id){
  await runs.open(contract({runId:id,novelId:novel,driver:'assisted',planVersion:'gates'}));
  await runs.transition(id,{type:'start'},0);
  await runs.transition(id,{type:'open_gate',gateId:'gate-'+id,artifactTypes:[type]},1);
 }
 async function artifact(novel,type,scope='book',protectedUserContent=false){return prisma.directorNextArtifact.create({data:{id:novel+':'+type+':'+scope,novelId:novel,type,scope,version:1,status:'draft',protectedUserContent,contentRef:'saved:'+type,contentHash:'hash-'+type}});}
 await openGate('edit','story_macro');
 for(const type of ['story_macro','character_cast','chapter_list','chapter_draft'])await artifact('edit',type,'book',type==='chapter_draft'||type==='character_cast');
 await artifact('edit','chapter_list','chapter:2');
 await artifact('other','chapter_list');
 const result = await service.execute({type:'resolve_gate',runId:'edit',decision:'confirm_after_edit',expectedVersion:2,idempotencyKey:'edit-once'});
 assert.equal(result.controlVersion,3);
 const rows = await prisma.directorNextArtifact.findMany({where:{novelId:'edit'}});
 const edited = rows.find(a=>a.type==='story_macro'&&a.version===2);
 assert.equal(edited.status,'user_edited'); assert.equal(edited.protectedUserContent,true); assert.equal(edited.contentHash,'edited-hash');
 assert.equal(rows.find(a=>a.type==='character_cast').status,'stale');
 assert.equal(rows.find(a=>a.type==='character_cast').protectedUserContent,true);
 assert.equal(rows.find(a=>a.type==='chapter_list'&&a.scope==='book').status,'stale');
 assert.equal(rows.find(a=>a.type==='chapter_list'&&a.scope==='chapter:2').status,'draft');
 assert.equal(rows.find(a=>a.type==='chapter_draft').status,'draft');
 assert.equal((await prisma.directorNextArtifact.findFirst({where:{novelId:'other'}})).status,'draft');
 assert.equal((await service.execute({type:'resolve_gate',runId:'edit',decision:'confirm_after_edit',expectedVersion:2,idempotencyKey:'edit-once'})).replayed,true);
 await openGate('confirm','chapter_list'); await artifact('confirm','chapter_list');
 await service.execute({type:'resolve_gate',runId:'confirm',decision:'confirm',expectedVersion:2,idempotencyKey:'confirm'});
 assert.equal((await prisma.directorNextArtifact.findFirst({where:{novelId:'confirm'}})).status,'confirmed');
 await openGate('regenerate','story_macro'); await artifact('regenerate','story_macro'); await artifact('regenerate','chapter_draft');
 await service.execute({type:'resolve_gate',runId:'regenerate',decision:'regenerate',expectedVersion:2,idempotencyKey:'regenerate'});
 assert.equal((await prisma.directorNextArtifact.findFirst({where:{novelId:'regenerate',type:'story_macro'}})).status,'stale');
 assert.equal((await prisma.directorNextArtifact.findFirst({where:{novelId:'regenerate',type:'chapter_draft'}})).status,'draft');
 await openGate('rollback','story_macro'); await artifact('rollback','story_macro'); rejectEdit=true;
 await assert.rejects(()=>service.execute({type:'resolve_gate',runId:'rollback',decision:'confirm_after_edit',expectedVersion:2,idempotencyKey:'rollback'}),/unavailable/);
 assert.equal((await runs.getControl('rollback')).status,'waiting_gate');
 assert.equal(await prisma.directorNextCommand.count({where:{idempotencyKey:'rollback'}}),0);
 assert.equal(await prisma.directorNextArtifact.count({where:{novelId:'rollback'}}),1);
 rejectEdit=false;
 await assert.rejects(()=>service.execute({type:'resolve_gate',runId:'rollback',decision:'confirm',expectedVersion:1,idempotencyKey:'conflict'}),e=>e.statusCode===409);
 await prisma.directorNextArtifact.update({where:{id:'rollback:story_macro:book'},data:{protectedUserContent:true}});
 await assert.rejects(()=>service.execute({type:'resolve_gate',runId:'rollback',decision:'regenerate',expectedVersion:2,idempotencyKey:'protected'}),e=>e.statusCode===400);
 assert.equal((await runs.getControl('rollback')).version,2);
 await runs.open(contract({runId:'resume',novelId:'resume'}));
 await runs.transition('resume',{type:'start'},0);
 await events.append({runId:'resume',type:'stop_signal',payload:{kind:'manual_recovery',reason:'runtime interruption',action:'pause_for_manual',source:'runtime'}});
 await runs.transition('resume',{type:'pause',pause:{kind:'manual_recovery',reason:'runtime interruption'}},1);
 assert.equal((await factsLoader.load('resume')).facts.stopSignal.source,'runtime');
 await service.execute({type:'resume',runId:'resume',expectedVersion:2,idempotencyKey:'resume-explicit'});
 assert.equal((await factsLoader.load('resume')).facts.stopSignal,null);
 assert.equal((await runs.getControl('resume')).status,'running');
 assert.equal((await events.list('resume')).filter(e=>e.type==='stop_signal_cleared').length,1);
 await service.execute({type:'resume',runId:'resume',expectedVersion:2,idempotencyKey:'resume-explicit'});
 assert.equal((await events.list('resume')).filter(e=>e.type==='stop_signal_cleared').length,1);
 await prisma.$disconnect();
})().catch(async e=>{console.error(e);await prisma.$disconnect();process.exitCode=1;});
`);
  execFileSync(process.execPath,[script],{cwd:repoRoot,env:{...process.env,NODE_ENV:'test',DIRECTOR_NEXT_REPO_ROOT:repoRoot,DATABASE_URL:'file:'+path.join(dir,'gate.db').replace(/\\/g,'/')},stdio:'pipe'});
});
