const {StyleCompiler}=require('../../../dist/services/styleEngine/StyleCompiler');
const layered=require('../../../dist/prompting/prompts/novel/chapterLayeredContext');
function writeContext(){return{
 bookContract:layered.buildBookContractContext({title:'测试书',hardConstraints:['保留人物身份'],narrativePov:'third_person'}),
 macroConstraints:null,volumeWindow:null,lengthBudget:null,participants:[],
 chapterMission:{chapterId:'chapter-1',chapterOrder:1,title:'城门',objective:'交出钥匙',expectation:'返回',hookTarget:'约定',mustAdvance:[],mustPreserve:[],riskNotes:[]},
 nextAction:'write_chapter',chapterStateGoal:null,protectedSecrets:['隐藏身份'],payoffDirectives:[],characterHardFacts:[{characterId:'hero',name:'阿青',prohibitions:[],pendingReviewFields:[]}],
 characterBehaviorGuides:[],activeRelationStages:[],pendingCandidateGuards:[],openConflictSummaries:[],ledgerPendingItems:[],ledgerUrgentItems:[],ledgerOverdueItems:[],
 ledgerSummary:null,timelineContext:null,characterResourceContext:null,recentChapterSummaries:[],previousChapterTail:null,styleContract:null,
 styleConstraints:[],continuationConstraints:[],ragFacts:[],completedMilestones:[],recentScenePatterns:[],localStateSummary:'城门前',openingAntiRepeatHint:'',
};}
function input(styled=false){
 const pkg={chapter:{id:'chapter-1',title:'城门',order:1},previousChapterContent:'前章完整正文',canonicalState:null,openAuditIssues:[],postGenerationStyleReviewEnabled:styled};
 if(styled){
  pkg.styleContext={compiledBlocks:new StyleCompiler().compile({styleProfile:{narrativeRules:{},characterRules:{},languageRules:{},rhythmRules:{}},
   antiAiRules:[{id:'report-only',name:'仅提示规则',type:'forbidden',severity:'high',enabled:true,autoRewrite:false,promptInstruction:'避免解释心理'}],appliedRuleIds:['report-only'],globalAntiAiRuleIds:['report-only']})};
  pkg.styleSignalPolicy=require('../../../../shared/dist/types/styleEngine').createStyleSignalPolicy();
  pkg.bookContract={narrativePov:'third_person'};
  const write=writeContext();write.styleContract=pkg.styleContext.compiledBlocks.contract;
  pkg.chapterReviewContext=layered.buildChapterReviewContext(write,pkg);
 }
 return{novelId:'novel-1',chapterId:'chapter-1',novelTitle:'测试书',chapterTitle:'城门',chapterOrder:1,content:'  阿青交出钥匙。\n他意识到必须返回。  ',contextPackage:pkg,provider:'openai',model:'fixture-model',persist:false};
}
function patchInput(styled=false){
 const write=writeContext(),issues=[{severity:'high',category:'coherence',evidence:'缺少承接',fixSuggestion:'补充动作'}];
 return{novelId:'novel-1',chapterId:'chapter-1',novelTitle:'测试书',chapterTitle:'城门',content:'阿青交出钥匙。',issues,repairMode:'light_repair',provider:'openai',model:'fixture-model',
  ...(styled?{runtimePackage:{context:{chapterRepairContext:{writeContext:write,issues,worldRules:['钥匙只能交出一次'],allowedEditBoundaries:['仅改必要句段'],structureObligations:[],historicalIssues:[]}},
   audit:{openIssues:[{id:'audit-1',code:'plot-gap'},{id:'style-1',code:'voice-gap'}]},obligationCoverage:{missing:[{kind:'must_preserve',summary:'钥匙归属'}]},
   styleReview:{report:{violations:[{issueCode:'voice-gap',layer:'surface',canAutoRewrite:true},{issueCode:'report-only',layer:'narrative',canAutoRewrite:false}]}}}}:{})};
}
module.exports={input,patchInput};
