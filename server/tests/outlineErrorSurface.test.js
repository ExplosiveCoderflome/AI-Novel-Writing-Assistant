const test = require('node:test');
const assert = require('node:assert/strict');
const promptRunner = require('../dist/prompting/core/promptRunner');
const { AppError } = require('../dist/middleware/errorHandler');
const { StructuredOutputError } = require('../dist/llm/structuredOutput');
const { OutlineProjectService } = require('../dist/modules/planning/outline/application/OutlineProjectService');
const { OutlineProposalService } = require('../dist/modules/planning/outline/application/OutlineProposalService');
const { createEmptyOutlineDocument } = require('../dist/modules/planning/outline/domain/outlineDocument');
const { outlineFeedbackAnalyzeSchema } = require('../../shared/dist/types/outlineFeedback.js');

function validDocument() {
  const document = createEmptyOutlineDocument('测试大纲');
  const volumeId = 'volume-1';
  const chapterId = 'chapter-1';
  document.volumes.push({ nodeId: volumeId, title: '第一卷', order: 0, planningDepth: 'rough', summary: '卷摘要', chapterNodeIds: [chapterId] });
  document.chapters.push({ nodeId: chapterId, volumeNodeId: volumeId, title: '第1章', order: 0, planningDepth: 'rough', summary: '章摘要', characterNodeIds: [], payoffNodeIds: [] });
  return document;
}

function structuredFailure(category, message) {
  return new StructuredOutputError({
    message,
    category,
    diagnostics: { strategy: 'prompt_json', profile: {}, reasoningForcedOff: false, fallbackAvailable: false, fallbackUsed: false, errorCategory: category },
  });
}

test('saving with a stale expectedVersion returns a 409 conflict instead of an internal error', async () => {
  const repository = {
    transaction: async (run) => run({
      outlineProject: {
        findUnique: async () => ({ id: 'project-1', currentVersion: 2, currentRevisionId: 'rev-2' }),
        updateMany: async () => ({ count: 0 }),
      },
      outlineRevision: { create: async () => ({ id: 'rev-3' }) },
    }),
  };
  await assert.rejects(
    new OutlineProjectService(repository).save('project-1', 1, validDocument()),
    (error) => error instanceof AppError && error.statusCode === 409 && error.message.includes('请重新加载后再保存'),
  );
});

test('saving a document with a dangling reference returns a readable 400 instead of an internal error', async () => {
  const document = validDocument();
  document.chapters[0].volumeNodeId = 'missing-volume';
  const repository = { transaction: async () => { throw new Error('must not reach the database'); } };
  await assert.rejects(
    new OutlineProjectService(repository).save('project-1', 1, document),
    (error) => error instanceof AppError && error.statusCode === 400 && error.message.includes('missing-volume'),
  );
});

test('saving a document with duplicate node ids returns a readable 400 instead of an internal error', async () => {
  const document = validDocument();
  document.chapters.push({ ...document.chapters[0] });
  const repository = { transaction: async () => { throw new Error('must not reach the database'); } };
  await assert.rejects(
    new OutlineProjectService(repository).save('project-1', 1, document),
    (error) => error instanceof AppError && error.statusCode === 400 && error.message.includes('节点 ID 必须唯一'),
  );
});

test('saving a valid document still creates the next revision', async () => {
  const repository = {
    transaction: async (run) => run({
      outlineProject: {
        findUnique: async () => ({ id: 'project-1', currentVersion: 1, currentRevisionId: 'rev-1' }),
        updateMany: async () => ({ count: 1 }),
      },
      outlineRevision: { create: async ({ data }) => ({ id: 'rev-2', ...data }) },
    }),
  };
  const result = await new OutlineProjectService(repository).save('project-1', 1, validDocument());
  assert.equal(result.revision.version, 2);
  assert.equal(result.document.story.title, '测试大纲');
});

test('proposal generation maps a schema-mismatch failure to a readable 400', async (t) => {
  const currentDocument = createEmptyOutlineDocument('空白大纲');
  t.mock.method(promptRunner, 'runStructuredPrompt', async () => {
    throw structuredFailure('schema_mismatch', '[outline.edit_proposal@v2] JSON repair 后仍未通过 Schema 校验。错误：- operations.0.dependsOn: dependsOn 只能引用同一提案中的其他 operationId，不能填写节点 ID');
  });
  const repository = {
    getCurrent: async () => ({ project: { currentVersion: 1 }, revision: { documentJson: JSON.stringify(currentDocument) } }),
  };
  await assert.rejects(
    new OutlineProposalService(repository).generate('project-1', { kind: 'edit', requestText: '改一下' }),
    (error) => error instanceof AppError && error.statusCode === 400 && error.message.includes('dependsOn 只能引用同一提案中的其他 operationId') && error.message.includes('重新生成'),
  );
});

test('proposal generation maps a transport failure to a readable 502', async (t) => {
  const currentDocument = createEmptyOutlineDocument('空白大纲');
  t.mock.method(promptRunner, 'runStructuredPrompt', async () => {
    throw structuredFailure('transport_error', '连接模型服务时发生网络错误');
  });
  const repository = {
    getCurrent: async () => ({ project: { currentVersion: 1 }, revision: { documentJson: JSON.stringify(currentDocument) } }),
  };
  await assert.rejects(
    new OutlineProposalService(repository).generate('project-1', { kind: 'edit', requestText: '改一下' }),
    (error) => error instanceof AppError && error.statusCode === 502 && error.message.includes('网络错误'),
  );
});

test('listing outlines includes volume and chapter counts from the current revision', async () => {
  const repository = {
    listSummaries: async () => ([
      { project: { id: 'project-1', title: '同名大纲', currentVersion: 2, updatedAt: '2026-11-18T00:00:00.000Z' }, revision: { documentJson: JSON.stringify(validDocument()) } },
      { project: { id: 'project-2', title: '同名大纲', currentVersion: 1, updatedAt: '2026-11-17T00:00:00.000Z' }, revision: null },
    ]),
  };
  const [first, second] = await new OutlineProjectService(repository).list();
  assert.deepEqual(first.outlineCounts, { volumes: 1, chapters: 1 });
  assert.equal(second.outlineCounts, null);
});

test('manual feedback analysis accepts a chapter without a request key', () => {
  const parsed = outlineFeedbackAnalyzeSchema.parse({ chapterId: 'chapter-1' });
  assert.equal(parsed.chapterId, 'chapter-1');
  assert.equal(parsed.requestKey, undefined);
  assert.throws(() => outlineFeedbackAnalyzeSchema.parse({}));
});
