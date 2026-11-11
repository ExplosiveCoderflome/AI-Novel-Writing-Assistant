const test = require('node:test');
const assert = require('node:assert/strict');
const promptRunner = require('../dist/prompting/core/promptRunner');
const { OutlineProposalService } = require('../dist/modules/planning/outline/application/OutlineProposalService');
const { OutlineImportPreviewService } = require('../dist/modules/planning/outline/application/OutlineImportPreviewService');
const { createEmptyOutlineDocument, validateOutlineDocument } = require('../dist/modules/planning/outline/domain/outlineDocument');

test('initial generation proposals can be adopted into a validated outline revision', async () => {
  const currentDocument = createEmptyOutlineDocument('空白大纲');
  const initial = {
    storyFields: {
      title: '星海来信',
      premise: '失联的探险家收到来自未来的信件。',
      synopsis: '主角沿信件线索寻找失踪的探险队。',
      theme: '选择与羁绊',
      tone: '悬疑而温暖',
      endingDirection: '主角决定守护两个时空的联系。',
    },
    volumes: [{ clientRef: 'volume-1', title: '第一卷', summary: '发现信件', planningDepth: 'detailed' }],
    chapters: [{ clientRef: 'chapter-1', volumeRef: 'volume-1', title: '第一章', summary: '收到第一封信', planningDepth: 'detailed' }],
    characters: [{ clientRef: 'character-1', title: '林澜', role: '主角', summary: '调查信件来源', planningDepth: 'rough' }],
    payoffs: [{ clientRef: 'payoff-1', title: '信件来源', summary: '隐藏寄信人', setupDescription: '信件没有邮戳', payoffDescription: '揭示寄信人身份', planningDepth: 'rough' }],
    facts: [{ clientRef: 'fact-1', title: '信件规则', content: '信件只能跨越一天', summary: '固定规则', planningDepth: 'rough' }],
  };
  let applied;
  const repository = {
    findProposal: async () => ({ id: 'proposal-1', projectId: 'project-1', baseVersion: 1, kind: 'initial_generation', status: 'pending', proposalJson: JSON.stringify(initial) }),
    getCurrent: async () => ({ project: { currentVersion: 1 }, revision: { documentJson: JSON.stringify(currentDocument) } }),
    applyInitialProposal: async (projectId, proposalId, baseVersion, document) => {
      applied = { projectId, proposalId, baseVersion, document: validateOutlineDocument(document) };
      return { revision: { version: baseVersion + 1 }, document: applied.document };
    },
  };

  const result = await new OutlineProposalService(repository).apply('project-1', 'proposal-1', []);

  assert.equal(applied.projectId, 'project-1');
  assert.equal(applied.proposalId, 'proposal-1');
  assert.equal(applied.baseVersion, 1);
  assert.equal(result.revision.version, 2);
  assert.equal(result.document.story.title, '星海来信');
  assert.equal(result.document.chapters[0].volumeNodeId, result.document.volumes[0].nodeId);
  assert.deepEqual(result.document.volumes[0].chapterNodeIds, [result.document.chapters[0].nodeId]);
  const generatedIds = [result.document.volumes[0].nodeId, result.document.chapters[0].nodeId, result.document.characters[0].nodeId, result.document.payoffs[0].nodeId, result.document.facts[0].nodeId];
  assert.equal(new Set(generatedIds).size, generatedIds.length);
  assert.ok(generatedIds.every(Boolean));
});

test('import preview binds verifiable source ranges to node IDs and merges overlapping coverage', async t => {
  const volumeFragment = '# 第一卷\n## 第一章\n出发';
  const chapterFragment = '## 第一章\n出发';
  const sourceText = `${volumeFragment}\n未分类`;
  const output = {
    nodes: [
      { clientRef: 'volume-1', nodeType: 'volume', title: '第一卷', summary: '启程', planningDepth: 'rough', sourceFragment: volumeFragment },
      { clientRef: 'chapter-1', nodeType: 'chapter', parentRef: 'volume-1', title: '第一章', summary: '主角出发', planningDepth: 'detailed', sourceFragment: chapterFragment },
      { clientRef: 'fact-1', nodeType: 'fact', title: '无依据设定', summary: '需要人工核对', planningDepth: 'rough', sourceFragment: '原文不存在的片段' },
    ],
    unclassifiedFragments: ['未分类'],
  };
  t.mock.method(promptRunner, 'runStructuredPrompt', async () => ({ output }));

  const preview = await new OutlineImportPreviewService({}).preview('user-1', '导入测试', sourceText, 'markdown');

  assert.equal(preview.coverage.length, 2);
  const nodeIds = new Set([
    preview.document.story.nodeId,
    ...preview.document.volumes.map(item => item.nodeId),
    ...preview.document.chapters.map(item => item.nodeId),
    ...preview.document.characters.map(item => item.nodeId),
    ...preview.document.payoffs.map(item => item.nodeId),
    ...preview.document.facts.map(item => item.nodeId),
  ]);
  for (const range of preview.coverage) {
    assert.ok(nodeIds.has(range.nodeId));
    assert.equal(sourceText.slice(range.start, range.end), range.text);
  }
  assert.equal(preview.coverage.find(item => item.clientRef === 'volume-1').nodeId, preview.document.volumes[0].nodeId);
  assert.equal(preview.coverage.find(item => item.clientRef === 'chapter-1').nodeId, preview.document.chapters[0].nodeId);
  assert.equal(preview.coveredLength, volumeFragment.length);
  assert.equal(preview.sourceLength, sourceText.length);
  assert.deepEqual(preview.unclassified, ['未分类']);
  assert.equal(preview.unmatchedSources.length, 1);
  assert.equal(preview.unmatchedSources[0].nodeId, preview.document.facts[0].nodeId);
  assert.equal(preview.unmatchedSources[0].sourceFragment, '原文不存在的片段');
});
