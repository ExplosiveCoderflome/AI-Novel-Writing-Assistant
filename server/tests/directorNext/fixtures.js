const domain = require("../../dist/modules/director/domain/index.js");

const plan = domain.definePlan({
  version: "test-plan-1",
  externalArtifacts: ["novel_seed"],
  steps: [
    {
      id: "story_macro",
      label: "故事宏观规划",
      requires: ["novel_seed"],
      produces: "story_macro",
      needs: ["structured_output"],
      gateable: true,
      overwrites: [],
    },
    {
      id: "character_cast",
      label: "角色阵容",
      requires: ["story_macro"],
      produces: "character_cast",
      needs: ["structured_output"],
      gateable: true,
      overwrites: [],
    },
    {
      id: "volume_strategy",
      label: "卷战略",
      requires: ["story_macro", "character_cast"],
      produces: "volume_strategy",
      needs: [],
      gateable: true,
      overwrites: [],
    },
    {
      id: "chapter_list",
      label: "章节列表",
      requires: ["volume_strategy"],
      produces: "chapter_list",
      needs: [],
      gateable: true,
      overwrites: [],
    },
  ],
});

const artifactTypes = {
  story_macro: { label: "故事宏观规划", reviewRoute: "/novels/n1/edit?stage=story_macro" },
  character_cast: { label: "角色阵容", reviewRoute: "/novels/n1/edit?stage=character" },
  volume_strategy: { label: "卷战略", reviewRoute: "/novels/n1/edit?stage=outline" },
  chapter_list: { label: "章节列表", reviewRoute: "/novels/n1/edit?stage=outline" },
};

function artifact(type, overrides = {}) {
  return {
    type,
    scope: "book",
    version: 1,
    status: "draft",
    protectedUserContent: false,
    ...overrides,
  };
}

function facts(artifacts = [], extra = {}) {
  return { artifacts, debts: [], stopSignal: null, ...extra };
}

function contract(overrides = {}) {
  return {
    runId: "run-1",
    novelId: "novel-1",
    driver: "auto",
    planVersion: "test-plan-1",
    scope: "book",
    stepIdsInScope: null,
    chapterRange: { from: 1, to: 10 },
    issuePolicy: { mode: "completion_first", version: "policy-1" },
    modelConfig: { route: "default", model: "test-model", version: "model-1" },
    tokenBudget: null,
    rejectionBudget: 3,
    ...overrides,
  };
}

function runningControl(overrides = {}) {
  return {
    version: 1,
    status: "running",
    pause: null,
    gate: null,
    cursorStepId: null,
    failureReason: null,
    ...overrides,
  };
}

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value)) {
      deepFreeze(value[key]);
    }
  }
  return value;
}

module.exports = {
  domain,
  plan,
  artifact,
  artifactTypes,
  facts,
  contract,
  runningControl,
  deepFreeze,
};

