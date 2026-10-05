const test = require('node:test');
const assert = require('node:assert/strict');
const { preparePromptExecution } = require('../dist/prompting/core/promptRunner');
const { createContextBlock } = require('../dist/prompting/core/contextBudget');
const { chapterArtifactDeltaPrompt } = require('../dist/prompting/prompts/novel/chapterArtifactDelta.prompts');
const { chapterPatchRepairPrompt } = require('../dist/prompting/prompts/novel/chapterPatchRepair.prompts');
const { chapterRepairPrompt } = require('../dist/prompting/prompts/novel/review.prompts');
const { chapterAcceptanceAssessmentPrompt } = require('../dist/prompting/prompts/novel/chapterAcceptance.prompts');
const { CHAPTER_PROSE_QUALITY_RULES } = require('../../shared/dist/types/chapterProseContract');

const input = {
  novelTitle: '本书', chapterOrder: 14, chapterTitle: '宴帖', chapterGoal: '交付宴帖',
  characterRosterText: '沈夜：主角，当前目标是确认邀约', previousStateText: '伤势未愈',
  existingResourceText: '旧刀藏于腰间', existingPayoffText: '邀约未兑现',
  activeCharacterDialogueInfluenceText: '隐瞒旧刀来源', chapterContent: '沈夜收起宴帖。',
  issuesJson: '[]', content: '沈夜收起宴帖。', bibleContent: '', ragContext: '',
};
const prepare = (asset, promptInput = input) => preparePromptExecution({ asset, promptInput }).messages;

test('patch issue and mode changes retain the prefix through the complete prose while every instruction stays fresh', () => {
  const render = (issue, modeHint) => preparePromptExecution({
    asset: chapterPatchRepairPrompt, promptInput: { ...input, issuesJson: issue, modeHint },
    contextBlocks: [
      { id: 'book', group: 'book_contract', content: '保密合同：门房不知道旧刀来源', reuseScope: 'book', priority: 100, required: true },
      { id: 'mission', group: 'chapter_mission', content: '本章须让主角拿到宴帖', priority: 100, required: true },
      { id: 'extra', group: 'repair_issues', content: `补充问题：${issue}`, priority: 100, required: true },
      { id: 'custom', group: 'custom_slot', content: `本次约束：${issue}`, priority: 999, required: true },
    ].map(createContextBlock),
  }).messages;
  const first = render('修复肩伤状态', '只处理连续性');
  const second = render('修复钥匙归属', '只处理人物事实');
  const flatten = messages => messages.map(m => `${m._getType()}:${m.content}`).join('\n');
  const a = flatten(first), b = flatten(second);
  const end = a.indexOf(input.chapterContent) + input.chapterContent.length;
  assert.equal(a.slice(0, end), b.slice(0, end));
  assert.ok(b.includes('补充问题：修复钥匙归属'));
  assert.ok(b.includes('本次约束：修复钥匙归属'));
  assert.ok(!b.includes('修复肩伤状态'));
  assert.ok(second.some(m => m._getType() === 'system' && String(m.content).includes('只处理人物事实')));
  assert.ok(b.indexOf('修复钥匙归属') > b.indexOf(input.chapterContent));
  assert.ok(b.includes('保密合同：门房不知道旧刀来源'));
});

test('acceptance example demonstrates evidence-based acceptance instead of prescribing a new ending scene', () => {
  const messages = prepare(chapterAcceptanceAssessmentPrompt, { ...input, chapterOrder: 16 });
  const hint = messages.find(m => String(m.content).includes('结构化输出骨架'));
  const example = chapterAcceptanceAssessmentPrompt.outputSchema.parse(JSON.parse(String(hint.content).split('示例：\n').at(-1)));
  assert.equal(example.status, 'accepted');
  assert.equal(example.continuePolicy, 'continue');
  assert.deepEqual(example.blockingIssues, []);
  assert.deepEqual(example.repairDirectives, []);
  assert.deepEqual(example.missingObligations, []);
  assert.ok(example.riskTags.length > 0, 'acceptance can retain follow-up risks without inventing a prose defect');
  assert.ok(JSON.stringify(example).length < 800);
});

test('both repair paths transmit the same prose contract as drafting before the editable prose', () => {
  for (const asset of [chapterPatchRepairPrompt, chapterRepairPrompt]) {
    const messages = prepare(asset);
    const system = messages.filter(message => message._getType() === 'system').map(message => String(message.content)).join('\n');
    for (const rule of CHAPTER_PROSE_QUALITY_RULES) assert.ok(system.includes(rule), `Missing prose constraint: ${rule}`);
    assert.ok(messages.some(message => String(message.content).includes(input.chapterContent)));
  }
});

test('artifact roster stays before chapter-specific changes, and changed state is never frozen', () => {
  const a = prepare(chapterArtifactDeltaPrompt).map(message => String(message.content)).join('\n');
  const b = prepare(chapterArtifactDeltaPrompt, { ...input, chapterOrder: 15, chapterTitle: '赴宴', chapterGoal: '观察旧刀',
    previousStateText: '肩伤加重', existingResourceText: '旧刀交给门房', existingPayoffText: '邀约已兑现',
    activeCharacterDialogueInfluenceText: '拒绝透露身份', chapterContent: '沈夜将旧刀交给门房。',
  }).map(message => String(message.content)).join('\n');
  const end = a.indexOf(input.characterRosterText) + input.characterRosterText.length;
  assert.equal(a.slice(0, end), b.slice(0, end));
  for (const text of ['肩伤加重', '旧刀交给门房', '邀约已兑现', '拒绝透露身份', '观察旧刀', '第 15 章']) assert.ok(b.includes(text));
  const edited = prepare(chapterArtifactDeltaPrompt, { ...input, characterRosterText: '沈夜：主角，当前目标是保护门房' });
  assert.ok(edited.some(message => String(message.content).includes('当前目标是保护门房')));
});

test('the artifact example fits a small input budget while keeping fact, ownership, secrecy and evidence contracts', () => {
  const messages = prepare(chapterArtifactDeltaPrompt);
  const hint = messages.find(message => String(message.content).includes('结构化输出骨架'));
  const example = JSON.parse(String(hint.content).split('示例：\n').at(-1));
  // Oversized examples encourage copying verbose snapshots into every output.
  assert.ok(JSON.stringify(example).length < 2000);
  const output = chapterArtifactDeltaPrompt.outputSchema.parse(example);
  assert.equal(chapterArtifactDeltaPrompt.postValidate(output), output);
  assert.ok(output.concreteFacts.length > 0);
  assert.ok(output.characterResourceDeltas[0].evidence.length > 0);
  assert.equal(output.characterResourceDeltas[0].holderCharacterName, '程秩');
  assert.equal(output.characterResourceDeltas[0].readerKnows, true);
  assert.ok(output.characterMindDeltas[0].evidence.length > 0);
  assert.ok(output.payoffDeltas[0].evidence.length > 0);
  assert.ok(output.stateDeltas.characterStates[0].summary, 'The next chapter reads character state summaries');
});

test('compact artifact output preserves explicit hidden ownership, injuries and mistaken beliefs', () => {
  const fixture = {
    summary: '沈夜肩伤未愈，暗中拿到钥匙，误以为门房未察觉。',
    stateDeltas: { characterStates: [{ characterName: '沈夜', summary: '肩伤未愈，准备潜入。', misbeliefs: ['门房未察觉钥匙失踪'] }] },
    characterResourceDeltas: [{ resourceName: '后门钥匙', updateType: 'acquired', statusAfter: 'hidden',
      holderCharacterName: '沈夜', ownerType: 'organization', ownerName: '裴府', readerKnows: false, holderKnows: true,
      narrativeImpact: '可以从后门进入', constraints: ['不能开启正门'], evidence: ['他把钥匙藏进袖口。'] }],
    syncPlan: { stateSnapshot: 'write', characterResources: 'write', payoffLedger: 'skip', characterDynamics: 'skip', reason: '状态和资源改变' },
    confidence: 0.9,
  };
  const output = chapterArtifactDeltaPrompt.outputSchema.parse(fixture);
  chapterArtifactDeltaPrompt.postValidate(output);
  assert.equal(output.characterResourceDeltas[0].readerKnows, false);
  assert.equal(output.characterResourceDeltas[0].ownerName, '裴府');
  assert.equal(output.characterResourceDeltas[0].holderCharacterName, '沈夜');
  assert.deepEqual(output.characterResourceDeltas[0].constraints, ['不能开启正门']);
  assert.deepEqual(output.stateDeltas.characterStates[0].misbeliefs, ['门房未察觉钥匙失踪']);
  assert.equal(output.stateDeltas.characterStates[0].summary, '肩伤未愈，准备潜入。');
});
