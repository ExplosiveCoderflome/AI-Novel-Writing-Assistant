const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {execFileSync} = require('node:child_process');

test('takeover cannot treat a saved partial list as completed full-volume planning', () => {
  const root = path.resolve(__dirname, '../../../..');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'director-planning-inventory-'));
  const script = path.join(dir, 'verify.cjs');
  fs.writeFileSync(script, String.raw`
const assert = require('node:assert/strict');
const path = require('node:path');
const server = path.join(process.env.DIRECTOR_NEXT_REPO_ROOT, 'server');
const {prisma} = require(path.join(server, 'dist/db/prisma'));
const {ensureRuntimeDatabaseReady} = require(path.join(server, 'dist/db/runtimeMigrations'));
const {createDirectorProductionOptions} = require(path.join(server, 'dist/app/director/productionComposition'));
const {readExistingAssets} = require(path.join(server, 'dist/app/director/existingAssets'));
(async () => {
  await ensureRuntimeDatabaseReady();
  await prisma.novel.create({data:{directorVersion:'v2',id: 'book', title: '规划接管'}});
  const chapter = await prisma.chapter.create({data: {novelId: 'book', order: 8, title: '保留正文', content: '授权之外已有的正文。'}});
  const options = createDirectorProductionOptions();
  const launchInput = {storyInput: '故事', estimatedChapterCount: 12, worldMode: 'skip', targetMode: 'opening', provider: 'openai', model: 'no-model-invocation'};
  const contract = options.contractFactory({runId: 'planning', novelId: 'book', driver: 'auto', stepIdsInScope: null, launchInput});
  for (const status of ['chapter_list_partial', 'chapter_list_partial:3/12', 'active']) {
    const document = {novelId: 'book', volumes: [{id: 'v1', title: '第一卷', sortOrder: 1, status,
      chapters: [1, 2, 3].map(chapterOrder => ({id: 'route-'+chapterOrder, chapterOrder, title: '第'+chapterOrder+'章', summary: '已保存路线'}))}]};
    const version = await prisma.volumePlanVersion.create({data: {novelId: 'book', version: status === 'active' ? 3 : status.includes(':') ? 2 : 1, status: 'active', contentJson: JSON.stringify(document)}});
    const before = await prisma.volumePlanVersion.findMany({where: {novelId: 'book'}, orderBy: {version: 'asc'}});
    const assets = await readExistingAssets(contract);
    assert.equal(assets.some(asset => asset.type === 'volume_chapter_list' && asset.usable), status === 'active', status);
    const inferred = await options.prepareOpen(contract);
    assert.equal(inferred.some(asset => asset.type === 'volume_chapter_list' && asset.status === 'confirmed'), status === 'active', status);
    // A partial full-volume list can still satisfy a bounded production route window.
    const production = options.contractFactory({runId: 'production', novelId: 'book', driver: 'auto', stepIdsInScope: null,
      launchInput: {...launchInput, executionRange: {from: 1, to: 3}}});
    assert.equal((await readExistingAssets(production)).some(asset => asset.type === 'volume_chapter_list' && asset.usable), true);
    assert.deepEqual(await prisma.volumePlanVersion.findMany({where: {novelId: 'book'}, orderBy: {version: 'asc'}}), before);
    assert.deepEqual(await prisma.chapter.findUniqueOrThrow({where: {id: chapter.id}}), chapter);
    assert.equal(version.novelId, 'book');
  }
  await prisma.$disconnect();
})().catch(async error => {console.error(error); await prisma.$disconnect(); process.exitCode = 1;});
`);
  execFileSync(process.execPath, [script], {cwd: root, env: {...process.env, NODE_ENV: 'test', AI_NOVEL_RUNTIME: 'desktop',
    AI_NOVEL_APP_DATA_DIR: dir, DIRECTOR_NEXT_REPO_ROOT: root, DATABASE_URL: 'file:'+path.join(dir, 'inventory.db').replace(/\\/g, '/')}, stdio: 'pipe'});
});
