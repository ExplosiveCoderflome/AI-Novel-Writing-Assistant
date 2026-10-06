const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
const {LegacyRunProjection}=require('../../../dist/modules/director/legacy');
test('every legacy state remains history with only source navigation and unchanged source data',async()=>{
 const rows=['queued','running','waiting_approval','failed','cancelled','succeeded'].map(status=>({id:status,novelId:'novel',title:'旧创作',status,progress:0.4,lastError:null,seedPayloadJson:'unread'}));
 const before=JSON.stringify(rows);const views=await new LegacyRunProjection({list:async()=>rows}).list({limit:50});
 assert.equal(views.every(v=>v.mode==='history'),true);assert.equal(views.every(v=>v.availableActions.every(a=>a.kind==='navigate')),true);assert.equal(JSON.stringify(rows),before);
 assert.equal(views.every(v=>v.sourceRoute==='/lab/director/novel'),true);
});
test('legacy files have no writes and core layers cannot import legacy',()=>{
 const root=path.resolve(__dirname,'../../../src/modules/director');
 function files(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(path.join(dir,e.name)):e.name.endsWith('.ts')?[path.join(dir,e.name)]:[]);}
 for(const file of files(path.join(root,'legacy'))) assert.doesNotMatch(fs.readFileSync(file,'utf8'),/\.(create|update|upsert|delete|executeRaw|queryRaw|transaction)\s*\(/);
 for(const folder of ['domain','application','infrastructure','steps']) for(const file of files(path.join(root,folder))) assert.doesNotMatch(fs.readFileSync(file,'utf8'),/(?:from\s*|require\(\s*)["'][^\r\n"']*legacy/);
});
