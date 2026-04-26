const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");

const { createApp } = require("../dist/app.js");
const {
  characterLibrarySyncService,
  sanitizeBaseCharacterDraft,
} = require("../dist/services/character/CharacterLibrarySyncService.js");

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve(address.port);
    });
  });
}

test("sanitizeBaseCharacterDraft keeps runtime state out of library payloads", () => {
  const draft = sanitizeBaseCharacterDraft({
    name: "林青",
    role: "冷静的盟友",
    personality: "克制、敏锐，会在压力下先观察再行动。",
    background: "出身边城，熟悉旧案线索。",
    development: "从旁观者逐步成为愿意承担代价的同行者。",
    appearance: "利落短发，常穿深色外套。",
    weaknesses: "过度自我保护。",
    interests: "习惯记录细节。",
    keyEvents: "旧案失去亲友；被主角救下；选择公开证词。",
    tags: "盟友,旧案,克制",
    category: "配角",
    currentState: "第十二章后重伤昏迷",
    currentGoal: "逃离追捕",
  });

  assert.equal(draft.name, "林青");
  assert.equal(Object.hasOwn(draft, "currentState"), false);
  assert.equal(Object.hasOwn(draft, "currentGoal"), false);
});

test("character sync routes expose import and save entrypoints without touching other novels", async () => {
  const originalImport = characterLibrarySyncService.importBaseCharacterToNovel;
  const originalSave = characterLibrarySyncService.saveNovelCharacterToLibrary;
  const captured = {
    importNovelId: null,
    importBody: null,
    saveNovelId: null,
    saveCharacterId: null,
    saveBody: null,
  };

  characterLibrarySyncService.importBaseCharacterToNovel = async function importMock(novelId, body) {
    captured.importNovelId = novelId;
    captured.importBody = body;
    return {
      character: {
        id: "char_imported",
        novelId,
        name: "林青",
        role: "盟友",
        baseCharacterId: body.baseCharacterId,
      },
      link: {
        id: "link_1",
        novelId,
        characterId: "char_imported",
        baseCharacterId: body.baseCharacterId,
        baseRevisionId: "rev_1",
        syncPolicy: "manual_review",
        linkStatus: "linked",
        localOverrides: {},
        lastSyncedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    };
  };

  characterLibrarySyncService.saveNovelCharacterToLibrary = async function saveMock(novelId, characterId, body) {
    captured.saveNovelId = novelId;
    captured.saveCharacterId = characterId;
    captured.saveBody = body;
    return {
      baseCharacter: {
        id: "base_new",
        name: body.baseCharacter.name,
      },
      character: {
        id: characterId,
        novelId,
        name: body.baseCharacter.name,
      },
      link: {
        id: "link_2",
        novelId,
        characterId,
        baseCharacterId: "base_new",
        baseRevisionId: "rev_new",
        syncPolicy: "manual_review",
        linkStatus: "linked",
        localOverrides: {},
        lastSyncedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    };
  };

  const app = createApp();
  const server = http.createServer(app);
  const port = await listen(server);

  try {
    const importResponse = await fetch(`http://127.0.0.1:${port}/api/novels/novel_a/characters/import-base-character`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        baseCharacterId: "base_1",
        mode: "linked",
        overrides: { currentState: "只属于 novel_a 的开场状态" },
      }),
    });
    assert.equal(importResponse.status, 201);
    assert.equal(captured.importNovelId, "novel_a");
    assert.equal(captured.importBody.baseCharacterId, "base_1");
    assert.equal(captured.importBody.overrides.currentState, "只属于 novel_a 的开场状态");

    const saveResponse = await fetch(`http://127.0.0.1:${port}/api/novels/novel_a/characters/char_1/library-sync/save-to-library`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        baseCharacter: {
          name: "林青",
          role: "盟友",
          personality: "克制、敏锐。",
          background: "旧案相关人物。",
          development: "从旁观者转为同行者。",
          category: "配角",
          tags: "盟友,旧案",
        },
      }),
    });
    assert.equal(saveResponse.status, 201);
    assert.equal(captured.saveNovelId, "novel_a");
    assert.equal(captured.saveCharacterId, "char_1");
    assert.equal(captured.saveBody.baseCharacter.name, "林青");
  } finally {
    characterLibrarySyncService.importBaseCharacterToNovel = originalImport;
    characterLibrarySyncService.saveNovelCharacterToLibrary = originalSave;
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});
