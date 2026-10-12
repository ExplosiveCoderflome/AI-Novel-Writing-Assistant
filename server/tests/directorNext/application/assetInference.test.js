const test=require('node:test');const assert=require('node:assert/strict');
const {inferExistingAssets}=require('../../../dist/modules/director/application');
const {contract}=require('../fixtures');
test('takeover protects saved content, preserves chapter scopes and never invents missing assets',async()=>{
 const snapshot=[{type:'character_cast',contentRef:'cast',content:{name:'原角色'},usable:true},
 {type:'chapter_draft',scope:'chapter:1',contentRef:'chapter:one',content:'原正文',usable:true},
 {type:'story_macro',contentRef:'macro',content:{partial:true},usable:false}];
 const before=JSON.stringify(snapshot);
 const assets=await inferExistingAssets(contract(),{read:async()=>snapshot,contentHash:value=>JSON.stringify(value)});
 assert.equal(assets.every(a=>a.protectedUserContent),true);assert.equal(assets.find(a=>a.type==='chapter_draft').scope,'chapter:1');
 assert.equal(assets.find(a=>a.type==='story_macro').status,'stale');assert.equal(assets.some(a=>a.type==='volume_strategy'),false);
 assert.equal(JSON.stringify(snapshot),before);
 assert.deepEqual(await inferExistingAssets(contract(),{read:async()=>[],contentHash:()=>''}),[]);
});
