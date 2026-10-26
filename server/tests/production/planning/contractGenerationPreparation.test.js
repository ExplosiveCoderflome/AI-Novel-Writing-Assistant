const test=require('node:test'),assert=require('node:assert/strict');
const api=require('../../../dist/services/novel/volume/ChapterExecutionContractService');
const {fixture}=require('./contractServiceFixture.cjs');
const {safe,candidate}=require('./contractFixture.cjs');
function readyFixture(){const f=fixture();f.workspace.beatSheets=[{volumeId:'volume-1',volumeSortOrder:1,status:'generated',
 beats:[{key:'opening',label:'开篇',title:'资源危机',summary:'交出线索后调查来源。',chapterSpanHint:'1-3',mustDeliver:['确认线索来源']}]}];return f;}
test('single chapter generation prepares full native input without invoking models or repairing workspace rows',async()=>{
 const f=readyFixture(),reads=[];
 const db={novel:{findUnique:async()=>({title:'测试',estimatedChapterCount:8,characters:[],primaryStoryMode:null,secondaryStoryMode:null})},
   chapter:{findFirst:async()=>{reads.push('previous');return {id:'previous',order:1,title:'前章',content:'完整前文。纸条来自旧钟。'};}},
   chapterSummary:{findFirst:async()=>({summary:'前章摘要'})}};
 f.workspace.volumes[0].chapters[0].chapterOrder=2;
 const prepared=await api.prepareChapterContractGeneration({novelId:'novel-1',workspace:f.workspace,
   targetVolumeId:'volume-1',targetChapterId:'volume-chapter-1',options:{provider:'openai',model:'test'},db,
   storyMacroPlanService:{getPlan:async()=>null}});
 assert.deepEqual(reads,['previous']);assert.equal(prepared.promptInput.previousChapterResult.content,'完整前文。纸条来自旧钟。');
 const requests=[];
 const document=await api.executePreparedChapterContractGeneration(JSON.parse(JSON.stringify(prepared)),{
   forceRegenerate:true,guidance:'保留前文来源',chapterTaskSheetQualityMode:'full_book_autopilot',
   chapterContractPorts:{invokePrompt:async request=>{requests.push(request);const output=candidate();return{output:{...output,sceneCards:JSON.parse(output.sceneCards).scenes}};},semanticAssessor:async()=>safe}});
 assert.equal(requests.length,1);assert.equal(requests[0].promptInput.guidance,'保留前文来源');
 assert.equal(requests[0].promptInput.previousChapterResult.content,'完整前文。纸条来自旧钟。');
 assert.equal(document.volumes[0].chapters[0].taskSheet,candidate().taskSheet);
});
test('strict generation source failure propagates before a model can run',async()=>{
 const f=readyFixture();await assert.rejects(()=>api.prepareChapterContractGeneration({novelId:'novel-1',workspace:f.workspace,
   targetVolumeId:'volume-1',targetChapterId:'volume-chapter-1',options:{},db:{novel:{findUnique:async()=>({title:'测试',characters:[]})}},
   storyMacroPlanService:{getPlan:async()=>{throw Error('macro source unavailable');}}}),/macro source unavailable/);
});
