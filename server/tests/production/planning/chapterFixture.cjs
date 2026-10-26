const {prisma}=require('../../../dist/db/prisma');
function fixture(){
 const now=new Date('2026-10-23T00:00:00.000Z');
 const novel={id:'novel-1',title:'城门约定',description:'阿青守住承诺',outline:'送还钥匙',structuredOutline:null,estimatedChapterCount:8,
  genre:{name:'悬疑'},targetAudience:'大众',bookSellingPoint:'承诺与秘密',competingFeel:null,first30ChapterPromise:null,narrativePov:'third_person',
  pacePreference:'moderate',emotionIntensity:'medium',styleTone:'克制',primaryStoryMode:null,secondaryStoryMode:null};
 const chapter={id:'chapter-1',title:'城门',order:1,expectation:'交出钥匙并约定返回',content:'',targetWordCount:2400,conflictLevel:3,revealLevel:2,
  mustAvoid:'不提前揭晓身份',hook:'返回前的疑问',taskSheet:'交出钥匙',sceneCards:null,updatedAt:now};
 const characters=[{id:'hero',name:'阿青',role:'主角',currentGoal:'送还钥匙',currentState:'城门前'}];
 const snapshot={novelId:'novel-1',sourceSnapshotId:null,scopeLabel:'chapter',bookContract:{title:'城门约定',genre:'悬疑',targetAudience:'大众',sellingPoint:'承诺与秘密',first30ChapterPromise:null,toneGuardrails:[],hardConstraints:[]},worldState:null,
  characters:[],narrative:{currentChapterId:'chapter-1',currentChapterOrder:1,currentChapterGoal:'交出钥匙',openConflicts:[],pendingPayoffs:[],urgentPayoffs:[],overduePayoffs:[],publicKnowledge:['钥匙尚未归还'],hiddenKnowledge:['真实身份'],suspenseThreads:['何时返回']},timeline:[],createdAt:now.toISOString()};
 const stateContext={snapshot,nextAction:'write_chapter',chapterStateGoal:null,localCharacters:[],localConflicts:[],localPayoffs:[],recentTimeline:[],protectedSecrets:['真实身份']};
 const payoff={summary:{totalCount:0,pendingCount:0,urgentCount:0,overdueCount:0,paidOffCount:0,failedCount:0,updatedAt:null},items:[],updatedAt:null};
 const state={models:0,persisted:0,payoffError:false};
 const db={novel:{findUnique:async()=>novel},chapter:{findFirst:async()=>chapter},novelBible:{findUnique:async()=>({rawContent:'钥匙只能交出一次'})},
  plotBeat:{findMany:async()=>[]},chapterSummary:{findMany:async()=>[]},character:{findMany:async()=>characters},volumePlan:{findMany:async()=>[]},auditReport:{findMany:async()=>[]},
  creativeDecision:{findMany:async()=>[]},storyMacroPlan:{findUnique:async()=>null},stateChangeProposal:{count:async()=>0}};
 const output={title:'城门交接',goal:'完成钥匙交接',participants:['阿青','陌生人'],reveals:['守卫认识钥匙'],riskNotes:['保留身份秘密'],hookTarget:'何时返回',planRole:'progress',phaseLabel:'开篇',mustAdvance:['交出钥匙'],mustPreserve:['身份保密'],
  scenes:[{title:'抵达',sceneGoal:'出示钥匙',conflict:'守卫盘问',reveal:'守卫认出钥匙',emotionBeat:'紧张'},{title:'交接',sceneGoal:'交出钥匙',conflict:'要求承诺',reveal:'约定返回',emotionBeat:'克制'},{title:'离开',sceneGoal:'留下约定',conflict:'不说明身份',reveal:'守卫等待',emotionBeat:'悬疑'}]};
 const deps={db,readBookPlan:async()=>null,listArcPlans:async()=>[],resolveStyleSummary:async()=> '无',readDynamics:async()=>null,buildStateContext:async()=>stateContext,
  readPayoff:async()=>{if(state.payoffError)throw Error('ledger source unavailable');return payoff},strictSources:true};
 function install(t){
  const restores=[];const patch=(object,key,value)=>{const original=object[key];object[key]=value;restores.push(()=>object[key]=original)};
  for(const [table,methods]of Object.entries(db))for(const [method,fn]of Object.entries(methods))patch(prisma[table],method,fn);
  const query=require('../../../dist/services/planner/query').plannerPlanQueryService;
  patch(query,'getBookPlan',deps.readBookPlan);patch(query,'listArcPlans',deps.listArcPlans);
  patch(require('../../../dist/services/novel/production/ContextAssemblyService').contextAssemblyService,'build',deps.buildStateContext);
  patch(require('../../../dist/services/payoff/PayoffLedgerSyncService').payoffLedgerSyncService,'getPayoffLedger',deps.readPayoff);
  patch(require('../../../dist/services/novel/dynamics/CharacterDynamicsQueryService').characterDynamicsQueryService,'getOverview',deps.readDynamics);
  patch(require('../../../dist/services/styleEngine/StyleBindingService').StyleBindingService.prototype,'resolveForGeneration',async()=>{throw Error('no style binding')});
  const captured={};patch(require('../../../dist/prompting/core/promptRunner'),'runStructuredPrompt',async request=>{state.models++;captured.request=view(request);return{output}});
  patch(require('../../../dist/services/planner/plannerPersistence'),'persistStoryPlan',async input=>{state.persisted++;captured.persist=JSON.parse(JSON.stringify(input));return captured.persist});
  t.after(()=>restores.reverse().forEach(restore=>restore()));return captured;
 }
 return{novel,chapter,output,deps,state,install,options:{provider:'openai',model:'fixture-model',temperature:0.3}};
}
function view(request){return JSON.parse(JSON.stringify({assetId:request.asset.id,assetVersion:request.asset.version,promptInput:request.promptInput,contextBlocks:request.contextBlocks,options:request.options}))}
module.exports={fixture,view};
