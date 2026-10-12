const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const {initializeTemporarySqliteDatabase} = require('../testInfrastructure/tempSqliteDatabase.cjs');

test('V2 candidate modes, durable recovery, ownership fences and V1 isolation in a temporary database', () => {
  const server = path.resolve(__dirname, '../..');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'v2-candidates-'));
  const databaseUrl = initializeTemporarySqliteDatabase(dir, 'test.db');
  const script = path.join(dir, 'check.cjs');
  fs.writeFileSync(script, String.raw`
const assert = require('node:assert/strict');
const path = require('node:path');
const base = process.env.TEST_SERVER_ROOT;
const load = p => require(path.join(base, 'dist', p));
const {prisma} = load('db/prisma');
const {DirectorCharacterCandidateService, CharacterCandidateReviewRequiredError} = load('services/novel/characters/candidates');
const {chapterArtifactDeltaOutputSchema} = load('prompting/prompts/novel/chapterArtifactDelta.prompts');
const {resumeBusiness} = load('app/director/savedContent');
const {readBatchOutcome} = load('app/director/batchOutcome');
load('prompting/core/promptRunner').runStructuredPrompt = async () => {throw Error('No model calls allowed');};
const content = '青禾推门而入，阿青就是青禾的乳名。阿宁递来药箱。门外有个蒙面人。';
const output = candidates => chapterArtifactDeltaOutputSchema.parse({summary: '章末摘要', stateDeltas: {},
  syncPlan: {reason: 'final draft'}, characterCandidates: candidates, confidence: .9});
const create = {proposedName: '阿宁', proposedRole: '药童', summary: '递来药箱的药童', evidence: ['阿宁递来药箱。'], identityDecision: 'create', decisionReason: '独立出场的药童'};
async function book(id, driver) {
  await prisma.novel.create({data: {id, title: id, directorVersion: 'v2', directorEpoch: 2}});
  const contract = {runId: id+'-run', novelId: id, driver, executionEpoch: 2, issuePolicy: {mode: 'completion_first'}};
  await prisma.directorNextRun.create({data: {id: contract.runId, novelId: id, driver, planVersion: 'test', contractJson: JSON.stringify(contract)}});
  await prisma.directorNextRunControl.create({data: {runId: contract.runId, novelId: id, status: 'running'}});
  await prisma.chapter.create({data: {id: id+'-chapter', novelId: id, title: '第一章', order: 1, content}});
  return {contract, input: {novelId: id, chapterId: id+'-chapter', directorRunId: contract.runId, content}};
}
(async () => {try {
  const service = new DirectorCharacterCandidateService();
  const auto = await book('auto', 'auto');
  await prisma.character.create({data: {id: 'qing', novelId: 'auto', name: '青禾', role: '主角', background: '作者设定'}});
  const extracted = output([create,
    {proposedName: '阿青', identityDecision: 'merge', matchedCharacterId: 'qing', decisionReason: '正文证实乳名', evidence: ['阿青就是青禾的乳名。']},
    {proposedName: '蒙面人', identityDecision: 'defer', decisionReason: '身份未知', evidence: ['门外有个蒙面人。']}]);
  extracted.stateDeltas.characterStates = [{characterName: '阿宁', characterId: null, currentState: '带来药箱'}];
  extracted.factionUpdates = [{characterName: '阿青', factionLabel: '药铺', confidence: .9}];
  const mapped = await service.prepare(auto.input, extracted);
  assert.equal(await prisma.character.count({where: {novelId: 'auto'}}), 2);
  assert.equal(mapped.factionUpdates[0].characterName, '青禾');
  assert.equal(mapped.stateDeltas.characterStates[0].characterId, (await prisma.character.findFirst({where: {name: '阿宁'}})).id);
  assert.equal((await prisma.character.findUnique({where: {id: 'qing'}})).background, '作者设定');
  await service.prepare(auto.input, extracted);
  assert.equal(await prisma.character.count({where: {novelId: 'auto'}}), 2, 'replay cannot create another actor');
  let page = await service.read(auto.contract.runId);
  assert.equal(page.reviews[0].blocking, false);
  assert.deepEqual(page.reviews[0].items.map(i => i.status), ['created', 'merged', 'pending']);
  assert.equal(await prisma.characterCandidate.count({where: {novelId: 'auto', status: 'pending'}}), 0, 'V1 pending queue cannot consume V2 candidates');
  const {CharacterDynamicsMutationService} = load('services/novel/dynamics/CharacterDynamicsMutationService');
  await assert.rejects(new CharacterDynamicsMutationService({}).confirmCandidate('auto', page.reviews[0].items[2].id, {}), /V2/);
  const assisted = await book('assisted', 'assisted');
  let reviewId;
  await assert.rejects(service.prepare(assisted.input, output([create])), error => {
    assert.ok(error instanceof CharacterCandidateReviewRequiredError); reviewId = error.reviewId; return true;
  });
  assert.equal(await prisma.character.count({where: {novelId: 'assisted'}}), 0);
  const contract = assisted.contract;
  const payload = {directorNext: {runId: contract.runId, decisions: [], pendingCharacterReviewId: reviewId}};
  await prisma.generationJob.create({data: {id: 'job', novelId: 'assisted', startOrder: 1, endOrder: 2, status: 'queued', pendingManualRecovery: true, payload: JSON.stringify(payload)}});
  await prisma.directorNextEvent.create({data: {id: 'binding', runId: contract.runId, seq: 1, type: 'chapter_batch_job', payloadJson: JSON.stringify({jobId: 'job'})}});
  const outcome = await readBatchOutcome({id: 'job'}, {runId: contract.runId, contract});
  assert.equal(outcome.stopSignal.kind, 'manual_recovery');
  assert.equal(outcome.stopSignal.action, 'pause_for_manual');
  await assert.rejects(prisma.$transaction(tx => resumeBusiness(contract, tx)), /先确认本章人物/);
  assert.equal((await prisma.generationJob.findUnique({where: {id: 'job'}})).pendingManualRecovery, true);
  await prisma.directorNextRunControl.update({where: {runId: contract.runId}, data: {status: 'paused'}});
  page = await service.read(contract.runId);
  const review = page.reviews[0];
  const confirmation = {reviewId, revision: review.revision, contentHash: review.contentHash, decisions: [{candidateId: review.items[0].id, action: 'create'}]};
  await assert.rejects(service.resolve(contract.runId, {...confirmation, decisions: [{candidateId: review.items[0].id, action: 'merge', targetId: 'qing'}]}), /本书/);
  await assert.rejects(service.resolve(contract.runId, {...confirmation, decisions: []}), /每个/);
  await service.resolve(contract.runId, confirmation);
  await assert.rejects(service.resolve(contract.runId, confirmation), /更新/);
  await prisma.$transaction(tx => resumeBusiness(contract, tx));
  const resumed = await prisma.generationJob.findUnique({where: {id: 'job'}});
  assert.equal(resumed.pendingManualRecovery, false);
  assert.equal(JSON.parse(resumed.payload).directorNext.pendingCharacterReviewId, undefined);
  await prisma.directorNextRunControl.update({where: {runId: contract.runId}, data: {status: 'running'}});
  await service.prepare(assisted.input, output([create]));
  assert.equal(await prisma.character.count({where: {novelId: 'assisted'}}), 1);
  assert.equal((await prisma.chapter.findUnique({where: {id: assisted.input.chapterId}})).content, content);
  await prisma.chapter.update({where: {id: auto.input.chapterId}, data: {content: content + '作者修改'}});
  await assert.rejects(service.prepare(auto.input, extracted), /正文已修改/);
  await prisma.novel.update({where: {id: 'assisted'}, data: {directorEpoch: 3, directorVersion: 'v1'}});
  await assert.rejects(service.prepare(assisted.input, output([create])), /归属/);
  const uncertain = await book('uncertain', 'auto');
  await service.prepare(uncertain.input, output([{...create, evidence: ['正文没有的证据']}])) ;
  assert.equal(await prisma.character.count({where: {novelId: 'uncertain'}}), 0);
  assert.equal((await service.read(uncertain.contract.runId)).reviews[0].blocking, false);
  const duplicate = await book('duplicate', 'auto');
  await prisma.character.create({data: {novelId: 'duplicate', name: '阿宁', role: '作者角色'}});
  await service.prepare(duplicate.input, output([create]));
  assert.equal(await prisma.character.count({where: {novelId: 'duplicate'}}), 1);
  assert.equal((await service.read(duplicate.contract.runId)).reviews[0].items[0].status, 'pending');
  const ignored = await book('ignored', 'auto');
  await service.prepare(ignored.input, output([{...create, identityDecision: 'ignore'}]));
  assert.equal(await prisma.character.count({where: {novelId: 'ignored'}}), 0);
  assert.equal((await service.read(ignored.contract.runId)).reviews[0].items[0].status, 'ignored');
  // Uncertain automatic candidates remain reviewable after starting a later batch in the same epoch.
  await prisma.directorNextRun.create({data: {id: 'uncertain-later', novelId: 'uncertain', driver: 'auto', planVersion: 'test',
    createdAt: new Date(Date.now() + 1000), contractJson: JSON.stringify({...uncertain.contract, runId: 'uncertain-later'})}});
  await prisma.directorNextRunControl.create({data: {runId: 'uncertain-later', novelId: 'uncertain', status: 'completed'}});
  const olderReview = (await service.read('uncertain-later')).reviews[0];
  assert.equal(olderReview.items[0].status, 'pending');
  await service.resolve('uncertain-later', {reviewId: olderReview.id, revision: 0, contentHash: olderReview.contentHash,
    decisions: [{candidateId: olderReview.items[0].id, action: 'ignore'}]});
  assert.equal((await service.read('uncertain-later')).reviews.length, 0);
  console.log('candidate checks passed');
} finally {await prisma.$disconnect();}})().catch(error => {console.error(error); process.exitCode = 1;});
`);
  try {
    const output = execFileSync(process.execPath, [script], {cwd: server, encoding: 'utf8', timeout: 90000,
      env: {...process.env, DATABASE_PROVIDER: 'sqlite', DATABASE_URL: databaseUrl, TEST_SERVER_ROOT: server, DIRECTOR_NEXT_ENABLED: 'true'}});
    if (!output.includes('candidate checks passed')) throw new Error(output);
  } finally {
    const resolved = path.resolve(dir);
    if (path.dirname(resolved) !== path.resolve(os.tmpdir()) || !path.basename(resolved).startsWith('v2-candidates-')) throw Error('Unsafe cleanup path');
    fs.rmSync(resolved, {recursive: true, force: true});
  }
});
