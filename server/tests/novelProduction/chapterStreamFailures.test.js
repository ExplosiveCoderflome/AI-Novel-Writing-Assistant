const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

test('empty, truncated and failed chapter streams remain recoverable without exiting the server process', () => {
  const harnessPath = path.join(__dirname, 'sourceHarness.cjs');
  const script = String.raw`
const assert = require('node:assert/strict');
const {loadRuntimeSource} = require(${JSON.stringify(harnessPath)});

async function runScenario(mode) {
  const status = [];
  let saved = 0;
  let finalized = 0;
  const streamError = new Error('synthetic provider stream failure');
  const {ChapterWritingGraph} = loadRuntimeSource('../chapterWritingGraph.ts', {
    '../../prompting/core/contextBudget': {createContextBlock: value => value},
    '../../prompting/core/promptRunner': {
      runTextPrompt: async () => ({output: ''}),
      streamTextPrompt: async () => ({
        complete: mode === 'error' ? Promise.reject(streamError)
          : Promise.resolve({output: mode === 'empty' ? '' : 'partial draft'}),
        stream: (async function* () {
          if (mode !== 'empty') yield {
            content: 'partial',
            response_metadata: mode === 'truncated' ? {finish_reason: 'length'} : {},
          };
          if (mode === 'error') throw streamError;
        })(),
      }),
    },
    '../../prompting/context/promptContextResolution': {
      resolvePromptContextBlocksForAsset: async input => ({blocks: input.fallbackBlocks}),
    },
    '../../prompting/prompts/novel/chapterLayeredContext': {
      resolveTargetWordRange: () => ({targetWordCount: null, minWordCount: null, maxWordCount: null}),
      buildChapterWriterContextBlocks: () => [],
      sanitizeWriterContextBlocks: blocks => ({allowedBlocks: blocks, removedBlockIds: []}),
    },
    '../../prompting/prompts/novel/chapterWriter.prompts': {chapterWriterPrompt: {}},
    '../../llm/modelRouter': {resolveModel: async () => ({routeMaxTokens: undefined, maxTokens: 16384})},
    './NovelContinuationService': {NovelContinuationService: class {
      async rewriteIfTooSimilar(input) { return {content: input.content, rewritten: false, maxSimilarity: 0}; }
    }},
    './runtime/chapterEmptyContentError': {
      assertChapterContentNotEmpty(content) {
        if (!content || !content.trim()) throw Object.assign(new Error('empty chapter'), {code: 'CHAPTER_EMPTY_CONTENT'});
        return content;
      },
    },
    '../../db/prisma': {prisma: {novel: {findUnique: async () => null}}},
    './novelP0Utils': {toText: value => typeof value === 'string' ? value : ''},
    './runtime/writing': {buildContinuationBudget: () => null},
  });
  const graph = new ChapterWritingGraph({
    enforceOpeningDiversity: async (_novelId, _order, _title, content) => ({content, rewritten: false, maxSimilarity: 0}),
    saveDraftAndArtifacts: async () => { saved += 1; },
    logInfo: () => {}, logWarn: () => {},
  });
  const assembled = {
    novel: {title: 'Fixture'},
    chapter: {id: 'chapter-1', order: 1, title: 'Chapter'},
    contextPackage: {
      chapter: {},
      chapterWriteContext: {chapterMission: {targetWordCount: null}},
      continuation: {}, nextAction: 'write', pendingReviewProposalCount: 0, openAuditIssues: [],
    },
  };
  const {ChapterStreamGenerationOrchestrator} = loadRuntimeSource('ChapterStreamGenerationOrchestrator.ts', {
    '../../../llm/streaming': {},
    '../novelP0Utils': {toText: value => typeof value === 'string' ? value : ''},
    './chapterEmptyContentError': {
      assertChapterContentNotEmpty(content) {
        if (!content || !content.trim()) throw Object.assign(new Error('empty chapter'), {code: 'CHAPTER_EMPTY_CONTENT'});
        return content;
      },
      isChapterEmptyContentError: error => error && error.code === 'CHAPTER_EMPTY_CONTENT',
    },
  });
  const orchestrator = new ChapterStreamGenerationOrchestrator({
    assembler: {assemble: async () => assembled},
    preparationService: {prepare: async () => {}},
    chapterWritingGraph: graph,
    readinessService: {assertReady: () => {}},
    contentFinalizationService: {
      markChapterStatus: async (_id, value) => status.push(value),
      finalizeChapterContent: async input => {
        finalized += 1;
        return {finalContent: input.content, runtimePackage: {audit: {hasBlockingIssues: false}}};
      },
    },
    agentRuntime: {createChapterGenRun: async () => 'run-1'},
    validateRequest: input => input,
    ensureNovelCharacters: async () => {},
  });

  const result = await orchestrator.createChapterStream('novel-1', 'chapter-1', {});
  let failed = false;
  let content = '';
  try {
    for await (const chunk of result.stream) content += chunk.content;
    await result.onDone(content, {writeFrame: () => {}});
  } catch {
    failed = true;
  }
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(failed, true, mode + ' must fail the chapter');
  assert.equal(finalized, 0, mode + ' must not finalize a false success');
  assert.equal(saved, 0, mode + ' must not save partial or empty text');
  assert.equal(status.at(-1), 'pending_generation', mode + ' must be recoverable');
}

(async () => {
  for (const mode of ['empty', 'truncated', 'error']) await runScenario(mode);
  process.stdout.write('chapter-stream-failures-verified\n');
})().catch(error => { console.error(error); process.exitCode = 1; });
`;
  const child = spawnSync(process.execPath, ['--unhandled-rejections=strict', '-e', script], {
    encoding: 'utf8',
    timeout: 15000,
  });
  assert.equal(child.status, 0, child.stderr || child.stdout);
  assert.match(child.stdout, /chapter-stream-failures-verified/);
});
