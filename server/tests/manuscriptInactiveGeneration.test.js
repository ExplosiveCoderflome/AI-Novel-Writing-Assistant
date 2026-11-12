const test=require('node:test');const assert=require('node:assert/strict');const {GenerationContextAssembler}=require('../dist/services/novel/runtime/GenerationContextAssembler');const {batchContextCache}=require('../dist/services/novel/runtime/BatchContextCache');const {prisma}=require('../dist/db/prisma');const workspace=require('../dist/modules/novel/manuscript/application/ManuscriptWorkspaceService');test('inactive manuscript generation rejects as a recoverable HTTP409 before planning or model calls',async()=>{const old={novel:batchContextCache.getNovelRow,chapter:prisma.chapter.findFirst,active:workspace.readActiveManuscriptChapters};batchContextCache.getNovelRow=async()=>({id:'n',title:'原稿'});prisma.chapter.findFirst=async()=>({id:'disabled',order:-1});workspace.readActiveManuscriptChapters=async()=>[];try{await assert.rejects(new GenerationContextAssembler().assemble('n','disabled',{}),e=>e.statusCode===409&&/停用/.test(e.message)&&/恢复/.test(e.message));}finally{batchContextCache.getNovelRow=old.novel;prisma.chapter.findFirst=old.chapter;workspace.readActiveManuscriptChapters=old.active;}});

const { createChapterExecutionPreparationService } = require('../dist/services/novel/production/preparation/ChapterExecutionPreparationService');
const { chapterTimelineFinalizationService } = require('../dist/services/novel/runtime/ChapterTimelineFinalizationService');
const { plannerService } = require('../dist/services/planner/PlannerService');
for (const status of ['inactive', 'active', null]) {
  test(`production preparation admission ${status ? `denies ${status} manuscript chapters before timeline or uncached planning` : 'preserves ordinary unbound generation'}`, async () => {
    const old = { project: prisma.manuscriptProject.findUnique, timeline: chapterTimelineFinalizationService.ensureBeforeGeneration, planner: plannerService.ensureChapterPlan };
    let timelineCalls = 0, plannerCalls = 0;
    prisma.manuscriptProject.findUnique = async ({ where, select }) => {
      assert.deepEqual(where, { novelId: 'novel' });
      assert.deepEqual(select, { id: true });
      return status ? { id: 'manuscript' } : null;
    };
    chapterTimelineFinalizationService.ensureBeforeGeneration = async () => { timelineCalls++; };
    plannerService.ensureChapterPlan = async () => { plannerCalls++; return { id: 'plan' }; };
    try {
      const run = createChapterExecutionPreparationService().prepare('novel', 'chapter', {});
      if (status) await assert.rejects(run, e => e.statusCode === 409 && /原稿修订工作区/.test(e.message));
      else assert.equal((await run).planId, 'plan');
      assert.equal(timelineCalls, status ? 0 : 1);
      assert.equal(plannerCalls, status ? 0 : 1);
    } finally {
      prisma.manuscriptProject.findUnique = old.project;
      chapterTimelineFinalizationService.ensureBeforeGeneration = old.timeline;
      plannerService.ensureChapterPlan = old.planner;
    }
  });
}
