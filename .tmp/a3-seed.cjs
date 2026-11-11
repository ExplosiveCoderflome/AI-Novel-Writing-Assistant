// Additive fixture only. Never resets a database or reads environment files.
const fs = require('node:fs');
const path = require('node:path');
const {createRequire} = require('node:module');
const root = path.resolve(__dirname, '..');
const req = createRequire(path.join(root, 'server/package.json'));
const Sqlite = req('better-sqlite3');
const {PrismaClient} = req('@prisma/client');
const {PrismaBetterSqlite3} = req('@prisma/adapter-better-sqlite3');
const {createEmptyOutlineDocument} = req('@ai-novel/shared/types/outline');
const {mapOutlineBook} = require('../server/dist/modules/planning/outline/openBook/domain/mapping');
const {buildOutlineWorkspace} = require('../server/dist/modules/planning/outline/openBook/domain/assets');
const {persistActiveVolumeWorkspace} = require('../server/dist/services/novel/volume/volumeWorkspacePersistence');
const {OutlineFeedbackService} = require('../server/dist/modules/planning/outline/feedback/application/OutlineFeedbackService');
const target = path.resolve(process.argv[2] || path.join(__dirname, 'a3-ui.sqlite'));
if (!fs.existsSync(path.dirname(target))) throw Error('Fixture parent directory must exist');
if (!fs.existsSync(target)) {
  const sql = require('../server/tests/production/persistence/sqliteFixture.cjs').fullSchemaSql();
  const sqlite = new Sqlite(target); sqlite.exec(sql); sqlite.close();
}
const db = new PrismaClient({adapter: new PrismaBetterSqlite3({url: `file:${target}`})});
async function main() {
  if (await db.outlineProject.findUnique({where:{id:'a3-ui-project'}})) {
    await new OutlineFeedbackService(db, undefined, () => {}).enqueue('a3-ui-project','a3-ui-chapter-1','a3-ui-pending');
    console.log('Fixture exists; preserving all prior UI decisions.');
    console.log(JSON.stringify(await new OutlineFeedbackService(db, undefined, () => {}).status('a3-ui-project'), null, 2));
    return;
  }
  const d = createEmptyOutlineDocument('雾港假钥匙 · 正文反馈验收');
  d.story.premise='修锁学徒追查雾港的假钥匙交易';
  d.volumes=[{nodeId:'a3-volume',order:0,title:'第一卷 · 雾港来信',summary:'从假钥匙追查旧港交易',planningDepth:'rough',chapterNodeIds:['a3-source-1','a3-source-2','a3-source-3']}];
  d.chapters=[1,2,3].map((x)=>({nodeId:`a3-source-${x}`,volumeNodeId:'a3-volume',order:x-1,title:['夜访旧铺','追查来历','码头交易'][x-1],summary:['林舟发现交付的钥匙是假的','林舟独自寻找钥匙来历','林舟在码头等待买家'][x-1],purpose:'推进调查',planningDepth:'rough',characterNodeIds:['a3-hero'],payoffNodeIds:['a3-key']}));
  d.characters=[{nodeId:'a3-hero',name:'林舟',arcDirection:'独自追求真相',appearanceNodeIds:['a3-source-1','a3-source-2','a3-source-3']}];
  d.payoffs=[{nodeId:'a3-key',title:'假钥匙与旧刻痕',kind:'foreshadowing',setupDescription:'钥匙来历可疑',payoffDescription:'查明幕后交易',setupChapterNodeIds:['a3-source-1'],payoffChapterNodeIds:['a3-source-3'],relatedNodeIds:[]}];
  d.facts=[{nodeId:'a3-locked',title:'雾港铁律',content:'钥匙不能凭空复制',category:'world',scope:{type:'story'},immutable:true,relatedNodeIds:[]}];
  const m=mapOutlineBook(d,{revisionId:'a3-ui-revision',expectedProjectVersion:1,bookSettings:{title:d.story.title,estimatedChapterCount:3},volumeQuotas:{'a3-volume':3},allowOptimize:[{nodeId:'a3-source-2',field:'summary'},{nodeId:'a3-hero',field:'arcDirection'},{nodeId:'a3-key',field:'payoffDescription'}]},'a3-ui-binding');
  m.mapping.chapters.forEach((c,i)=>c.chapterId=`a3-ui-chapter-${i+1}`);
  const w=buildOutlineWorkspace('a3-ui-novel',d,m.mapping,3000,'a3-ui-workspace');
  await db.$transaction(async tx=>{
    await tx.novel.create({data:{id:'a3-ui-novel',title:d.story.title,directorVersion:'v2',estimatedChapterCount:3}});
    for(let order=1;order<=3;order++) await tx.chapter.create({data:{id:`a3-ui-chapter-${order}`,novelId:'a3-ui-novel',order,title:d.chapters[order-1].title,content:order===1?'林舟推开旧铺的门。他试了三次，钥匙仍转不动。同行的阿禾指出，齿纹边缘藏着一道旧港刻痕。林舟终于承认，这把钥匙是假的。':'',generationState:order===1?'drafted':'planned'}});
    await tx.chapterSummary.create({data:{novelId:'a3-ui-novel',chapterId:'a3-ui-chapter-1',summary:'林舟发现交付的钥匙是假的；阿禾认出旧港刻痕，林舟开始怀疑独自调查的办法。后续需要追查买家，并保留雾港钥匙不能凭空复制的铁律。'}});
    await tx.outlineProject.create({data:{id:'a3-ui-project',title:d.story.title,currentVersion:1,currentRevisionId:'a3-ui-revision',boundNovelId:'a3-ui-novel'}});
    await tx.outlineRevision.create({data:{id:'a3-ui-revision',projectId:'a3-ui-project',version:1,sourceType:'manual',documentJson:JSON.stringify(d)}});
    await tx.outlineBookBinding.create({data:{id:'a3-ui-binding',projectId:'a3-ui-project',revisionId:'a3-ui-revision',revisionVersion:1,sourceDocumentHash:m.sourceDocumentHash,novelId:'a3-ui-novel',requestKey:'a3-ui-book',requestHash:m.requestHash,mappingJson:JSON.stringify(m.mapping),policyJson:JSON.stringify(m.policy),postCreateStateJson:JSON.stringify({rag:'queued'}),feedbackSettingsJson:JSON.stringify({mode:'every_n',everyN:3})}});
    await tx.volumePlanVersion.create({data:{id:'a3-ui-workspace',novelId:'a3-ui-novel',version:1,status:'active',contentJson:JSON.stringify(w)}});
    await persistActiveVolumeWorkspace(tx,'a3-ui-novel',w,'a3-ui-workspace');
    await tx.outlineProject.create({data:{id:'a3-ui-unbound',title:'未绑定大纲',currentVersion:1,currentRevisionId:'a3-ui-unbound-r'}});
    await tx.outlineRevision.create({data:{id:'a3-ui-unbound-r',projectId:'a3-ui-unbound',version:1,sourceType:'manual',documentJson:JSON.stringify(createEmptyOutlineDocument('未绑定大纲'))}});
  });
  const queue=[];
  // Deterministic analyzer injection through the real service contract; no model/network.
  const service=new OutlineFeedbackService(db,async()=>({operations:[
    {operationId:'a3-arc',kind:'update_fields',nodeId:'a3-hero',fields:{arcDirection:'从独自追查到学会信任阿禾'},reason:'阿禾识破刻痕，为主角提供值得信任的证据。',dependsOn:[]},
    {operationId:'a3-hook',kind:'update_fields',nodeId:'a3-key',fields:{payoffDescription:'以旧港刻痕引出幕后买家，保留假钥匙的来历悬念'},reason:'承接首章新出现的旧港刻痕。',dependsOn:[]},
    {operationId:'a3-future',kind:'update_fields',nodeId:'a3-source-2',fields:{summary:'林舟与阿禾一同追查旧港刻痕，发现码头买家的交易线索'},reason:'让后续章节任务承接正文发现。',dependsOn:[]},
  ]}),work=>queue.push(work));
  const receipt=await service.enqueue('a3-ui-project','a3-ui-chapter-1','a3-ui-seed');
  while(queue.length) await queue.shift()();
  const failed=new OutlineFeedbackService(db,async()=>{throw Error('deterministic fixture failure');},work=>queue.push(work));
  const failure=await failed.enqueue('a3-ui-project','a3-ui-chapter-1','a3-ui-failure');
  while(queue.length) await queue.shift()();
  const pendingService=new OutlineFeedbackService(db,async()=>{throw Error('Never execute pending fixture');},()=>{});
  const pending=await pendingService.enqueue('a3-ui-project','a3-ui-chapter-1','a3-ui-pending');
  console.log(JSON.stringify({database:target,projectId:'a3-ui-project',novelId:'a3-ui-novel',completedRunId:receipt.id,failedRunId:failure.id,pendingRunId:pending.id,route:'/outlines/a3-ui-project?panel=feedback',operations:['a3-arc','a3-hook','a3-future']},null,2));
  console.log(JSON.stringify(await service.status('a3-ui-project'),null,2));
}
main().catch(()=>{console.error('Fixture seed failed; existing data preserved.');process.exitCode=1;}).finally(()=>db.$disconnect());
