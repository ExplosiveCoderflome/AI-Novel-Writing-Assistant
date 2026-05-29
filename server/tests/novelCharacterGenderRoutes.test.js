const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");

const { createApp } = require("../dist/app.js");
const {
  DefaultNovelApplicationServices,
} = require("../dist/services/novel/application/NovelApplicationServices.js");

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve(address.port);
    });
  });
}

test("character routes accept and return gender fields", async () => {
  const originalCreateCharacter = DefaultNovelApplicationServices.prototype.createCharacter;
  const originalUpdateCharacter = DefaultNovelApplicationServices.prototype.updateCharacter;
  const originalApplySupplementalCharacter = DefaultNovelApplicationServices.prototype.applySupplementalCharacter;
  const captured = {
    createBody: null,
    updateBody: null,
    supplementalBody: null,
  };

  DefaultNovelApplicationServices.prototype.createCharacter = async function createCharacterMock(_novelId, body) {
    captured.createBody = body;
    return {
      id: "char_1",
      novelId: "novel_gender",
      name: body.name,
      role: body.role,
      gender: body.gender ?? "unknown",
      castRole: body.castRole ?? null,
      storyFunction: body.storyFunction ?? null,
      relationToProtagonist: body.relationToProtagonist ?? null,
      personality: body.personality ?? null,
      background: body.background ?? null,
      development: body.development ?? null,
      outerGoal: body.outerGoal ?? null,
      innerNeed: null,
      fear: null,
      wound: null,
      misbelief: null,
      secret: null,
      moralLine: null,
      firstImpression: null,
      arcStart: null,
      arcMidpoint: null,
      arcClimax: null,
      arcEnd: null,
      currentState: null,
      currentGoal: null,
      lastEvolvedAt: null,
      baseCharacterId: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  };
  DefaultNovelApplicationServices.prototype.updateCharacter = async function updateCharacterMock(_novelId, _charId, body) {
    captured.updateBody = body;
    return {
      id: "char_1",
      novelId: "novel_gender",
      name: body.name ?? "刘雪婷",
      role: body.role ?? "主角",
      gender: body.gender ?? "unknown",
      castRole: body.castRole ?? null,
      storyFunction: body.storyFunction ?? null,
      relationToProtagonist: body.relationToProtagonist ?? null,
      personality: body.personality ?? null,
      background: body.background ?? null,
      development: body.development ?? null,
      outerGoal: body.outerGoal ?? null,
      innerNeed: null,
      fear: null,
      wound: null,
      misbelief: null,
      secret: null,
      moralLine: null,
      firstImpression: null,
      arcStart: null,
      arcMidpoint: null,
      arcClimax: null,
      arcEnd: null,
      currentState: null,
      currentGoal: null,
      lastEvolvedAt: null,
      baseCharacterId: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  };
  DefaultNovelApplicationServices.prototype.applySupplementalCharacter = async function applySupplementalCharacterMock(_novelId, body) {
    captured.supplementalBody = body;
    return {
      character: {
        id: "char_sup_1",
        novelId: "novel_gender",
        name: body.name,
        role: body.role,
        gender: body.gender,
        castRole: body.castRole,
        storyFunction: body.storyFunction,
        relationToProtagonist: body.relationToProtagonist ?? null,
        personality: body.personality ?? null,
        background: body.background ?? null,
        development: body.development ?? null,
        outerGoal: body.outerGoal ?? null,
        innerNeed: body.innerNeed ?? null,
        fear: body.fear ?? null,
        wound: body.wound ?? null,
        misbelief: body.misbelief ?? null,
        secret: body.secret ?? null,
        moralLine: body.moralLine ?? null,
        firstImpression: body.firstImpression ?? null,
        arcStart: null,
        arcMidpoint: null,
        arcClimax: null,
        arcEnd: null,
        currentState: body.currentState ?? null,
        currentGoal: body.currentGoal ?? null,
        lastEvolvedAt: null,
        baseCharacterId: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      relationCount: 0,
    };
  };

  const app = createApp();
  const server = http.createServer(app);
  const port = await listen(server);

  try {
    const createResponse = await fetch(`http://127.0.0.1:${port}/api/novels/novel_gender/characters`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "刘雪婷",
        role: "主角",
        gender: "female",
      }),
    });
    assert.equal(createResponse.status, 201);
    const createPayload = await createResponse.json();
    assert.equal(createPayload.data.gender, "female");
    assert.equal(captured.createBody.gender, "female");

    const updateResponse = await fetch(`http://127.0.0.1:${port}/api/novels/novel_gender/characters/char_1`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        gender: "other",
      }),
    });
    assert.equal(updateResponse.status, 200);
    const updatePayload = await updateResponse.json();
    assert.equal(updatePayload.data.gender, "other");
    assert.equal(captured.updateBody.gender, "other");

    const supplementalResponse = await fetch(`http://127.0.0.1:${port}/api/novels/novel_gender/character-prep/supplemental-characters/apply`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "赵成",
        role: "宫廷前辈",
        gender: "male",
        castRole: "mentor",
        summary: "熟悉内廷规矩的前辈宦者。",
        storyFunction: "带主角看见秦宫规矩和赵高旧事。",
        relationToProtagonist: "半引路半试探",
        relations: [],
      }),
    });
    assert.equal(supplementalResponse.status, 200);
    const supplementalPayload = await supplementalResponse.json();
    assert.equal(supplementalPayload.data.character.gender, "male");
    assert.equal(captured.supplementalBody.gender, "male");
  } finally {
    DefaultNovelApplicationServices.prototype.createCharacter = originalCreateCharacter;
    DefaultNovelApplicationServices.prototype.updateCharacter = originalUpdateCharacter;
    DefaultNovelApplicationServices.prototype.applySupplementalCharacter = originalApplySupplementalCharacter;
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test("character cast apply route runs post-apply enhancements in background mode", async () => {
  const originalApplyCharacterCastOption = DefaultNovelApplicationServices.prototype.applyCharacterCastOption;
  let capturedApplyArgs = null;

  DefaultNovelApplicationServices.prototype.applyCharacterCastOption = async function applyCharacterCastOptionMock(...args) {
    capturedApplyArgs = args;
    return {
      optionId: args[1],
      createdCount: 2,
      updatedCount: 0,
      relationCount: 1,
      characterIds: ["char_1", "char_2"],
      primaryCharacterId: "char_1",
      qualityOverrideApplied: false,
      qualityWarnings: [],
    };
  };

  const app = createApp();
  const server = http.createServer(app);
  const port = await listen(server);

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/novels/novel_cast/character-prep/cast-options/option_1/apply`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider: "deepseek",
        model: "deepseek-chat",
        temperature: 0.45,
      }),
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.data.optionId, "option_1");
    assert.equal(capturedApplyArgs?.[0], "novel_cast");
    assert.equal(capturedApplyArgs?.[1], "option_1");
    assert.deepEqual(capturedApplyArgs?.[2], {
      overrideQualityGate: undefined,
      postApplyMode: "background",
      visibleProfileGeneration: {
        provider: "deepseek",
        model: "deepseek-chat",
        temperature: 0.45,
      },
    });
  } finally {
    DefaultNovelApplicationServices.prototype.applyCharacterCastOption = originalApplyCharacterCastOption;
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});
