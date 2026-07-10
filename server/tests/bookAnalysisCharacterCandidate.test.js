const test = require("node:test");
const assert = require("node:assert/strict");
const { prisma } = require("../dist/db/prisma.js");
const { BookAnalysisCharacterService } = require("../dist/services/bookAnalysis/bookAnalysisCharacter/BookAnalysisCharacterService.js");

function createSourceCache() {
  return {
    getOrBuildSourceNotes: async () => ({
      notes: [{
        summary: "人物系统信号",
        characters: ["主角：许大茂", "配角：娄晓娥"],
        evidence: [],
      }],
    }),
  };
}

function createAnalysis(status = "succeeded") {
  return {
    id: "analysis-1",
    status,
    provider: "deepseek",
    model: null,
    temperature: null,
    maxTokens: null,
    documentVersionId: "version-1",
    documentVersion: {
      id: "version-1",
      content: "第一章 许大茂登场。",
    },
    sections: [{
      sectionKey: "character_system",
      aiContent: "许大茂是主角，娄晓娥是关键配角。",
      editedContent: null,
    }],
  };
}

function promptResult(output, tokenUsage) {
  return {
    output,
    meta: {
      tokenUsage,
    },
  };
}

function createMemoryStore(initialCharacters = []) {
  const store = {
    characters: initialCharacters.map((item, index) => ({
      id: item.id ?? `char-${index + 1}`,
      analysisId: item.analysisId ?? "analysis-1",
      name: item.name,
      role: item.role,
      status: item.status ?? "candidate",
      briefDescription: item.briefDescription ?? null,
      importance: item.importance ?? null,
      occurringChaptersJson: item.occurringChaptersJson ?? null,
      lastGenerationError: item.lastGenerationError ?? null,
      generationDepth: item.generationDepth ?? "standard",
      selectedDimensionsJson: item.selectedDimensionsJson ?? null,
      profileJson: item.profileJson ?? null,
      evidenceJson: item.evidenceJson ?? null,
      sortOrder: item.sortOrder ?? index,
      createdAt: item.createdAt ?? new Date("2026-06-26T00:00:00.000Z"),
      updatedAt: item.updatedAt ?? new Date("2026-06-26T00:00:00.000Z"),
      arcs: item.arcs ?? [],
      scenes: item.scenes ?? [],
    })),
    arcs: [],
    scenes: [],
    nextCharacterId: initialCharacters.length + 1,
    nextArcId: 1,
    nextSceneId: 1,
    usedTokens: 0,
    budgetTokens: 1_000_000,
  };
  return store;
}

function withPatchedPrisma(store, fn) {
  const original = {
    bookAnalysisFindUnique: prisma.bookAnalysis.findUnique,
    bookAnalysisUpdate: prisma.bookAnalysis.update,
    characterFindMany: prisma.bookAnalysisCharacter.findMany,
    characterFindFirst: prisma.bookAnalysisCharacter.findFirst,
    characterCount: prisma.bookAnalysisCharacter.count,
    characterCreate: prisma.bookAnalysisCharacter.create,
    characterUpdate: prisma.bookAnalysisCharacter.update,
    characterDeleteMany: prisma.bookAnalysisCharacter.deleteMany,
    arcDeleteMany: prisma.bookAnalysisCharacterArc.deleteMany,
    arcCreate: prisma.bookAnalysisCharacterArc.create,
    sceneDeleteMany: prisma.bookAnalysisCharacterScene.deleteMany,
    sceneCreate: prisma.bookAnalysisCharacterScene.create,
    transaction: prisma.$transaction,
  };

  const includeRelations = (character) => ({
    ...character,
    arcs: store.arcs.filter((arc) => arc.characterId === character.id),
    scenes: store.scenes.filter((scene) => scene.characterId === character.id),
  });

  const tx = {
    bookAnalysisCharacter: {
      create: async ({ data }) => {
        const created = {
          id: `char-${store.nextCharacterId}`,
          createdAt: new Date("2026-06-26T00:00:00.000Z"),
          updatedAt: new Date("2026-06-26T00:00:00.000Z"),
          ...data,
        };
        store.nextCharacterId += 1;
        store.characters.push(created);
        return created;
      },
      update: async ({ where, data }) => {
        const row = store.characters.find((item) => item.id === where.id);
        if (!row) throw new Error("missing character");
        Object.assign(row, data, { updatedAt: new Date("2026-06-26T00:00:00.000Z") });
        return row;
      },
    },
    bookAnalysisCharacterArc: {
      deleteMany: async ({ where }) => {
        store.arcs = store.arcs.filter((arc) => arc.characterId !== where.characterId);
        return { count: 0 };
      },
      create: async ({ data }) => {
        const created = {
          id: `arc-${store.nextArcId}`,
          createdAt: new Date("2026-06-26T00:00:00.000Z"),
          updatedAt: new Date("2026-06-26T00:00:00.000Z"),
          ...data,
        };
        store.nextArcId += 1;
        store.arcs.push(created);
        return created;
      },
    },
    bookAnalysisCharacterScene: {
      deleteMany: async ({ where }) => {
        store.scenes = store.scenes.filter((scene) => scene.characterId !== where.characterId);
        return { count: 0 };
      },
      create: async ({ data }) => {
        const created = {
          id: `scene-${store.nextSceneId}`,
          createdAt: new Date("2026-06-26T00:00:00.000Z"),
          updatedAt: new Date("2026-06-26T00:00:00.000Z"),
          ...data,
        };
        store.nextSceneId += 1;
        store.scenes.push(created);
        return created;
      },
    },
  };

  prisma.bookAnalysis.findUnique = async (args) => {
    if (args?.select?.status) return { status: "succeeded" };
    if (args?.select?.budgetTokens || args?.select?.usedTokens) {
      return { budgetTokens: store.budgetTokens, usedTokens: store.usedTokens };
    }
    return createAnalysis();
  };
  prisma.bookAnalysis.update = async ({ data }) => {
    if (typeof data?.usedTokens === "number") {
      store.usedTokens = data.usedTokens;
    } else {
      const increment = data?.usedTokens?.increment ?? 0;
      store.usedTokens += increment;
    }
    return { budgetTokens: store.budgetTokens, usedTokens: store.usedTokens };
  };
  prisma.bookAnalysisCharacter.findMany = async (args = {}) => {
    let rows = store.characters.filter((item) => !args.where?.analysisId || item.analysisId === args.where.analysisId);
    if (args.where?.id) rows = rows.filter((item) => item.id === args.where.id);
    if (args.where?.status?.in) rows = rows.filter((item) => args.where.status.in.includes(item.status));
    return rows.map(includeRelations);
  };
  prisma.bookAnalysisCharacter.findFirst = async ({ where }) =>
    store.characters.find((item) => item.id === where.id && item.analysisId === where.analysisId) ?? null;
  prisma.bookAnalysisCharacter.count = async ({ where }) =>
    store.characters.filter((item) => item.analysisId === where.analysisId).length;
  prisma.bookAnalysisCharacter.create = tx.bookAnalysisCharacter.create;
  prisma.bookAnalysisCharacter.update = tx.bookAnalysisCharacter.update;
  prisma.bookAnalysisCharacter.deleteMany = async ({ where }) => {
    const before = store.characters.length;
    store.characters = store.characters.filter((item) => !(item.id === where.id && item.analysisId === where.analysisId));
    return { count: before - store.characters.length };
  };
  prisma.bookAnalysisCharacterArc.deleteMany = tx.bookAnalysisCharacterArc.deleteMany;
  prisma.bookAnalysisCharacterArc.create = tx.bookAnalysisCharacterArc.create;
  prisma.bookAnalysisCharacterScene.deleteMany = tx.bookAnalysisCharacterScene.deleteMany;
  prisma.bookAnalysisCharacterScene.create = tx.bookAnalysisCharacterScene.create;
  prisma.$transaction = async (callback) => callback(tx);

  return Promise.resolve()
    .then(fn)
    .finally(() => {
      prisma.bookAnalysis.findUnique = original.bookAnalysisFindUnique;
      prisma.bookAnalysis.update = original.bookAnalysisUpdate;
      prisma.bookAnalysisCharacter.findMany = original.characterFindMany;
      prisma.bookAnalysisCharacter.findFirst = original.characterFindFirst;
      prisma.bookAnalysisCharacter.count = original.characterCount;
      prisma.bookAnalysisCharacter.create = original.characterCreate;
      prisma.bookAnalysisCharacter.update = original.characterUpdate;
      prisma.bookAnalysisCharacter.deleteMany = original.characterDeleteMany;
      prisma.bookAnalysisCharacterArc.deleteMany = original.arcDeleteMany;
      prisma.bookAnalysisCharacterArc.create = original.arcCreate;
      prisma.bookAnalysisCharacterScene.deleteMany = original.sceneDeleteMany;
      prisma.bookAnalysisCharacterScene.create = original.sceneCreate;
      prisma.$transaction = original.transaction;
    });
}

test("identifyCharacterCandidates dedupes candidates and keeps generated rows intact", async () => {
  const store = createMemoryStore([{
    id: "char-1",
    name: "许大茂",
    role: "主角",
    status: "generated",
    profileJson: JSON.stringify({ name: "许大茂", role: "主角", personality: "精明" }),
  }, {
    id: "char-2",
    name: "娄晓娥",
    role: "配角",
    status: "candidate",
    briefDescription: "旧描述",
  }]);
  let promptCalls = 0;
  const promptRunner = async ({ asset }) => {
    promptCalls += 1;
    assert.equal(asset.id, "bookAnalysis.character.identify");
    return promptResult(
      {
        candidates: [
          { name: "许大茂", roleHint: "不应覆盖", importance: "high", briefDescription: "不应覆盖", occurringChapters: [] },
          { name: "娄晓娥", roleHint: "关键配角", importance: "medium", briefDescription: "更新描述", occurringChapters: ["第 2 章"] },
          { name: "傻柱", roleHint: "对照角色", importance: "medium", briefDescription: "构成关系张力", occurringChapters: [] },
        ],
      },
      { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
    );
  };

  await withPatchedPrisma(store, async () => {
    const service = new BookAnalysisCharacterService(createSourceCache(), promptRunner);
    const rows = await service.identifyCharacterCandidates("analysis-1");
    assert.equal(promptCalls, 1);
    assert.equal(rows.length, 3);
    assert.equal(rows.find((item) => item.name === "许大茂").role, "主角");
    assert.equal(rows.find((item) => item.name === "娄晓娥").briefDescription, "更新描述");
    assert.equal(rows.find((item) => item.name === "傻柱").status, "candidate");
    assert.equal(store.usedTokens, 15);
  });
});

test("generateCharacterProfile transitions candidate to generated with arcs and scenes", async () => {
  const store = createMemoryStore([{ id: "char-1", name: "许大茂", role: "主角", status: "candidate" }]);
  const promptRunner = async ({ asset }) => {
    assert.equal(asset.id, "bookAnalysis.character.profile");
    return promptResult(
      {
        character: {
          name: "许大茂",
          role: "主角",
          profile: { name: "许大茂", role: "主角", personality: "精明外放" },
          evidence: [{ label: "人物", excerpt: "许大茂登场", sourceLabel: "notes" }],
          arcs: [{ stageLabel: "登场建立目标", stateSnapshot: { goal: "争取机会" } }],
          scenes: [{ sceneLabel: "登场场景", sceneType: "亮相", performance: { technique: "对比" } }],
        },
      },
      { promptTokens: 20, completionTokens: 30, totalTokens: 50 },
    );
  };

  await withPatchedPrisma(store, async () => {
    const service = new BookAnalysisCharacterService(createSourceCache(), promptRunner);
    const row = await service.generateCharacterProfile("analysis-1", "char-1", {
      generationDepth: "standard",
      selectedDimensions: ["basic", "personality", "arc", "scenes"],
    });
    assert.equal(row.status, "generated");
    assert.equal(row.profile.personality, "精明外放");
    assert.equal(row.arcs.length, 1);
    assert.equal(row.scenes.length, 1);
    assert.equal(store.usedTokens, 50);
  });
});

test("generateCharacterProfile marks failed status when prompt fails", async () => {
  const store = createMemoryStore([{ id: "char-1", name: "许大茂", role: "主角", status: "candidate" }]);
  const promptRunner = async () => {
    throw new Error("model failed");
  };

  await withPatchedPrisma(store, async () => {
    const service = new BookAnalysisCharacterService(createSourceCache(), promptRunner);
    await assert.rejects(
      () => service.generateCharacterProfile("analysis-1", "char-1", {
        generationDepth: "quick",
        selectedDimensions: ["basic"],
      }),
      /model failed/,
    );
    assert.equal(store.characters[0].status, "failed");
    assert.match(store.characters[0].lastGenerationError, /model failed/);
  });
});

test("generateAllCandidates skips generated rows and processes failed candidates", async () => {
  const store = createMemoryStore([{
    id: "char-1",
    name: "已完成",
    role: "角色",
    status: "generated",
    profileJson: JSON.stringify({ name: "已完成", role: "角色" }),
  }, {
    id: "char-2",
    name: "候选",
    role: "角色",
    status: "candidate",
  }, {
    id: "char-3",
    name: "失败候选",
    role: "角色",
    status: "failed",
  }]);
  const generatedNames = [];
  const promptRunner = async ({ promptInput }) => {
    generatedNames.push(promptInput.character.name);
    return promptResult(
      {
        character: {
          name: promptInput.character.name,
          role: promptInput.character.role,
          profile: { name: promptInput.character.name, role: promptInput.character.role },
          evidence: [],
          arcs: [],
          scenes: [],
        },
      },
      { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
    );
  };

  await withPatchedPrisma(store, async () => {
    const service = new BookAnalysisCharacterService(createSourceCache(), promptRunner);
    const rows = await service.generateAllCandidates("analysis-1", {
      generationDepth: "quick",
      selectedDimensions: ["basic"],
      includeFailed: true,
    });
    assert.deepEqual(generatedNames.sort(), ["候选", "失败候选"].sort());
    assert.equal(rows.filter((item) => item.status === "generated").length, 3);
    assert.equal(store.usedTokens, 4);
  });
});

test("legacy generateCharacters identifies then generates profiles", async () => {
  const store = createMemoryStore([]);
  const promptRunner = async ({ asset, promptInput }) => {
    if (asset.id === "bookAnalysis.character.identify") {
      return promptResult(
        {
          candidates: [{ name: "许大茂", roleHint: "主角", importance: "high", briefDescription: "核心人物", occurringChapters: [] }],
        },
        { promptTokens: 3, completionTokens: 2, totalTokens: 5 },
      );
    }
    return promptResult(
      {
        character: {
          name: promptInput.character.name,
          role: promptInput.character.role,
          profile: { name: promptInput.character.name, role: promptInput.character.role },
          evidence: [],
          arcs: [],
          scenes: [],
        },
      },
      { promptTokens: 5, completionTokens: 5, totalTokens: 10 },
    );
  };

  await withPatchedPrisma(store, async () => {
    const service = new BookAnalysisCharacterService(createSourceCache(), promptRunner);
    const rows = await service.generateCharacters("analysis-1", {
      generationDepth: "quick",
      selectedDimensions: ["basic"],
    });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].status, "generated");
    assert.equal(store.usedTokens, 15);
  });
});
