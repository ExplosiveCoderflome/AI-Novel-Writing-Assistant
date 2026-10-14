const assert = require("node:assert/strict");
const test = require("node:test");

const { volumeDocumentSchema } = require("../dist/modules/novel/http/novelHttpSchemas.js");
const { aiRevisionPreviewSchema } = require("../dist/modules/novel/http/novelHttpSchemas.js");

test("volume workspace schema keeps critique-only saves from clearing volumes", () => {
  const parsed = volumeDocumentSchema.parse({ critiqueReport: null });

  assert.equal(Object.hasOwn(parsed, "volumes"), false);
});

const repairRequest = {
  source: 'preset', scope: 'selection', presetOperation: 'compress', contentSnapshot: 'alpha',
  selection: {from:0,to:5,text:'alpha'},
  context: {beforeParagraphs:[],afterParagraphs:[]},
  constraints: {keepFacts:true,keepPov:true,noUnauthorizedSetting:true,preserveCoreInfo:true},
  repairBrief: {title:'痛感重复',problemSummary:'连续描写相同痛感',whyItMatters:'拖慢危机推进',
    repairGoal:'压缩重复，保留关键线索',repairApproach:'只删重复的身体感受',mustPreserve:['保留黑石裂纹线索']},
};

test('chapter repair HTTP schema preserves the specific diagnostic brief',()=>{
  assert.deepEqual(aiRevisionPreviewSchema.parse(repairRequest).repairBrief,repairRequest.repairBrief);
});

test('chapter repair HTTP schema rejects an oversized diagnostic goal',()=>{
  assert.throws(()=>aiRevisionPreviewSchema.parse({...repairRequest,repairBrief:{...repairRequest.repairBrief,repairGoal:'x'.repeat(1001)}}));
});
