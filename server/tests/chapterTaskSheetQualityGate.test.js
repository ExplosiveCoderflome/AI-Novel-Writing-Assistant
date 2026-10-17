const test = require("node:test");
const assert = require("node:assert/strict");

const {
  ChapterScenePlanNormalizationError,
} = require("../../shared/dist/types/chapterLengthControl.js");

const {
  assessChapterExecutionContractShape,
  aiChapterTaskSheetQualityAssessmentSchema,
  formatChapterTaskSheetQualityFailure,
} = require("../../shared/dist/types/chapterTaskSheetQuality.js");
const {
  ChapterTaskSheetQualityGateService,
} = require("../dist/services/novel/volume/ChapterTaskSheetQualityGateService.js");
const {
  canReuseChapterExecutionContract,
  shouldRetryChapterExecutionContract,
  generateChapterTaskSheetDetail,
} = require("../dist/services/novel/volume/chapterDetail/chapterExecutionContractGeneration.js");
const {
  ChapterTaskSheetQualityGateError,
} = require("../dist/services/novel/volume/ChapterTaskSheetQualityGateService.js");
const {
  inspectChapterExecutionContractReadiness,
} = require("../dist/services/novel/volume/chapterDetail/chapterExecutionContractReadiness.js");
const {
  chapterTaskSheetQualityPrompt,
} = require("../dist/prompting/prompts/novel/volume/chapterTaskSheetQuality.prompts.js");
const {
  getRegisteredPromptAsset,
} = require("../dist/prompting/registry.js");

function buildSceneCards() {
  return JSON.stringify({
    targetWordCount: 3000,
    lengthBudget: {
      targetWordCount: 3000,
      softMinWordCount: 2550,
      softMaxWordCount: 3450,
      hardMaxWordCount: 3750,
    },
    scenes: [
      {
        key: "scene-1",
        title: "入口压力",
        purpose: "让主角被迫正面处理新的资源危机。",
        mustAdvance: ["暴露危机来源"],
        mustPreserve: ["不提前解决最终对手"],
        entryState: "主角刚拿到异常线索。",
        exitState: "主角确认危机来自内部。",
        forbiddenExpansion: ["不要直接揭开幕后人身份"],
        targetWordCount: 1000,
      },
      {
        key: "scene-2",
        title: "主动试探",
        purpose: "让主角用低成本方案试探对方底线。",
        mustAdvance: ["获得一个可验证证据"],
        mustPreserve: ["保留关系张力"],
        entryState: "主角掌握第一条线索。",
        exitState: "对手被迫露出反常反应。",
        forbiddenExpansion: ["不要让冲突直接收束"],
        targetWordCount: 1000,
      },
      {
        key: "scene-3",
        title: "结尾钩子",
        purpose: "把局面推到下一章入口。",
        mustAdvance: ["留下更大的追查方向"],
        mustPreserve: ["不兑现下一章核心事件"],
        entryState: "主角确认对手有破绽。",
        exitState: "新证据指向更危险的入口。",
        forbiddenExpansion: ["不要提前解决下一章标题事件"],
        targetWordCount: 1000,
      },
    ],
  });
}

function buildCandidate(overrides = {}) {
  return {
    novelId: "novel-1",
    volumeId: "volume-1",
    chapterId: "chapter-1",
    chapterOrder: 1,
    title: "第一章 危机入局",
    summary: "主角发现资源危机并开始试探。",
    purpose: "推进主角从被动承压转为主动试探。",
    exclusiveEvent: "主角第一次确认资源危机来自内部。",
    endingState: "主角拿到第一份证据。",
    nextChapterEntryState: "主角带着证据进入下一轮试探。",
    conflictLevel: 45,
    revealLevel: 35,
    targetWordCount: 3000,
    mustAvoid: "不要提前揭示幕后主使，不要复写下一章核心事件。",
    payoffRefs: ["资源危机"],
    taskSheet: "本章以资源危机开场，主角从被动承压转为主动试探，结尾留下更危险的证据入口。",
    sceneCards: buildSceneCards(),
    ...overrides,
  };
}

test('quality observer retains the structured AI assessment without changing the legacy gate result',async()=>{
  const assessment={verdict:'repairable',safeToSync:false,loadRisk:'normal',recommendedHandling:'repair_contract',summary:'局部补充',issues:[],repairGuidance:['补足目标'],confidence:0.9};
  const gate=new ChapterTaskSheetQualityGateService(async()=>assessment);
  let observed;
  const result=await gate.evaluate(buildCandidate(),{mode:'full_book_autopilot',onEvaluated:async event=>{observed=event;}});
  assert.equal(result.canEnterExecution,true);
  assert.deepEqual(observed,{result,assessment});
  await assert.rejects(()=>gate.assertCanEnterExecution(buildCandidate(),{mode:'ai_copilot'}),ChapterTaskSheetQualityGateError);
});

test('task-sheet generation forwards the assessment once while preserving legacy return and rejection behavior',async()=>{
  const runner=require('../dist/prompting/core/promptRunner.js');
  const original=runner.runStructuredPrompt;
  const candidate=buildCandidate();
  const chapter={...candidate,id:candidate.chapterId,taskSheet:null,sceneCards:null};
  const assessment={verdict:'repairable',safeToSync:false,loadRisk:'normal',recommendedHandling:'repair_contract',summary:'局部目标需完善',issues:[],repairGuidance:['补足目标'],confidence:0.9};
  runner.runStructuredPrompt=async({asset})=>({output:asset.id===chapterTaskSheetQualityPrompt.id?assessment:{...candidate,sceneCards:JSON.parse(buildSceneCards()).scenes}});
  try {
    const events=[];
    const params={promptInput:{novel:{id:'novel-1',title:'测试小说',characters:[]},workspace:{novelId:'novel-1',volumes:[]},storyMacroPlan:null,strategyPlan:null,targetVolume:{id:'volume-1',sortOrder:1,title:'第一卷',chapters:[chapter],openPayoffs:[]},targetBeatSheet:null,targetChapter:chapter,detailMode:'task_sheet'},options:{chapterTaskSheetQualityMode:'full_book_autopilot',onChapterTaskSheetQuality:async event=>events.push(event)}};
    const detail=await generateChapterTaskSheetDetail(params);
    assert.ok(detail.taskSheet.startsWith(candidate.taskSheet));assert.ok(detail.taskSheet.includes('补足目标'));assert.equal(events.length,1);
    assert.equal(events[0].chapterId,chapter.id);assert.equal(events[0].chapterOrder,1);
    assert.deepEqual(events[0].assessment,assessment);
    await assert.rejects(()=>generateChapterTaskSheetDetail({...params,options:{chapterTaskSheetQualityMode:'ai_copilot'}}),ChapterTaskSheetQualityGateError);
  } finally {runner.runStructuredPrompt=original;}
});

test('a saved JSON scene plan is reused without falsely reporting missing scenes', async () => {
  const candidate=buildCandidate();
  const chapter={...candidate,id:candidate.chapterId};
  const detail=await generateChapterTaskSheetDetail({promptInput:{workspace:{novelId:candidate.novelId},targetVolume:{id:candidate.volumeId},targetChapter:chapter},options:{}});
  assert.equal(detail.taskSheet,candidate.taskSheet);
  assert.equal(JSON.parse(detail.sceneCards).scenes.length,3);
});

test('autopilot repairs a local plan once and only publishes the final assessment and guidance', async () => {
  const runner=require('../dist/prompting/core/promptRunner.js'), original=runner.runStructuredPrompt;
  const candidate=buildCandidate(), chapter={...candidate,id:candidate.chapterId,taskSheet:null,sceneCards:null};
  const previousChapterResult={chapterOrder:1,title:'前章',summary:'纸条来自旧钟，无信封。',tail:'他收好钟内纸条。'};
  const params={promptInput:{novel:{id:candidate.novelId,title:'测试',characters:[]},workspace:{novelId:candidate.novelId,volumes:[]},
    storyMacroPlan:null,strategyPlan:null,targetVolume:{id:candidate.volumeId,sortOrder:1,title:'一卷',chapters:[chapter],openPayoffs:[]},
    targetBeatSheet:null,targetChapter:chapter,detailMode:'task_sheet',previousChapterResult},options:{chapterTaskSheetQualityMode:'full_book_autopilot'}};
  const warning={verdict:'repairable',safeToSync:false,loadRisk:'normal',recommendedHandling:'repair_contract',summary:'来源冲突',issues:[],repairGuidance:['保留钟内纸条来源'],confidence:0.9};
  const safe={...warning,verdict:'safe',safeToSync:true,recommendedHandling:'sync',summary:'来源一致',repairGuidance:[]};
  try {
    for (const failure of [null,'shape','abort','transport','runtime']) {
      const calls=[],events=[]; let generations=0;
      const controller=new AbortController();
      runner.runStructuredPrompt=async input=>{
        calls.push(input);
        if (input.asset.id===chapterTaskSheetQualityPrompt.id) return {output:generations===1?warning:safe};
        generations++;
        if (generations===2 && failure) {
          if (failure==='abort') {controller.abort(); throw new Error('aborted');}
          if (failure==='transport') throw new (require('../dist/llm/structuredOutput').StructuredOutputError)({message:'transport failed',category:'transport_error',diagnostics:{}});
          if (failure==='runtime') throw Error('data integrity failed');
          throw Object.assign(Error('shape invalid'),{promptQualityFailureKind:'post_validate_failed'});
        }
        return {output:{...candidate,sceneCards:JSON.parse(candidate.sceneCards).scenes}};
      };
      const promise=generateChapterTaskSheetDetail({...params,options:{...params.options,signal:controller.signal,onChapterTaskSheetQuality:e=>events.push(e)}});
      if (['abort','transport','runtime'].includes(failure)) {
        await assert.rejects(promise); assert.equal(events.length,0);
      } else {
        const detail=await promise;
        assert.equal(events.length,1);
        assert.equal(events[0].assessment.verdict,failure?'repairable':'safe');
        assert.equal(detail.taskSheet.includes('保留钟内纸条来源'),Boolean(failure));
      }
      assert.equal(generations,2);
      const second=calls.filter(c=>c.asset.id!==chapterTaskSheetQualityPrompt.id)[1];
      assert.ok(second.promptInput.guidance.includes('保留钟内纸条来源'));
      assert.ok(second.contextBlocks.find(b=>b.id==='previous_chapter_result').content.includes('无信封'));
      assert.deepEqual(calls.find(c=>c.asset.id===chapterTaskSheetQualityPrompt.id).promptInput.candidate.previousChapterResult,previousChapterResult);
    }
  } finally {runner.runStructuredPrompt=original;}
});

test('explicit regeneration bypasses a complete saved contract with or without guidance', async () => {
  const runner=require('../dist/prompting/core/promptRunner.js'),original=runner.runStructuredPrompt;
  const candidate=buildCandidate(),chapter={...candidate,id:candidate.chapterId};
  const calls=[];
  runner.runStructuredPrompt=async input=>{
    calls.push(input);
    return {output:input.asset.id===chapterTaskSheetQualityPrompt.id
      ? {verdict:'safe',safeToSync:true,loadRisk:'normal',recommendedHandling:'sync',summary:'可用',issues:[],repairGuidance:[],confidence:0.9}
      : {...candidate,taskSheet:'重写后的任务',sceneCards:JSON.parse(candidate.sceneCards).scenes}};
  };
  try {
    for (const guidance of [undefined,'保留残符，让主角主动试探']) {
      calls.length=0;
      const detail=await generateChapterTaskSheetDetail({promptInput:{novel:{id:candidate.novelId,title:'测试',characters:[]},workspace:{novelId:candidate.novelId,volumes:[]},storyMacroPlan:null,strategyPlan:null,targetVolume:{id:candidate.volumeId,sortOrder:1,title:'一卷',chapters:[chapter],openPayoffs:[]},targetBeatSheet:null,targetChapter:chapter,detailMode:'task_sheet',guidance},options:{forceRegenerate:true,chapterTaskSheetQualityMode:'full_book_autopilot'}});
      assert.equal(detail.taskSheet,'重写后的任务');
      assert.equal(calls.find(call=>call.asset.id!==chapterTaskSheetQualityPrompt.id)?.promptInput.guidance,guidance);
    }
  } finally {runner.runStructuredPrompt=original;}
});

test("incomplete persisted contracts are regenerated instead of reused", () => {
  const complete = buildCandidate();
  const chapter = {
    ...complete,
    id: complete.chapterId,
  };

  assert.equal(canReuseChapterExecutionContract({
    novelId: complete.novelId,
    volumeId: complete.volumeId,
    chapter,
  }), true);

  assert.equal(canReuseChapterExecutionContract({
    novelId: complete.novelId,
    volumeId: complete.volumeId,
    chapter: {
      ...chapter,
      purpose: null,
      targetWordCount: null,
    },
  }), false);
});

test("contract readiness distinguishes structural completeness from current requirement compatibility", () => {
  const requirement = {
    ...buildCandidate(),
    id: "volume-chapter-1",
    chapterId: "chapter-1",
    volumeId: "volume-1",
    chapterOrder: 1,
    payoffRefs: ["资源危机"],
    createdAt: "2026-09-08T00:00:00.000Z",
    updatedAt: "2026-09-08T00:00:00.000Z",
  };
  const persisted = {
    targetWordCount: requirement.targetWordCount,
    conflictLevel: requirement.conflictLevel,
    revealLevel: requirement.revealLevel,
    mustAvoid: requirement.mustAvoid,
    taskSheet: requirement.taskSheet,
    sceneCards: requirement.sceneCards,
  };

  const compatible = inspectChapterExecutionContractReadiness({
    novelId: "novel-1",
    volumeId: "volume-1",
    requirement,
    persisted,
  });
  assert.equal(compatible.structure.canEnterExecution, true);
  assert.equal(compatible.compatibility, "compatible");
  assert.equal(compatible.canReuse, true);

  const stale = inspectChapterExecutionContractReadiness({
    novelId: "novel-1",
    volumeId: "volume-1",
    requirement: {
      ...requirement,
      mustAvoid: "不要提前揭示幕后主使，也不要让主角离开当前地点。",
    },
    persisted,
  });
  assert.equal(stale.structure.canEnterExecution, true);
  assert.equal(stale.compatibility, "incompatible");
  assert.deepEqual(stale.mismatchedFields, ["mustAvoid"]);
  assert.equal(stale.canReuse, false);

  const incomplete = inspectChapterExecutionContractReadiness({
    novelId: "novel-1",
    volumeId: "volume-1",
    requirement: { ...requirement, purpose: null },
    persisted,
  });
  assert.equal(incomplete.structure.canEnterExecution, false);
  assert.equal(incomplete.compatibility, "compatible");
  assert.equal(incomplete.canReuse, false);
});

test("chapter execution contract does not retry a semantic quality warning", () => {
  const qualityError = new ChapterTaskSheetQualityGateError({
    status: "repairable",
    canEnterExecution: false,
    summary: "合同需要局部修正。",
    issues: [],
    repairGuidance: ["修正章节边界。"],
    confidence: 0.8,
  });
  const postValidateError = Object.assign(new Error("章节边界不一致"), {
    promptQualityFailureKind: "post_validate_failed",
  });

  assert.equal(shouldRetryChapterExecutionContract(qualityError, 0), false);
  assert.equal(shouldRetryChapterExecutionContract(qualityError, 1), false);
  assert.equal(shouldRetryChapterExecutionContract(postValidateError, 0), true);
  assert.equal(shouldRetryChapterExecutionContract(
    new ChapterScenePlanNormalizationError("scene_count_below_minimum", "章节场景拆解至少需要 3 个有效场景。"),
    0,
  ), true);
  assert.equal(shouldRetryChapterExecutionContract(new Error("terminated"), 0), false);
});

test("chapter execution contract shape gate blocks invalid task sheet artifacts", () => {
  const result = assessChapterExecutionContractShape(buildCandidate({
    taskSheet: "",
    sceneCards: null,
  }));

  assert.equal(result.canEnterExecution, false);
  assert.equal(result.status, "repairable");
  assert.ok(result.issues.some((issue) => issue.id === "missing_task_sheet"));
  assert.ok(result.issues.some((issue) => issue.id === "invalid_scene_cards"));
  assert.match(formatChapterTaskSheetQualityFailure(result), /章节执行合同/);
});

test("chapter task sheet quality service lets full book mode continue with semantic warnings", async () => {
  const service = new ChapterTaskSheetQualityGateService(async () => ({
    verdict: "repairable",
    safeToSync: false,
    summary: "任务单可修复，但当前版本仍会越界。",
    issues: [
      {
        id: "semantic_boundary_leak",
        severity: "high",
        target: "semantic",
        summary: "任务单提前兑现下一章事件。",
        repairHint: "把下一章事件改成入口钩子，不要在本章完成。",
      },
    ],
    repairGuidance: ["收回下一章事件，只保留下章入口。"],
    confidence: 0.82,
  }));

  const result = await service.evaluate(buildCandidate(), {
    mode: "full_book_autopilot",
  });

  assert.equal(result.canEnterExecution, true);
  assert.equal(result.status, "repairable");
  assert.equal(result.issues[0].id, "semantic_boundary_leak");
});

test("chapter task sheet quality schema normalizes common assessment enum drift", () => {
  const parsed = aiChapterTaskSheetQualityAssessmentSchema.parse({
    verdict: "pass",
    safeToSync: true,
    loadRisk: "normal",
    recommendedHandling: "use_as_is",
    summary: "任务单可进入正文生成。",
    issues: [{
      id: "pacing_issue",
      severity: "medium",
      target: "pacing",
      summary: "节奏段缺少阶段性转向。",
      repairHint: "把一章改成主动反击或阶段兑现。",
    }],
    repairGuidance: [],
    confidence: 85,
  });

  assert.equal(parsed.verdict, "usable");
  assert.equal(parsed.issues[0].target, "semantic");
  assert.equal(parsed.confidence, 0.85);
});

test("chapter task sheet quality prompt declares strict JSON contract", () => {
  const messages = chapterTaskSheetQualityPrompt.render({
    candidate: buildCandidate(),
    mode: "full_book_autopilot",
  });
  const systemText = String(messages[0].content);

  assert.match(systemText, /verdict 只能使用 usable、repairable、unusable/);
  assert.match(systemText, /issues\.target 只能使用 purpose、boundary、task_sheet、scene_cards、semantic/);
  assert.match(systemText, /readerExperience\.rewardLevel 表示本章计划提供的可见回报强度/);
  assert.match(systemText, /只能使用 setup、partial、major/);
  assert.match(systemText, /完整兑现了 promisedReward，也不要建议把 rewardLevel 改为 full/);
  assert.match(systemText, /confidence 必须是 0 到 1 之间的小数/);
  assert.match(systemText, /"verdict": "repairable"/);
});

test("chapter task sheet quality service marks overloaded contracts for window replan", async () => {
  const service = new ChapterTaskSheetQualityGateService(async () => ({
    verdict: "repairable",
    safeToSync: false,
    loadRisk: "overloaded",
    recommendedHandling: "replan_window",
    summary: "本章同时承担多条 payoff 和多名角色转折，职责过载。",
    issues: [],
    repairGuidance: ["把其中一条 payoff 和一个角色转折拆到下一章。"],
    confidence: 0.86,
  }));

  const result = await service.evaluate(buildCandidate(), {
    mode: "full_book_autopilot",
  });

  assert.equal(result.canEnterExecution, true);
  assert.equal(result.status, "repairable");
  assert.ok(result.issues.some((issue) => issue.id === "contract_overloaded"));
});

test("chapter task sheet quality service passes usable semantic assessments", async () => {
  const service = new ChapterTaskSheetQualityGateService(async () => ({
    verdict: "usable",
    safeToSync: true,
    summary: "任务单和场景卡可进入正文生成。",
    issues: [],
    repairGuidance: [],
    confidence: 0.9,
  }));

  const result = await service.evaluate(buildCandidate(), {
    mode: "ai_copilot",
  });

  assert.equal(result.canEnterExecution, true);
  assert.equal(result.status, "passed");
  assert.equal(result.confidence, 0.9);
});

test("chapter task sheet quality prompt is registered as a product prompt asset", () => {
  const registered = getRegisteredPromptAsset("novel.volume.chapter_task_sheet_quality", "v4");
  assert.equal(registered, chapterTaskSheetQualityPrompt);
});
