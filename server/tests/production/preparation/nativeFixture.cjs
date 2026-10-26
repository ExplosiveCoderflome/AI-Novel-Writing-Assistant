const {fixture}=require('./fixture.cjs');
async function nativeFixture(t,fault){
 const f=await fixture(t),api=require('../../../dist/app/director/productionKernel');
 const {ChapterExecutionContractService,readExecutionContractWorkspace}=require('../../../dist/services/novel/volume/ChapterExecutionContractService');
 const native=require('../planning/contractServiceFixture.cjs').fixture();
 const planner=require('../planning/chapterFixture.cjs').fixture();
 if(fault!=='reuse_plan'){
  native.workspace.volumes[0].chapters[0].taskSheet=null;
  native.workspace.volumes[0].chapters[0].sceneCards=null;
 }
 native.workspace.beatSheets=[{volumeId:'volume-1',volumeSortOrder:1,status:'generated',beats:[{
   key:'opening',label:'开篇',title:'线索推进',summary:'核对线索后推进调查。',chapterSpanHint:'1-3',mustDeliver:['核实线索来源']}]}];
 await f.db.chapter.update({where:{id:'chapter-1'},data:{taskSheet:null,sceneCards:null}});
 await f.db.volumePlanVersion.create({data:{id:'version-1',novelId:'novel-1',version:1,status:'active',contentJson:JSON.stringify(native.workspace)}});
 await f.db.$transaction(tx=>require('../../../dist/services/novel/volume/volumeWorkspacePersistence').persistActiveVolumeWorkspace(tx,'novel-1',native.workspace,'version-1'));
 if(fault==='reuse_plan'){
  const target=native.workspace.volumes[0].chapters[0];
  const chapter=await f.db.chapter.update({where:{id:'chapter-1'},data:{taskSheet:target.taskSheet,sceneCards:target.sceneCards,
   targetWordCount:target.targetWordCount,conflictLevel:target.conflictLevel,revealLevel:target.revealLevel,mustAvoid:target.mustAvoid}});
  const hash=require('../../../dist/services/planner/plannerPersistence').buildChapterExecutionContractHash(chapter);
  await f.db.storyPlan.create({data:{id:'existing-chapter-plan',novelId:'novel-1',chapterId:'chapter-1',level:'chapter',title:'已有规划',
   objective:'保留已有执行目标',rawPlanJson:JSON.stringify({executionContractHash:hash}),
   scenes:{create:{sortOrder:1,title:'已有场景',objective:'推进证据'}}}});
 }
 const state={fault,models:0,assembly:0,requests:[],descriptors:[]};
 if(['workspace_after_contract','workspace_after_plan'].includes(fault)){
  const apply=f.checkpoints.applyConsumer.bind(f.checkpoints);
  f.checkpoints.applyConsumer=async(claim,write)=>{
   const result=await apply(claim,write);
   const expected=state.fault==='workspace_after_contract'?'prepare:commit:execution_contract':state.fault==='workspace_after_plan'?'prepare:commit:chapter_plan':null;
   if(expected&&claim.identity.step===expected){
    state.fault=null;const row=await f.db.volumePlanVersion.findUniqueOrThrow({where:{id:'version-1'}});
    const document=JSON.parse(row.contentJson);document.volumes[0].summary='人工保留的卷纲修订';
    await f.db.volumePlanVersion.update({where:{id:'version-1'},data:{contentJson:JSON.stringify(document)}});
   }
   return result;
  };
 }
 const contract=new ChapterExecutionContractService({...native.deps,ensureActiveVersionRecord:async()=>({versionId:'version-1',version:1})});
 const plannerInstance=new (require('../../../dist/services/planner/PlannerService').PlannerService)();
 plannerInstance.getChapterPlan=(novelId,chapterId)=>f.db.storyPlan.findFirst({where:{novelId,chapterId,level:'chapter',status:{not:'stale'}},include:{scenes:{orderBy:{sortOrder:'asc'}}},orderBy:{updatedAt:'desc'}});
 const planning=api.createKernelNativePlanningPreparation({db:f.db,contract,
   contractSources:{db:f.db,readWorkspace:id=>readExecutionContractWorkspace(f.db,id),resolveStyleContract:async()=>null},
   storyMacroPlanService:{getPlan:async()=>null},planner:plannerInstance,
   plannerSources:{...planner.deps,db:f.db},request:async run=>({provider:run.snapshots.model.provider,model:run.snapshots.model.model}),
   sourceRoute:()=>'/lab/director/novel-1',assertOwnership:tx=>f.assertOwnership(tx,{executionToken:'lease-1'}),
   assembler:{assemble:async()=>{state.assembly++;if(state.fault==='assembly'){state.fault=null;throw Error('exit before outer prepare receipt');}
     return{novel:{id:'novel-1',title:'测试书'},chapter:{id:'chapter-1',order:1,title:'测试章'},contextPackage:{source:'native preparation fixture'}};}},
   invoke:(_run,steps)=>{const counts=new Map();return async request=>{
     const key=request.asset.id,ordinal=counts.get(key)||0;counts.set(key,ordinal+1);
     const input=JSON.parse(JSON.stringify({assetId:key,version:request.asset.version,promptInput:request.promptInput,contextBlocks:request.contextBlocks,options:request.options}));
     const identity=f.kernel.hashProductionContent(require('../../../dist/modules/production/common').canonicalProductionJson(input));
     state.descriptors.push({identity,input});
     const output=await steps.model(`${key}:${ordinal}`,{identity,input,outputTokens:request.options.maxTokens||4096},async()=>{
       state.models++;state.requests.push(input);
       if(key.includes('chapter_task_sheet_quality'))return require('../planning/contractFixture.cjs').safe;
       if(key.startsWith('planner.'))return planner.output;
       const candidate=require('../planning/contractFixture.cjs').candidate();return{...candidate,sceneCards:JSON.parse(candidate.sceneCards).scenes};
     });
     if(state.fault==='after_models'&&key.startsWith('planner.')){state.fault=null;throw Error('exit after durable native plan result');}
     return{output};
   }},
 });
 const readBaseline=async()=>{const row=await f.db.chapter.findUniqueOrThrow({where:{id:'chapter-1'}});return{content:row.content,updatedAt:row.updatedAt.toISOString(),protectedUserContent:false};};
 const stage=f.kernel.createKernelPreparationStage({...planning,purpose:'automatic',checkpoints:f.checkpoints,executionToken:()=> 'lease-1',readBaseline,fence:async()=>{}});
 const descriptor=await stage.describe(f.run),run={...f.run,artifacts:{...f.run.artifacts,activeDescriptor:descriptor}};
 return{...f,state,stage,run,execute:()=>stage.execute(run,{...descriptor,requestKey:'prepare-request'})};
}
module.exports={nativeFixture};
