const test = require('node:test');
const assert = require('node:assert/strict');
const { prisma } = require('../dist/db/prisma');
const support = require('../dist/services/novel/novelCoreSupport');
const { novelEventBus } = require('../dist/events/publisher');
const { NovelCoreCrudService } = require('../dist/services/novel/novelCoreCrudService');

test('actual CRUD preserves omission, round-trips choice and clears only explicit null', async () => {
  const previous = { create: prisma.novel.create, update: prisma.novel.update, find: prisma.novel.findUnique, queue: support.queueRagUpsert, emit: novelEventBus.emit };
  const profile = { schemaVersion: 1, orientation: 'literary_genre', namingBackground: { era: '合成古代', languageCulture: '多语' } };
  let row = { id: 'synthetic-book', title: '合成书', worldId: null, writingMode: 'original', creativeProfileJson: null };
  let patch;
  support.queueRagUpsert = () => {};
  novelEventBus.emit = async () => {};
  prisma.novel.create = async ({ data }) => { row = { ...row, ...data }; return row; };
  prisma.novel.findUnique = async () => row;
  prisma.novel.update = async ({ data }) => {
    patch = data;
    row = { ...row, ...Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined)) };
    return row;
  };
  try {
    const service = new NovelCoreCrudService();
    const created = await service.createNovel({ title: '合成书', creativeProfile: profile });
    assert.deepEqual(created.creativeProfile, profile);
    assert.ok(!Object.hasOwn(created, 'creativeProfileJson'));
    const stored = row.creativeProfileJson;
    await service.updateNovel(row.id, { description: '只改合成简介' });
    assert.equal(patch.creativeProfileJson, undefined);
    assert.equal(row.creativeProfileJson, stored);
    await service.updateNovel(row.id, { creativeProfile: null });
    assert.equal(row.creativeProfileJson, null);
    const read = await service.getNovelById(row.id);
    assert.equal(read.creativeProfile, null);
    row.creativeProfileJson = '{synthetic broken';
    const broken = await service.updateNovel(row.id, { title: '保留未识别配置' });
    assert.equal(row.creativeProfileJson, '{synthetic broken');
    assert.equal(broken.creativeProfileIssue.code, 'malformed_json');
    await assert.rejects(() => service.updateNovel(row.id, { creativeProfile: { orientation: 'unknown' } }));
    assert.equal(row.creativeProfileJson, '{synthetic broken');
  } finally {
    prisma.novel.create = previous.create; prisma.novel.update = previous.update; prisma.novel.findUnique = previous.find;
    support.queueRagUpsert = previous.queue; novelEventBus.emit = previous.emit;
  }
});
