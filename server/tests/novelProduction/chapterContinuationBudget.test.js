const test = require('node:test');
const assert = require('node:assert/strict');
const { loadRuntimeSource } = require('./sourceHarness.cjs');

test('chapter 17 continuation gets only the remaining character and output allowance', () => {
  const { buildContinuationBudget } = loadRuntimeSource('writing/ContinuationBudget.ts', {});
  const budget = buildContinuationBudget(2315, { targetWordCount: 3200, minWordCount: 2720, maxWordCount: 3680 });
  assert.equal(budget.minAdditionalCharacters, 405);
  assert.equal(budget.targetAdditionalCharacters, 885);
  assert.equal(budget.maxAdditionalCharacters, 1365);
  assert.ok(budget.maxOutputTokens < 2500);
});

test('adequate drafts and unspecified or invalid ranges need no paid extension', () => {
  const { buildContinuationBudget } = loadRuntimeSource('writing/ContinuationBudget.ts', {});
  const range = { targetWordCount: 3200, minWordCount: 2720, maxWordCount: 3680 };
  for (const current of [2720, 3200, 7906, NaN, -1]) assert.equal(buildContinuationBudget(current, range), null);
  assert.equal(buildContinuationBudget(2315, { targetWordCount: null, minWordCount: null, maxWordCount: null }), null);
});

function graphFixture(output, streaming = false) {
  const calls = [], warnings = [], progress = [];
  const { ChapterWritingGraph } = loadRuntimeSource('../chapterWritingGraph.ts', {
    '../../prompting/core/contextBudget': { createContextBlock: value => value },
    '../../prompting/core/promptRunner': {
      runTextPrompt: async request => { calls.push(request); return { output }; },
      streamTextPrompt: async request => { calls.push(request); return {
        complete: Promise.resolve({ output }),
        stream: (async function* () { yield { content: output }; })(),
      }; },
    },
    '../../prompting/context/promptContextResolution': { resolvePromptContextBlocksForAsset: async input => ({ blocks: input.fallbackBlocks }) },
    '../../prompting/prompts/novel/chapterLayeredContext': {
      resolveTargetWordRange: target => target ? { targetWordCount: target, minWordCount: Math.floor(target * .85), maxWordCount: Math.floor(target * 1.15) } : { targetWordCount: null, minWordCount: null, maxWordCount: null },
      buildChapterWriterContextBlocks: () => [], sanitizeWriterContextBlocks: blocks => ({ allowedBlocks: blocks, removedBlockIds: [] }),
    },
    '../../prompting/prompts/novel/chapterWriter.prompts': { chapterWriterPrompt: {} },
    './NovelContinuationService': { NovelContinuationService: class {} },
    './runtime/chapterEmptyContentError': {},
    '../../db/prisma': { prisma: { novel: { findUnique: async () => null } } },
    './novelP0Utils': { toText: value => value },
    './runtime/writing': loadRuntimeSource('writing/ContinuationBudget.ts', {}),
  });
  const graph = new ChapterWritingGraph({ logInfo: () => {}, logWarn: (...args) => warnings.push(args) });
  const original = '字'.repeat(2315);
  const input = { novelId: 'n', novelTitle: '本书', chapter: { id: 'c', order: 17, title: '封城令下' }, content: original,
    contextPackage: { chapter: {}, chapterWriteContext: { chapterMission: { targetWordCount: 3200 } } }, options: {},
    ...(streaming ? { onDraftProgress: (content, state) => progress.push({ content, state }) } : {}),
  };
  return { graph, calls, warnings, progress, original, input, run: () => graph.enforceTargetLength(input) };
}

test('bounded extension appends to the draft and receives a small output allowance', async () => {
  const h = graphFixture('续'.repeat(885));
  assert.equal(await h.run(), `${h.original}\n\n${'续'.repeat(885)}`);
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].promptInput.continuationBudget.targetAdditionalCharacters, 885);
  assert.ok(h.calls[0].options.maxTokens < 2500);
});

test('chapter 17 overshoot is rejected without truncating, saving or calling another model', async () => {
  for (const streaming of [false, true]) {
    const h = graphFixture('续'.repeat(5533), streaming);
    assert.equal(await h.run(), h.original);
    assert.equal(h.calls.length, 1);
    assert.equal(h.warnings[0][1].additionalCharacters, 5533);
    if (streaming) assert.deepEqual(h.progress.at(-1), { content: h.original, state: 'checking' });
  }
});

test('already adequate drafts skip continuation completely', async () => {
  const h = graphFixture('unused'); h.input.content = '字'.repeat(2720);
  assert.equal(await h.run(), h.input.content);
  assert.equal(h.calls.length, 0);
});

test('initial Writer request uses the resolved mission target even when chapter metadata is empty', async () => {
  const h = graphFixture('正文');
  h.input.contextPackage.chapterWriteContext.chapterMission.targetWordCount = 1800;
  h.input.contextPackage.continuation = {};
  await h.graph.createChapterStream(h.input);
  assert.equal(h.calls[0].promptInput.targetWordCount, 1800);
  assert.equal(h.calls[0].promptInput.minWordCount, 1530);
  assert.equal(h.calls[0].promptInput.maxWordCount, 2070);
});
