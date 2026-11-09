const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const {spawnSync} = require('node:child_process');

test('fresh API books ignore initialization placeholder volumes while an author volume is preserved', () => {
  const root = path.resolve(__dirname, '../../../..');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'initialization-volume-strategy-'));
  const script = path.join(dir, 'verify.cjs');
  fs.writeFileSync(script, String.raw`
const assert = require('node:assert/strict'), path = require('node:path'), http = require('node:http');
const server = path.join(process.env.DIRECTOR_NEXT_REPO_ROOT, 'server');
const {prisma} = require(path.join(server, 'dist/db/prisma'));
const {ensureRuntimeDatabaseReady} = require(path.join(server, 'dist/db/runtimeMigrations'));
const {NovelVolumeService} = require(path.join(server, 'dist/services/novel/volume/NovelVolumeService'));
const {getDirectorProductionServices} = require(path.join(server, 'dist/app/director/services'));
const {PrismaArtifactLedger} = require(path.join(server, 'dist/modules/director/infrastructure'));
const runner = require(path.join(server, 'dist/prompting/core/promptRunner'));
const {createApp} = require(path.join(server, 'dist/app'));
const {novelCreateResourceRecommendationService} = require(path.join(server, 'dist/services/novel/NovelCreateResourceRecommendationService'));
novelCreateResourceRecommendationService.resolveRequired = async () => ({genreId: null, primaryStoryModeId: null, secondaryStoryModeId: null});

const promptCalls = [];
function strategy(count) {
  return {
    recommendedVolumeCount: count,
    hardPlannedVolumeCount: Math.min(3, count),
    readerRewardLadder: '逐卷兑现读者回报',
    escalationLadder: '逐卷升级核心压力',
    midpointShift: '中盘改变主角处境',
    notes: '测试卷战略',
    volumes: Array.from({length: count}, (_, index) => ({
      sortOrder: index + 1,
      planningMode: index < 3 ? 'hard' : 'soft',
      roleLabel: '第' + (index + 1) + '卷职责',
      coreReward: '阶段回报',
      escalationFocus: '升级焦点',
      uncertaintyLevel: 'low',
    })),
    uncertainties: [],
  };
}
function skeletonVolumes(count) {
  return Array.from({length: count}, (_, index) => ({
    title: 'AI第' + (index + 1) + '卷',
    summary: '本卷概括',
    openingHook: '开卷钩子',
    mainPromise: '卷级承诺',
    primaryPressureSource: '核心压力',
    coreSellingPoint: '本卷卖点',
    escalationMode: '升级方式',
    protagonistChange: '主角变化',
    midVolumeRisk: '中段风险',
    climax: '卷末高潮',
    payoffType: '阶段兑现',
    nextVolumeHook: '下卷钩子',
    resetPoint: '下卷起点',
    openPayoffs: [],
  }));
}
runner.runStructuredPrompt = async ({promptInput, options}) => {
  promptCalls.push({novelId: options.novelId, scope: options.scope, guidance: promptInput.volumeCountGuidance});
  if (options.scope === 'strategy') {
    const count = promptInput.volumeCountGuidance.userPreferredVolumeCount
      ?? promptInput.volumeCountGuidance.respectedExistingVolumeCount
      ?? 3;
    return {output: strategy(count)};
  }
  if (options.scope === 'strategy_critique') {
    return {output: {overallRisk: 'low', summary: '战略可用', issues: [], recommendedActions: []}};
  }
  assert.equal(options.scope, 'skeleton');
  return {output: {volumes: skeletonVolumes(promptInput.strategyPlan.recommendedVolumeCount)}};
};

(async () => {
  await ensureRuntimeDatabaseReady();
  const app = http.createServer(createApp());
  await new Promise(resolve => app.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + app.address().port;
  const services = getDirectorProductionServices();
  async function post(route, body, expectedStatus) {
    const response = await fetch(base + route, {
      method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body),
    });
    const payload = await response.json();
    assert.equal(response.status, expectedStatus, route + ': ' + JSON.stringify(payload));
    return payload.data;
  }
  async function createBook(title) {
    const created = await post('/api/novels', {title, description: title + '的故事方向'}, 201);
    assert.equal(created.directorVersion, 'v2');
    return created.id;
  }
  async function runVolumeStrategy(novelId, userPreferredVolumeCount) {
    const opened = await post('/api/director-next/commands', {
      type: 'open_run', novelId, driver: 'auto', stepIdsInScope: ['volume_strategy'],
      launchInput: {
        storyInput: '主角在持续升级的压力中完成全书承诺。',
        estimatedChapterCount: 60, worldMode: 'skip', targetMode: 'opening',
        provider: 'openai', model: 'stub',
        ...(userPreferredVolumeCount === undefined ? {} : {userPreferredVolumeCount}),
      },
      idempotencyKey: 'open-' + novelId,
    }, 202);
    const ledger = new PrismaArtifactLedger();
    for (const type of ['story_macro', 'book_contract', 'character_cast']) {
      await ledger.record({
        novelId, type, scope: 'book', status: 'confirmed', protectedUserContent: true,
        contentRef: type + ':' + novelId, contentHash: 'fixture-' + type, producedByRunId: opened.runId,
      });
    }
    let control;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      assert.equal(await services.worker.tick(), true);
      control = await services.http.runRepository.getControl(opened.runId);
      if (control.status !== 'running' && control.status !== 'queued') break;
    }
    assert.equal(control.status, 'completed', JSON.stringify(control));
    return opened.runId;
  }
  function scopes(novelId) {
    return promptCalls.filter(call => call.novelId === novelId).map(call => call.scope);
  }
  try {
    for (const preferred of [undefined, 3]) {
      const novelId = await createBook(preferred === undefined ? 'AI推荐卷数' : '作者指定三卷');
      await runVolumeStrategy(novelId, preferred);
      assert.deepEqual(scopes(novelId), ['strategy', 'strategy_critique', 'skeleton']);
      const strategyCall = promptCalls.find(call => call.novelId === novelId && call.scope === 'strategy');
      assert.equal(strategyCall.guidance.userPreferredVolumeCount, preferred ?? null);
      assert.equal(strategyCall.guidance.respectedExistingVolumeCount, null);
      const workspace = await new NovelVolumeService().getVolumes(novelId, {hydrateCanonical: false});
      assert.equal(workspace.volumes.length, 3);
      assert.equal(workspace.strategyPlan.recommendedVolumeCount, 3);
      assert.deepEqual(workspace.volumes.map(volume => volume.title), ['AI第1卷', 'AI第2卷', 'AI第3卷']);
    }

    const novelId = await createBook('已有作者单卷');
    const volumeService = new NovelVolumeService();
    await volumeService.updateVolumes(novelId, {
      volumes: [{
        id: 'author-volume', sortOrder: 1, title: '作者单卷', summary: '作者亲自保存的卷级内容',
        openingHook: '作者开卷钩子', mainPromise: '作者卷级承诺', primaryPressureSource: '作者压力源',
        coreSellingPoint: '作者卖点', escalationMode: '作者升级方式', protagonistChange: '作者成长安排',
        midVolumeRisk: '作者中段风险', climax: '作者卷末高潮', payoffType: '作者兑现方式',
        nextVolumeHook: '作者后续钩子', resetPoint: '作者下卷起点', openPayoffs: [],
        chapters: [{id: 'author-plan', chapterOrder: 1, title: '作者章节', summary: '作者章节概要', taskSheet: '作者任务', sceneCards: '作者场景'}],
      }],
      syncToChapterExecution: false,
    });
    const before = await volumeService.getVolumes(novelId, {hydrateCanonical: false});
    await runVolumeStrategy(novelId, 3);
    assert.deepEqual(scopes(novelId), ['strategy']);
    const after = await volumeService.getVolumes(novelId, {hydrateCanonical: false});
    assert.deepEqual(after.volumes, before.volumes);
    assert.equal(after.volumes.length, 1);
    assert.equal(after.volumes[0].title, '作者单卷');
    assert.equal(after.strategyPlan.recommendedVolumeCount, 1);
  } finally {
    await new Promise(resolve => app.close(resolve));
  }
  await prisma.$disconnect();
})().catch(async error => {console.error(error); await prisma.$disconnect(); process.exitCode = 1;});
`);
  const result = spawnSync(process.execPath, [script], {cwd: root, encoding: 'utf8', timeout: 90000, env: {...process.env,
    NODE_ENV: 'test', AI_NOVEL_RUNTIME: 'desktop', AI_NOVEL_APP_DATA_DIR: dir, DIRECTOR_NEXT_REPO_ROOT: root,
    DIRECTOR_NEXT_ENABLED: 'true', DATABASE_URL: 'file:' + path.join(dir, 'strategy.db').replace(/\\/g, '/'),
  }});
  assert.equal(result.status, 0, result.stderr + '\n' + result.stdout);
});
