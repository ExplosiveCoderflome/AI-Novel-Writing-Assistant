const test = require('node:test');
const assert = require('node:assert/strict');
const sessionLog = require('../dist/llm/sessionLogFile');
const { attachLLMDebugLogging } = require('../dist/llm/debugLogging');
const { attachLLMUsageTracking, runWithLlmUsageTracking } = require('../dist/llm/usageTracking');
const { prisma } = require('../dist/db/prisma');

async function exercise(chunks, failAfterChunks = false) {
  const entries = [], updates = [], forwarded = [];
  const previous = { append: sessionLog.appendLlmSessionLog, info: console.info,
    warn: console.warn, update: prisma.generationJob.updateMany, env: process.env.LLM_DEBUG_LOG };
  sessionLog.appendLlmSessionLog = entry => entries.push(entry);
  console.info = console.warn = () => {};
  process.env.LLM_DEBUG_LOG = 'true';
  prisma.generationJob.updateMany = async data => { updates.push(data); return { count: 1 }; };
  const llm = {
    invoke: async () => {}, batch: async () => [],
    stream: async () => ({ async *[Symbol.asyncIterator]() {
      for (const chunk of chunks) yield chunk;
      if (failAfterChunks) throw new Error('transport interrupted');
    } }),
  };
  const meta = { provider: 'deepseek', model: 'test-model', temperature: 0,
    promptMeta: { promptId: 'novel.chapter.writer', promptVersion: 'v2', taskType: 'writer',
      chapterId: 'chapter-1', stage: 'writer_extend', contextBlockIds: [], droppedContextBlockIds: [],
      summarizedContextBlockIds: [], estimatedInputTokens: 0, repairUsed: false, repairAttempts: 0 } };
  try {
    attachLLMDebugLogging(attachLLMUsageTracking(llm, meta), meta);
    const consume = () => runWithLlmUsageTracking({ generationJobId: 'job-1' }, async () => {
      for await (const chunk of await llm.stream([])) forwarded.push(chunk);
    });
    if (failAfterChunks) await assert.rejects(consume, /transport interrupted/);
    else await consume();
    return { entries, updates, forwarded };
  } finally {
    sessionLog.appendLlmSessionLog = previous.append;
    console.info = previous.info; console.warn = previous.warn;
    prisma.generationJob.updateMany = previous.update;
    if (previous.env === undefined) delete process.env.LLM_DEBUG_LOG;
    else process.env.LLM_DEBUG_LOG = previous.env;
  }
}

test('stream log retains actual final usage without charging cumulative chunks twice', async () => {
  const chunks = [{ content: '第一段', usage_metadata: { input_tokens: 100, output_tokens: 10, total_tokens: 110 } },
    { content: '第二段', usage_metadata: { input_tokens: 100, output_tokens: 20, total_tokens: 120 } }];
  const result = await exercise(chunks);
  const response = result.entries.find(entry => entry.event === 'response');
  assert.equal(response.actualPromptTokens, 100);
  assert.deepEqual(response.payload.usageMetadata, { input_tokens: 100, output_tokens: 20, total_tokens: 120 });
  assert.equal(response.payload.content, '第一段第二段');
  assert.equal(result.updates.length, 1);
  assert.equal(result.updates[0].data.totalTokens.increment, 120);
  assert.deepEqual(result.forwarded, chunks);
});

test('stream without reported usage keeps actual consumption unknown', async () => {
  const result = await exercise([{ content: '完整正文' }]);
  const response = result.entries.find(entry => entry.event === 'response');
  assert.equal(response.actualPromptTokens, null);
  assert.equal(response.payload.usageMetadata == null, true);
  assert.equal(result.updates.length, 0);
});

test('interrupted stream reports the known partial usage on the error entry', async () => {
  const result = await exercise([{ content: '已生成部分', response_metadata: {
    usage: { prompt_tokens: 80, completion_tokens: 5, total_tokens: 85 },
  } }], true);
  const error = result.entries.find(entry => entry.event === 'error');
  assert.equal(error.actualPromptTokens, 80);
  assert.equal(error.payload.usageMetadata.total_tokens, 85);
  assert.equal(result.updates[0].data.totalTokens.increment, 85);
});
