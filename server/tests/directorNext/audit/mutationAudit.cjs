const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'../../../..'),server=path.join(root,'server'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'director-mutation-'));
const copy=path.join(temp,'server');fs.mkdirSync(copy,{recursive:true});
for(const sub of ['dist','tests/directorNext','src/prisma/migrations.sqlite'])fs.cpSync(path.join(server,sub),path.join(copy,sub),{recursive:true});
fs.symlinkSync(path.join(server,'node_modules'),path.join(copy,'node_modules'),'junction');
const cases=[
 ['01 paused accepts step_finished','domain/control.js','paused: { resume: "running", cancel: "cancelled" }','paused: { resume: "running", cancel: "cancelled", step_finished: "running" }','control.test.js'],
 ['01 failed accepts resume','domain/control.js','failed: {},','failed: { resume: "running" },','control.test.js'],
 ['01 protected content ignored','domain/guard.js','if (protectedType) {','if (false && protectedType) {','guard.test.js'],
 ['01 rejection budget ignored','domain/guard.js','if (input.rejections >= contract.rejectionBudget) {','if (false && input.rejections >= contract.rejectionBudget) {','guard.test.js'],
 ['01 stale satisfies dependency','domain/plan.js','if (!artifact || artifact.status === "stale") {','if (!artifact) {','plan.test.js'],
 ['01 downstream not transitive','domain/plan.js','queue.push(step.produces);','/* no transitive propagation */','plan.test.js'],
 ['01 stop signal ignored','domain/planOrchestrator.js','if (facts.stopSignal) {','if (false && facts.stopSignal) {','planOrchestrator.test.js'],
 ['01 quality debt hidden','domain/projection.js','count: facts.debts.length','count: 0','projection.test.js'],
 ['07 unconfirmed dependency allowed','domain/gateOrchestrator.js','requireConfirmed: true','requireConfirmed: false','gateOrchestrator.test.js'],
 ['07 draft wrongly invalidated','infrastructure/prismaArtifactLedger.js','const staleTypes = [...new Set(types)].filter((type) => type !== "chapter_draft");','const staleTypes = [...new Set([...types, "chapter_draft"])];','persistence.test.js'],
];
const rows=[];
function run(file){return spawnSync(process.execPath,['--test',path.join(copy,'tests/directorNext',file)],{cwd:temp,encoding:'utf8',env:{...process.env,NODE_ENV:'test'},timeout:60000});}
for(const [name,file,from,to,test]of cases){
 const dest=path.join(copy,'dist/modules/director',file),original=fs.readFileSync(dest,'utf8');
 if(!original.includes(from))throw Error('mutation anchor missing: '+name);
 const base=run(test);if(base.status!==0)throw Error('baseline failed: '+name+'\n'+base.stdout+base.stderr);
 try{
  fs.writeFileSync(dest,original.replace(from,to));const changed=run(test);
  const output=changed.stdout+changed.stderr;fs.writeFileSync(path.join(temp,name.slice(0,2)+'-'+path.basename(file)+'.log'),output);
  const caught=changed.status!==0&&/AssertionError|ERR_ASSERTION/.test(output);
  rows.push({name,baseline:'pass',mutation:caught?'caught':'UNPROVEN',exit:changed.status});
  console.log(name+': '+rows.at(-1).mutation);
 }finally{fs.writeFileSync(dest,original);}
}
fs.writeFileSync(path.join(temp,'report.json'),JSON.stringify(rows,null,2));
console.log('REPORT '+path.join(temp,'report.json'));if(rows.some(row=>row.mutation!=='caught'))process.exitCode=1;
