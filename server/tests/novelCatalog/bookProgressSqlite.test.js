const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const {initializeTemporarySqliteDatabase} = require('../testInfrastructure/tempSqliteDatabase.cjs');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'book-progress-'));
process.env.DATABASE_URL = initializeTemporarySqliteDatabase(directory, 'test.db');
process.env.NODE_ENV = 'test';
process.env.AI_NOVEL_RUNTIME = 'desktop';
process.env.AI_NOVEL_APP_DATA_DIR = directory;
const {prisma} = require('../../dist/db/prisma');
const {listNovels} = require('../../dist/services/novel/catalog');
test.after(() => prisma.$disconnect());

test('catalog separates saved prose and current V2 run from a successful opening handoff', async () => {
  await prisma.novel.create({data: {id: 'book', title: '十四毫米', directorVersion: 'v2', estimatedChapterCount: 90}});
  await prisma.chapter.createMany({data: Array.from({length: 90}, (_, index) => ({
    novelId: 'book', title: `第${index + 1}章`, order: index + 1, content: index === 0 ? '已保存正文。' : index === 1 ? ' \n\t\r ' : '',
  }))});
  const opening = await prisma.novelWorkflowTask.create({data: {novelId: 'book', lane: 'auto_director', title: '开书交接',
    status: 'succeeded', progress: 1, currentItemKey: 'opening_complete', currentItemLabel: '进入小说导演台继续创作'}});
  await prisma.directorNextRun.create({data: {id: 'run', novelId: 'book', driver: 'auto', planVersion: 'test', contractJson: JSON.stringify({executionEpoch: 0})}});
  const control = await prisma.directorNextRunControl.create({data: {runId: 'run', novelId: 'book', status: 'completed'}});
  const read = async () => (await listNovels({page: 1, limit: 12})).items.find(book => book.id === 'book');
  const book = await read();
  assert.equal(book._count.chapters, 90);
  assert.equal(book.latestAutoDirectorTask, null);
  assert.deepEqual(book.bookProgress, {writtenChapters: 1, targetChapters: 90, director: {runId: 'run', status: 'completed'}});
  assert.deepEqual(await prisma.novelWorkflowTask.findUnique({where: {id: opening.id}}), opening);
  assert.deepEqual(await prisma.directorNextRunControl.findUnique({where: {runId: 'run'}}), control);
  for (const status of ['running', 'paused', 'waiting_gate', 'failed', 'cancelled']) {
    await prisma.directorNextRunControl.update({where: {runId: 'run'}, data: {status}});
    assert.equal((await read()).bookProgress.director.status, status);
  }
  await prisma.novel.update({where: {id: 'book'}, data: {directorEpoch: 1}});
  assert.equal((await read()).bookProgress.director, null, 'a previous epoch cannot become the current director');
  await prisma.novel.update({where: {id: 'book'}, data: {directorVersion: 'v1'}});
  assert.equal((await read()).latestAutoDirectorTask.id, opening.id, 'V1 keeps its workflow contract');
  assert.equal((await read()).bookProgress.director, null);
});
