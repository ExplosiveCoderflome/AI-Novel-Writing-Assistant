const {candidate} = require('./contractFixture.cjs');
function fixture() {
  const {buildVolumeWorkspaceDocument} = require('../../../dist/services/novel/volume/volumeWorkspaceDocument');
  const source = candidate({chapterId: 'chapter-1', chapterOrder: 1});
  const chapter = {...source, id: 'chapter-1', order: 1, content: '', taskSheet: null, sceneCards: null,
    expectation: '核实证据', chapterStatus: 'unplanned', generationState: null, repairHistory: null,
    qualityScore: null, continuityScore: null, characterScore: null, pacingScore: null, riskFlags: null,
    hook: '新的疑问', createdAt: new Date('2026-10-23T00:00:00Z'), updatedAt: new Date('2026-10-23T00:00:00Z')};
  const workspace = buildVolumeWorkspaceDocument({novelId: source.novelId, source: 'volume', activeVersionId: 'version-1',
    volumes: [{id: source.volumeId, sortOrder: 1, title: '第一卷', openPayoffs: [], status: 'active',
      chapters: [{...source, id: 'volume-chapter-1', chapterId: chapter.id}]}]});
  const generatedDocument = structuredClone(workspace);
  generatedDocument.volumes[0].chapters[0].taskSheet += '\n补充执行指导。';
  const captures = {};
  const deps = {storyMacroPlanService: {getPlan: async () => null},
    styleBindingService: {resolveForGeneration: async () => null},
    ensureVolumeWorkspace: async () => structuredClone(workspace),
    findVolumeChapterMatch: () => ({volumeId: source.volumeId, volumeChapterId: 'volume-chapter-1'}),
    ensureActiveVersionRecord: async (...args) => {captures.version = args.slice(1); return {versionId: 'version-1', version: 1};},
    emitVolumeUpdated: (...args) => {captures.event = args;}};
  const db = {chapter: {findFirst: async () => chapter, updateMany: async () => ({count: 1}), update: async input => {
    captures.chapter = input; return {...chapter, ...input.data};
  }}, volumePlan: {findMany: async () => []}, volumePlanVersion: {findMany: async () => [], update: async input => {captures.versionUpdate = input;}}};
  const ports = {db, readWorkspace: deps.ensureVolumeWorkspace,
    resolveStyleContract: async () => null, reviewContinuity: async () => {throw Error('unexpected continuity request');},
    generateDocument: async input => {captures.generation = input; return structuredClone(generatedDocument);}};
  function install(t) {
    const restore = [];
    function patch(object, key, value) {const original = object[key]; object[key] = value; restore.push(() => {object[key] = original;});}
    patch(require('../../../dist/db/prisma').prisma.chapter, 'findFirst', db.chapter.findFirst);
    patch(require('../../../dist/services/novel/volume/volumeGenerationOrchestrator'), 'generateVolumePlanDocument', ports.generateDocument);
    const persistence = require('../../../dist/services/novel/volume/volumeWorkspacePersistence');
    patch(persistence, 'runVolumeWorkspaceTransaction', async work => work(db));
    patch(persistence, 'persistActiveVolumeWorkspace', async (...args) => {captures.workspace = args.slice(1);});
    t.after(() => restore.reverse().forEach(run => run()));
  }
  return {chapter, workspace, generatedDocument, deps, db, ports, captures, install};
}
function view(value) {return JSON.parse(JSON.stringify(value));}
module.exports = {fixture, view};
