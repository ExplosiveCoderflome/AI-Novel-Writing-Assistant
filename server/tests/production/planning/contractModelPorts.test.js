const test = require('node:test');
const assert = require('node:assert/strict');
const runner = require('../../../dist/prompting/core/promptRunner');
const quality = require('../../../dist/services/novel/volume/ChapterTaskSheetQualityGateService');
const {generateChapterTaskSheetDetail} = require('../../../dist/services/novel/volume/chapterDetail');
const {reviewChapterExecutionContinuity} = require('../../../dist/services/novel/volume/chapterDetail');
const {candidate, generationInput, safe} = require('./contractFixture.cjs');

test('quality request preparation exactly matches the native executed request', async () => {
  const original = runner.runStructuredPrompt;
  let actual;
  runner.runStructuredPrompt = async request => {actual = request; return {output: safe};};
  try {
    const input = candidate(), options = {provider: 'openai', model: 'snapshot-model', taskId: 'task-1', entrypoint: 'auto_director'};
    await new quality.ChapterTaskSheetQualityGateService().evaluate(input, options);
    assert.deepEqual(quality.buildChapterTaskSheetQualityPromptRequest({candidate: input, mode: 'ai_copilot', options}), actual);
    assert.deepEqual(actual.promptInput.candidate, input);
  } finally {runner.runStructuredPrompt = original;}
});

test('contract generation routes each actual generation and quality request through injected ports', async () => {
  const original = runner.runStructuredPrompt;
  runner.runStructuredPrompt = async () => {throw Error('unexpected legacy model call');};
  const generations = [], assessments = [], warning = {...safe, verdict: 'repairable', safeToSync: false,
    recommendedHandling: 'repair_contract', repairGuidance: ['保留钟内纸条来源']};
  try {
    const result = await generateChapterTaskSheetDetail(generationInput({
      chapterTaskSheetQualityMode: 'full_book_autopilot',
      chapterContractPorts: {
        invokePrompt: async request => {generations.push(request); const output = candidate();
          return {output: {...output, sceneCards: JSON.parse(output.sceneCards).scenes}};},
        semanticAssessor: async input => {assessments.push(input); return assessments.length === 1 ? warning : safe;},
      },
    }));
    assert.equal(generations.length, 2);
    assert.equal(assessments.length, 2);
    assert.match(generations[1].promptInput.guidance, /保留钟内纸条来源/);
    assert.equal(generations[0].options.maxTokens, 3200);
    assert.equal(assessments[1].candidate.sceneCards, result.sceneCards);
  } finally {runner.runStructuredPrompt = original;}
});

test('injected continuity assessment uses full preceding prose without legacy model resolution or cache writes', async () => {
  const factory = require('../../../dist/llm/factory');
  const original = factory.resolveLLMClientOptions;
  factory.resolveLLMClientOptions = async () => {throw Error('unexpected legacy model resolution');};
  const source = candidate({previousChapterResult: {chapterOrder: 1, title: '前章', summary: '', tail: '末尾', content: '完整前文：纸条藏在旧钟内。末尾'}});
  let actual;
  try {
    const result = await reviewChapterExecutionContinuity(source, {provider: 'openai', model: 'snapshot-model'}, {
      semanticAssessor: async input => {actual = input; return safe;},
    });
    assert.deepEqual(result.assessment, safe);
    assert.deepEqual(actual.candidate, source);
    assert.equal(actual.mode, 'ai_copilot');
    assert.equal(result.result.canEnterExecution, true);
  } finally {factory.resolveLLMClientOptions = original;}
});
