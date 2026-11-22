const test = require('node:test');
const assert = require('node:assert/strict');
const promptRunner = require('../dist/prompting/core/promptRunner');
const { AppError } = require('../dist/middleware/errorHandler');
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
  assert.equal(result.document.characters[0].summary, initial.characters[0].summary);
  assert.deepEqual(result.document.characters[0].appearanceNodeIds, []);
  const generatedIds = [result.document.volumes[0].nodeId, result.document.chapters[0].nodeId, result.document.characters[0].nodeId, result.document.payoffs[0].nodeId, result.document.facts[0].nodeId];
  assert.equal(new Set(generatedIds).size, generatedIds.length);
  assert.ok(generatedIds.every(Boolean));
});

test('stale outline proposals return a recoverable conflict instead of an internal error', async () => {
  const repository = {
    findProposal: async () => ({ id: 'proposal-1', baseVersion: 2, kind: 'edit', status: 'pending' }),
    getCurrent: async () => ({ project: { currentVersion: 3 }, revision: { documentJson: '{}' } }),
  };
  await assert.rejects(
    new OutlineProposalService(repository).apply('project-1', 'proposal-1', []),
    error => error instanceof AppError && error.statusCode === 409 && error.message.includes('大纲已更新，请重新生成提案'),
  );
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


test('Markdown book heading is the story title, not an empty volume, with original source coverage', async t => {
  const text = '# 潮汐邮局\n\n## 第一卷：最后一封信\n### 第一章：空信封\n苏禾发现空信封。';
  let promptText;
  t.mock.method(promptRunner, 'runStructuredPrompt', async ({ promptInput }) => {
    promptText = promptInput.text;
    return { output: { nodes: [
      { clientRef: 'v1', nodeType: 'volume', title: '第一卷：最后一封信', summary: '', planningDepth: 'rough', sourceFragment: '## 第一卷：最后一封信' },
      { clientRef: 'c1', nodeType: 'chapter', parentRef: 'v1', title: '第一章：空信封', summary: '苏禾发现空信封。', planningDepth: 'detailed', sourceFragment: '### 第一章：空信封\n苏禾发现空信封。' },
    ], unclassifiedFragments: [] } };
  });
  const preview = await new OutlineImportPreviewService({}).preview('u', '导入的大纲', text, 'markdown');
  assert.equal(preview.document.story.title, '潮汐邮局');
  assert.equal(preview.document.volumes.length, 1);
  assert.equal(preview.document.volumes[0].title, '第一卷：最后一封信');
  assert.equal(preview.document.chapters[0].volumeNodeId, preview.document.volumes[0].nodeId);
  assert.equal(promptText.length, text.length);
  assert.ok(!promptText.includes('潮汐邮局'));
  assert.ok(preview.coverage.some(item => item.nodeId === preview.document.story.nodeId));
  for (const item of preview.coverage) assert.equal(text.slice(item.start, item.end), item.text);
});

test('a top-level real volume heading is still parsed as a volume', async t => {
  const text = '# 第一卷：启航\n故事开始。';
  t.mock.method(promptRunner, 'runStructuredPrompt', async ({ promptInput }) => {
    assert.equal(promptInput.text, text);
    return { output: { nodes: [{ clientRef: 'v', nodeType: 'volume', title: '第一卷：启航', summary: '故事开始。', planningDepth: 'rough', sourceFragment: text }], unclassifiedFragments: [] } };
  });
  const preview = await new OutlineImportPreviewService({}).preview('u', '原书名', text, 'markdown');
  assert.equal(preview.document.story.title, '原书名');
  assert.equal(preview.document.volumes.length, 1);
});


test('a top-level category heading is not mistaken for a book title', async t => {
  const text = '# 人物\n苏禾：邮差。';
  t.mock.method(promptRunner, 'runStructuredPrompt', async ({ promptInput }) => {
    assert.equal(promptInput.text, text);
    return { output: { nodes: [{ clientRef: 'p', nodeType: 'character', title: '苏禾', summary: '邮差。', planningDepth: 'rough', sourceFragment: '苏禾：邮差。' }], unclassifiedFragments: [] } };
  });
  const preview = await new OutlineImportPreviewService({}).preview('u', '原书名', text, 'markdown');
  assert.equal(preview.document.story.title, '原书名');
  assert.equal(preview.document.characters[0].name, '苏禾');
});

test('edit apply rejects dependsOn that use node ids instead of operation ids with 400', async () => {
  const document = createEmptyOutlineDocument('已有大纲');
  document.volumes = [{ nodeId: 'vol-1', title: '第一卷', summary: '已有', order: 0, planningDepth: 'detailed', chapterNodeIds: [] }];
  document.chapters = [];
  const operations = [{
    operationId: 'op-1',
    kind: 'add_node',
    nodeType: 'chapter',
    clientRef: 'chapter-new',
    fields: { title: '新章', summary: '补充', volumeNodeId: 'vol-1' },
    reason: '补章',
    affectedNodeIds: [],
    dependsOn: ['vol-1'],
    risks: [],
  }];
  const repository = {
    findProposal: async () => ({ id: 'proposal-edit', projectId: 'project-1', baseVersion: 1, kind: 'edit', status: 'pending', proposalJson: JSON.stringify({ operations }) }),
    getCurrent: async () => ({ project: { currentVersion: 1 }, revision: { documentJson: JSON.stringify(document) } }),
    applyOutlineProposal: async () => { throw new Error('must not apply'); },
  };
  await assert.rejects(
    new OutlineProposalService(repository).apply('project-1', 'proposal-edit', ['op-1']),
    error => error instanceof AppError && error.statusCode === 400 && /操作编号|依赖/.test(error.message),
  );
});

test('edit apply rejects chapter add without volumeNodeId and never writes', async () => {
  const document = createEmptyOutlineDocument('已有大纲');
  document.volumes = [{ nodeId: 'vol-1', title: '第一卷', summary: '已有', order: 0, planningDepth: 'detailed', chapterNodeIds: [] }];
  let applied = false;
  const operations = [{
    operationId: 'op-1',
    kind: 'add_node',
    nodeType: 'chapter',
    clientRef: 'chapter-new',
    fields: { title: '新章', summary: '补充' },
    reason: '补章',
    affectedNodeIds: [],
    dependsOn: [],
    risks: [],
  }];
  const repository = {
    findProposal: async () => ({ id: 'proposal-edit', projectId: 'project-1', baseVersion: 1, kind: 'edit', status: 'pending', proposalJson: JSON.stringify({ operations }) }),
    getCurrent: async () => ({ project: { currentVersion: 1 }, revision: { documentJson: JSON.stringify(document) } }),
    applyOutlineProposal: async () => { applied = true; return {}; },
  };
  await assert.rejects(
    new OutlineProposalService(repository).apply('project-1', 'proposal-edit', ['op-1']),
    error => error instanceof AppError && error.statusCode === 400 && /所属卷|volumeNodeId|章节列表/.test(error.message),
  );
  assert.equal(applied, false);
});

test('edit apply accepts seven chapter adds with volumeNodeId and selected dependencies', async () => {
  const document = createEmptyOutlineDocument('三卷大纲');
  document.volumes = [
    { nodeId: 'vol-1', title: '第一卷', summary: 'A', order: 0, planningDepth: 'detailed', chapterNodeIds: ['ch-1'] },
    { nodeId: 'vol-2', title: '第二卷', summary: 'B', order: 1, planningDepth: 'detailed', chapterNodeIds: [] },
    { nodeId: 'vol-3', title: '第三卷', summary: 'C', order: 2, planningDepth: 'detailed', chapterNodeIds: [] },
  ];
  document.chapters = [
    { nodeId: 'ch-1', volumeNodeId: 'vol-1', title: '第一章', summary: '已有', order: 0, planningDepth: 'detailed', characterNodeIds: [], payoffNodeIds: [] },
  ];
  const operations = Array.from({ length: 7 }, (_, index) => ({
    operationId: `op-${index + 1}`,
    kind: 'add_node',
    nodeType: 'chapter',
    clientRef: `chapter-new-${index + 1}`,
    fields: { title: `新章${index + 1}`, summary: `补充${index + 1}`, volumeNodeId: index < 3 ? 'vol-2' : 'vol-3' },
    reason: '补后几卷章节',
    affectedNodeIds: [],
    dependsOn: index === 0 ? [] : [`op-${index}`],
    risks: [],
  }));
  let applied;
  const repository = {
    findProposal: async () => ({ id: 'proposal-edit', projectId: 'project-1', baseVersion: 1, kind: 'edit', status: 'pending', proposalJson: JSON.stringify({ operations }) }),
    getCurrent: async () => ({ project: { currentVersion: 1 }, revision: { documentJson: JSON.stringify(document) } }),
    applyOutlineProposal: async (projectId, proposalId, baseVersion, selected, source, ops) => {
      applied = { projectId, proposalId, baseVersion, selected: [...selected], opsCount: ops.length };
      return { revision: { version: baseVersion + 1 }, document: source };
    },
  };
  const all = await new OutlineProposalService(repository).apply('project-1', 'proposal-edit', operations.map((item) => item.operationId));
  assert.equal(all.revision.version, 2);
  assert.equal(applied.selected.length, 7);
  await assert.rejects(
    new OutlineProposalService(repository).apply('project-1', 'proposal-edit', ['op-7']),
    error => error instanceof AppError && error.statusCode === 400 && /未勾选的操作/.test(error.message),
  );
});

test('edit apply rejects volume chapterNodeIds update shortcut with 400', async () => {
  const document = createEmptyOutlineDocument('已有大纲');
  document.volumes = [{ nodeId: 'vol-1', title: '第一卷', summary: '已有', order: 0, planningDepth: 'detailed', chapterNodeIds: [] }];
  const operations = [{
    operationId: 'op-1',
    kind: 'update_fields',
    nodeId: 'vol-1',
    fields: { chapterNodeIds: ['ghost'] },
    reason: '误用',
    affectedNodeIds: ['vol-1'],
    dependsOn: [],
    risks: [],
  }];
  const repository = {
    findProposal: async () => ({ id: 'proposal-edit', projectId: 'project-1', baseVersion: 1, kind: 'edit', status: 'pending', proposalJson: JSON.stringify({ operations }) }),
    getCurrent: async () => ({ project: { currentVersion: 1 }, revision: { documentJson: JSON.stringify(document) } }),
    applyOutlineProposal: async () => { throw new Error('must not apply'); },
  };
  await assert.rejects(
    new OutlineProposalService(repository).apply('project-1', 'proposal-edit', ['op-1']),
    error => error instanceof AppError && error.statusCode === 400 && /章节列表|新增章节/.test(error.message),
  );
});

test('edit apply rejects dangling volumeNodeId, cycles, duplicate ids and missing targets without writing', async () => {
  const document = createEmptyOutlineDocument('已有大纲');
  document.volumes = [{ nodeId: 'vol-1', title: '第一卷', summary: '已有', order: 0, planningDepth: 'detailed', chapterNodeIds: [] }];
  document.chapters = [];
  let applied = 0;
  const repositoryFor = (operations) => ({
    findProposal: async () => ({ id: 'proposal-edit', projectId: 'project-1', baseVersion: 1, kind: 'edit', status: 'pending', proposalJson: JSON.stringify({ operations }) }),
    getCurrent: async () => ({ project: { currentVersion: 1 }, revision: { documentJson: JSON.stringify(document) } }),
    applyOutlineProposal: async () => { applied += 1; return {}; },
  });

  await assert.rejects(
    new OutlineProposalService(repositoryFor([{
      operationId: 'op-1', kind: 'add_node', nodeType: 'chapter', clientRef: 'c1',
      fields: { title: '章', summary: 's', volumeNodeId: 'vol-missing' }, reason: 'r', affectedNodeIds: [], dependsOn: [], risks: [],
    }])).apply('project-1', 'proposal-edit', ['op-1']),
    error => error instanceof AppError && error.statusCode === 400 && /所属卷|不存在/.test(error.message),
  );

  await assert.rejects(
    new OutlineProposalService(repositoryFor([
      { operationId: 'op-a', kind: 'add_node', nodeType: 'chapter', clientRef: 'c1', fields: { title: 'A', summary: 's', volumeNodeId: 'vol-1' }, reason: 'r', affectedNodeIds: [], dependsOn: ['op-b'], risks: [] },
      { operationId: 'op-b', kind: 'add_node', nodeType: 'chapter', clientRef: 'c2', fields: { title: 'B', summary: 's', volumeNodeId: 'vol-1' }, reason: 'r', affectedNodeIds: [], dependsOn: ['op-a'], risks: [] },
    ])).apply('project-1', 'proposal-edit', ['op-a', 'op-b']),
    error => error instanceof AppError && error.statusCode === 400 && /循环/.test(error.message),
  );

  await assert.rejects(
    new OutlineProposalService(repositoryFor([
      { operationId: 'op-dup', kind: 'add_node', nodeType: 'chapter', clientRef: 'c1', fields: { title: 'A', summary: 's', volumeNodeId: 'vol-1' }, reason: 'r', affectedNodeIds: [], dependsOn: [], risks: [] },
      { operationId: 'op-dup', kind: 'add_node', nodeType: 'chapter', clientRef: 'c2', fields: { title: 'B', summary: 's', volumeNodeId: 'vol-1' }, reason: 'r', affectedNodeIds: [], dependsOn: [], risks: [] },
    ])).apply('project-1', 'proposal-edit', ['op-dup']),
    error => error instanceof AppError && error.statusCode === 400 && /重复/.test(error.message),
  );

  await assert.rejects(
    new OutlineProposalService(repositoryFor([{
      operationId: 'op-1', kind: 'remove_node', nodeId: 'ghost-node', reason: 'r', affectedNodeIds: [], dependsOn: [], risks: [],
    }])).apply('project-1', 'proposal-edit', ['op-1']),
    error => error instanceof AppError && error.statusCode === 400 && /不存在/.test(error.message),
  );

  assert.equal(applied, 0);
});

test('edit apply accepts new-volume clientRef as chapter volumeNodeId and maps missing-dependency plain Error to 400', async () => {
  const document = createEmptyOutlineDocument('已有大纲');
  document.volumes = [];
  document.chapters = [];
  const operations = [
    { operationId: 'op-vol', kind: 'add_node', nodeType: 'volume', clientRef: 'volume-new', fields: { title: '新卷', summary: 's' }, reason: '加卷', affectedNodeIds: [], dependsOn: [], risks: [] },
    { operationId: 'op-ch', kind: 'add_node', nodeType: 'chapter', clientRef: 'chapter-new', fields: { title: '新章', summary: 's', volumeNodeId: 'volume-new' }, reason: '加章', affectedNodeIds: [], dependsOn: ['op-vol'], risks: [] },
  ];
  let appliedOps;
  const repository = {
    findProposal: async () => ({ id: 'proposal-edit', projectId: 'project-1', baseVersion: 1, kind: 'edit', status: 'pending', proposalJson: JSON.stringify({ operations }) }),
    getCurrent: async () => ({ project: { currentVersion: 1 }, revision: { documentJson: JSON.stringify(document) } }),
    applyOutlineProposal: async (_projectId, _proposalId, _baseVersion, selected, _source, ops) => {
      appliedOps = { selected: [...selected], opsCount: ops.length };
      return { revision: { version: 2 }, document };
    },
  };
  const result = await new OutlineProposalService(repository).apply('project-1', 'proposal-edit', ['op-vol', 'op-ch']);
  assert.equal(result.revision.version, 2);
  assert.deepEqual(appliedOps.selected.sort(), ['op-ch', 'op-vol']);

  await assert.rejects(
    new OutlineProposalService({
      ...repository,
      applyOutlineProposal: async () => { throw new Error('所选操作缺少依赖项'); },
    }).apply('project-1', 'proposal-edit', ['op-vol', 'op-ch']),
    error => error instanceof AppError && error.statusCode === 400 && /依赖/.test(error.message),
  );
});

test('edit apply keeps unknown repository failures as non-AppError for real 500 mapping', async () => {
  const document = createEmptyOutlineDocument('已有大纲');
  document.volumes = [{ nodeId: 'vol-1', title: '第一卷', summary: '已有', order: 0, planningDepth: 'detailed', chapterNodeIds: [] }];
  const operations = [{
    operationId: 'op-1', kind: 'add_node', nodeType: 'chapter', clientRef: 'c1',
    fields: { title: '章', summary: 's', volumeNodeId: 'vol-1' }, reason: 'r', affectedNodeIds: [], dependsOn: [], risks: [],
  }];
  const repository = {
    findProposal: async () => ({ id: 'proposal-edit', projectId: 'project-1', baseVersion: 1, kind: 'edit', status: 'pending', proposalJson: JSON.stringify({ operations }) }),
    getCurrent: async () => ({ project: { currentVersion: 1 }, revision: { documentJson: JSON.stringify(document) } }),
    applyOutlineProposal: async () => { throw new Error('disk I/O exploded'); },
  };
  await assert.rejects(
    new OutlineProposalService(repository).apply('project-1', 'proposal-edit', ['op-1']),
    error => !(error instanceof AppError) && error instanceof Error && error.message === 'disk I/O exploded',
  );
});

test('edit generate validates AI output before creating a proposal', async t => {
  const document = createEmptyOutlineDocument('已有大纲');
  document.volumes = [{ nodeId: 'vol-1', title: '第一卷', summary: '已有', order: 0, planningDepth: 'detailed', chapterNodeIds: [] }];
  let created = 0;
  const repository = {
    getCurrent: async () => ({ project: { currentVersion: 1 }, revision: { documentJson: JSON.stringify(document) } }),
    createProposal: async () => { created += 1; return { id: 'should-not-create' }; },
  };
  t.mock.method(promptRunner, 'runStructuredPrompt', async () => ({
    output: {
      operations: [{
        operationId: 'op-1',
        kind: 'add_node',
        nodeType: 'chapter',
        clientRef: 'c1',
        fields: { title: '章', summary: 's', volumeNodeId: 'vol-1' },
        reason: 'r',
        affectedNodeIds: [],
        dependsOn: ['vol-1'],
        risks: [],
      }],
    },
    meta: { invocation: { promptId: 'outline.edit_proposal', promptVersion: 'v2' } },
  }));
  await assert.rejects(
    new OutlineProposalService(repository).generate('project-1', { kind: 'edit', requestText: '补一章' }),
    error => error instanceof AppError && error.statusCode === 400 && /操作编号|依赖/.test(error.message),
  );
  assert.equal(created, 0);
});
