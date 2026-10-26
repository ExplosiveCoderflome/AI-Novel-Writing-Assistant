const test=require('node:test'),assert=require('node:assert/strict');
const kernel=require('../../../dist/modules/production');
const runner=require('../../../dist/prompting/core/promptRunner');
const resolution=require('../../../dist/prompting/context/promptContextResolution');
const {input,patchInput}=require('../prompts/nativeFixture.cjs');
const customBlock={id:'custom',group:'chapter_mission',priority:100,required:true,estimatedTokens:4,content:'自定义完整上下文'};
async function captureAcceptance(value,resolver){
 const oldRun=runner.runStructuredPrompt,oldResolve=resolution.resolvePromptContextBlocksForAsset;let captured;
 try{
  runner.runStructuredPrompt=async request=>(captured=request,{output:{}});
  resolution.resolvePromptContextBlocksForAsset=resolver;
  const {ChapterAcceptanceAssessmentService}=require('../../../dist/services/novel/runtime/ChapterAcceptanceAssessmentService');
  await new ChapterAcceptanceAssessmentService().invokeAssessment(value);
  return captured;
 }finally{runner.runStructuredPrompt=oldRun;resolution.resolvePromptContextBlocksForAsset=oldResolve;}
}
async function capturePatch(value){
 const old=runner.runStructuredPrompt;let captured;
 try{
  runner.runStructuredPrompt=async request=>{captured=request;throw new Error('captured-before-provider')};
  const {ChapterPatchRepairService}=require('../../../dist/services/novel/chapterPatchRepairService');
  await assert.rejects(()=>new ChapterPatchRepairService().repair(value),/captured-before-provider/);return captured;
 }finally{runner.runStructuredPrompt=old;}
}
for(const mode of ['original','candidate','style-and-custom-context'])test(`readonly acceptance request matches actual native fields: ${mode}`,async()=>{
 assert.equal(typeof kernel.buildKernelAcceptancePromptRequest,'function','readonly acceptance request builder must be public');
 const value=input(mode==='style-and-custom-context'),before=JSON.stringify(value);
 if(mode==='candidate')Object.assign(value,{targetWordCount:3200,temperature:0.9,repairReviewBaseline:{blockingIssues:[],repairDirectives:[],missingObligations:[]},
  styleRewriteBaseline:{sourceContentHash:'original-hash',allowedCorrectionIssueIds:['audit-1'],changes:[{original:'交出',replacement:'递出'}]}});
 const resolver=async request=>({blocks:[...request.fallbackBlocks,customBlock]});
 const built=await kernel.buildKernelAcceptancePromptRequest(value,resolver),native=await captureAcceptance(value,resolver);
 assert.deepEqual(built,native);assert.equal(built.promptInput.content,value.content);assert.equal(built.promptInput.previousChapterContent,'前章完整正文');
 assert.equal(built.options.maxTokens,mode==='candidate'?6144:4096);assert.ok(built.contextBlocks.some(block=>block.content==='自定义完整上下文'));
 if(mode==='candidate'){assert.equal(built.options.temperature,0.35);assert.deepEqual(built.promptInput.styleRewriteBaseline.allowedCorrectionIssueIds,['audit-1']);}
 if(mode==='style-and-custom-context'){assert.equal(built.promptInput.styleReviewEnabled,true);assert.deepEqual(built.promptInput.styleRuleIds,['report-only']);assert.ok(built.promptInput.styleSignals);}
 if(mode!=='candidate')assert.equal(JSON.stringify(value),before);
});
for(const styled of [false,true])test(`readonly patch request retains the native permission and protection payload: ${styled}`,async()=>{
 assert.equal(typeof kernel.buildKernelPatchPromptRequest,'function','readonly patch request builder must be public');
 const value=patchInput(styled);value.temperature=0.9;const before=JSON.stringify(value);
 const built=kernel.buildKernelPatchPromptRequest(value),native=await capturePatch(value);
 assert.deepEqual(built,native);assert.equal(built.promptInput.chapterContent,'阿青交出钥匙。');assert.equal(built.options.maxTokens,4200);assert.equal(built.options.temperature,0.45);
 if(styled){const protection=JSON.parse(built.promptInput.styleProtection);
  assert.deepEqual(protection.allowedIssueIds,['voice-gap','audit-1','plot-gap','must_preserve:钥匙归属']);assert.deepEqual(protection.protectedTerms,['阿青']);
  assert.deepEqual(protection.reportOnly.map(x=>x.issueCode),['report-only']);assert.ok(built.contextBlocks.some(block=>block.content.includes('钥匙只能交出一次')));
 }else assert.equal(built.promptInput.styleProtection,undefined);
 assert.equal(JSON.stringify(value),before);
});
test('building native requests never invokes the model runner',async()=>{
 assert.equal(typeof kernel.buildKernelAcceptancePromptRequest,'function');assert.equal(typeof kernel.buildKernelPatchPromptRequest,'function');
 const old=runner.runStructuredPrompt;runner.runStructuredPrompt=async()=>{throw new Error('model invoked during preflight')};
 try{await kernel.buildKernelAcceptancePromptRequest(input(),async()=>({blocks:[]}));kernel.buildKernelPatchPromptRequest(patchInput());}
 finally{runner.runStructuredPrompt=old;}
});
