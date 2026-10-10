const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

// No production database or paid model can cross this test's import boundary.
function loadSource(filename, imports) {
  const filenamePath = path.resolve(__dirname, '../../src', filename);
  const code = ts.transpileModule(fs.readFileSync(filenamePath, 'utf8'), {
    compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022},
  }).outputText;
  const exports = {};
  vm.runInThisContext(`(function(require,exports){${code}\n})`, {filename: filenamePath})((id) => {
    if (!Object.hasOwn(imports, id)) throw new Error(`Unmocked dependency: ${id}`);
    return imports[id];
  }, exports);
  return exports;
}

function fixture() {
  const state = {
    novel: {id: 'book', directorVersion: 'v2', directorEpoch: 4},
    contract: {novelId: 'book', runId: 'run', executionEpoch: 4,
      modelConfig: {route: 'deepseek', model: 'frozen-model'}, launchInput: {temperature: 0.6}},
    option: {id: 'cast', status: 'applied', members: [{name: '沈夜'}]},
    characters: [{id: 'actor', name: '沈夜', novelId: 'book', appearance: '正文确认的旧疤', physique: null,
      attireStyle: null, signatureDetail: null, voiceTexture: null, presenceImpression: null}],
    minds: [{characterId: 'actor', isCurrent: true, sourceType: 'artifact_delta'}],
    job: {id: 'pipeline', novelId: 'book', status: 'succeeded', startOrder: 1, endOrder: 3,
      payload: JSON.stringify({directorNext: {runId: 'run'}})},
    enabled: true, closed: true, busy: false, leaseValid: true, legacyReads: 0, queued: [], generated: [], mindCalls: [], usage: [], writes: [],
  };
  const db = {
    novel: {findUnique: async () => state.novel},
    directorNextRun: {findUnique: async () => ({id: 'run', novelId: 'book', contractJson: JSON.stringify(state.contract), control: {status: 'completed'}})},
    generationJob: {
      findUnique: async () => state.job,
      findFirst: async () => state.busy ? {id: 'next-pipeline'} : null,
    },
    chapter: {findMany: async () => state.closed ? [{id: 'chapter', order: 1, content: '最终修复并保存的正文', closed: true}] : []},
    characterCastOption: {findFirst: async () => state.option},
    character: {
      findMany: async () => state.characters,
      findFirst: async ({where}) => state.characters.find(c => c.id === where.id && c.novelId === where.novelId) ?? null,
      updateMany: async ({where, data}) => {
        const actor = state.characters.find(c => c.id === where.id && c.novelId === where.novelId);
        if (!actor || Object.entries(where).some(([key,value]) => !['id','novelId','novel'].includes(key) && actor[key] !== value)) return {count: 0};
        if (where.novel && state.novel.directorEpoch !== where.novel.directorEpoch) return {count: 0};
        Object.assign(actor, data); state.writes.push({...data}); return {count: 1};
      },
    },
    characterMindSnapshot: {findMany: async () => state.minds},
    novelSideEffectJob: {findFirst: async () => state.leaseValid ? {id: 'side-job'} : null},
    novelWorkflowTask: {findFirst: async () => {state.legacyReads++; throw new Error('V2 must never read the V1 seed');}},
  };
  db.$transaction = async callback => callback(db);
  const sideEffectJobs = {enqueueJob: async input => {
    const prior = state.queued.find(row => row.idempotencyKey === input.idempotencyKey);
    if (prior) return {created: false, job: prior};
    state.queued.push(input); return {created: true, job: input};
  }};
  const profileModule = {
    VISIBLE_PROFILE_FIELDS: ['appearance','physique','attireStyle','signatureDetail','voiceTexture','presenceImpression'],
    CharacterVisibleProfileService: class {
      async generateCharacterVisibleProfile(novelId, id, options) {
        state.generated.push({novelId,id,options});
        await state.onGenerate?.();
        return {fields: {appearance: 'AI 不能覆盖正文的样貌', physique: '身形瘦削，站立时背脊挺直',
          attireStyle: '常穿洗得发白的青色旧衫', signatureDetail: '说话前会轻抚袖边的旧线',
          voiceTexture: '声音低缓，说话时习惯先停半拍', presenceImpression: '初见安静，目光始终留意周围'}};
      }
    },
  };
  let service;
  const serviceFile = path.resolve(__dirname, '../../src/services/novel/characterPrep/deferred/DirectorV2CharacterEnrichmentService.ts');
  if (fs.existsSync(serviceFile)) {
    const serviceModule = loadSource('services/novel/characterPrep/deferred/DirectorV2CharacterEnrichmentService.ts', {
      '../../../../db/prisma': {prisma: db},
      '../../../../llm/usageTracking': {runWithLlmUsageTracking: async (context, runner) => {state.usage.push(context); return runner();}},
      '../../../../events/sideEffects/NovelSideEffectJobService': {novelSideEffectJobService: sideEffectJobs,
        NovelSideEffectLeaseLostError: class extends Error {}},
      '../../production/completion': {isCurrentV2ChapterProductionCompleted: c => c.closed},
      '../../runtime/artifactSync': {CHAPTER_ARTIFACT_BOUNDARY_TYPE: 'boundary'},
      '../../characterProfile/CharacterVisibleProfileService': profileModule,
      '../../characterMind/CharacterMindService': {characterMindService: {bootstrapMindStates: async (...args) => {state.mindCalls.push(args); return [];}}},
      '../../../../modules/novel/director-routing': {directorV2Available: () => state.enabled},
    });
    service = new serviceModule.DirectorV2CharacterEnrichmentService(db, sideEffectJobs);
  }
  const {EventBus} = loadSource('events/EventBus.ts', {});
  const {registerNovelEventHandlers} = loadSource('events/handlers/registerNovelEventHandlers.ts', {
    'node:crypto': require('node:crypto'), '../../db/prisma': {prisma: db},
    '../sideEffects': {novelSideEffectJobService: sideEffectJobs},
    '../../services/novel/characterPrep/deferred': {directorV2CharacterEnrichmentService: service},
  });
  const bus = new EventBus();
  registerNovelEventHandlers(bus, {sideEffectJobs});
  const complete = () => bus.emit({type: 'pipeline:completed', payload: {novelId: 'book', jobId: 'pipeline', status: 'succeeded'}});
  return {state, db, service, complete, bus};
}

test('pure V2 completion schedules one enrichment without any V1 task seed', async () => {
  const {state, complete} = fixture();
  await complete(); await complete();
  const jobs = state.queued.filter(j => j.jobType === 'character.v2DeferredEnrichment');
  assert.equal(jobs.length, 1);
  assert.deepEqual(jobs[0].payload, {novelId: 'book', runId: 'run', executionEpoch: 4, optionId: 'cast', characterIds: ['actor']});
});

const payload = {novelId: 'book', runId: 'run', executionEpoch: 4, optionId: 'cast', characterIds: ['actor']};

test('V2 chapter finalization bypasses legacy enrichment scheduling', async () => {
  const {state, bus} = fixture();
  await bus.emit({type: 'chapter:finalized', payload: {novelId: 'book', chapterId: 'chapter', chapterOrder: 1}});
  assert.equal(state.legacyReads, 0);
});

test('V1 fast-start still uses its own scheduling flow and execution epoch', async () => {
  const {state, db, bus} = fixture(); state.novel.directorVersion = 'v1';
  db.novelWorkflowTask.findFirst = async () => ({seedPayloadJson: JSON.stringify({startupPreparation: {
    strategy: 'fast_start', backgroundEnrichment: 'after_first_draft'}})});
  await bus.emit({type: 'chapter:finalized', payload: {novelId: 'book', chapterId: 'chapter', chapterOrder: 1}});
  assert.deepEqual(state.queued.map(j => j.jobType), ['character.postDraftEnrichment']);
  assert.equal(state.queued[0].payload.executionEpoch, 4);
});

test('disabled V2 defers pending work without model calls', async () => {
  const {state, service} = fixture(); state.enabled = false;
  assert.equal(await service.execute(payload), 'deferred'); assert.equal(state.generated.length, 0);
});

test('enrichment waits for the final resource boundary rather than a saved draft', async () => {
  const {state, complete} = fixture(); state.closed = false;
  await complete();
  assert.equal(state.queued.filter(j => j.jobType === 'character.v2DeferredEnrichment').length, 0);
});

test('failed generation cannot start optional character model calls', async () => {
  const {state, service} = fixture(); state.job.status = 'failed';
  await service.scheduleAfterPipeline('book', 'pipeline');
  assert.equal(state.queued.length, 0);
});

test('V1 books and obsolete V2 execution epochs never enqueue V2 enrichment', async () => {
  for (const change of [s => s.novel.directorVersion = 'v1', s => s.novel.directorEpoch = 5]) {
    const {state, complete} = fixture(); change(state); await complete();
    assert.equal(state.queued.filter(j => j.jobType === 'character.v2DeferredEnrichment').length, 0);
  }
});

test('active chapter production defers enrichment without generating anything', async () => {
  const {state, service} = fixture(); state.busy = true;
  assert.equal(await service.execute(payload), 'deferred');
  assert.equal(state.generated.length, 0); assert.equal(state.mindCalls.length, 0);
});

test('enrichment fills blanks using the frozen model and preserves finalized mind states', async () => {
  const {state, service} = fixture();
  assert.equal(await service.execute(payload), 'completed');
  assert.equal(state.characters[0].appearance, '正文确认的旧疤');
  assert.equal(state.characters[0].physique, '身形瘦削，站立时背脊挺直');
  assert.equal(state.generated[0].options.provider, 'deepseek');
  assert.equal(state.generated[0].options.model, 'frozen-model');
  assert.equal(state.mindCalls.length, 0);
  assert.equal(state.usage[0].directorNextRunId, 'run');
  assert.equal(state.usage[0].generationJobId, null);
  assert.equal(await service.execute(payload), 'completed');
  assert.equal(state.generated.length, 1, 'retry must reuse completed profile fields');
});

test('author edits made during generation take precedence over profile suggestions', async () => {
  const {state, service} = fixture();
  state.onGenerate = () => {state.characters[0].physique = '作者指定体态';};
  await service.execute(payload);
  assert.equal(state.characters[0].physique, '作者指定体态');
});

test('a version switch during the model call rejects all stale writes', async () => {
  const {state, service} = fixture(); state.onGenerate = () => {state.novel.directorEpoch = 5;};
  assert.equal(await service.execute(payload), 'skipped');
  assert.equal(state.writes.length, 0); assert.equal(state.mindCalls.length, 0);
});

test('replaced casts and stale owners skip without model calls', async () => {
  for (const change of [s => s.option.id = 'new-cast', s => s.novel.directorVersion = 'v1']) {
    const {state, service} = fixture(); change(state);
    assert.equal(await service.execute(payload), 'skipped'); assert.equal(state.generated.length, 0);
  }
});

test('missing mind states request guarded bootstrap rather than refreshing existing states', async () => {
  const {state, service} = fixture(); state.minds = [];
  await service.execute(payload);
  assert.deepEqual(state.mindCalls[0].slice(0,2), ['book', ['actor']]);
  assert.equal(state.mindCalls[0][2].onlyMissing, true);
  assert.equal(typeof state.mindCalls[0][2].assertWriteOwnership, 'function');
});

test('a background worker that loses its lease during AI generation cannot write', async () => {
  const {state, service} = fixture(); state.onGenerate = () => {state.leaseValid = false;};
  await assert.rejects(service.execute(payload, {id: 'side-job', leaseOwner: 'worker'}), /lease/i);
  assert.equal(state.writes.length, 0);
});

function mindFixture() {
  const writes = [];
  const db = {characterMindSnapshot: {
    findMany: async () => [{characterId: 'actor'}], findFirst: async () => ({id: 'final-mind', isCurrent: true}),
    updateMany: async () => {writes.push('archive'); return {count: 1};},
    create: async () => {writes.push('replace'); return {id: 'created', evidenceJson: '[]', beliefsJson: '[]', misbeliefsJson: '[]', createdAt: new Date(), updatedAt: new Date()};},
  }};
  db.$transaction = async callback => callback(db);
  const {CharacterMindService} = loadSource('services/novel/characterMind/CharacterMindService.ts', {
    '../../../db/prisma': {prisma: db},
    '../runtime/artifactSync/ChapterArtifactSyncResult': {ChapterArtifactContentVersionError: class extends Error {}},
    '../../../prompting/core/promptRunner': {runStructuredPrompt: async () => {throw new Error('completed minds must not trigger a model call');}},
    '../../../prompting/prompts/novel/characterMind.prompts': {characterMindSnapshotPrompt: {}, buildCharacterMindContextBlocks: () => []},
  });
  return {service: new CharacterMindService(), db, writes};
}

test('guarded bootstrap does no work when all requested minds already exist', async () => {
  const {service, writes} = mindFixture();
  assert.deepEqual(await service.bootstrapMindStates('book', ['actor'], {onlyMissing: true}), []);
  assert.deepEqual(writes, []);
});

test('a mind filled by resource backfill while AI runs cannot be replaced by deferred bootstrap', async () => {
  const {service, writes} = mindFixture();
  const result = await service.persistSnapshots('book', [{characterId: 'actor', sourceChapterId: null, sourceType: 'bootstrap',
    snapshot: {currentInterpretation: '旧推断', evidence: ['初始资料']}}], {onlyMissing: true});
  assert.deepEqual(result, []); assert.deepEqual(writes, []);
});

test('mind ownership is checked inside the write transaction', async () => {
  const {service, writes} = mindFixture();
  await assert.rejects(service.persistSnapshots('book', [{characterId: 'actor', sourceChapterId: null, sourceType: 'bootstrap',
    snapshot: {currentInterpretation: '旧推断', evidence: ['初始资料']}}], {
      onlyMissing: true, assertWriteOwnership: async () => {throw new Error('old epoch');},
    }), /old epoch/);
  assert.deepEqual(writes, []);
});
