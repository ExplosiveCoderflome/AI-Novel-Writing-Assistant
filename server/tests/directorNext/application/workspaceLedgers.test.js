const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {execFileSync} = require('node:child_process');

test('saved ledgers are complete, book-scoped and strictly read-only, including pending resources and malformed details', () => {
  const root = path.resolve(__dirname, '../../../..');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'director-ledgers-'));
  const script = path.join(dir, 'read.cjs');
  fs.writeFileSync(script, String.raw`
const assert = require('node:assert/strict');
const path = require('node:path');
const server = path.join(process.env.DIRECTOR_NEXT_REPO_ROOT, 'server');
const {prisma} = require(path.join(server, 'dist/db/prisma'));
const {ensureRuntimeDatabaseReady} = require(path.join(server, 'dist/db/runtimeMigrations'));
const {readDirectorLedgers} = require(path.join(server, 'dist/app/director/workspace'));
(async()=>{
 await ensureRuntimeDatabaseReady();
 for(const id of ['book','other','empty']) await prisma.novel.create({data:{id,title:id}});
 await prisma.character.create({data:{id:'hero',novelId:'book',name:'主角',role:'主角'}});
 await prisma.chapter.create({data:{id:'chapter',novelId:'book',order:2,title:'保存章',content:'最终正文'}});
 await prisma.payoffLedgerItem.create({data:{id:'payoff',novelId:'book',ledgerKey:'promise',title:'刀的来历',summary:'等待揭晓',scopeType:'book',currentStatus:'pending_payoff',setupChapterId:'chapter',firstSeenChapterOrder:2,targetEndChapterOrder:8,evidenceJson:JSON.stringify([{summary:'保存证据',chapterId:'chapter',chapterOrder:2}])}});
 await prisma.payoffLedgerItem.create({data:{id:'foreign-payoff',novelId:'other',ledgerKey:'promise',title:'他书秘密',summary:'他书',scopeType:'book',currentStatus:'setup'}});
 for(let i=0;i<25;i++) await prisma.characterResourceLedgerItem.create({data:{id:'resource'+i,novelId:'book',resourceKey:'key'+i,name:'信物'+i,summary:'资源摘要',resourceType:'physical_item',narrativeFunction:'key',ownerType:'character',ownerCharacterId:'hero',holderCharacterId:'hero',status:i===0?'consumed':'available',constraintsJson:i===0?'[broken':JSON.stringify(['只能使用一次']),introducedChapterId:'chapter',lastTouchedChapterOrder:2}});
 await prisma.characterResourceLedgerItem.create({data:{id:'foreign-resource',novelId:'other',resourceKey:'key',name:'他书背包',summary:'他书',resourceType:'physical_item',narrativeFunction:'tool',ownerType:'unknown',status:'available'}});
 await prisma.characterResourceEvent.create({data:{id:'event',novelId:'book',resourceId:'resource0',chapterId:'chapter',chapterOrder:2,eventType:'consumed',summary:'信物已使用',evidenceJson:'["最终正文证据"]'}});
 await prisma.stateChangeProposal.create({data:{id:'pending',novelId:'book',chapterId:'chapter',sourceType:'chapter',proposalType:'character_resource_update',riskLevel:'high',status:'pending_review',summary:'归属需要核对',payloadJson:'{"resourceName":"信物0"}',validationNotesJson:'["持有关系有冲突"]'}});
 await prisma.stateChangeProposal.create({data:{id:'foreign-pending',novelId:'other',sourceType:'chapter',proposalType:'character_resource_update',riskLevel:'low',status:'pending_review',summary:'他书提案',payloadJson:'{}'}});
 const delegates=[prisma.novel,prisma.chapter,prisma.character,prisma.payoffLedgerItem,prisma.characterResourceLedgerItem,prisma.characterResourceEvent,prisma.stateChangeProposal,prisma.directorNextRun];
 const snapshot=()=>Promise.all(delegates.map(delegate=>delegate.findMany({orderBy:{id:'asc'}})));
 const before=await snapshot();
 for(let i=0;i<2;i++){
  const result=await readDirectorLedgers('book');
  assert.equal(result.novelId,'book');
  assert.deepEqual(result.payoffs.map(row=>row.id),['payoff']);
  assert.equal(result.payoffs[0].targetEndChapterOrder,8);
  assert.equal(result.payoffs[0].evidence[0].chapterId,'chapter');
  assert.equal(result.resources.length,25,'reading cannot truncate the inventory to prompt budgets');
  const consumed=result.resources.find(row=>row.id==='resource0');
  assert.equal(consumed.status,'consumed');assert.equal(consumed.holderCharacterName,'主角');
  assert.deepEqual(consumed.constraints,[]);assert.ok(result.warnings.some(message=>message.includes('信物0')));
  assert.deepEqual(result.resources.find(row=>row.id==='resource1').constraints,['只能使用一次']);
  assert.deepEqual(result.resourceEvents.map(row=>row.id),['event']);
  assert.deepEqual(result.pendingResources.map(row=>row.id),['pending']);
  assert.deepEqual(result.pendingResources[0].validationNotes,['持有关系有冲突']);
  assert.doesNotMatch(JSON.stringify(result),/foreign|他书/);
 }
 const empty=await readDirectorLedgers('empty');
 assert.deepEqual([empty.payoffs,empty.resources,empty.resourceEvents,empty.pendingResources],[[],[],[],[]]);
 await assert.rejects(readDirectorLedgers('missing'),error=>error.statusCode===404);
 assert.deepEqual(await snapshot(),before,'viewing must not hydrate, sync, confirm or modify any saved row');
 await prisma.$disconnect();
})().catch(async error=>{console.error(error);await prisma.$disconnect();process.exitCode=1;});
`, 'utf8');
  execFileSync(process.execPath,[script],{cwd:root,env:{...process.env,NODE_ENV:'test',AI_NOVEL_RUNTIME:'desktop',AI_NOVEL_APP_DATA_DIR:dir,DIRECTOR_NEXT_REPO_ROOT:root,DATABASE_URL:'file:'+path.join(dir,'read.db').replace(/\\/g,'/')},stdio:'pipe'});
});
