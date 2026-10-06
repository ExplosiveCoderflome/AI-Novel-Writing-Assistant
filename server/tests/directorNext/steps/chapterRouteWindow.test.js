const test=require('node:test'),assert=require('node:assert/strict');
const {createChapterRouteWindowStepHandler}=require('../../../dist/modules/director/steps');
const context={runId:'run',contract:{novelId:'book',scope:'chapters:7-20',chapterRange:{from:7,to:20}}};
const chapter=chapterOrder=>({id:'plan-'+chapterOrder,chapterOrder,title:'第'+chapterOrder+'章'});
const workspace={novelId:'book',volumes:[{id:'v1',chapters:Array.from({length:8},(_,i)=>chapter(i+7))}]};
function setup(saved=workspace){const calls=[];return{calls,handler:createChapterRouteWindowStepHandler({
 inputProvider:async()=>({targetVolumeId:'v1',provider:'openai',model:'saved-model',temperature:0.2}),
 routeService:{ensureRouteWindow:async(...args)=>{calls.push(['window',...args]);return{availableRouteCount:99,extended:true};}},
 volumeService:{getVolumes:async id=>{calls.push(['read',id]);return saved;}},contentHash:value=>{calls.push(['hash',value]);return 'saved-hash';}
})};}
test('production prepares a bounded saved route window instead of a full volume',async()=>{
 const {handler,calls}=setup();const result=await handler(context);
 assert.deepEqual(calls[0],['window','book',7,{min:3,target:5,provider:'openai',model:'saved-model',temperature:0.2,taskId:'run'}]);
 assert.deepEqual(calls[2],['hash',workspace.volumes[0].chapters.slice(0,5)]);
 assert.equal(result.artifact.scope,'chapters:7-20');assert.equal(result.artifact.contentHash,'saved-hash');
});
test('short authorized range requires only its remaining chapters',async()=>{
 const {handler,calls}=setup();await handler({...context,contract:{...context.contract,chapterRange:{from:7,to:8}}});
 assert.equal(calls[0][3].min,2);assert.equal(calls[0][3].target,2);assert.equal(calls[2][1].length,2);
});
test('reported counts cannot hide missing, duplicate or foreign saved routes',async()=>{
 for(const saved of [{...workspace,novelId:'foreign'},{...workspace,volumes:[{id:'v1',chapters:[chapter(7),chapter(9),chapter(10)]}]},{...workspace,volumes:[{id:'v1',chapters:[chapter(7),chapter(7),chapter(8),chapter(9)]}]},{...workspace,volumes:[{id:'other',chapters:workspace.volumes[0].chapters}]}]){
  const {handler,calls}=setup(saved);await assert.rejects(()=>handler(context));assert.equal(calls.some(c=>c[0]==='hash'),false);
 }
});
test('no route generation is allowed without a valid explicit chapter range',async()=>{
 for(const chapterRange of [null,{from:0,to:5},{from:7,to:6}]){const {handler,calls}=setup();await assert.rejects(()=>handler({...context,contract:{...context.contract,chapterRange}}));assert.equal(calls.length,0);}
});
