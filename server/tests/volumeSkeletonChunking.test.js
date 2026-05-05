const test = require("node:test");
const assert = require("node:assert/strict");

const promptRunner = require("../dist/prompting/core/promptRunner.js");
const { prisma } = require("../dist/db/prisma.js");
const {
  generateVolumePlanDocument,
} = require("../dist/services/novel/volume/volumeGenerationOrchestrator.js");
const {
  buildVolumeWorkspaceDocument,
} = require("../dist/services/novel/volume/volumeWorkspaceDocument.js");

function createStrategyVolume(sortOrder) {
  return {
    sortOrder,
    planningMode: sortOrder <= 8 ? "hard" : "soft",
    roleLabel: `role ${sortOrder}`,
    coreReward: `reward ${sortOrder}`,
    escalationFocus: `escalation ${sortOrder}`,
    uncertaintyLevel: "medium",
  };
}

function createGeneratedVolume(sortOrder) {
  return {
    title: `Volume ${sortOrder}`,
    summary: `Summary ${sortOrder}`,
    openingHook: `Hook ${sortOrder}`,
    mainPromise: `Promise ${sortOrder}`,
    primaryPressureSource: `Pressure ${sortOrder}`,
    coreSellingPoint: `Selling point ${sortOrder}`,
    escalationMode: `Escalation ${sortOrder}`,
    protagonistChange: `Change ${sortOrder}`,
    midVolumeRisk: `Risk ${sortOrder}`,
    climax: `Climax ${sortOrder}`,
    payoffType: `Payoff ${sortOrder}`,
    nextVolumeHook: `Next ${sortOrder}`,
    resetPoint: `Reset ${sortOrder}`,
    openPayoffs: [`payoff ${sortOrder}`],
  };
}

function resolveExpectedVolumeCount(asset) {
  for (let count = 1; count <= 20; count += 1) {
    const result = asset.outputSchema.safeParse({
      volumes: Array.from({ length: count }, (_, index) => createGeneratedVolume(index + 1)),
    });
    if (result.success) {
      return count;
    }
  }
  throw new Error("Unable to resolve expected volume count from output schema.");
}

function createWorkspace(volumeCount) {
  return buildVolumeWorkspaceDocument({
    novelId: "novel-1",
    volumes: Array.from({ length: volumeCount }, (_, index) => ({
      id: `volume-${index + 1}`,
      novelId: "novel-1",
      sortOrder: index + 1,
      title: `Existing ${index + 1}`,
      summary: null,
      openingHook: null,
      mainPromise: null,
      primaryPressureSource: null,
      coreSellingPoint: null,
      escalationMode: null,
      protagonistChange: null,
      midVolumeRisk: null,
      climax: null,
      payoffType: null,
      nextVolumeHook: null,
      resetPoint: null,
      openPayoffs: [],
      status: "active",
      sourceVersionId: null,
      chapters: [],
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString(),
    })),
    strategyPlan: {
      recommendedVolumeCount: volumeCount,
      hardPlannedVolumeCount: 8,
      readerRewardLadder: "reward ladder",
      escalationLadder: "escalation ladder",
      midpointShift: "midpoint",
      notes: "notes",
      volumes: Array.from({ length: volumeCount }, (_, index) => createStrategyVolume(index + 1)),
      uncertainties: [],
    },
    critiqueReport: null,
    beatSheets: [],
    rebalanceDecisions: [],
    source: "volume",
    activeVersionId: null,
  });
}

test("volume skeleton generation chunks large books into smaller structured calls", async () => {
  const originalRunStructuredPrompt = promptRunner.runStructuredPrompt;
  const originalFindUnique = prisma.novel.findUnique;
  const calls = [];
  prisma.novel.findUnique = async () => ({
    title: "Novel",
    description: "Description",
    targetAudience: "Readers",
    bookSellingPoint: "Selling point",
    competingFeel: "Competing feel",
    first30ChapterPromise: "Promise",
    commercialTagsJson: "[]",
    estimatedChapterCount: 1000,
    narrativePov: "third_person",
    pacePreference: "balanced",
    emotionIntensity: "medium",
    genre: null,
    primaryStoryMode: null,
    secondaryStoryMode: null,
    characters: [],
  });
  promptRunner.runStructuredPrompt = async ({ asset }) => {
    const expectedCount = resolveExpectedVolumeCount(asset);
    calls.push(expectedCount);
    const firstSortOrder = (calls.length - 1) * 5 + 1;
    return {
      output: {
        volumes: Array.from({ length: expectedCount }, (_, index) => createGeneratedVolume(firstSortOrder + index)),
      },
    };
  };

  try {
    const document = await generateVolumePlanDocument({
      novelId: "novel-1",
      workspace: createWorkspace(15),
      options: {
        scope: "skeleton",
      },
      storyMacroPlanService: {
        getPlan: async () => null,
      },
    });

    assert.deepEqual(calls, [5, 5, 5]);
    assert.equal(document.volumes.length, 15);
    assert.equal(document.volumes[0].title, "Volume 1");
    assert.equal(document.volumes[14].title, "Volume 15");
  } finally {
    promptRunner.runStructuredPrompt = originalRunStructuredPrompt;
    prisma.novel.findUnique = originalFindUnique;
  }
});
