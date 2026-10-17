const test=require('node:test');
const assert=require('node:assert/strict');
const {loadRuntimeSource,createPipelineHarness}=require('./sourceHarness.cjs');

test('unavailable acceptance retains saved content and quality debt without publishing a quality grade',async()=>{
  const h=createPipelineHarness({scores:[0],acceptanceMeta:{riskTags:['acceptance_gate_unavailable']}});
  const result=await h.run();
  assert.equal(result.reviewExecuted,false); assert.equal(result.pass,false);
  assert.equal(h.content,'original draft'); assert.ok(h.events.includes('reviewed'));
  const reports=[],assessments=[],issues=[];
  const {applyChapterQualityClosure}=loadRuntimeSource('../production/qualityClosure/ChapterQualityClosure.ts',{
    '@ai-novel/shared/types/directorIssue': require('../../../shared/dist/types/directorIssue'),
    '../../novelCoreShared':{logPipelineWarn:()=>{},logPipelineError:()=>{}},
    '../../novelCoreReviewService':{createQualityReport:async(...args)=>reports.push(args)},
    '../../quality/ChapterQualityLoopService':{chapterQualityLoopService:{recordAssessment:async input=>assessments.push(input)}},
    '../issueGovernance/PipelineIssueGovernance':{reportPipelineIssue:async input=>issues.push(input)},
  });
  const closed=await applyChapterQualityClosure({governance:null,novelId:'n',jobId:'job',chapter:{id:'c',order:1},chapterResult:result,
    qualityThreshold:75,runtimePayload:{autoReview:true},qualityAlertDetails:[],replanAlertDetails:[],recoverableRepairDetails:[],runLocalReplan:async()=>{throw Error('no replan');}});
  assert.equal(closed.shouldStopAfterCurrentChapter,false);
  assert.equal(reports.length,0); assert.equal(assessments.length,1);
  assert.equal(assessments[0].terminalAction,'defer_and_continue');
  assert.ok(issues.some(i=>i.issueCode==='quality.acceptance_unavailable'));
});
