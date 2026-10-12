const test = require('node:test');
const assert = require('node:assert/strict');
const {preparePromptExecution} = require('../dist/prompting/core/promptRunner');
const {getPromptCacheBoundary} = require('../dist/platform/llm/cache');
const {chapterArtifactDeltaPrompt} = require('../dist/prompting/prompts/novel/chapterArtifactDelta.prompts');
const {payoffLedgerSyncPrompt} = require('../dist/prompting/prompts/payoff/payoffLedgerSync.prompts');

const input = {
  novelTitle: '本书', chapterTitle: '章一', chapterOrder: 1, chapterGoal: '进入库房',
  characterRosterText: '角色程秩', characterStateText: '角色状态甲',
  resourceCatalogText: '铜钥匙目录', payoffCatalogText: '后门线索目录',
  chapterContent: '正文甲', previousStateText: '状态甲', existingResourceText: '资源甲',
  existingPayoffText: '账本甲', activeCharacterDialogueInfluenceText: '心智甲',
  locationTrackingEnabled:true, characterLocationText:'甲在牢房，来源第1章',
  bookContractPayoffs: [], activeVolumeSummary: '卷甲', latestChapterContext: '最近正文甲',
  majorPayoffsText: '书级承诺', openPayoffsText: '卷级计划', chapterPayoffRefsText: '章节兑现安排',
  foreshadowStatesText: '线索甲', payoffConflictsText: '冲突甲', payoffAuditIssuesText: '问题甲',
};
const next = {
  ...input, chapterOrder: 2, chapterTitle: '章二', chapterGoal: '本章目标乙',
  chapterContent: '正文乙', previousStateText: '状态乙', characterStateText: '角色状态乙',
  existingResourceText: '资源乙', existingPayoffText: '账本乙',
  activeCharacterDialogueInfluenceText: '心智乙', latestChapterContext: '最近正文乙',
  activeVolumeSummary: '卷乙', foreshadowStatesText: '线索乙',
  payoffConflictsText: '冲突乙', payoffAuditIssuesText: '问题乙',
  characterLocationText:'甲到客栈，来源第2章',
};

for (const asset of [chapterArtifactDeltaPrompt, payoffLedgerSyncPrompt]) {
  test(`${asset.id} reuses book context while all current chapter state remains fresh`, () => {
    const a = preparePromptExecution({asset, promptInput: input});
    const b = preparePromptExecution({asset, promptInput: next});
    const boundary = getPromptCacheBoundary(b.messages);
    assert.deepEqual(boundary, {messageIndex: 2, contentBlockIndex: 0});
    const prefix = messages => messages.slice(0, boundary.messageIndex + 1).map(m => m.content);
    assert.deepEqual(prefix(a.messages), prefix(b.messages));
    assert.match(String(b.messages[1].content), /结构化输出骨架/);
    assert.match(String(b.messages[2].content), /本书/);
    const dynamic = b.messages.slice(boundary.messageIndex + 1).map(m => m.content).join('\n');
    const fresh = asset === chapterArtifactDeltaPrompt
      ? ['正文乙', '状态乙', '角色状态乙', '资源乙', '账本乙', '心智乙', '本章目标乙', '甲到客栈，来源第2章']
      : ['卷乙', '最近正文乙', '线索乙', '冲突乙', '问题乙'];
    for (const word of fresh) {
      assert.ok(dynamic.includes(word), `missing fresh state: ${word}`);
      assert.ok(!prefix(b.messages).join('\n').includes(word), `volatile state in prefix: ${word}`);
    }
    const otherBook = preparePromptExecution({asset, promptInput: {...next, novelTitle: '另一本书'}});
    assert.notEqual(b.messages[2].content, otherBook.messages[2].content);
    assert.equal(getPromptCacheBoundary([...b.messages]), null);
  });
}

test('native request serialization marks the book block and leaves adjacent live state outside it', async () => {
  const {createAnthropicLLM} = require('../dist/llm/anthropicClient');
  const oldFetch = global.fetch;
  const oldPolicy = process.env.LLM_EXPLICIT_CACHE_ENABLED;
  const requests = [];
  global.fetch = async (_url, options) => {
    requests.push(JSON.parse(options.body));
    return new Response(JSON.stringify({content: [{type: 'text', text: '{}'}], usage: {input_tokens: 10, output_tokens: 2}}));
  };
  process.env.LLM_EXPLICIT_CACHE_ENABLED = 'true';
  try {
    for (const asset of [chapterArtifactDeltaPrompt, payoffLedgerSyncPrompt]) {
      const prepared = preparePromptExecution({asset, promptInput: next});
      await createAnthropicLLM({model: 'claude-sonnet-4-5', baseURL: 'https://api.anthropic.com/v1', temperature: 0}).invoke(prepared.messages);
      const request = requests.at(-1);
      const blocks = request.messages[0].content;
      assert.equal(blocks.length, 3);
      assert.equal(blocks[0].cache_control, undefined);
      assert.deepEqual(blocks[1].cache_control, {type: 'ephemeral'});
      assert.equal(blocks[1].text, prepared.messages[2].content);
      assert.equal(blocks[2].text, prepared.messages[3].content);
      assert.equal(blocks[2].cache_control, undefined);
    }
    assert.equal(requests.length, 2, 'no cache warm-up or additional model calls');
  } finally {
    global.fetch = oldFetch;
    if (oldPolicy === undefined) delete process.env.LLM_EXPLICIT_CACHE_ENABLED;
    else process.env.LLM_EXPLICIT_CACHE_ENABLED = oldPolicy;
  }
});
