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

test('import confirmation persists edited titles, hierarchy and typed references', async t => {
  const fragments = {
    volume1: '# 第一卷',
    volume2: '# 第二卷',
    chapter: '## 第一章\n出发',
    character: '人物：林澜',
    payoff: '伏笔：信件来源',
    fact: '设定：信件规则',
  };
  const output = {
    nodes: [
      { clientRef: 'v1', nodeType: 'volume', title: '第一卷', summary: '启程', planningDepth: 'rough', sourceFragment: fragments.volume1 },
      { clientRef: 'v2', nodeType: 'volume', title: '第二卷', summary: '深入调查', planningDepth: 'rough', sourceFragment: fragments.volume2 },
      { clientRef: 'c1', nodeType: 'chapter', parentRef: 'v1', title: '第一章', summary: '主角出发', planningDepth: 'detailed', sourceFragment: fragments.chapter },
      { clientRef: 'char1', nodeType: 'character', title: '林澜', summary: '主角', planningDepth: 'rough', sourceFragment: fragments.character },
      { clientRef: 'p1', nodeType: 'payoff', title: '信件来源', summary: '隐藏寄信人', planningDepth: 'rough', sourceFragment: fragments.payoff },
      { clientRef: 'f1', nodeType: 'fact', title: '信件规则', summary: '只能跨越一天', planningDepth: 'rough', sourceFragment: fragments.fact },
    ],
    unclassifiedFragments: [],
  };
  t.mock.method(promptRunner, 'runStructuredPrompt', async () => ({ output }));
  let created;
  const repository = {
    createImport: async (title, document, sourceText) => {
      created = { title, document: validateOutlineDocument(document), sourceText };
      return { project: { id: 'project-imported' }, document };
    },
  };
  const service = new OutlineImportPreviewService(repository);
  const sourceText = Object.values(fragments).join('\n');
  const preview = await service.preview('user-1', '原始标题', sourceText, 'markdown');
  const edited = structuredClone(preview.document);
  const [volume1, volume2] = edited.volumes;
  const [chapter] = edited.chapters;
  const [character] = edited.characters;
  const [payoff] = edited.payoffs;
  const [fact] = edited.facts;
  edited.story.title = '调整后的故事';
  volume2.title = '调整后的第二卷';
  chapter.title = '调整后的第一章';
  chapter.volumeNodeId = volume2.nodeId;
  chapter.characterNodeIds = [character.nodeId];
  chapter.payoffNodeIds = [payoff.nodeId];
  chapter.summary = '不允许通过标题编辑覆盖的概要';
  character.appearanceNodeIds = [chapter.nodeId];
  payoff.setupChapterNodeIds = [chapter.nodeId];
  payoff.payoffChapterNodeIds = [chapter.nodeId];
  payoff.relatedNodeIds = [character.nodeId];
  fact.scope = { type: 'chapter', nodeId: chapter.nodeId };
  fact.relatedNodeIds = [payoff.nodeId];

  const result = await service.confirm('user-1', preview.token, { document: edited });

  assert.equal(result.project.id, 'project-imported');
  assert.equal(created.title, '调整后的故事');
  assert.equal(created.sourceText, sourceText);
  assert.equal(created.document.story.title, '调整后的故事');
  assert.equal(created.document.volumes[1].title, '调整后的第二卷');
  assert.equal(created.document.chapters[0].title, '调整后的第一章');
  assert.equal(created.document.chapters[0].summary, '主角出发');
  assert.equal(created.document.chapters[0].volumeNodeId, volume2.nodeId);
  assert.deepEqual(created.document.volumes[0].chapterNodeIds, []);
  assert.deepEqual(created.document.volumes[1].chapterNodeIds, [chapter.nodeId]);
  assert.deepEqual(created.document.chapters[0].characterNodeIds, [character.nodeId]);
  assert.deepEqual(created.document.characters[0].appearanceNodeIds, [chapter.nodeId]);
  assert.deepEqual(created.document.payoffs[0].setupChapterNodeIds, [chapter.nodeId]);
  assert.deepEqual(created.document.payoffs[0].payoffChapterNodeIds, [chapter.nodeId]);
  assert.deepEqual(created.document.facts[0].scope, { type: 'chapter', nodeId: chapter.nodeId });
  assert.equal(volume1.nodeId !== volume2.nodeId, true);
});
