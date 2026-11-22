const test = require("node:test");
const assert = require("node:assert/strict");
const { getRegisteredPromptAsset } = require("../dist/prompting/registry.js");
const runner = require("../dist/prompting/core/promptRunner.js");
const candidateCalls = require("../dist/services/novel/director/phases/candidateStructuredCall.js");
const { NovelDirectorCandidateStageService } = require("../dist/services/novel/director/phases/novelDirectorCandidateStage.js");
const { novelCreateResourceRecommendationService } = require("../dist/services/novel/NovelCreateResourceRecommendationService.js");
const { titleGenerationService } = require("../dist/services/title/TitleGenerationService.js");
const { directorPersistedCandidateSchema } = require("../dist/services/novel/director/runtime/novelDirectorSchemas.js");
const { enhanceCandidateTitles } = require("../dist/services/novel/director/runtime/novelDirectorHelpers.js");

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

test("首轮命名与定向重做都保留编辑首选和短书名，重做避开同轮另一案", async t => {
  const asset = getRegisteredPromptAsset("novel.director.candidate_titles", "v1");
  assert.throws(() => asset.postValidate({ titles: [], coverTitle: "组外书名" }), /原样选取/);
  const first = { ...cards.A, id: "a", plannedDirection: "冒名领信追查空饷" };
  const sibling = { ...cards.B, id: "b" };
  const idea = "一封送错的家书";
  const feedback = "希望带点人物说话的口气";
  const briefs = [];
  t.mock.method(runner, "runStructuredPrompt", async call => {
    assert.equal(call.asset, asset);
    briefs.push(call.promptInput.context.brief);
    const names = briefs.length === 1 ? ["认信人", "落款", "错名之下", "渡口无灯"] : ["借姓", "认字人", sibling.workingTitle, "薄纸一张"];
    const titles = names.map((title, index) => ({
      title, style: "suspense", angle: "冒名领信", reason: "小卒必须冒用别人的姓名。", clickRate: 60 + index * 10,
    }));
    const coverTitle = briefs.length === 1 ? "落款" : sibling.workingTitle;
    return { output: asset.postValidate(asset.outputSchema.parse({
      namingMoment: "领信时小卒要署别人的名", titles, coverReason: "对应小卒冒名的选择", coverTitle,
    })) };
  });
  const named = await enhanceCandidateTitles(first, { idea, request: {}, options: {} }, { roundCandidates: [first, sibling] });
  assert.equal(named.workingTitle, "落款");
  const service = new NovelDirectorCandidateStageService({});
  const rerolled = await service.refineCandidateTitleOptions({
    idea, feedback, batchId: "round", candidateId: first.id, previousBatches: [{ id: "round", candidates: [named, sibling] }],
  });
  assert.equal(rerolled.candidate.workingTitle, "借姓");
  assert.deepEqual(rerolled.batch.candidates[1], sibling);
  assert.ok(rerolled.candidate.titleOptions.every(item => item.title !== sibling.workingTitle));
  assert.equal(briefs.length, 2);
  for (const brief of briefs) {
    assert.ok(brief.includes(first.logline) && brief.includes(first.plannedDirection));
    assert.ok(brief.includes(sibling.logline));
  }
  assert.ok(briefs[1].includes(feedback) && briefs[1].includes(sibling.workingTitle) && briefs[1].includes("认信人"));
});

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

test("较长的方向选择句原样进入两案展开与候选保存", async () => {
  const pair = {
    A: { ...directions.A, choice: "冒领家书的小卒必须亲自寻访每一位收信人，把阵亡士卒原本打算带回家的消息交给他们的亲人，才能换得揭开空饷账目的证词。" },
    B: { ...directions.B, choice: "小卒把名册上的村落当成转移路线，在追兵赶到前带走还活着的家属；每救下一户，都要用自己仅有的一条退路换下一家开门。" },
  };
  assert.ok(pair.A.choice.length > 48 && pair.B.choice.length > 48);
  const parsed = plan.postValidate(plan.outputSchema.parse(pair));
  const messages = await expand.render({ idea: "一封家书", context: {}, count: 2, batches: [], presets: [], directions: parsed }, { blocks: [] });
  const prompt = messages.map(item => item.content).join("\n");
  for (const key of ["A", "B"]) {
    assert.ok(prompt.includes(pair[key].choice));
    const saved = directorPersistedCandidateSchema.parse({ ...cards[key], id: key, plannedDirection: parsed[key].choice });
    assert.equal(saved.plannedDirection, pair[key].choice);
  }
});

test("首轮和换一批先定方向，展开时按键对应并保留书名重配前的选择句", async t => {
  const idea = "边关小卒从一张阵亡名册上看见了自己的名字";
  const feedback = "想多看小卒主动救人的选择";
  const foundation = { genre: { path: "历史架空" } };
  t.mock.method(novelCreateResourceRecommendationService, "resolveRequired", async () => ({
    recommendation: foundation, promptBlock: "历史架空，边关悬疑",
  }));
  t.mock.method(titleGenerationService, "generateTitleIdeas", async () => ({ titles: [] }));
  const { promptSlotOverrideService } = require("../dist/prompting/slots/PromptSlotOverrideService.js");
  const customFork = "两条路线上，主角各欠不同的人一份人情。";
  const customExpansion = "写清每个承诺怎样在下一次救人时兑现。";
  t.mock.method(promptSlotOverrideService, "getOverrideMaps", async ({ promptId, novelId }) => {
    assert.equal(novelId, undefined);
    const global = promptId === plan.id
      ? { "directions.fork": { value: customFork } }
      : { "candidates.progression": { value: customExpansion } };
    return { global, novel: {} };
  });
  const calls = [];
  async function render(call) {
    const overlays = await runner.resolvePromptOverlaysForAsset(call);
    return runner.preparePromptExecution({ ...call, resolvedSlots: overlays.resolvedSlots }).messages
      .map(message => message.content).join("\n");
  }
  const planningCall = t.mock.method(runner, "runStructuredPrompt", async call => {
    calls.push("plan");
    assert.equal(call.asset, plan);
    const prompt = await render(call);
    assert.ok(prompt.includes(customFork) && !prompt.includes(customExpansion));
    assert.ok(prompt.includes(idea) && prompt.includes("历史架空"));
    if (call.promptInput.batches.length) {
      assert.ok(prompt.includes(feedback) && prompt.includes(directions.A.choice) && prompt.includes("冲突更强"));
    }
    return { output: plan.postValidate(plan.outputSchema.parse(directions)) };
  });
  t.mock.method(candidateCalls, "runCandidateStructuredCall", async call => {
    calls.push("expand");
    assert.equal(call.asset, expand);
    const prompt = await render(call);
    assert.ok(prompt.includes(customExpansion) && !prompt.includes(customFork));
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
