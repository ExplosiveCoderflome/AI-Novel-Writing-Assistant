const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const {randomUUID} = require('node:crypto');
const {initializeTemporarySqliteDatabase} = require('../testInfrastructure/tempSqliteDatabase.cjs');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'manual-consumers-'));
process.env.DATABASE_URL = initializeTemporarySqliteDatabase(directory, 'test.db');
process.env.NODE_ENV = 'test';
process.env.AI_NOVEL_RUNTIME = 'desktop';
process.env.AI_NOVEL_APP_DATA_DIR = directory;
const {prisma} = require('../../dist/db/prisma');
const {NovelCoreCrudService} = require('../../dist/services/novel/novelCoreCrudService');
const {ManualChapterSyncService, readManualChapterSync} = require('../../dist/services/novel/chapterEditor/synchronization');
const {ChapterArtifactRecoveryService} = require('../../dist/services/novel/runtime/artifactSync');
const {ChapterArtifactDeltaService} = require('../../dist/services/novel/runtime/ChapterArtifactDeltaService');
const {chapterArtifactBackgroundSyncService: background} = require('../../dist/services/novel/runtime/ChapterArtifactBackgroundSyncService');
const {chapterArtifactDeltaOutputSchema} = require('../../dist/prompting/prompts/novel/chapterArtifactDelta.prompts');
const {characterAppearanceService} = require('../../dist/services/novel/characters/appearances');
const {buildChapterArtifactContentHash: hash} = require('../../dist/services/novel/runtime/artifactSync/contracts');
const crud = new NovelCoreCrudService();
test.after(() => prisma.$disconnect());
const content = '青禾推开药铺门。阿宁递来药箱。';
const output = chapterArtifactDeltaOutputSchema.parse({summary: '药铺送药', stateDeltas: {}, confidence: .9,
  syncPlan: {reason: '手动修订'},
  characterAppearances: [{characterId: '', characterName: '阿宁', kind: 'present', summary: '递药箱', evidence: '阿宁递来药箱。'}],
  characterCandidates: [{proposedName: '阿宁', proposedRole: '药童', evidence: ['阿宁递来药箱。'], identityDecision: 'create', decisionReason: '独立行动的新人物'}]});

for (const status of ['completed', 'paused', 'waiting_gate', 'cancelled', 'failed']) {
  test(`saved manual prose reaches real character consumers with ${status} director unchanged`, async t => {
    t.mock.method(crud.volumeService, 'mirrorChapterIntoWorkspace', async () => {});
    t.mock.method(require('../../dist/prompting/core/promptRunner'), 'runStructuredPrompt', async () => {throw Error('Unexpected model call');});
    t.mock.method(background, 'shouldRunPayoffFullReconcile', async () => false);
    const novelId = randomUUID(), runId = randomUUID();
    await prisma.novel.create({data: {id: novelId, title: '手动修订', directorVersion: 'v2', directorEpoch: 2}});
    await prisma.directorNextRun.create({data: {id: runId, novelId, driver: 'auto', planVersion: 'test',
      contractJson: JSON.stringify({runId, novelId, driver: 'auto', executionEpoch: 2, modelConfig: {route: 'test', model: 'test'}})}});
    const before = await prisma.directorNextRunControl.create({data: {runId, novelId, status,
      pauseJson: status === 'paused' ? JSON.stringify({kind: 'manual_recovery', reason: '等待显式恢复'}) : null}});
    const chapter = await prisma.chapter.create({data: {novelId, order: 1, title: '药铺', content: '原文'}});
    await crud.updateChapter(novelId, chapter.id, {content, expectedContent: '原文'});
    const marker = await readManualChapterSync(novelId, chapter.id, content);
    const real = new ChapterArtifactDeltaService();
    let calls = 0;
    const recovery = new ChapterArtifactRecoveryService({deltaService: {
      extractChapterArtifacts: async () => {calls++; return {contentHash: hash(content), output};},
      applyChapterArtifactConsumer: input => ['character_appearances', 'character_locations'].includes(input.consumer)
        ? real.applyChapterArtifactConsumer(input) : Promise.resolve({}),
      toSyncResult: (extraction, aggregate) => ({...extraction, ...aggregate, requiresFullReconcile: false}),
    }});
    t.mock.method(background, 'getArtifactRecoveryService', () => recovery);
    const result = await new ManualChapterSyncService().run(JSON.parse(marker.metadataJson));
    assert.equal(result.status, 'completed');
    assert.equal(calls, 1);
    const added = await prisma.character.findFirstOrThrow({where: {novelId, name: '阿宁'}});
    assert.equal((await characterAppearanceService.read(novelId, added.id)).chapters[0].events.length, 1);
    assert.deepEqual(await prisma.directorNextRunControl.findUnique({where: {runId}}), before);
    assert.equal((await prisma.chapter.findUnique({where: {id: chapter.id}})).content, content);
    await assert.rejects(characterAppearanceService.applyFinalChapter({novelId, chapterId: chapter.id, content,
      contentHash: hash(content), directorRunId: runId, appearances: output.characterAppearances}), /停止/);
  });
}

test('manual appearance writes reject missing proof, stale attempts, cross-chapter markers and old epochs', async () => {
  const novelId = randomUUID();
  await prisma.novel.create({data: {id: novelId, title: '版本保护', directorVersion: 'v2', directorEpoch: 1}});
  const chapter = await prisma.chapter.create({data: {novelId, order: 1, title: '原稿', content}});
  const revision = randomUUID(), metadataJson = JSON.stringify({novelId, chapterId: chapter.id, contentHash: hash(content), revision, attemptId: randomUUID()});
  const marker = await prisma.chapterArtifactSyncCheckpoint.create({data: {novelId, chapterId: chapter.id, contentHash: hash(content),
    artifactType: 'manual_chapter_sync:v1', syncMode: 'manual', status: 'running', metadataJson}});
  const input = {novelId, chapterId: chapter.id, content, contentHash: hash(content), appearances: [], manualRevision: revision,
    revisionGuard: {id: marker.id, metadataJson, novel: {directorEpoch: 1, directorVersion: 'v2'}}};
  await assert.rejects(characterAppearanceService.applyFinalChapter({...input, revisionGuard: undefined}), /修订/);
  await assert.rejects(characterAppearanceService.applyFinalChapter({...input, chapterId: 'foreign'}), /修订/);
  await prisma.chapterArtifactSyncCheckpoint.update({where: {id: marker.id}, data: {metadataJson: JSON.stringify({...JSON.parse(metadataJson), attemptId: randomUUID()})}});
  await assert.rejects(characterAppearanceService.applyFinalChapter(input), /修订/);
  await prisma.chapterArtifactSyncCheckpoint.update({where: {id: marker.id}, data: {metadataJson}});
  await prisma.novel.update({where: {id: novelId}, data: {directorEpoch: 2}});
  await assert.rejects(characterAppearanceService.applyFinalChapter(input), /修订/);
  assert.equal(await prisma.chapterArtifactSyncCheckpoint.count({where: {novelId, artifactType: 'director_v2_character_appearances:v1'}}), 0);
});
