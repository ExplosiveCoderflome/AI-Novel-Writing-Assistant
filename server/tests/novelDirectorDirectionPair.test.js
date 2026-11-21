const test = require("node:test");
const assert = require("node:assert/strict");
const { getRegisteredPromptAsset } = require("../dist/prompting/registry.js");
const runner = require("../dist/prompting/core/promptRunner.js");
const candidateCalls = require("../dist/services/novel/director/phases/candidateStructuredCall.js");
const { NovelDirectorCandidateStageService } = require("../dist/services/novel/director/phases/novelDirectorCandidateStage.js");
const { novelCreateResourceRecommendationService } = require("../dist/services/novel/NovelCreateResourceRecommendationService.js");
const { titleGenerationService } = require("../dist/services/title/TitleGenerationService.js");
const { directorPersistedCandidateSchema } = require("../dist/services/novel/director/runtime/novelDirectorSchemas.js");

const directions = {
  A: { choice: "冒领阵亡者的家书，查清谁在吃空饷", engine: "每次替人领信都要假扮另一个人，暴露风险逼他换取下一份证词。" },
  B: { choice: "用阵亡名册抢在追兵前转移活人", engine: "每救一户就失去一处藏身地，下一次转移必须重新争取沿途村民。" },
};
const plan = getRegisteredPromptAsset("novel.director.direction_pair", "v1");
const expand = getRegisteredPromptAsset("novel.director.candidates", "v3");

function card(title, direction) {
  return {
    workingTitle: title, logline: direction.choice, positioning: "边关悬疑", sellingPoint: direction.choice,
    coreConflict: direction.choice, protagonistPath: "从求生到为他人冒险", endingDirection: "承担选择的代价",
    hookStrategy: direction.choice, progressionLoop: direction.engine, whyItFits: "围绕题设中的名册展开",
    toneKeywords: ["紧迫", "边关"], targetChapterCount: 90,
    recommendedWritingPlatform: "qidian_male", writingPlatformReason: "适合长篇连载",
  };
}
// Deliberately return B first: a direction belongs to its key, not the order of JSON properties.
const cards = { B: card("逆流渡口", directions.B), A: card("亡人来信", directions.A) };

test("新轮次需要两条完整且不同的路线，旧版候选仍可读取", () => {
  assert.ok(!plan.outputSchema.safeParse({ A: directions.A }).success);
  assert.ok(!plan.outputSchema.safeParse({ ...directions, B: { choice: " ", engine: "寻人" } }).success);
  assert.throws(() => plan.postValidate({ A: directions.A, B: directions.A }), /重复/);
  assert.throws(() => expand.postValidate({ A: cards.A, B: { ...cards.B, progressionLoop: cards.A.progressionLoop } }), /重复/);
  assert.ok(!expand.outputSchema.safeParse({ A: cards.A }).success);
  assert.throws(() => expand.render({ idea: "一封家书", context: {}, count: 2, batches: [], presets: [] }, { blocks: [] }));
  assert.ok(getRegisteredPromptAsset("novel.director.candidates", "v2").outputSchema.safeParse({ candidates: [cards.A, cards.B] }).success);
  assert.equal(directorPersistedCandidateSchema.parse({ id: "old", ...cards.A }).plannedDirection, undefined);
});

test("首轮和换一批先定方向，展开时按键对应并保留书名重配前的选择句", async t => {
  const idea = "边关小卒从一张阵亡名册上看见了自己的名字";
  const feedback = "想多看小卒主动救人的选择";
  const foundation = { genre: { path: "历史架空" } };
  t.mock.method(novelCreateResourceRecommendationService, "resolveRequired", async () => ({
    recommendation: foundation, promptBlock: "历史架空，边关悬疑",
  }));
  t.mock.method(titleGenerationService, "generateTitleIdeas", async () => ({ titles: [] }));
  const calls = [];
  function render(call) {
    return call.asset.render(call.promptInput, {
      blocks: call.contextBlocks, selectedBlockIds: call.contextBlocks.map(block => block.id),
    }).map(message => message.content).join("\n");
  }
  const planningCall = t.mock.method(runner, "runStructuredPrompt", async call => {
    calls.push("plan");
    assert.equal(call.asset, plan);
    const prompt = render(call);
    assert.ok(prompt.includes(idea) && prompt.includes("历史架空"));
    if (call.promptInput.batches.length) {
      assert.ok(prompt.includes(feedback) && prompt.includes(directions.A.choice) && prompt.includes("冲突更强"));
    }
    return { output: plan.postValidate(plan.outputSchema.parse(directions)) };
  });
  t.mock.method(candidateCalls, "runCandidateStructuredCall", async call => {
    calls.push("expand");
    assert.equal(call.asset, expand);
    const prompt = render(call);
    assert.ok(prompt.includes(directions.A.engine) && prompt.includes(directions.B.engine));
    return { output: expand.postValidate(expand.outputSchema.parse(cards)) };
  });
  const service = new NovelDirectorCandidateStageService({});
  const first = await service.generateCandidates({ idea });
  const next = await service.refineCandidates({ idea, previousBatches: [first.batch], presets: ["stronger_conflict"], feedback });
  assert.deepEqual(calls, ["plan", "expand", "plan", "expand"]);
  assert.equal(next.batch.round, 2);
  for (const batch of [first.batch, next.batch]) {
    assert.deepEqual(batch.candidates.map(c => [c.workingTitle, c.plannedDirection]), [
      ["亡人来信", directions.A.choice], ["逆流渡口", directions.B.choice],
    ]);
  }
  const saved = directorPersistedCandidateSchema.parse({ ...cards.B, id: "saved", plannedDirection: directions.B.choice });
  assert.equal(saved.plannedDirection, directions.B.choice);
  planningCall.mock.mockImplementationOnce(async () => { throw new Error("方向生成失败"); });
  await assert.rejects(service.refineCandidates({ idea, previousBatches: [first.batch], presets: [], feedback }), /方向生成失败/);
  assert.equal(calls.filter(stage => stage === "expand").length, 2, "方向未定时不能生成新的完整卡片");
});
