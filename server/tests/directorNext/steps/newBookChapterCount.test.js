const test=require('node:test');
const assert=require('node:assert/strict');
const {loadRuntimeSource}=require('../../novelProduction/sourceHarness.cjs');

test('new book and frozen execution share AI recommended count unless the author sets an explicit count', async()=>{
  const created=[],commands=[];
  const {launchNewDirectorBook}=loadRuntimeSource('../../../app/director/newBook.ts',{
    '../../db/prisma':{prisma:{novel:{findUnique:async()=>null,update:async()=>{}}}},
    '../../services/novel/NovelCoreService':{NovelCoreService:class{async createNovel(input){created.push(input);return{id:input.id};}}},
    '../../services/settings/LLMSelectionSettingsService':{getLLMSelectionSettings:async()=>({provider:'deepseek',model:'test'})},
    './services':{getDirectorProductionServices:()=>({http:{commandService:{execute:async c=>{commands.push(c);return{runId:'run'};}}}})},
    '../../middleware/errorHandler':{AppError:Error},
    '../../services/styleEngine/StyleBindingService':{StyleBindingService:class{async ensureNovelDefault(){}}},
    '../../modules/novel/director-routing':{},
  });
  for (const explicit of [undefined,80]) {
    await launchNewDirectorBook({candidate:{workingTitle:'测试',logline:'故事',targetChapterCount:12},idea:'十二章完结',
      runMode:'full_book_autopilot',estimatedChapterCount:explicit},'source','original_opening');
    const count=explicit??12;
    assert.equal(created.at(-1).estimatedChapterCount,count);
    assert.equal(commands.at(-1).launchInput.estimatedChapterCount,count);
    assert.deepEqual(commands.at(-1).launchInput.executionRange,{from:1,to:count});
  }
});
