const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildChapterPlanContextBlocks,
} = require("../dist/services/planner/plannerContextBlocks.js");

function createInput() {
  return {
    novelTitle: "测试小说",
    description: "一个新手也能跟着写下去的都市反压故事。",
    genreName: "都市异能",
    targetAudience: "新手向男频读者",
    bookSellingPoint: "高压开局与持续反压",
    competingFeel: "都市逆袭 + 强追读节奏",
    first30ChapterPromise: "前三十章稳定兑现压迫与反压快感",
    narrativePov: "limited-third-person",
    pacePreference: "fast",
    emotionIntensity: "high",
    styleTone: "狠、稳、别空话",
    chapterExpectation: "第5章要完成第一次明确反压",
    chapterTaskSheet: "保留压迫感，不要抢跑解释幕后黑手",
    chapterTargetWordCount: 3000,
    bible: "主角必须靠主动布局而不是外挂碾压。",
    styleEngine: "当前命中写法：冷峻现实派\n\n规划期写法约束：\n避免说教式总结\n多用动作和对话承载压迫感",
    outline: "旧大纲文本",
    structuredOutline: "{\"volumes\":[]}",
    mappedVolumes: [
      {
        sortOrder: 1,
        title: "第一卷",
        summary: "建立压迫源并完成第一次反压",
        mainPromise: "主角在高压环境下抢回一点主动权",
        climax: "卷末反压成立",
        updatedAt: "2026-04-01T00:00:00.000Z",
        chapters: [
          { chapterOrder: 1, title: "第1章", summary: "建立压迫" },
          { chapterOrder: 5, title: "第5章", summary: "第一次反压" },
        ],
      },
      {
        sortOrder: 2,
        title: "第二卷",
        summary: "敌我盘面升级",
        mainPromise: "把反压扩大到新层级",
        climax: "更大势力下场",
        updatedAt: "2026-04-01T00:00:00.000Z",
        chapters: [
          { chapterOrder: 6, title: "第6章", summary: "卷二起势" },
        ],
      },
    ],
    bookPlan: "全书规划 | 主线不断升级",
    arcPlans: "1 起势篇 | 完成第一次反压",
    characters: "主角|核心角色|goal=抢回主动权|state=被压制",
    recentSummaries: "上一章：主角踩中陷阱但看见反扑机会。",
    plotBeats: "5 第一次反压 卷内兑现",
    stateSnapshot: "主角与敌人的资源差距仍然明显。",
    openAuditIssues: "plot/high: 上一轮缺少明确兑现",
    recentDecisions: "plot/high: 先兑现反压再拉大盘面",
    characterDynamicsSummary: "当前卷：第一卷\n当前卷核心角色：主角、女二\n缺席高风险角色：女二(high, 缺席跨度=3)\n待确认候选：1 个",
    characterVolumeAssignments: "主角 | 卷级身份=破局者 | 卷级职责=完成第一次反压 | 计划章次=5\n女二 | 卷级身份=暗线持钥者 | 卷级职责=补足情报链 | 缺席风险=high(跨度=3)",
    characterRelationStages: "主角 -> 女二: 互试探合作 | 双方仍在试探底线 | 下一步=交换关键情报",
    characterCandidateGuards: "林策(情报商) | 待确认候选 | 来源章节=4 | 只读约束，未确认前禁止写入正式执行链",
    stateDrivenDirective: "recommended_next_action=write_chapter\npending_state_review=0\nopen_audit_issues=1",
    stateDrivenGoal: [
      "章节状态目标：把反压推进到可见收益",
      "应推进冲突：第一次反压必须落地",
      "应推进关系：主角: 互试探合作",
      "应触碰 payoff：女二情报钥匙",
      "禁止提前泄露：幕后黑手身份",
      "最近关键事件：主角确认账本异常",
    ].join("\n"),
    defaultMetadata: "planRole=pressure | phase=反压前夜\nmustAdvance=第一次反压\nmustPreserve=压迫感",
    replanContext: "无",
    payoffLedgerSummary: [
      "账本摘要：待兑现=2，紧急=1，逾期=1，已兑现=1",
      "当前未兑现项：女二情报钥匙 | 需要先铺垫她带来的反压价值；黑市账户异常 | 主角要先确认账本有异动",
      "当前逾期项：黑市账户异常 | 目标窗口已过，不能继续拖延",
      "本章应触碰项：女二情报钥匙 | 窗口=5-6；黑市账户异常 | 窗口=4-5",
      "最近一次已兑现项：第一次反压试探 | 已在第4章附近兑现",
    ].join("\n"),
    storyMacroSummary: "核心冲突：主角在压迫中夺回主动权\n推进回路：每次反压都会引来更强反扑",
    currentVolumeWindow: "当前卷：第一卷\n卷使命：建立压迫源并完成第一次反压\n下一卷预期：敌我盘面升级",
    storyModeBlock: "故事模式：都市反压",
  };
}

test("chapter planner context prioritizes framing, story macro and current volume window over legacy outline", () => {
  const blocks = buildChapterPlanContextBlocks(createInput());
  const byId = new Map(blocks.map((block) => [block.id, block]));

  assert.match(byId.get("book_framing").content, /目标读者：新手向男频读者/);
  assert.match(byId.get("book_framing").content, /题材基底：都市异能/);
  assert.match(byId.get("book_framing").content, /前30章承诺：前三十章稳定兑现压迫与反压快感/);
  assert.match(byId.get("style_engine").content, /当前命中写法：冷峻现实派/);
  assert.match(byId.get("story_macro").content, /核心冲突：主角在压迫中夺回主动权/);
  assert.match(byId.get("current_volume_window").content, /卷使命：建立压迫源并完成第一次反压/);
  assert.match(byId.get("chapter_target").content, /章节目标字数：3000 字/);
  assert.match(byId.get("volume_summary").content, /卷级工作台展开/);
  assert.match(byId.get("character_dynamics_summary").content, /当前卷核心角色：主角、女二/);
  assert.match(byId.get("character_volume_assignments").content, /卷级职责=完成第一次反压/);
  assert.match(byId.get("character_relation_stages").content, /互试探合作/);
  assert.match(byId.get("character_candidate_guards").content, /未确认前禁止写入正式执行链/);
  assert.match(byId.get("chapter_target").content, /recommended_next_action=write_chapter/);
  assert.match(byId.get("state_driven_goal").content, /禁止提前泄露：幕后黑手身份/);
  assert.match(byId.get("payoff_ledger").content, /账本摘要：待兑现=2，紧急=1，逾期=1，已兑现=1/);
  assert.match(byId.get("payoff_ledger").content, /当前逾期项：黑市账户异常/);
  assert.match(byId.get("legacy_outline_source").content, /兼容性旧主线大纲（仅作迁移参考）/);
  assert.equal(byId.get("legacy_outline_source").required, false);
  assert.ok(byId.get("book_framing").priority > byId.get("legacy_outline_source").priority);
  assert.ok(byId.get("current_volume_window").priority > byId.get("legacy_outline_source").priority);
  assert.ok(byId.get("character_dynamics_summary").priority > byId.get("legacy_outline_source").priority);
});
