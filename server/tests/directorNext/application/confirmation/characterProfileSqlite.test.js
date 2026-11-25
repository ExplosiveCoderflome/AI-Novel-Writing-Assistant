const test = require("node:test");
const assert = require("node:assert/strict");
const { once } = require("node:events");
const { mkdtempSync } = require("node:fs");
const { tmpdir } = require("node:os");
const path = require("node:path");
const { setTimeout: delay } = require("node:timers/promises");
const { initializeTemporarySqliteDatabase } = require("../../../testInfrastructure/tempSqliteDatabase.cjs");

test("role profile discussion proposes edits to one character, and saving stays at the cast gate", async () => {
  Object.assign(process.env, {
    DATABASE_URL: initializeTemporarySqliteDatabase(mkdtempSync(path.join(tmpdir(), "director-character-profile-")), "fixture.db"),
    RAG_ENABLED: "false",
  });
  const express = require("express");
  const { prisma } = require("../../../../dist/db/prisma");
  const { directorCharacterProfileRouter } = require("../../../../dist/app/director/revisions/characterProfile");
  const { ensureVolumeWorkspaceDocument } = require("../../../../dist/services/novel/volume/volumeWorkspacePersistence");
  const { errorHandler } = require("../../../../dist/middleware/errorHandler");
  const runner = require("../../../../dist/prompting/core/promptRunner");
  const originalRunner = runner.runStructuredPrompt;
  let receivedInput;
  runner.runStructuredPrompt = async input => {
    receivedInput = input;
    return {output: {replyText: "给她改个名字，并补一点经商经历。", changes: [
      {field: "name", value: "林晓", reason: "沿用原姓，保留身份辨识度。"},
      {field: "background", value: "曾替前东家追讨船款。", reason: "让她熟悉追账的难处。"},
    ]}};
  };
  const app = express();
  app.use(express.json(), directorCharacterProfileRouter(), errorHandler);
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const root = "http://127.0.0.1:" + server.address().port + "/novels/";
  const profile = root + "book/characters/lead/profile";
  const conversation = profile + "/conversation";
  const send = (url, method, body) => fetch(url, {
    method, body: JSON.stringify(body), headers: {"Content-Type": "application/json"},
  });
  const read = async url => {
    const response = await fetch(url);
    assert.equal(response.status, 200);
    return (await response.json()).data;
  };
  const rename = (before, after) => ({field: "name", before, after});
  try {
    await prisma.novel.createMany({data: [
      {id: "book", title: "船行", directorVersion: "v2", description: "掌柜开辟新的商路。"},
      {id: "another", title: "外书", directorVersion: "v2", outline: "阿商继承了老街的钥匙。"},
    ]});
    await prisma.character.createMany({data: [
      {id: "lead", novelId: "book", name: "林晚", role: "掌柜", background: "曾在药铺管账。"},
      {id: "ally", novelId: "book", name: "沈砚舟", role: "账房"},
      {id: "merchant", novelId: "another", name: "阿商", role: "钥匙保管人"},
    ]});
    await prisma.characterRelation.create({data: {
      novelId: "book", sourceCharacterId: "lead", targetCharacterId: "ally", surfaceRelation: "合伙人",
    }});
    await prisma.directorNextRun.create({data: {id: "run", novelId: "book", driver: "assisted", planVersion: "test", contractJson: "{}"}});
    await prisma.directorNextRunControl.create({data: {runId: "run", novelId: "book", status: "waiting_gate", version: 7}});
    const starter = await ensureVolumeWorkspaceDocument({novelId: "book", getLegacySource: async () => ({chapters: []})});
    assert.ok(starter.activeVersionId);
    assert.equal((await fetch(root + "another/characters/lead/profile")).status, 404);
    assert.ok((await read(root + "another/characters/merchant/profile")).renameBlockedReason);
    const initialProfile = await read(profile);
    assert.equal(initialProfile.renameBlockedReason, null);
    const base = initialProfile.fields;
    const request = {requestId: "turn-1", requestText: "把她改名林晓，再补一点经商经历。", base, draft: base};
    assert.equal((await send(conversation + "/turns", "POST", request)).status, 202);
    let suggestions;
    for (let attempt = 0; attempt < 100 && !suggestions; attempt++) {
      const [turn] = await read(conversation);
      if (turn?.status === "failed") assert.fail(turn.replyText);
      suggestions = turn?.result?.changes;
      if (!suggestions) await delay(20);
    }
    assert.deepEqual(suggestions?.map(item => item.before), [base.name, base.background]);
    assert.equal(receivedInput.asset.id, "novel.director.character_profile_dialogue");
    assert.deepEqual((await read(profile)).fields, base);
    assert.equal((await send(profile, "PATCH", {changes: [rename("林晚", "沈砚舟")]})).status, 409);
    const changes = suggestions.map(({field, before, value}) => ({field, before, after: value}));
    assert.equal((await send(profile, "PATCH", {changes})).status, 200);
    const saved = (await read(profile)).fields;
    assert.equal(saved.name, "林晓");
    assert.equal(saved.background, "曾替前东家追讨船款。");
    assert.equal(await prisma.characterRelation.count({where: {sourceCharacterId: "lead", targetCharacterId: "ally"}}), 1);
    const gate = await prisma.directorNextRunControl.findUnique({where: {runId: "run"}});
    assert.equal(gate.status, "waiting_gate");
    assert.equal(gate.version, 7);
    assert.equal((await send(profile, "PATCH", {changes: [{field: "background", before: base.background, after: "陈年旧事"}]})).status, 409);

    await prisma.novel.update({where: {id: "book"}, data: {outline: "林晓携契约去见商队。"}});
    assert.ok((await read(profile)).renameBlockedReason);
    await prisma.novel.update({where: {id: "book"}, data: {outline: starter.derivedOutline}});
    const starterVolume = starter.volumes[0];
    await prisma.volumePlan.update({where: {id: starterVolume.id}, data: {climax: "林晓在潮水涨起前救下货船。"}});
    assert.ok((await read(profile)).renameBlockedReason);
    await prisma.volumePlan.update({where: {id: starterVolume.id}, data: {climax: starterVolume.climax}});
    await prisma.chapter.create({data: {novelId: "book", title: "开张", order: 1, content: "林晓摘下船行的招牌。"}});
    assert.ok((await read(profile)).renameBlockedReason);
    assert.equal((await send(profile, "PATCH", {changes: [rename("林晓", "林越")]})).status, 409);
    assert.equal((await send(profile, "PATCH", {changes: [{field: "voiceTexture", before: "", after: "说话干练。"}]})).status, 200);
    await prisma.directorNextRunControl.update({where: {runId: "run"}, data: {status: "running"}});
    assert.ok((await read(profile)).editBlockedReason);
    assert.equal((await send(profile, "PATCH", {changes: [{field: "voiceTexture", before: "说话干练。", after: "说话缓慢。"}]})).status, 409);
    assert.equal((await send(conversation + "/turns", "POST", {...request, requestId: "turn-2"})).status, 409);
  } finally {
    runner.runStructuredPrompt = originalRunner;
    await new Promise(done => server.close(done));
    await prisma.$disconnect();
  }
});
