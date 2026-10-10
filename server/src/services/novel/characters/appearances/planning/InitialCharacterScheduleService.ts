import type {LLMProvider} from "@ai-novel/shared/types/llm";
import type {InitialCharacterScheduleResult} from "@ai-novel/shared/types/director/characterAppearances";
import {prisma} from "../../../../../db/prisma";
import {withSqliteRetry} from "../../../../../db/sqliteRetry";
import {AppError} from "../../../../../middleware/errorHandler";
import {assertNovelDirectorVersion} from "../../../../../modules/novel/director-routing";
import {runStructuredPrompt} from "../../../../../prompting/core/promptRunner";
import {characterInitialSchedulePrompt} from "../../../../../prompting/prompts/novel/characterInitialSchedule.prompts";
import {readInitialScheduleDocument} from "./InitialScheduleDocument";

const fillingBooks=new Set<string>();
const terminalStatuses=["completed","failed","cancelled"];

export class InitialCharacterScheduleService {
  async fill(novelId:string, input:{provider:LLMProvider;model:string}):Promise<InitialCharacterScheduleResult> {
    if(fillingBooks.has(novelId)) throw new AppError("本书正在补齐角色出场安排，请等待完成。",409);
    fillingBooks.add(novelId);
    try {return await this.fillOnce(novelId,input);} finally {fillingBooks.delete(novelId);}
  }

  private async fillOnce(novelId:string, input:{provider:LLMProvider;model:string}):Promise<InitialCharacterScheduleResult> {
    await assertNovelDirectorVersion(novelId,"v2");
    const [novel,snapshot,run,executionChapters]=await Promise.all([
      prisma.novel.findUniqueOrThrow({where:{id:novelId},select:{title:true,directorEpoch:true,
        characters:{orderBy:{id:"asc"},select:{id:true,name:true,role:true,castRole:true}}}}),
      readInitialScheduleDocument(novelId),
      prisma.directorNextRun.findFirst({where:{novelId},orderBy:[{createdAt:"desc"},{id:"desc"}],include:{control:true}}),
      prisma.chapter.findMany({where:{novelId,OR:[
        {AND:[{content:{not:null}},{content:{not:""}}]},
        {storyPlans:{some:{level:"chapter",status:{not:"stale"},participantsJson:{not:null}}}},
      ]},select:{order:true}}),
    ]);
    if(run?.control && (!terminalStatuses.includes(run.control.status) || (run.control.leaseExpiresAt && run.control.leaseExpiresAt>new Date()))) {
      throw new AppError("请先等待本书创作结束，再补齐角色出场安排。",409);
    }
    if(!snapshot) throw new AppError("请先保存章节规划，再补齐角色出场安排。",409);
    const all=snapshot.document.volumes.flatMap(volume=>volume.chapters.map(chapter=>({...chapter,
      volumeTitle:volume.title,volumeSummary:volume.summary ?? null}))).sort((a,b)=>a.chapterOrder-b.chapterOrder);
    const prepared=new Set(executionChapters.map(chapter=>chapter.order));
    const missing=all.filter(chapter=>chapter.plannedCharacterIds===undefined && !chapter.taskSheet?.trim()
      && !chapter.sceneCards?.trim() && !prepared.has(chapter.chapterOrder));
    const targets=missing.slice(0,24);
    if(!targets.length) return {updated:0,remaining:0};
    if(!novel.characters.length) throw new AppError("请先准备角色资料，再安排角色出场。",409);
    const generated=await runStructuredPrompt({asset:characterInitialSchedulePrompt,promptInput:{
      title:novel.title,characters:novel.characters,
      chapters:targets.map(chapter=>({id:chapter.id,chapterOrder:chapter.chapterOrder,title:chapter.title,
        summary:chapter.summary,beatKey:chapter.beatKey,volumeTitle:chapter.volumeTitle,volumeSummary:chapter.volumeSummary})),
      neighbors:all.filter(chapter=>chapter.plannedCharacterIds!==undefined
        && chapter.chapterOrder>=targets[0].chapterOrder-3 && chapter.chapterOrder<=targets[targets.length-1].chapterOrder+3)
        .map(chapter=>({chapterOrder:chapter.chapterOrder,plannedCharacterIds:chapter.plannedCharacterIds!})),
    },options:{...input,temperature:0.25,maxTokens:Math.min(4800,600+targets.length*170),
      novelId,taskId:run?.id,stage:"character_initial_schedule",scope:"character_initial_schedule",
      itemKey:"character_initial_schedule",entrypoint:"director_next"}});
    const requested=new Set(targets.map(chapter=>chapter.id));
    const validIds=new Set(novel.characters.map(character=>character.id));
    if(generated.output.chapters.length!==targets.length || new Set(generated.output.chapters.map(chapter=>chapter.planId)).size!==targets.length
      || generated.output.chapters.some(chapter=>!requested.has(chapter.planId) || new Set(chapter.plannedCharacterIds).size!==chapter.plannedCharacterIds.length
        || chapter.plannedCharacterIds.some(id=>!validIds.has(id)))) throw new AppError("角色出场安排不完整或包含其他书籍角色，请重新补齐。",422);
    const assignments=new Map(generated.output.chapters.map(chapter=>[chapter.planId,chapter.plannedCharacterIds]));
    const next={...snapshot.document,volumes:snapshot.document.volumes.map(volume=>({...volume,
      chapters:volume.chapters.map(chapter=>assignments.has(chapter.id)?{...chapter,plannedCharacterIds:assignments.get(chapter.id)}:chapter)}))};
    await withSqliteRetry(()=>prisma.$transaction(async tx=>{
      const lock=await tx.novel.updateMany({where:{id:novelId,directorEpoch:novel.directorEpoch},data:{directorEpoch:{increment:0}}});
      if(lock.count!==1) throw new AppError("本书创作归属已变化，请刷新后再补齐。",409);
      await assertNovelDirectorVersion(novelId,"v2",novel.directorEpoch,tx);
      const currentRun=await tx.directorNextRun.findFirst({where:{novelId},orderBy:[{createdAt:"desc"},{id:"desc"}],include:{control:true}});
      if(currentRun?.id!==run?.id || currentRun?.control?.status!==run?.control?.status || currentRun?.control?.version!==run?.control?.version
        || (currentRun?.control?.leaseExpiresAt && currentRun.control.leaseExpiresAt>new Date())) {
        throw new AppError("本书创作状态已变化，请等待创作结束再补齐。",409);
      }
      const currentVersion=await tx.volumePlanVersion.findFirst({where:{novelId,status:"active"},orderBy:[{version:"desc"},{id:"desc"}],select:{id:true}});
      if(currentVersion?.id!==snapshot.version.id) throw new AppError("本书规划版本已变化，请刷新后再补齐。",409);
      const ids=await tx.character.findMany({where:{novelId,id:{in:[...new Set(generated.output.chapters.flatMap(chapter=>chapter.plannedCharacterIds))]}},select:{id:true}});
      if(generated.output.chapters.some(chapter=>chapter.plannedCharacterIds.some(id=>!ids.some(character=>character.id===id)))) throw new AppError("角色资料已变化，请刷新后再补齐。",409);
      const saved=await tx.volumePlanVersion.updateMany({where:{id:snapshot.version.id,novelId,status:"active",contentJson:snapshot.version.contentJson},data:{contentJson:JSON.stringify(next)}});
      if(saved.count!==1) throw new AppError("本书规划已变化，请刷新后再补齐。",409);
    }),{label:"director_v2.initial_character_schedule"});
    return {updated:targets.length,remaining:missing.length-targets.length};
  }
}

export const initialCharacterScheduleService=new InitialCharacterScheduleService();
