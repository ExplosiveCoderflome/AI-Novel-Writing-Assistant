const assert = require("node:assert/strict");
const {
  characterCastAutoResponseSchema,
} = require("../../../dist/prompting/prompts/novel/characterPreparation.promptSchemas");

const chosen = {
  hook: "柜台收到一枚逆走的怀表",
  goal: "找回被撕去的签收页",
  climax: "在钟楼公开签收页",
  task: "核对签收日期再去钟楼",
  turn: "证人把铜钥匙塞进表壳",
  prose: "铜钥匙留在修表铺。",
  final: "她锁上柜门，把钥匙交还失主。",
};
const declined = "这条建议没有被作者选中";
const candidate = {
  id: "watch",
  workingTitle: "走慢的表",
  logline: "修表师寻找一位失主",
  positioning: "小城悬疑",
  sellingPoint: "旧表寻人",
  protagonistPath: "学徒接手老铺",
  coreConflict: "收件人失踪",
  hookStrategy: "有人打来电话",
  progressionLoop: "查证收据",
  endingDirection: "物归原主",
  whyItFits: "从日常物件引出谜题",
  toneKeywords: ["怀旧", "悬疑"],
  targetChapterCount: 12,
};
const dialogue = (changes) => ({
  replyText: "可以分别选择这两处。",
  changes: changes.map((item) => ({ ...item, reason: "让发现有具体后果" })),
});
const members = [
  ["沈梅", "protagonist", "修表师", "寻找失主"],
  ["叶敏", "ally", "邮递员", "保管收据"],
  ["陈远", "pressure_source", "房东", "收回店铺"],
].map(([name, castRole, role, storyFunction]) => ({
  name,
  castRole,
  role,
  storyFunction,
  gender: "female",
  personality: "谨慎",
  outerGoal: "守店",
}));
const echoedFields = (keys) => Object.fromEntries(keys.split(" ").map((key) => [key, "循着收据找到失主"]));
function fieldsRead(value, accepted) {
  const text = JSON.stringify(value);
  assert.ok(text.includes(accepted), "下游缺少 " + accepted);
  assert.ok(!text.includes(declined), "下游混入未采纳建议");
}
const titles = [
  "夜半敲窗",
  "被拆开的钟",
  "最后一班邮车",
  "楼梯上的灰",
  "无人收件",
  "印泥未干",
  "学徒的字条",
  "账册背面",
  "雨停之前",
  "证人开口",
  "钟楼回声",
  "失物归还",
];
function modelReply({ asset, promptInput: input, contextBlocks, options }) {
  switch (asset.id) {
    case "novel.create.resource_recommendation":
      return {
        summary: "沿着线索查证",
        genreId: input.allowedGenreIds[0],
        genreReason: "适合小城故事",
        primaryStoryModeId: input.allowedStoryModeIds[0],
        primaryStoryModeReason: "追查失物",
        powerSystemMode: "none",
        powerSystemReason: "现实题材",
      };
    case "novel.director.direction_pair":
      return {
        A: { choice: "追查旧表", engine: "沿着收据寻人" },
        B: { choice: "保住街坊", engine: "老铺面临搬迁" },
      };
    case "novel.director.candidates": {
      const card = {
        ...candidate,
        recommendedWritingPlatform: "fanqie_free",
        writingPlatformReason: "适合悬疑故事",
      };
      return { A: card, B: { ...card, workingTitle: "另一家店", logline: "街坊合力保住老铺" } };
    }
    case "novel.director.candidate_titles":
      return {
        titles: [
          {
            title: input.context.brief?.includes("本案方向：保住街坊") ? "另一家店" : candidate.workingTitle,
            style: "literary",
            clickRate: 89,
          },
        ],
      };
    case "novel.director.candidate_dialogue":
      return dialogue([
        { field: "hookStrategy", value: chosen.hook },
        { field: "coreConflict", value: declined },
      ]);
    case "novel.story_macro.decomposition":
      fieldsRead(input.storyInput, chosen.hook);
      return {
        expansion: {
          ...echoedFields(
            "expanded_premise protagonist_core conflict_engine mystery_box emotional_line tone_reference",
          ),
          conflict_layers: echoedFields("external internal relational"),
          setpiece_seeds: ["表铺", "钟楼"],
        },
        decomposition: {
          ...echoedFields("selling_point core_conflict progression_loop growth_path ending_flavor"),
          main_hook: chosen.hook,
          major_payoffs: ["找到收据", "归还怀表"],
        },
        constraints: ["保留铺面", "归还失物"],
        issues: [],
      };
    case "novel.director.book_contract":
      fieldsRead(input, chosen.hook);
      return {
        ...echoedFields(
          "readingPromise protagonistFantasy coreSellingPoint chapter3Payoff chapter10Payoff chapter30Payoff escalationLadder relationshipMainline",
        ),
        absoluteRedLines: [],
      };
    case "novel.character.castAuto":
      fieldsRead(contextBlocks, chosen.hook);
      return characterCastAutoResponseSchema.parse({
        option: {
          title: "守铺的人",
          summary: "追查收据去向",
          members,
          relations: [{ sourceName: "沈梅", targetName: "叶敏", surfaceRelation: "同查收据" }],
        },
      });
    case "novel.director.cast_dialogue":
      fieldsRead(input.storyInput, chosen.hook);
      return dialogue([
        { field: "currentGoal", value: chosen.goal },
        { field: "storyFunction", value: declined },
      ]);
    case "novel.director.volume_dialogue":
      return dialogue([
        { field: "climax", value: chosen.climax },
        { field: "nextVolumeHook", value: declined },
      ]);
    case "novel.director.chapter_dialogue":
      fieldsRead(input.storyInput, chosen.hook);
      return dialogue([
        { target: "scene", sceneKey: input.scenes[1].key, field: "turn", value: chosen.turn },
        { target: "chapter", field: "taskSheet", value: chosen.task },
        { target: "chapter", field: "mustAvoid", value: declined },
      ]);
    case "novel.director.prose_dialogue":
      return dialogue([
        { paragraph: 2, value: input.finding ? chosen.final : chosen.prose },
        { paragraph: 1, value: declined },
      ]);
    case "novel.director.final_inspection":
      if (input.chapter.order !== 3) return { findings: [] };
      assert.equal(input.chapter.paragraphs["2"], chosen.prose);
      return {
        findings: [{ paragraph: 2, quote: chosen.prose, problem: "交代归还钥匙的人。", advice: "补上交接动作。" }],
      };
    case "novel.payoff_ledger.sync":
      return { items: [] };
    case "novel.chapter.artifact_delta.extract":
      return {
        summary: input.chapterContent.slice(-100),
        stateDeltas: {},
        syncPlan: { reason: "沿用确认正文" },
        confidence: 0.95,
      };
    case "novel.volume.chapter_execution_contract":
      fieldsRead(input.targetVolume, chosen.climax);
      return {
        ...echoedFields("purpose exclusiveEvent endingState nextChapterEntryState taskSheet mustAvoid"),
        conflictLevel: 45,
        revealLevel: 40,
        targetWordCount: 2400,
        payoffRefs: [],
        readerExperience: {
          ...echoedFields(
            "readerQuestion promisedReward protagonistWant primaryResistance keyTurn emotionalShift informationReveal netChange endingHook",
          ),
          rewardLevel: "partial",
          inheritedHookResponsibilities: [],
        },
        sceneCards: [1, 2, 3].map((i) => ({
          key: "scene" + i,
          title: "查证" + i,
          ...echoedFields("purpose entryState exitState resistance turn emotionalShift readerValue"),
          mustAdvance: ["核实收据"],
          mustPreserve: ["保留证人"],
          forbiddenExpansion: [],
          targetWordCount: 800,
        })),
      };
    case "novel.volume.chapter_task_sheet_quality":
      return {
        verdict: "usable",
        safeToSync: true,
        loadRisk: "normal",
        recommendedHandling: "use_as_is",
        summary: "可以写作",
        issues: [],
        repairGuidance: [],
        confidence: 0.95,
      };
  }
  switch (options.scope) {
    case "strategy":
      fieldsRead(contextBlocks.find((b) => b.id === "book_contract").content, chosen.goal);
      return {
        recommendedVolumeCount: 1,
        hardPlannedVolumeCount: 1,
        ...echoedFields("readerRewardLadder escalationLadder midpointShift notes"),
        uncertainties: [],
        volumes: [
          {
            sortOrder: 1,
            planningMode: "hard",
            roleLabel: "查证",
            coreReward: "查明真相",
            escalationFocus: "寻找证人",
            uncertaintyLevel: "low",
          },
        ],
      };
    case "strategy_critique":
      return { overallRisk: "low", summary: "可推进", issues: [], recommendedActions: [] };
    case "skeleton":
      return {
        volumes: [
          {
            title: "失主",
            ...echoedFields(
              "summary openingHook mainPromise primaryPressureSource coreSellingPoint escalationMode protagonistChange midVolumeRisk climax payoffType nextVolumeHook resetPoint",
            ),
            openPayoffs: [],
          },
        ],
      };
    case "beat_sheet":
      fieldsRead(contextBlocks.find((b) => b.id === "target_volume").content, chosen.climax);
      return {
        beats: [
          {
            key: "open_hook",
            label: "开卷",
            title: "失主上门",
            summary: "找到收据",
            chapterSpanHint: "1-12章",
            mustDeliver: ["找到失主"],
          },
        ],
      };
    case "chapter_list":
      fieldsRead(contextBlocks.find((b) => b.id === "target_volume").content, chosen.climax);
      return {
        beatKey: input.targetBeat.key,
        beatLabel: input.targetBeat.label,
        chapterCount: input.targetBeatChapterCount,
        chapters: titles
          .slice(0, input.targetBeatChapterCount)
          .map((title) => ({ beatKey: input.targetBeat.key, title, summary: "修表师沿着收据查出新的地址。" })),
      };
    case "rebalance":
      return { decisions: [] };
    default:
      assert.fail("缺少固定回复 " + asset.id + " / " + options.scope);
  }
}
module.exports = { chosen, declined, candidate, modelReply, fieldsRead };
