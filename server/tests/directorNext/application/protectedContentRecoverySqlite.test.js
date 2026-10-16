const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {spawnSync} = require("node:child_process");
const {initializeTemporarySqliteDatabase} = require("../../testInfrastructure/tempSqliteDatabase.cjs");

test("legacy rejection pause recovers through an atomic saved-result confirmation across service restart", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "protected-result-recovery-"));
  const url = initializeTemporarySqliteDatabase(directory, "recovery.db");
  const script = String.raw`
const assert = require("node:assert/strict");
const {prisma} = require("./dist/db/prisma");
const {createDirectorNextServices} = require("./dist/modules/director/bootstrap");
const {StepRegistry} = require("./dist/modules/director/application");
const {definePlan} = require("./dist/modules/director/domain");
const {PrismaRunRepository,PrismaArtifactLedger,PrismaEventLog} = require("./dist/modules/director/infrastructure");
const {contract} = require("./tests/directorNext/fixtures");
(async () => {
  await prisma.novel.create({data:{id:"book",title:"受保护结果恢复",description:"作者保存的内容"}});
  const plan = definePlan({version:"protected-recovery",externalArtifacts:["novel_seed"],steps:[
    {id:"macro",label:"故事规划",requires:["novel_seed"],produces:"story_macro",needs:[],gateable:true,overwrites:[]},
    {id:"cast",label:"角色准备",requires:["story_macro"],produces:"character_cast",needs:[],gateable:true,overwrites:[]},
  ]});
  let calls = 0, rejectRead = true;
  const registry = new StepRegistry();
  registry.register("macro", async()=>assert.fail("作者规划不得重新生成"));
  registry.register("cast", async()=>{calls++;return {artifact:{scope:"book",status:"confirmed",protectedUserContent:false,contentRef:"cast",contentHash:"cast"}};});
  const options = {plan,stepRegistry:registry,
    artifactTypes:{story_macro:{label:"故事规划",reviewRoute:"/lab/director/book?review=story_macro"}},
    contractFactory:input=>contract({...input,planVersion:plan.version}),
    readEditedArtifact:async(input,tx)=>{
      const saved = await tx.novel.findUniqueOrThrow({where:{id:input.contract.novelId}});
      if(rejectRead) throw Error("读取保存结果失败");
      return {contentRef:"novel:book",contentHash:saved.description};
    }};
  let services = createDirectorNextServices(options);
  const runs = new PrismaRunRepository(prisma),ledger = new PrismaArtifactLedger(prisma),events = new PrismaEventLog(prisma);
  const {runId} = await services.http.commandService.execute({type:"open_run",novelId:"book",driver:"auto",stepIdsInScope:null,idempotencyKey:"open"});
  await ledger.record({novelId:"book",type:"novel_seed",scope:"book",status:"confirmed",protectedUserContent:true,contentRef:"seed",contentHash:"seed",producedByRunId:runId});
  await ledger.record({novelId:"book",type:"story_macro",scope:"book",status:"stale",protectedUserContent:true,contentRef:"novel:book",contentHash:"旧保存版本",producedByRunId:runId});
  await runs.transition(runId,{type:"start"},0);
  await events.append({runId,type:"action_rejected",payload:{code:"protected_content",action:{kind:"run_step",stepId:"macro"},message:"internal guard message"}});
  await events.append({runId,type:"stop_signal",payload:{kind:"manual_recovery",reason:"rejection_budget_exhausted",source:"runtime",action:"pause_for_manual"}});
  await runs.transition(runId,{type:"pause",pause:{kind:"manual_recovery",reason:"rejection_budget_exhausted"}},1);
  const pausedView = await services.http.projectionService.get(runId);
  assert.match(pausedView.detail,/故事规划.*需要保留的修改/);
  assert.doesNotMatch(pausedView.detail,/rejection_budget_exhausted|internal guard/);
  await services.http.commandService.execute({type:"resume",runId,expectedVersion:2,idempotencyKey:"resume"});
  await services.worker.tick();
  const waiting = await runs.getControl(runId);
  assert.equal(waiting.status,"waiting_gate");
  assert.equal(calls,0);
  services = createDirectorNextServices(options);
  assert.equal((await services.http.projectionService.get(runId)).mode,"waiting_gate");
  const confirm = {type:"resolve_gate",runId,decision:"confirm",expectedVersion:waiting.version,idempotencyKey:"confirm"};
  await assert.rejects(services.http.commandService.execute({...confirm,decision:"regenerate",idempotencyKey:"regenerate"}),/保留/);
  await assert.rejects(services.http.commandService.execute(confirm),/读取保存结果失败/);
  assert.equal((await runs.getControl(runId)).version,waiting.version);
  assert.equal(await prisma.directorNextCommand.count({where:{idempotencyKey:"confirm"}}),0);
  assert.equal(await prisma.directorNextArtifact.count({where:{novelId:"book",type:"story_macro"}}),1);
  rejectRead = false;
  await prisma.novel.update({where:{id:"book"},data:{description:"作者核对后的保存内容"}});
  await services.http.commandService.execute(confirm);
  const refs = await prisma.directorNextArtifact.findMany({where:{novelId:"book",type:"story_macro"},orderBy:{version:"asc"}});
  assert.equal(refs[0].status,"stale");
  assert.equal(refs[1].status,"user_edited");
  assert.equal(refs[1].contentHash,"作者核对后的保存内容");
  assert.equal(refs[1].protectedUserContent,true);
  const replay = await services.http.commandService.execute(confirm);
  assert.equal(replay.replayed,true);
  // A restarted worker takes over only after the original process lease expires.
  await prisma.directorNextRunControl.update({where:{runId},data:{leaseExpiresAt:new Date(0)}});
  await services.worker.tick();
  await services.worker.tick();
  assert.equal((await runs.getControl(runId)).status,"completed");
  assert.equal(calls,1);
  assert.equal((await events.list(runId)).filter(event=>event.type==="action_rejected").length,1);
  assert.equal((await prisma.novel.findUniqueOrThrow({where:{id:"book"}})).description,"作者核对后的保存内容");
})().catch(error=>{console.error(error);process.exitCode=1}).finally(()=>prisma.$disconnect());
`;
  const result = spawnSync(process.execPath, ["-e", script], {
    cwd: path.resolve(__dirname, "../../.."), encoding:"utf8", timeout:60000,
    env:{...process.env,NODE_ENV:"test",AI_NOVEL_RUNTIME:"desktop",AI_NOVEL_APP_DATA_DIR:directory,DATABASE_URL:url},
  });
  assert.equal(result.status,0,result.stdout+"\n"+result.stderr);
});
