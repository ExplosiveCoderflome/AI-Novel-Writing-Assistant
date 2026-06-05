const test = require("node:test");
const assert = require("node:assert/strict");

const {
  summarizeOpenConflicts,
  summarizeStateSnapshot,
  summarizeWorldRules,
} = require("../dist/prompting/prompts/novel/chapterLayeredContextShared.js");

function createContextPackage() {
  return {
    canonicalState: {
      novelId: "novel-1",
      sourceSnapshotId: "snapshot-4",
      scopeLabel: "chapter:5",
      bookContract: {
        title: "Test Novel",
        genre: "urban",
        targetAudience: "web readers",
        sellingPoint: "counterattack",
        first30ChapterPromise: "first payoff lands early",
        readingPromise: null,
        protagonistFantasy: null,
        coreSellingPoint: null,
        chapter3Payoff: null,
        chapter10Payoff: null,
        chapter30Payoff: null,
        escalationLadder: null,
        relationshipMainline: null,
        toneGuardrails: ["tight pacing"],
        hardConstraints: ["no early exposure"],
      },
      worldState: {
        worldId: "world-1",
        name: "Modern City",
        summary: "capital pressure and hidden powers",
        rules: ["resources decide leverage", "public exposure has cost"],
        forces: ["family office", "underground network"],
        locations: ["old district"],
        tabooRules: ["do not reveal the patron early"],
        currentSituation: "the protagonist is still suppressed",
      },
      characters: [
        {
          characterId: "char-1",
          name: "Hero",
          role: "lead",
          currentGoal: "launch the first counterattack",
          currentState: "cornered but moving",
          currentPressure: "stress=78",
          currentSecret: "still hiding the backer",
          emotion: "contained anger",
          knownFacts: ["half the ledger is recovered"],
          relationStageLabels: ["mutual testing"],
          summary: "the hero is done waiting",
          lastEventSummary: "accepts the risk",
        },
      ],
      narrative: {
        currentVolumeId: "volume-1",
        currentVolumeTitle: "Counterattack",
        currentChapterId: "chapter-5",
        currentChapterOrder: 5,
        currentChapterGoal: "turn pressure into visible gain",
        currentPhase: "conflict_active",
        openConflicts: [
          {
            id: "conflict-1",
            title: "first counterattack still unresolved",
            summary: "the protagonist still owes readers a visible win",
            conflictType: "plot",
            severity: "high",
            status: "open",
            resolutionHint: "land a clear payoff in this chapter",
            lastSeenChapterOrder: 4,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ],
        pendingPayoffs: [],
        urgentPayoffs: [],
        overduePayoffs: [],
        publicKnowledge: ["the ally still holds the clue"],
        hiddenKnowledge: ["the patron is the prince"],
        suspenseThreads: ["patron identity"],
      },
      timeline: [],
      createdAt: new Date().toISOString(),
    },
    stateSnapshot: {
      summary: "legacy state that should not win",
      characterStates: [],
      informationStates: [],
    },
    openConflicts: [{
      title: "legacy conflict",
      summary: "legacy summary",
      resolutionHint: "legacy fix",
    }],
    storyWorldSlice: null,
  };
}

test("chapter layered context summaries prefer canonical state when present", () => {
  const contextPackage = createContextPackage();

  const stateSummary = summarizeStateSnapshot(contextPackage);
  const conflictSummary = summarizeOpenConflicts(contextPackage);
  const worldSummary = summarizeWorldRules(contextPackage);

  assert.match(stateSummary, /turn pressure into visible gain/);
  assert.doesNotMatch(stateSummary, /legacy state/);
  assert.equal(conflictSummary[0], "first counterattack still unresolved | the protagonist still owes readers a visible win | resolution hint: land a clear payoff in this chapter");
  assert.deepEqual(worldSummary.slice(0, 3), [
    "连续性记录：capital pressure and hidden powers",
    "连续性规则记录：resources decide leverage",
    "连续性规则记录：public exposure has cost",
  ]);
});

test("world summary prefers story world slice over canonical world continuity record", () => {
  const contextPackage = createContextPackage();
  contextPackage.storyWorldSlice = {
    storyId: "novel-1",
    worldId: "world-slice-1",
    coreWorldFrame: "星核枯竭的北境舞台。",
    appliedRules: [{
      id: "rule-star-core",
      name: "星核代价",
      summary: "透支星核会损伤寿命。",
      whyItMatters: "能力不能无代价升级。",
    }],
    activeForces: [],
    activeLocations: [],
    activeElements: [],
    conflictCandidates: [],
    pressureSources: [],
    mysterySources: [],
    suggestedStoryAxes: [],
    recommendedEntryPoints: [],
    forbiddenCombinations: ["不要把星核写成普通灵石"],
    storyScopeBoundary: "前期限定在北境。",
    metadata: {
      schemaVersion: 1,
      builtAt: new Date().toISOString(),
      sourceWorldUpdatedAt: null,
      storyInputDigest: "digest",
      builtFromStructuredData: true,
      builderMode: "runtime",
    },
  };

  const worldSummary = summarizeWorldRules(contextPackage);

  assert.deepEqual(worldSummary, [
    "星核枯竭的北境舞台。",
    "星核代价: 透支星核会损伤寿命。",
    "不要把星核写成普通灵石",
    "前期限定在北境。",
  ]);
  assert.equal(worldSummary.some((item) => item.includes("capital pressure")), false);
});
