const test=require('node:test');const assert=require('node:assert/strict');
const {resolveChapterQualityReports}=require('../../../dist/modules/director/steps');
const report=handling=>({chapterId:'p1',chapterOrder:1,result:{status:'warning',canEnterExecution:true,issues:[{id:'obligation',summary:'本章义务过多'}]},assessment:{recommendedHandling:handling}});
test('the adapter projects explicit AI replan and repair decisions without prose classification',()=>{
 assert.equal(resolveChapterQualityReports([report('replan_window')]).action,'stop_for_replan');
 assert.equal(resolveChapterQualityReports([report('repair_contract')]).action,'local_patch_plan');
 assert.equal(resolveChapterQualityReports([report('use_as_is')]).action,'continue_with_warning');
});
test('missing or unknown AI decisions fail instead of using fallback matching',()=>{
 assert.throws(()=>resolveChapterQualityReports([{...report('use_as_is'),assessment:undefined}]),/AI/);
 assert.throws(()=>resolveChapterQualityReports([report('unknown')]),/AI/);
});
