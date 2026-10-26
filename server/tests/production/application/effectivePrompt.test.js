const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const target=path.resolve(__dirname,'../../../dist/prompting/execution/describePrompt.js');
const api=fs.existsSync(target)?require(target):{};
const runner=require('../../../dist/prompting/core/promptRunner');
const {promptSlotOverrideService:slots}=require('../../../dist/prompting/slots/PromptSlotOverrideService');
const {promptTemplateOverrideService:templates}=require('../../../dist/prompting/templates/PromptTemplateOverrideService');
const {chapterWriterPrompt}=require('../../../dist/prompting/prompts/novel/chapterWriter.prompts');
const {chapterPatchRepairPrompt}=require('../../../dist/prompting/prompts/novel/chapterPatchRepair.prompts');
const {resolvePromptOverlays}=require('../../../dist/prompting/slots/slotResolution');
const {getRequiredTemplateContextGroups}=require('../../../dist/prompting/templates/templateTypes');
const messages=value=>value.map(message=>({role:message.getType(),content:message.content}));
function setup(t){
 assert.equal(typeof api.prepareEffectivePromptExecution,'function','readonly effective Prompt rendering must be available');
 const beforeSlots=slots.resolveForRuntime,beforeTemplate=templates.getActiveCustomTemplate;
 const state={append:'预检追加上下文',template:false};let dispatched=0;
 slots.resolveForRuntime=async({promptId})=>resolvePromptOverlays({slotDefs:(promptId===chapterWriterPrompt.id?chapterWriterPrompt:chapterPatchRepairPrompt).slots??[],
  globalOverrides:{},novelOverrides:{}});
 templates.getActiveCustomTemplate=async()=>state.template?{template:{kind:'chat',messages:[{role:'system',content:'模板规则 '+state.append},{role:'human',content:'{{input.novelTitle}} 完整上下文\n'+getRequiredTemplateContextGroups(chapterWriterPrompt.id).map(group=>'{{context.'+group+'}}').join('\n')}]}}:null;
 t.after(()=>{slots.resolveForRuntime=beforeSlots;templates.getActiveCustomTemplate=beforeTemplate;runner.setPromptRunnerLLMFactoryForTests();runner.setPromptRunnerStructuredInvokerForTests();});
 const blocks=getRequiredTemplateContextGroups(chapterWriterPrompt.id).map(group=>({id:group,group,priority:100,required:true,estimatedTokens:10,content:'保留 '+group}));
 return{state,blocks,get dispatched(){return dispatched},captureText:()=>{let actual;runner.setPromptRunnerLLMFactoryForTests(async()=>({stream:async function*(value){dispatched++;actual=messages(value);yield{content:'测试正文'}}}));return()=>actual;},
  captureStructured:()=>{let actual;runner.setPromptRunnerStructuredInvokerForTests(async value=>{dispatched++;actual=messages(value.messages);return{data:{strategy:'patch_first',summary:'完成',patches:[],requiresFullRewrite:false,escalationReason:null},rawContent:'{}',repairUsed:false,repairAttempts:0,tokenUsage:null}});return()=>actual;}};
}
test('readonly writer rendering matches actual custom-template messages with every required context group',async t=>{
 const f=setup(t);f.state.template=true;const capture=f.captureText();
 const request={asset:chapterWriterPrompt,promptInput:{novelTitle:'完整书名',chapterOrder:1,chapterTitle:'章',mode:'draft',targetWordCount:2000,minWordCount:1500,maxWordCount:2500},contextBlocks:f.blocks,options:{novelId:'novel-1',chapterId:'chapter-1',provider:'openai',model:'fixture',maxTokens:6000}};
 const described=await api.prepareEffectivePromptExecution(request);assert.equal(f.dispatched,0);
 await runner.runTextPrompt(request);assert.deepEqual(messages(described.messages),capture());
 assert.equal(described.messages[0].content,'模板规则 预检追加上下文');
 for(const group of getRequiredTemplateContextGroups(chapterWriterPrompt.id))assert.ok(described.messages.some(m=>String(m.content).includes('保留 '+group)),group);
});
test('readonly structured rendering includes the complete manuscript and the exact native structured-output hints',async t=>{
 const f=setup(t),capture=f.captureStructured();const content='首段完整正文。\n'+'中段内容。'.repeat(1000)+'尾段必须保留。';
 const request={asset:chapterPatchRepairPrompt,promptInput:{novelTitle:'书',chapterTitle:'章',chapterContent:content,issuesJson:'[]'},options:{novelId:'novel-1',chapterId:'chapter-1',provider:'openai',model:'fixture',maxTokens:4200}};
 const described=await api.prepareEffectivePromptExecution(request);assert.equal(f.dispatched,0);
 await runner.runStructuredPrompt(request);assert.deepEqual(messages(described.messages),capture());
 assert.ok(described.messages.some(m=>String(m.content).includes(content)));assert.ok(described.messages.some(m=>String(m.content).includes('JSON')));
});
test('effective rendering changes when the published slot overlay changes, without model dispatch',async t=>{
 const f=setup(t);const raw=slots.resolveForRuntime;
 slots.resolveForRuntime=async input=>({...await raw(input),appendBlocks:[{id:'custom_slot:fixture',group:'custom_slot',priority:999,required:true,estimatedTokens:2,content:f.state.append}]});
 const request={asset:chapterWriterPrompt,promptInput:{novelTitle:'书',chapterOrder:1,chapterTitle:'章',mode:'draft'},contextBlocks:f.blocks,options:{novelId:'novel-1'}};
 const first=messages((await api.prepareEffectivePromptExecution(request)).messages);f.state.append='另一份完整追加内容';
 const second=messages((await api.prepareEffectivePromptExecution(request)).messages);
 assert.notDeepEqual(first,second);assert.ok(JSON.stringify(second).includes('另一份完整追加内容'));assert.equal(f.dispatched,0);
});
