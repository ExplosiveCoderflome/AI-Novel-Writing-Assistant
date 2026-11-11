const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'b1-revision-'));
Object.assign(process.env, { NODE_ENV: 'test', AI_NOVEL_RUNTIME: 'desktop',
  AI_NOVEL_APP_DATA_DIR: dir, DATABASE_URL: `file:${path.join(dir, 'revision.db')}` });

// Install the cache replacement BEFORE loading any services. Never load/call the real runner.
const runnerPath = require.resolve('../dist/prompting/core/promptRunner');
let calls = [], intercept;
const hash = text => createHash('sha256').update(text).digest('hex');
const ending = '尾章真相：送信人竟是失踪的母亲。';
function mockOutput({ asset, promptInput: p }) {
  switch (asset.id) {
    case 'manuscript.chapter.extract': {
      assert.equal(typeof p.sourceText, 'string');
      const quote = p.sourceText.includes(ending) ? ending : p.sourceText.slice(0, 24);
      return { summary: p.sourceText.includes(ending) ? ending : `已读片段${p.chunkIndex}`,
        characters: [], facts: [], unresolved: [], evidence: [{ quote }] };
    }
    case 'manuscript.outline.merge': {
      const hasEnding = p.summaries.some(x => x.summary.includes(ending));
      return { summary: hasEnding ? ending : '中段事实', theme: '寻亲', tone: '悬疑', endingDirection: hasEnding ? ending : '原文未明确' };
    }
    case 'manuscript.outline.verify': return { warnings: [] };
    // Diagnosis has currentContent rather than sourceText: empty cards avoid fabricated quotes.
    case 'manuscript.chapter.diagnose': return { diagnosticCards: [] };
    case 'novel.chapter_editor.rewrite_candidates': return { candidates: [1, 2].map(n => ({
      label: `候选${n}`, content: p.operation === 'compress' ? `精简${n}。` : `${p.selectedText}修订${n}。`,
      summary: '保留事实', rationale: '调整表达', riskNotes: [], semanticTags: [] })) };
    default: throw Error(`UNEXPECTED_PROMPT_ASSET:${asset.id}`);
  }
}
require.cache[runnerPath] = { id: runnerPath, filename: runnerPath, loaded: true, exports: {
  runStructuredPrompt: async request => {
    calls.push(request);
    const output = intercept ? await intercept(request) : mockOutput(request);
    return { output: request.asset.outputSchema.parse(output) };
  },
} };
const { prisma } = require('../dist/db/prisma');
const { ensureRuntimeDatabaseReady } = require('../dist/db/runtimeMigrations');
const basePath = '../dist/modules/novel/manuscript/application/';
const { ManuscriptImportService } = require(basePath + 'ManuscriptImportService');
const { ManuscriptBaselineService, registerManuscriptBaselineTask } = require(basePath + 'ManuscriptBaselineService');
const { ManuscriptRevisionService, registerManuscriptRevisionTasks } = require(basePath + 'ManuscriptRevisionService');
const { ManuscriptWorkspaceService, takeManuscriptSnapshot } = require(basePath + 'ManuscriptWorkspaceService');
const { ManuscriptTaskService } = require(basePath + 'ManuscriptTasks');
const { OutlineProjectService } = require('../dist/modules/planning/outline/application/OutlineProjectService');
const { OutlineRepository } = require('../dist/modules/planning/outline/infrastructure/OutlineRepository');
const imports = new ManuscriptImportService(), baselines = new ManuscriptBaselineService();
const revisions = new ManuscriptRevisionService(), workspace = new ManuscriptWorkspaceService();
const tasks = new ManuscriptTaskService(), outlines = new OutlineProjectService(new OutlineRepository(prisma));
let sequence = 0;
const key = () => `revision-test-${++sequence}`;
test.before(async () => { await ensureRuntimeDatabaseReady(); registerManuscriptBaselineTask(); registerManuscriptRevisionTasks(); });
test.beforeEach(() => { calls = []; intercept = undefined; });
test.after(() => prisma.$disconnect());
// Keep the temporary database for diagnosis; no destructive cleanup or existing database access.

async function fixture(parts = ['第一章\r\n😀来信放在桌上。\r\n', '第二章\r\n她走进雾港寻找母亲。\r\n', `第三章\r\n${ending}`]) {
  const text = parts.join(''), imported = await imports.create({ bytes: Buffer.from(text), title: key(), requestKey: key() });
  let start = 0;
  const units = parts.map((part, i) => { const unit = { draftId: `unit-${i}`, title: `第${i + 1}章`, role: 'body', needsReview: false, range: { start, end: start + part.length } }; start += part.length; return unit; });
  const partition = await imports.partition(imported.sessionId, 1, imported.sourceHash, units);
  const book = await imports.confirm(imported.sessionId, partition.version, imported.sourceHash, partition.coverage.coverageHash, key(), key());
  return { ...imported, ...book, text, parts, units: (await workspace.get(imported.projectId)).units };
}
async function base(f, index = 1) {
  const s = await takeManuscriptSnapshot(prisma, f.projectId, f.units[index].id);
  return { expectedStructureVersion: s.structureVersion, baseUnitRevision: s.unitRevision, baseContentHash: s.contentHash,
    baselineOutlineRevisionId: s.baselineRevisionId, baseWorkingOutlineRevisionId: s.workingRevisionId, requestKey: key() };
}
async function baselinePreview(f, extra = {}) {
  const p = await baselines.preview(f.projectId, { sourceHash: f.sourceHash, expectedStructureVersion: 1, requestKey: key(), ...extra });
  if (p.status === 'generating') await tasks.execute(p.id);
  return workspace.proposal(f.projectId, p.id);
}
function confirmInput(f, p, candidateRevisionId = p.candidateRevisionId) {
  return { proposalId: p.id, candidateRevisionId, sourceHash: f.sourceHash, coverageHash: p.coverageHash, expectedStructureVersion: 1, requestKey: key() };
}
async function ready() {
  const f = await fixture(), p = await baselinePreview(f);
  const w = await baselines.confirm(f.projectId, confirmInput(f, p));
  assert.equal(w.project.baselineSourceType, 'inferred_from_manuscript');
  return f;
}
async function preview(f, operation = 'polish', selection) {
  const input = { ...await base(f), operation, instruction: '保留事实调整表达', ...(selection ? { selection } : {}) };
  const p = await revisions.rewrite(f.projectId, f.units[1].id, input);
  await tasks.execute(p.id);
  const result = await workspace.proposal(f.projectId, p.id);
  assert.equal(result.status, 'pending', `rewrite task failed: ${JSON.stringify(result)}`);
  return { p: result, input };
}
async function chapterRows(f) { return prisma.chapter.findMany({ where: { novelId: f.novelId }, orderBy: { order: 'asc' } }); }
async function accept(f, p, input) { return revisions.apply(f.projectId, p.id, { ...input, requestKey: key(), candidateId: p.candidates[0].id }); }

test('full >24k UTF-16 source reaches final twist with literal evidence and complete persisted coverage', async () => {
  const f = await fixture(['第一章\r\n' + '😀雾中来信。'.repeat(4100), '第二章\r\n' + '寻找线索。'.repeat(1500), `第三章\r\n${ending}`]);
  assert.ok(f.text.length > 24000);
  const before = await chapterRows(f), p = await baselinePreview(f);
  assert.equal(p.status, 'pending'); assert.equal(p.sourceType, 'inferred_from_manuscript');
  assert.equal(p.coverage.completedChunks, p.coverage.totalChunks);
  assert.deepEqual(new Set(p.coverage.coveredUnitIds), new Set(f.units.map(x => x.id)));
  const extracts = calls.filter(x => x.asset.id === 'manuscript.chapter.extract');
  assert.equal(extracts.length, p.coverage.totalChunks);
  assert.equal(extracts.map(x => x.promptInput.sourceText).join(''), f.text);
  for (const { quote, range } of p.evidence) assert.equal(f.text.slice(range.start, range.end), quote);
  assert.ok(p.evidence.some(x => x.quote === ending));
  assert.equal(p.document.story.endingDirection, ending);
  assert.ok(calls.find(x => x.asset.id === 'manuscript.outline.verify').promptInput.lastChapterEvidence.includes(ending));
  assert.deepEqual(await chapterRows(f), before);
});

test('author baseline and inferred baseline retain distinct labels; corrected exact A1 revision freezes independently of latest and working', async () => {
  const f = await fixture(), author = await outlines.create('作者原纲');
  const doc = structuredClone(author.document); doc.story.endingDirection = '作者明确结局';
  const saved = await outlines.save(author.project.id, 1, doc);
  const p = await baselinePreview(f, { sourceType: 'author_provided', outlineProjectId: author.project.id, outlineRevisionId: saved.revision.id });
  assert.equal(calls.length, 0); assert.equal(p.sourceType, 'author_provided');
  const corrected = structuredClone(p.document); corrected.story.endingDirection = 'A1人工校正的结局';
  const correction = await outlines.save(p.outlineProjectId, 1, corrected);
  const later = structuredClone(corrected); later.story.endingDirection = '不能偷换为latest';
  await outlines.save(p.outlineProjectId, 2, later);
  const w = await baselines.confirm(f.projectId, confirmInput(f, p, correction.revision.id));
  assert.equal(w.project.baselineOutlineRevisionId, correction.revision.id);
  assert.equal(w.project.baselineSourceType, 'author_provided', 'A1 manual correction must preserve the author-provided baseline provenance');
  assert.notEqual(w.project.workingOutlineProjectId, p.outlineProjectId);
  const working = await outlines.get(w.project.workingOutlineProjectId);
  assert.equal(working.document.story.endingDirection, corrected.story.endingDirection);
  working.document.story.endingDirection = '独立工作纲'; await outlines.save(working.id, working.currentVersion, working.document);
  await outlines.save(p.outlineProjectId, 3, later);
  assert.equal((await workspace.get(f.projectId)).project.baselineOutlineRevisionId, correction.revision.id);
  assert.equal(JSON.parse((await prisma.outlineRevision.findUniqueOrThrow({ where: { id: correction.revision.id } })).documentJson).story.endingDirection, corrected.story.endingDirection);
});

test('baseline rejects foreign outline revision and foreign proposal without freezing either project', async () => {
  const a = await fixture(), b = await fixture(), pa = await baselinePreview(a), pb = await baselinePreview(b);
  await assert.rejects(() => baselines.confirm(a.projectId, confirmInput(a, pa, pb.candidateRevisionId)), /MANUSCRIPT_NOT_FOUND/);
  await assert.rejects(() => baselines.confirm(a.projectId, confirmInput(a, pb)), /MANUSCRIPT_NOT_FOUND/);
  const author = await outlines.create('作者');
  await assert.rejects(() => baselinePreview(a, { sourceType: 'author_provided', outlineProjectId: author.project.id, outlineRevisionId: pb.candidateRevisionId }), /MANUSCRIPT_NOT_FOUND/);
  assert.equal((await workspace.get(a.projectId)).project.baselineOutlineRevisionId, null);
});

test('diagnosis is read-only and cannot be adopted as prose', async () => {
  const f = await ready(), before = await chapterRows(f), input = await base(f);
  const p = await revisions.diagnose(f.projectId, f.units[1].id, input); await tasks.execute(p.id);
  assert.equal((await workspace.proposal(f.projectId, p.id)).status, 'pending');
  assert.deepEqual(await chapterRows(f), before);
  await assert.rejects(() => revisions.apply(f.projectId, p.id, { ...input, candidateId: 'fabricated' }), /REVISION_BASE_STALE/);
});

for (const operation of ['custom', 'expand', 'compress', 'selection']) test(`${operation} preview is read-only; candidateId adoption preserves other chapter hashes`, async () => {
  const f = await ready(), before = await chapterRows(f), body = before[1].content;
  const selection = operation === 'selection' ? { from: 5, to: body.length - 2, text: body.slice(5, -2) } : undefined;
  const { p, input } = await preview(f, operation === 'selection' ? 'polish' : operation, selection);
  assert.deepEqual(await chapterRows(f), before);
  await assert.rejects(() => revisions.apply(f.projectId, p.id, { ...input, candidateId: 'client-forged-content' }), /MANUSCRIPT_CANDIDATE_INVALID/);
  assert.deepEqual(await chapterRows(f), before);
  const receipt = await accept(f, p, input), after = await chapterRows(f);
  assert.equal(after[1].content, p.candidates[0].content); assert.equal(receipt.afterHash, hash(after[1].content));
  for (const i of [0, 2]) assert.equal(hash(after[i].content), hash(before[i].content));
  if (selection) { assert.ok(after[1].content.startsWith(body.slice(0, 5))); assert.ok(after[1].content.endsWith(body.slice(-2))); }
});

for (const change of ['current', 'previous', 'working']) test(`${change} dependency change rejects stale adoption without altering saved prose`, async () => {
  const f = await ready(), { p, input } = await preview(f);
  if (change === 'working') {
    const w = await workspace.get(f.projectId), o = await outlines.get(w.project.workingOutlineProjectId);
    o.document.story.theme = '变化后的主题'; await outlines.save(o.id, o.currentVersion, o.document);
  } else { const i = change === 'current' ? 1 : 0; await revisions.manualSave(f.projectId, f.units[i].id, { ...await base(f, i), content: `人工修改${change}` }); }
  const before = await chapterRows(f);
  assert.equal((await workspace.proposal(f.projectId, p.id)).status, 'stale');
  await assert.rejects(() => accept(f, p, input), /REVISION_BASE_STALE/);
  assert.deepEqual(await chapterRows(f), before);
});

test('apply replays exactly once and competing tabs cannot overwrite the winning candidate', async () => {
  const f = await ready(), a = await preview(f), b = await preview(f);
  const input = { ...a.input, candidateId: a.p.candidates[0].id, requestKey: key() };
  const first = await revisions.apply(f.projectId, a.p.id, input), rows = await chapterRows(f);
  assert.equal((await revisions.apply(f.projectId, a.p.id, input)).replayed, true);
  await assert.rejects(() => revisions.apply(f.projectId, a.p.id, { ...input, candidateId: a.p.candidates[1].id }), /REQUEST_KEY_CONFLICT/);
  await assert.rejects(() => accept(f, b.p, b.input), /REVISION_BASE_STALE/);
  assert.deepEqual(await chapterRows(f), rows);
  assert.equal(rows[1].content, first.afterContent);
});

test('foreign project cannot read or adopt a chapter proposal; simultaneous tabs produce one winner', async () => {
  const f = await ready(), other = await ready(), a = await preview(f), b = await preview(f);
  await assert.rejects(() => workspace.proposal(other.projectId, a.p.id), /MANUSCRIPT_NOT_FOUND/);
  await assert.rejects(() => revisions.apply(other.projectId, a.p.id, { ...a.input, candidateId: a.p.candidates[0].id }), /MANUSCRIPT_NOT_FOUND/);
  const results = await Promise.allSettled([accept(f, a.p, a.input), accept(f, b.p, b.input)]);
  assert.equal(results.filter(x => x.status === 'fulfilled').length, 1);
  assert.equal((await workspace.get(f.projectId, f.units[1].id)).currentUnit.workingRevision, 2);
  const winner = results.find(x => x.status === 'fulfilled').value;
  assert.equal((await chapterRows(f))[1].content, winner.afterContent);
});

test('durable cancellation discards a late model response without pending result or chapter mutation', async () => {
  const f = await ready(), before = await chapterRows(f);
  let release, entered;
  const started = new Promise(resolve => { entered = resolve; });
  intercept = request => new Promise(resolve => { release = () => resolve(mockOutput(request)); entered(); });
  const p = await revisions.rewrite(f.projectId, f.units[1].id, { ...await base(f), operation: 'polish', instruction: '调整' });
  const execution = tasks.execute(p.id); await started;
  try { await tasks.cancel(f.projectId, p.id); } finally { release(); }
  await execution;
  const row = await prisma.manuscriptRevisionProposal.findUniqueOrThrow({ where: { id: p.id } });
  assert.equal(row.status, 'rejected'); assert.equal(JSON.parse(row.operationsJson).candidates, undefined);
  assert.deepEqual(await chapterRows(f), before);
});

test('failed baseline retries persisted checkpoints without rereading completed original chunks', async () => {
  const f = await fixture(['第一章\r\n' + '雨中线索。'.repeat(2600), `第二章\r\n${ending}`]);
  let extracts = 0;
  intercept = request => { if (request.asset.id === 'manuscript.chapter.extract' && ++extracts === 2) throw Error('injected model failure'); return mockOutput(request); };
  const p = await baselinePreview(f);
  assert.equal(p.status, 'failed'); assert.equal(p.coverage.completedChunks, 1);
  const completedRange = calls.find(x => x.asset.id === 'manuscript.chapter.extract').promptInput.sourceRange;
  calls = []; intercept = undefined;
  await tasks.retry(f.projectId, p.id, 100); await tasks.execute(p.id);
  const retried = await workspace.proposal(f.projectId, p.id);
  assert.equal(retried.status, 'pending'); assert.equal(retried.coverage.completedChunks, retried.coverage.totalChunks);
  assert.equal(calls.some(x => x.asset.id === 'manuscript.chapter.extract' && x.promptInput.sourceRange.start === completedRange.start), false);
});

test('manual save CAS, replay and undo afterHash protect later edits', async () => {
  const f = await ready(), before = (await chapterRows(f))[1].content, input = { ...await base(f), content: '人工确认内容' };
  const receipt = await revisions.manualSave(f.projectId, f.units[1].id, input);
  assert.equal((await revisions.manualSave(f.projectId, f.units[1].id, input)).replayed, true);
  await assert.rejects(() => revisions.manualSave(f.projectId, f.units[1].id, { ...input, requestKey: key(), content: '旧页覆盖' }), /REVISION_BASE_STALE/);
  await assert.rejects(() => revisions.undo(f.projectId, receipt.id, { expectedStructureVersion: 1, expectedAfterHash: hash('错误'), requestKey: key() }), /REVISION_BASE_STALE/);
  const undoInput = { expectedStructureVersion: 1, expectedAfterHash: receipt.afterHash, requestKey: key() };
  await revisions.undo(f.projectId, receipt.id, undoInput);
  assert.equal((await chapterRows(f))[1].content, before);
  assert.equal((await revisions.undo(f.projectId, receipt.id, undoInput)).replayed, true);
  const later = await revisions.manualSave(f.projectId, f.units[1].id, { ...await base(f), content: '下一次保存' });
  await revisions.manualSave(f.projectId, f.units[1].id, { ...await base(f), content: '后续人工编辑' });
  await assert.rejects(() => revisions.undo(f.projectId, later.id, { expectedStructureVersion: 1, expectedAfterHash: later.afterHash, requestKey: key() }), /REVISION_BASE_STALE/);
  assert.equal((await chapterRows(f))[1].content, '后续人工编辑');
});

test('more than ten adoptions preserve original Source bytes, baseline and restore preview', async () => {
  const f = await ready(), source = await prisma.manuscriptSource.findUniqueOrThrow({ where: { id: f.sourceId } });
  const baselineId = (await workspace.get(f.projectId)).project.baselineOutlineRevisionId;
  for (let i = 0; i < 11; i++) { const { p, input } = await preview(f); await accept(f, p, input); }
  const w = await workspace.get(f.projectId, f.units[1].id);
  assert.equal(w.currentUnit.workingRevision, 12); assert.equal(w.currentUnit.originalText, f.parts[1]);
  assert.equal(w.project.baselineOutlineRevisionId, baselineId);
  assert.deepEqual(await prisma.manuscriptSource.findUniqueOrThrow({ where: { id: f.sourceId } }), source);
  const before = await chapterRows(f), p = await revisions.restore(f.projectId, f.units[1].id, await base(f));
  assert.equal(p.candidates[0].content, f.parts[1]); assert.deepEqual(await chapterRows(f), before);
});

test('manual save receipt failure rolls back chapter and both synchronization obligations', async () => {
  const f = await ready(), input = { ...await base(f), content: '人工保存应当原子提交' }, before = await transactionState(f);
  await prisma.$executeRawUnsafe("CREATE TRIGGER fail_manual_receipt BEFORE INSERT ON ManuscriptRevisionProposal WHEN NEW.kind = 'manual_save' BEGIN SELECT RAISE(ABORT, 'manual receipt injected fault'); END");
  try {
    await assert.rejects(() => revisions.manualSave(f.projectId, f.units[1].id, input));
    assert.deepEqual(await transactionState(f), before);
  } finally { await prisma.$executeRawUnsafe('DROP TRIGGER fail_manual_receipt'); }
  await revisions.manualSave(f.projectId, f.units[1].id, input);
  assert.equal((await chapterRows(f))[1].content, input.content);
});

async function transactionState(f) {
  return { chapters: await chapterRows(f), units: await prisma.manuscriptUnit.findMany({ where: { projectId: f.projectId }, orderBy: { id: 'asc' } }),
    proposals: await prisma.manuscriptRevisionProposal.findMany({ where: { projectId: f.projectId }, orderBy: { id: 'asc' } }),
    checkpoints: await prisma.chapterArtifactSyncCheckpoint.findMany({ where: { novelId: f.novelId }, orderBy: { id: 'asc' } }),
    jobs: await prisma.novelSideEffectJob.findMany({ where: { novelId: f.novelId }, orderBy: { id: 'asc' } }) };
}
for (const fault of [
  { table: 'Chapter', event: 'UPDATE' },
  { table: 'ChapterArtifactSyncCheckpoint', event: 'INSERT', when: "WHEN NEW.artifactType = 'manual_chapter_sync:v1'" },
  { table: 'ChapterArtifactSyncCheckpoint', event: 'INSERT', when: "WHEN NEW.artifactType = 'timeline_finalization'" },
  { table: 'NovelSideEffectJob', event: 'INSERT' },
  { table: 'ManuscriptRevisionProposal', event: 'UPDATE', when: "WHEN NEW.status = 'applied'" },
]) test(`adoption rolls back body, unit, receipt and sync obligations at ${fault.table}/${fault.when || fault.event}`, async () => {
  const f = await ready(), { p, input } = await preview(f), before = await transactionState(f);
  await prisma.$executeRawUnsafe(`CREATE TRIGGER fail_revision BEFORE ${fault.event} ON "${fault.table}" ${fault.when || ''} BEGIN SELECT RAISE(ABORT, 'revision injected fault'); END`);
  try {
    await assert.rejects(() => accept(f, p, input));
    assert.deepEqual(await transactionState(f), before, 'all transaction participants must roll back');
  } finally { await prisma.$executeRawUnsafe('DROP TRIGGER fail_revision'); }
  await accept(f, p, input);
  const state = await transactionState(f);
  assert.ok(state.checkpoints.some(x => x.artifactType === 'manual_chapter_sync:v1' && x.status === 'pending'));
  assert.ok(state.checkpoints.some(x => x.artifactType === 'timeline_finalization' && x.status === 'pending'));
  assert.ok(state.jobs.some(x => x.jobType === 'chapter.manualSync'));
  assert.ok(state.jobs.some(x => x.jobType === 'chapter.timelineFinalization'));
});


test('literal tokenizer special strings remain losslessly covered rather than rejected', async () => {
  const text = '第一章\n她写下 <|endoftext|> 与 <|fim_prefix|>，这些只是原稿字面量。';
  const f = await fixture([text]);
  const { manuscriptExtractionChunks } = require(basePath + 'ManuscriptBaselineService');
  const chunks = manuscriptExtractionChunks(await prisma.manuscriptUnit.findMany({where:{projectId:f.projectId}}), text);
  assert.equal(chunks.map(chunk => chunk.text).join(''), text);
  assert.equal(chunks.at(-1).range.end, text.length);
});

test('earlier manual save supersedes later running/succeeded artifacts and extracted timeline, not planned facts', async () => {
  const f = await fixture(), chapterId = f.units[1].chapterId;
  const rows = await Promise.all(['running', 'succeeded'].map((status, i) => prisma.chapterArtifactSyncCheckpoint.create({data:{
    novelId:f.novelId,chapterId,contentHash:hash(f.parts[1]),artifactType:`regression_${i}`,syncMode:'manual',status,
  }})));
  const event = {novelId:f.novelId,chapterId,chapterIndex:2,eventOrder:1,title:'旧上下文事件',summary:'旧上下文',type:'plot',status:'occurred',visibility:'public'};
  const extracted = await prisma.storyTimelineEvent.create({data:{...event,source:'chapter_extraction'}});
  const planned = await prisma.storyTimelineEvent.create({data:{...event,source:'planned'}});
  await revisions.manualSave(f.projectId,f.units[0].id,{...await base(f,0),content:'第一章\n更新后的前文。'});
  for(const row of rows)assert.equal((await prisma.chapterArtifactSyncCheckpoint.findUnique({where:{id:row.id}})).status,'superseded');
  assert.equal((await prisma.storyTimelineEvent.findUnique({where:{id:extracted.id}})).status,'superseded');
  assert.equal((await prisma.storyTimelineEvent.findUnique({where:{id:planned.id}})).status,'occurred');
  assert.equal((await prisma.chapter.findUnique({where:{id:chapterId}})).content,f.parts[1]);
});

test('late timeline commit cannot write unchanged later body with superseded previous working context', async () => {
  const f=await fixture(),chapterId=f.units[1].chapterId;
  const { TimelineFinalizationStore }=require('../dist/modules/timeline/persistence/TimelineFinalizationStore');
  const {withCurrentTimelineContent,TimelineContentVersionError}=require('../dist/modules/timeline/persistence/chapterVersion');
  const store=new TimelineFinalizationStore(),version={novelId:f.novelId,chapterId,content:f.parts[1],manuscriptVersion:await store.captureManuscriptVersion(f.novelId,chapterId)};
  let committed=false;
  await withCurrentTimelineContent(version,async()=>{});
  await revisions.manualSave(f.projectId,f.units[0].id,{...await base(f,0),content:'前章重新修订，后章正文未改。'});
  await assert.rejects(()=>withCurrentTimelineContent(version,async()=>{committed=true;}),TimelineContentVersionError);
  assert.equal(committed,false);
  assert.equal((await prisma.chapter.findUnique({where:{id:chapterId}})).content,f.parts[1]);
});
