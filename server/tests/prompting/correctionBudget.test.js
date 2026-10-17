const test=require('node:test'),assert=require('node:assert/strict');
const {z}=require('zod');
const {runStructuredPrompt,setPromptRunnerStructuredInvokerForTests}=require('../../dist/prompting/core/promptRunner');
const registered=require('../../dist/prompting/prompts/novel/chapterAcceptance.prompts').chapterAcceptanceAssessmentPrompt;

test('acceptance can share structural and semantic correction allowance without changing other assets',async()=>{
  for(const [structuralRepairs,shared,expectedCalls] of [[1,1,1],[0,1,2],[1,undefined,2]]){
    const calls=[];
    const asset={id:registered.id,version:registered.version,taskType:'review',mode:'structured',
      contextPolicy:{maxTokensBudget:100},outputSchema:z.object({valid:z.boolean()}),render:()=>[],
      semanticRetryPolicy:{maxAttempts:1,sharedCorrectionBudget:shared},
      postValidate:output=>{if(!output.valid)throw Error('evidence invalid');return output;},
      postValidateFailureRecovery:()=>({valid:false,degraded:true}),
    };
    setPromptRunnerStructuredInvokerForTests(async input=>{
      calls.push(input);return{data:{valid:calls.length>1},repairUsed:structuralRepairs>0,repairAttempts:calls.length===1?structuralRepairs:0};
    });
    try{
      const result=await runStructuredPrompt({asset,promptInput:{}});
      assert.equal(calls.length,expectedCalls);
      assert.equal(result.output.valid,expectedCalls>1);
      if(calls.length>1){
        assert.equal(calls[1].maxRepairAttempts,shared===1?0:1);
        assert.equal(calls[1].fallbackMaxRepairAttempts,shared===1?0:1);
      }
    }finally{setPromptRunnerStructuredInvokerForTests();}
  }
});
