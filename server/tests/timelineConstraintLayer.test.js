const test = require("node:test");
const assert = require("node:assert/strict");

const {
  TimelineCheckerService,
} = require("../dist/modules/timeline/timeline-checker.service.js");
const {
  TimelineContextService,
} = require("../dist/modules/timeline/timeline-context.service.js");
const {
  TimelinePromptAdapter,
} = require("../dist/modules/timeline/timeline-prompt-adapter.js");

function baseContext(overrides = {}) {
  return {
    currentChapterIndex: 8,
    currentTime: { storyDayIndex: 3, label: "第三日午后" },
    previousEvents: [{
      id: "event-7",
      title: "赵无极城下叫阵",
      summary: "赵无极已在第7章抵达武帝城外。",
      chapterIndex: 7,
      storyTimeLabel: "第三日午前",
    }],
    plannedEventsThisChapter: [{
      id: "planned-8",
      title: "承接城南钟楼动乱",
      summary: "王仙芝必须处理城内有人动手的危机。",
    }],
    openHooks: [{
      id: "hook-7",
      title: "城南钟楼三声长钟",
      description: "第7章结尾提示城内有人动手。",
      priority: "critical",
    }],
    forbiddenEvents: [{
      id: "future-9",
      title: "赵无极已经被秘密囚禁",
      reason: "该结果必须在问剑对决之后才能确认。",
    }],
    continuityRequirements: ["本章必须承接城南钟楼三声长钟。"],
    knownStateChanges: [{
      targetType: "character",
      targetId: "chen-xuan",
      field: "martial_status",
      after: "修为被废，囚于地牢",
      certainty: "confirmed",
    }],
    ...overrides,
  };
}

test("TimelineChecker blocks future event leakage", () => {
  const checker = new TimelineCheckerService();
  const result = checker.checkChapter({
    novelId: "novel-1",
    chapterId: "chapter-8",
    chapterIndex: 8,
    timelineContext: baseContext(),
    chapterContent: "赵无极已经被秘密囚禁，北凉王府尚不知情。",
    extractedEvents: [{
      title: "赵无极已经被秘密囚禁",
      summary: "正文确认赵无极已经被囚禁。",
      type: "plot",
      participantNames: ["赵无极"],
      stateChanges: [],
      possibleHooks: [],
      occurred: true,
      confidence: 0.9,
      matchedPlannedEventIds: [],
    }],
  });

  assert.equal(result.status, "failed");
  assert.equal(result.issues[0].type, "future_event_leak");
});

test("TimelineChecker flags unresolved previous hook", () => {
  const checker = new TimelineCheckerService();
  const result = checker.checkChapter({
    novelId: "novel-1",
    chapterId: "chapter-8",
    chapterIndex: 8,
    timelineContext: baseContext({ forbiddenEvents: [], plannedEventsThisChapter: [] }),
    chapterContent: "赵无极重新踏上吊桥，向武帝城正门走来。",
    extractedEvents: [{
      title: "赵无极抵达正门",
      summary: "赵无极重新走向武帝城正门。",
      type: "plot",
      participantNames: ["赵无极"],
      stateChanges: [],
      possibleHooks: [],
      occurred: true,
      confidence: 0.8,
      matchedPlannedEventIds: [],
    }],
  });

  assert.equal(result.status, "failed");
  assert.ok(result.issues.some((issue) => issue.type === "unresolved_previous_hook"));
});

test("TimelineChecker detects confirmed state conflicts", () => {
  const checker = new TimelineCheckerService();
  const result = checker.checkChapter({
    novelId: "novel-1",
    chapterId: "chapter-9",
    chapterIndex: 9,
    timelineContext: baseContext({ forbiddenEvents: [], plannedEventsThisChapter: [], openHooks: [] }),
    chapterContent: "陈玄忽然运起巅峰功力，冲破地牢。",
    extractedEvents: [{
      title: "陈玄运功冲牢",
      summary: "陈玄施展巅峰功力冲破地牢。",
      type: "battle",
      participantNames: ["陈玄"],
      stateChanges: [{
        targetType: "character",
        targetId: "chen-xuan",
        field: "martial_status",
        before: "修为被废",
        after: "恢复巅峰功力",
        certainty: "confirmed",
      }],
      possibleHooks: [],
      occurred: true,
      confidence: 0.9,
      matchedPlannedEventIds: [],
    }],
  });

  assert.equal(result.status, "failed");
  assert.ok(result.issues.some((issue) => issue.type === "state_conflict"));
});

test("TimelineChecker warns on suspicious time regression", () => {
  const checker = new TimelineCheckerService();
  const result = checker.checkChapter({
    novelId: "novel-1",
    chapterId: "chapter-8",
    chapterIndex: 8,
    timelineContext: baseContext({
      currentTime: { storyDayIndex: 2, label: "两日前夜" },
      forbiddenEvents: [],
      plannedEventsThisChapter: [],
      openHooks: [],
    }),
    chapterContent: "两日前夜，武帝城仍在雨里。",
    extractedEvents: [],
  });

  assert.equal(result.status, "warning");
  assert.ok(result.issues.some((issue) => issue.type === "timeline_regression"));
});

test("TimelineChecker warns on repeated occurred event", () => {
  const checker = new TimelineCheckerService();
  const result = checker.checkChapter({
    novelId: "novel-1",
    chapterId: "chapter-8",
    chapterIndex: 8,
    timelineContext: baseContext({
      forbiddenEvents: [],
      plannedEventsThisChapter: [],
      openHooks: [],
      previousEvents: [{
        id: "event-2",
        title: "王仙芝当众压制陈玄",
        summary: "王仙芝在演武场当众压住陈玄反心，给他三日时间想清楚。",
        chapterIndex: 2,
        storyTimeLabel: "第一日午后",
      }],
    }),
    chapterContent: "王仙芝又在演武场当众压制陈玄。",
    extractedEvents: [{
      title: "王仙芝当众压制陈玄",
      summary: "王仙芝在演武场当众压住陈玄。",
      type: "conflict",
      participantNames: ["王仙芝", "陈玄"],
      stateChanges: [],
      possibleHooks: [],
      occurred: true,
      confidence: 0.85,
      matchedPlannedEventIds: [],
    }],
  });

  assert.equal(result.status, "warning");
  assert.ok(result.issues.some((issue) => issue.type === "repeated_event"));
});

test("TimelineChecker fails when planned event is missing", () => {
  const checker = new TimelineCheckerService();
  const result = checker.checkChapter({
    novelId: "novel-1",
    chapterId: "chapter-8",
    chapterIndex: 8,
    timelineContext: baseContext({
      forbiddenEvents: [],
      openHooks: [],
    }),
    chapterContent: "赵无极站在城门前问剑。",
    extractedEvents: [{
      title: "赵无极问剑",
      summary: "赵无极在城门前向王仙芝问剑。",
      type: "battle",
      participantNames: ["赵无极"],
      stateChanges: [],
      possibleHooks: [],
      occurred: true,
      confidence: 0.8,
      matchedPlannedEventIds: [],
    }],
  });

  assert.equal(result.status, "failed");
  assert.ok(result.issues.some((issue) => issue.type === "missing_planned_event"));
});

test("TimelineChecker blocks forbidden event from continuity requirements", () => {
  const checker = new TimelineCheckerService();
  const result = checker.checkChapter({
    novelId: "novel-1",
    chapterId: "chapter-8",
    chapterIndex: 8,
    timelineContext: baseContext({
      forbiddenEvents: [],
      plannedEventsThisChapter: [],
      openHooks: [],
      continuityRequirements: ["禁止提前发生：幕后主使现身"],
    }),
    chapterContent: "幕后主使现身，承认城内动乱是他安排。",
    extractedEvents: [{
      title: "幕后主使现身",
      summary: "正文确认幕后主使已经公开出现。",
      type: "reveal",
      participantNames: ["幕后主使"],
      stateChanges: [],
      possibleHooks: [],
      occurred: true,
      confidence: 0.9,
      matchedPlannedEventIds: [],
    }],
  });

  assert.equal(result.status, "failed");
  assert.ok(result.issues.some((issue) => issue.type === "forbidden_event_occurred"));
});

test("TimelineContextService builds open hooks and planned events from repository", async () => {
  const service = new TimelineContextService({
    getChapterTimeAnchor: async () => ({
      id: "anchor-8",
      novelId: "novel-1",
      chapterId: "chapter-8",
      chapterIndex: 8,
      storyDayIndex: 3,
      timeLabel: "第三日午后",
      startsAfterEventIds: [],
      plannedEventIds: [],
      endedWithEventIds: [],
      previousHookIds: ["hook-7"],
      nextHookIds: [],
      forbiddenEventIds: [],
      createdAt: "now",
      updatedAt: "now",
    }),
    listEventsBeforeChapter: async () => [],
    listPlannedEventsForChapter: async () => [{
      id: "planned-8",
      novelId: "novel-1",
      eventOrder: 8001,
      chapterId: "chapter-8",
      chapterIndex: 8,
      title: "处理城内动乱",
      summary: "王仙芝回应城内异动。",
      type: "plot",
      status: "planned",
      visibility: "reader_known",
      source: "chapter_plan",
      participantIds: [],
      factionIds: [],
      prerequisiteEventIds: [],
      consequenceEventIds: [],
      stateChanges: [],
      confidence: 1,
      createdAt: "now",
      updatedAt: "now",
    }],
    listForbiddenEventsForChapter: async () => [],
    listOpenHooks: async () => [{
      id: "hook-7",
      novelId: "novel-1",
      createdInChapterId: "chapter-7",
      createdInChapterIndex: 7,
      title: "城南钟楼三声长钟",
      description: "城内有人动手。",
      status: "open",
      priority: "critical",
      relatedEventIds: [],
      participantIds: [],
      createdAt: "now",
      updatedAt: "now",
    }],
    listActiveConstraints: async () => [],
    getLatestCheckReport: async () => null,
    saveExtractedEvents: async () => [],
    createHooks: async () => {},
    markHooksAddressed: async () => {},
    saveCheckReport: async () => null,
  });

  const context = await service.buildForChapter({ novelId: "novel-1", chapterId: "chapter-8", chapterIndex: 8 });
  assert.equal(context.openHooks[0].title, "城南钟楼三声长钟");
  assert.equal(context.plannedEventsThisChapter[0].title, "处理城内动乱");
});

test("TimelinePromptAdapter emits required block with empty context", () => {
  const adapter = new TimelinePromptAdapter();
  const output = adapter.toPromptBlock(baseContext({
    previousEvents: [],
    plannedEventsThisChapter: [],
    openHooks: [],
    forbiddenEvents: [],
    continuityRequirements: [],
    knownStateChanges: [],
  }));

  assert.match(output, /【时间线约束】/);
  assert.match(output, /【上一章遗留钩子】\n- 无/);
});
