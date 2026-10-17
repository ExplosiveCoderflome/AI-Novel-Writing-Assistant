const test = require('node:test');
const assert = require('node:assert/strict');
const { prisma } = require('../../dist/db/prisma');
const factory = require('../../dist/llm/factory');
const templates = require('../../dist/prompting/templates/templateRuntime');
const { HumanMessage } = require('@langchain/core/messages');
const { ChapterTaskSheetQualityGateService } = require('../../dist/services/novel/volume/ChapterTaskSheetQualityGateService');
const { reviewChapterExecutionContinuity } = require('../../dist/services/novel/volume/chapterDetail');
const { ChapterExecutionContractService } = require('../../dist/services/novel/volume/ChapterExecutionContractService');
const generation = require('../../dist/services/novel/volume/volumeGenerationOrchestrator');
const { normalizeChapterScenePlan, serializeChapterScenePlan } = require('../../../shared/dist/types/chapterLengthControl');

function fixture(t) {
  const originals = [factory.resolveLLMClientOptions, templates.resolveAdvancedPromptMessages,
    ChapterTaskSheetQualityGateService.prototype.evaluate, prisma.chapterArtifactSyncCheckpoint.findUnique,
    prisma.chapterArtifactSyncCheckpoint.upsert, prisma.chapter.findFirst, generation.generateVolumePlanDocument];
  const rows = new Map(), calls = [], generated = [];
  const sceneCards = serializeChapterScenePlan(normalizeChapterScenePlan({ scenes: [1, 2, 3].map(n => ({
    key: 's' + n, title: '场景' + n, purpose: '核对工牌和信件', entryState: '两人在邮局', exitState: '确认新线索',
    mustAdvance: ['核对学校'], mustPreserve: ['保留手抄件'], forbiddenExpansion: ['不提前揭晓真相'], targetWordCount: 1000,
  })) }, 3000));
  const candidate = { id: 'p4', chapterId: 'c4', chapterOrder: 4, title: '工牌对上了', summary: '核对工牌',
    purpose: '比对信件旧校名', exclusiveEvent: '发现父亲真实履历', endingState: '获得邮戳编号', nextChapterEntryState: '查找分拣口',
    conflictLevel: 3, revealLevel: 2, targetWordCount: 3000, mustAvoid: '不得提前揭晓秘密', payoffRefs: [],
    taskSheet: '苏晚离开钟表铺时，林砚发现邮戳编号。', sceneCards };
  const chapter = { ...candidate, id: 'c4', novelId: 'n', order: 4, content: '' };
  const previous = { order: 3, title: '信纸多出一行', content: '林砚把自己手抄的纸翻过来，背面有了周德海的名字。两人离开钟表铺，向邮局走去。' };
  const state = { assessment: { verdict: 'usable', safeToSync: true, loadRisk: 'normal', recommendedHandling: 'use_as_is',
    summary: '可以承接', issues: [], repairGuidance: [], confidence: 0.9 }, templateSuffix: '', sourceChangesDuringReview: false };
  factory.resolveLLMClientOptions = async (_provider, options) => ({ provider: 'deepseek', model: options.model,
    baseURL: 'https://offline.invalid', temperature: 0.1, requestProtocol: 'chat_completions' });
  templates.resolveAdvancedPromptMessages = async ({ officialMessages }) => state.templateSuffix
    ? [...officialMessages, new HumanMessage(state.templateSuffix)] : officialMessages;
  ChapterTaskSheetQualityGateService.prototype.evaluate = async (input, options) => {
    calls.push(input);
    if (state.sourceChangesDuringReview) previous.content += '父亲出现了。';
    await options.onEvaluated({ assessment: state.assessment });
    return {};
  };
  const key = input => JSON.stringify(input.where);
  prisma.chapterArtifactSyncCheckpoint.findUnique = async input => rows.get(key(input)) ?? null;
  prisma.chapterArtifactSyncCheckpoint.upsert = async input => { rows.set(key(input), input.create); return input.create; };
  prisma.chapter.findFirst = async ({ where }) => where.id ? chapter : previous;
  const stop = new Error('offline generator boundary');
  generation.generateVolumePlanDocument = async input => { generated.push(input); throw stop; };
  const service = new ChapterExecutionContractService({ ensureVolumeWorkspace: async () => ({ novelId: 'n', volumes: [{ id: 'v', chapters: [candidate] }] }),
    findVolumeChapterMatch: () => ({ volumeId: 'v', volumeChapterId: 'p4' }),
    styleBindingService: { resolveForGeneration: async () => null } });
  t.after(() => { [factory.resolveLLMClientOptions, templates.resolveAdvancedPromptMessages,
    ChapterTaskSheetQualityGateService.prototype.evaluate, prisma.chapterArtifactSyncCheckpoint.findUnique,
    prisma.chapterArtifactSyncCheckpoint.upsert, prisma.chapter.findFirst, generation.generateVolumePlanDocument] = originals; });
  const options = { provider: 'deepseek', model: 'offline-model', chapterTaskSheetQualityMode: 'full_book_autopilot' };
  return { candidate, chapter, previous, state, calls, generated, rows, stop, service, options,
    direct: patch => reviewChapterExecutionContinuity({ ...candidate, novelId: 'n', previousChapterResult: {
      chapterOrder: previous.order, title: previous.title, summary: '', tail: previous.content, content: previous.content }, ...patch },
    { ...options, mode: 'full_book_autopilot' }) };
}

test('shape-ready plans are checked against saved prose once and reused only with identical effective inputs', async t => {
  const f = fixture(t);
  await f.service.ensureChapterExecutionContract('n', 'c4', f.options);
  await f.service.ensureChapterExecutionContract('n', 'c4', f.options);
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].previousChapterResult.content, f.previous.content);
  f.previous.content += '手抄件仍在内袋里。';
  await f.service.ensureChapterExecutionContract('n', 'c4', f.options);
  assert.equal(f.calls.length, 2);
  f.state.templateSuffix = '新的检查合同';
  await f.service.ensureChapterExecutionContract('n', 'c4', f.options);
  assert.equal(f.calls.length, 3);
  assert.equal(f.generated.length, 0);
});

test('AI continuity conflicts guide the existing contract generator before any writer receives the plan', async t => {
  const f = fixture(t);
  f.state.assessment = { ...f.state.assessment, verdict: 'repairable', safeToSync: false, recommendedHandling: 'repair_contract',
    summary: '前文已到邮局，不能无故回到钟表铺', repairGuidance: ['把编号发现移至邮局，并保留手抄件和已有字迹'] };
  await assert.rejects(f.service.ensureChapterExecutionContract('n', 'c4', f.options), error => error === f.stop);
  assert.equal(f.generated.length, 1);
  assert.equal(f.generated[0].options.forceRegenerate, true);
  assert.ok(f.generated[0].options.guidance.includes('移至邮局'));
  assert.equal(f.chapter.content, '');
  await assert.rejects(f.service.ensureChapterExecutionContract('n', 'c4', { ...f.options, chapterTaskSheetQualityMode: 'ai_copilot' }),
    /前文已到邮局/);
  assert.equal(f.generated.length, 1, 'manual planning requires confirmation rather than silently replacing the contract');
});

test('written chapters are retained and source edits during review cannot authorize stale plan reuse', async t => {
  const f = fixture(t);
  f.chapter.content = '作者已保存的正文';
  const saved = await f.service.ensureChapterExecutionContract('n', 'c4', f.options);
  assert.equal(saved.content, '作者已保存的正文');
  assert.equal(f.calls.length, 0);
  f.chapter.content = '';
  f.state.sourceChangesDuringReview = true;
  await assert.rejects(f.service.ensureChapterExecutionContract('n', 'c4', f.options), /正文在规划核对期间发生变化/);
  assert.equal(f.generated.length, 0);
});

test('missing prose and cancelled requests cannot trigger a semantic check', async t => {
  const f = fixture(t);
  assert.equal(await f.direct({ previousChapterResult: null }), null);
  const controller = new AbortController(); controller.abort(new Error('offline cancelled'));
  await assert.rejects(reviewChapterExecutionContinuity({ ...f.candidate, novelId: 'n', previousChapterResult: {
    chapterOrder: 3, title: '上一章', summary: '', tail: f.previous.content, content: f.previous.content } },
    { provider: 'deepseek', model: 'offline-model', signal: controller.signal }), /offline cancelled/);
  assert.equal(f.calls.length, 0);
});
