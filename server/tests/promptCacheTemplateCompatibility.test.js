const test=require('node:test'),assert=require('node:assert/strict'),{z}=require('zod');const {appendStructuredOutputHintMessages}=require('../dist/prompting/core/structuredOutputHint');const {HumanMessage,SystemMessage}=require('@langchain/core/messages');
const c={blocks:[],selectedBlockIds:[],droppedBlockIds:[],summarizedBlockIds:[],estimatedInputTokens:0};const messages=[new SystemMessage('规则'),new HumanMessage('动态章节')];const base={id:'fixture',mode:'structured',outputSchema:z.object({text:z.string()}),structuredOutputHint:{placement:'stable_prefix',example:{text:'示例'},note:'静态格式'}};
test('explicit static hint is before dynamic material with Human role preserved',()=>{const result=appendStructuredOutputHintMessages({asset:base,context:c,promptInput:{},messages});assert.equal(result[0].content,'规则');assert.match(result[1].content,/结构化输出骨架/);assert.equal(result[1].type,'human');assert.equal(result[2].content,'动态章节')});
test('dynamic examples and advanced templates retain tail hint placement',()=>{for(const asset of [{...base,structuredOutputHint:{...base.structuredOutputHint,example:()=>({text:'当前内容'})}},base]){const result=appendStructuredOutputHintMessages({asset,context:c,promptInput:{},messages,preserveMessageLayout:asset===base});assert.equal(result[1].content,'动态章节');assert.match(result[2].content,/结构化输出骨架/);}});

test('updated production assets resolve through registry at their exact versions', () => {
  const { getRegisteredPromptAsset } = require('../dist/prompting/registry');
  for (const [id, version] of [['novel.chapter.writer', 'v10'], ['novel.chapter.acceptance_assessment', 'v24'], ['novel.review.patch', 'v11'], ['novel.review.chapter', 'v3'], ['novel.review.repair', 'v4'], ['novel.chapter.artifact_delta.extract', 'v10'], ['novel.payoff_ledger.sync', 'v8'], ['style.detection', 'v10'], ['style.rewrite', 'v4']]) {
    const asset = getRegisteredPromptAsset(id, version);
    assert.ok(asset, `${id}@${version} must be registered`);
    assert.equal(asset.version, version);
  }
});
