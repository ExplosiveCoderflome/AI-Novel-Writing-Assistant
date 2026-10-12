const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const {initializeTemporarySqliteDatabase} = require('../testInfrastructure/tempSqliteDatabase.cjs');

test('V2 character enrichment preserves ownership and progress in an isolated SQLite database', () => {
  const server = path.resolve(__dirname, '../..');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'v2-character-enrichment-'));
  const databaseUrl = initializeTemporarySqliteDatabase(dir, 'test.db');
  const script = path.join(dir, 'enrichment.cjs');
  fs.writeFileSync(script, String.raw`
const assert = require('node:assert/strict');
const path = require('node:path');
const base = process.env.TEST_SERVER_ROOT;
const {prisma} = require(path.join(base, 'dist/db/prisma'));
const {DirectorV2CharacterEnrichmentService} = require(path.join(base, 'dist/services/novel/characterPrep/deferred'));
const {NovelSideEffectJobService} = require(path.join(base, 'dist/events/sideEffects/NovelSideEffectJobService'));
const {NovelSideEffectWorker} = require(path.join(base, 'dist/events/sideEffects/NovelSideEffectWorker'));
const {CharacterVisibleProfileService} = require(path.join(base, 'dist/services/novel/characterProfile/CharacterVisibleProfileService'));
const {CharacterMindService} = require(path.join(base, 'dist/services/novel/characterMind/CharacterMindService'));
const {buildChapterArtifactContentHash: hash} = require(path.join(base, 'dist/services/novel/runtime/artifactSync/ChapterArtifactContentVersion'));
const {CHAPTER_ARTIFACT_BOUNDARY_TYPE} = require(path.join(base, 'dist/services/novel/runtime/artifactSync'));
require(path.join(base, 'dist/prompting/core/promptRunner')).runStructuredPrompt = async () => {throw new Error('Paid generation is forbidden in this test');};
let calls = 0;
CharacterVisibleProfileService.prototype.generateCharacterVisibleProfile = async (_book, id, options) => {
  calls++;
  assert.equal(options.model, 'frozen-model');
  await prisma.character.update({where: {id}, data: {physique: '作者在生成期间补写的体态'}});
  return {fields: {appearance: '不能覆盖已有样貌', physique: '不能覆盖作者体态', attireStyle: '常穿一件青色旧衫',
    signatureDetail: '袖口有一圈细密旧针脚', voiceTexture: '音量低缓，短句之间略停', presenceImpression: '安静站立时也留意周围动静'}};
};
(async () => {
  try {
    await prisma.novel.create({data: {id: 'book', title: '隔离测试', directorVersion: 'v2', directorEpoch: 4}});
    await prisma.character.create({data: {id: 'actor', novelId: 'book', name: '沈夜', role: '主角', appearance: '正文明确写下的旧疤'}});
    await prisma.characterMindSnapshot.create({data: {id: 'final-mind', novelId: 'book', characterId: 'actor',
      sourceType: 'artifact_delta', currentInterpretation: '正文资源回填的新思路', evidenceJson: '[]', isCurrent: true}});
    await prisma.characterCastOption.create({data: {id: 'cast', novelId: 'book', title: '核心阵容', summary: '测试', status: 'applied',
      members: {create: {name: '沈夜', role: '主角', castRole: 'protagonist', storyFunction: '推动主线', sortOrder: 0}}}});
    await prisma.directorNextRun.create({data: {id: 'run', novelId: 'book', driver: 'auto', planVersion: 'test',
      contractJson: JSON.stringify({runId: 'run', novelId: 'book', executionEpoch: 4,
        modelConfig: {route: 'deepseek', model: 'frozen-model'}, launchInput: {temperature: 0.6}})}});
    const content = '最终修复并保存的正文';
    await prisma.chapter.create({data: {id: 'chapter', novelId: 'book', title: '第一章', order: 1, content, generationState: 'approved'}});
    await prisma.chapterArtifactSyncCheckpoint.create({data: {novelId: 'book', chapterId: 'chapter',
      artifactType: CHAPTER_ARTIFACT_BOUNDARY_TYPE, syncMode: 'adaptive', status: 'succeeded', contentHash: hash(content),
      metadataJson: JSON.stringify({outcome: 'completed', completedArtifacts: ['artifact_delta']})}});
    await prisma.generationJob.create({data: {id: 'pipeline', novelId: 'book', status: 'succeeded', startOrder: 1, endOrder: 3,
      payload: JSON.stringify({directorNext: {runId: 'run'}})}});
    const service = new DirectorV2CharacterEnrichmentService();
    await service.scheduleAfterPipeline('book', 'pipeline');
    await service.scheduleAfterPipeline('book', 'pipeline');
    assert.equal(await prisma.novelSideEffectJob.count(), 1, 'one durable task per epoch/cast');
    const queued = await prisma.novelSideEffectJob.findFirst();
    const payload = JSON.parse(queued.payloadJson);
    await prisma.generationJob.create({data: {id: 'next-pipeline', novelId: 'book', status: 'running', startOrder: 4, endOrder: 6}});
    const worker = new NovelSideEffectWorker(new NovelSideEffectJobService(), undefined, {workerId: 'test-worker'});
    await worker.tick();
    let saved = await prisma.novelSideEffectJob.findUnique({where: {id: queued.id}});
    assert.equal(saved.status, 'pending'); assert.equal(saved.attempts, 0); assert.equal(calls, 0);
    await prisma.generationJob.update({where: {id: 'next-pipeline'}, data: {status: 'succeeded'}});
    await prisma.novelSideEffectJob.update({where: {id: queued.id}, data: {runAfter: new Date(0)}});
    await worker.tick();
    saved = await prisma.novelSideEffectJob.findUnique({where: {id: queued.id}});
    assert.equal(saved.status, 'succeeded'); assert.equal(calls, 1);
    const actor = await prisma.character.findUnique({where: {id: 'actor'}});
    assert.equal(actor.appearance, '正文明确写下的旧疤');
    assert.equal(actor.physique, '作者在生成期间补写的体态');
    assert.equal(actor.attireStyle, '常穿一件青色旧衫');
    assert.equal(await prisma.characterMindSnapshot.count({where: {isCurrent: true}}), 1);
    await new CharacterMindService().persistSnapshots('book', [{characterId: 'actor', sourceChapterId: null, sourceType: 'bootstrap',
      snapshot: {currentInterpretation: '过期初始推断', evidence: ['开书资料']}}], {onlyMissing: true});
    assert.equal((await prisma.characterMindSnapshot.findUnique({where: {id: 'final-mind'}})).isCurrent, true);
    assert.equal(await service.execute(payload), 'completed'); assert.equal(calls, 1);
    await prisma.novel.update({where: {id: 'book'}, data: {directorVersion: 'v1', directorEpoch: 5}});
    assert.equal(await service.execute(payload), 'skipped'); assert.equal(calls, 1);
    console.log('SQLite enrichment: durable dedupe, idle deferral, guarded fill, mind preservation and V1 isolation passed');
  } finally {await prisma.$disconnect();}
})().catch(error => {console.error(error); process.exitCode = 1;});
`);
  try {
    const output = execFileSync(process.execPath, [script], {cwd: server, encoding: 'utf8',
      env: {...process.env, DATABASE_PROVIDER: 'sqlite', DATABASE_URL: databaseUrl, TEST_SERVER_ROOT: server,
        DIRECTOR_NEXT_ENABLED: 'true', DIRECTOR_V2_ENABLED: 'true'}, timeout: 90_000});
    if (!output.includes('V1 isolation passed')) throw new Error(output);
  } finally {
    const resolved = path.resolve(dir);
    if (path.dirname(resolved) !== path.resolve(os.tmpdir()) || !path.basename(resolved).startsWith('v2-character-enrichment-')) throw new Error('Unsafe test cleanup path');
    fs.rmSync(resolved, {recursive: true, force: true});
  }
});
