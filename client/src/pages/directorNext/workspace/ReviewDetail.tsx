import {parseChapterScenePlan} from "@ai-novel/shared/types/chapterLengthControl";
import type {SavedReview} from "./review";
import type {WorkspaceBook} from "./model";

function Field({label,value}:{label:string;value?:string|number|null}) {
  return value ? <section className="py-3"><h3 className="mb-2 text-sm font-medium text-muted-foreground">{label}</h3><p className="whitespace-pre-wrap leading-8">{value}</p></section> : null;
}
function Scenes({value,targetWordCount}:{value?:string|null;targetWordCount?:number|null}) {
  const plan=parseChapterScenePlan(value,{targetWordCount});
  if (!plan) return <Field label="场景安排" value={value}/>;
  return <section className="py-3"><h3 className="text-sm font-medium">场景安排 · {plan.scenes.length} 场</h3>{plan.scenes.map((scene,index)=><section key={scene.key} className="mt-4 border-t border-border/40 pt-4">
    <h4 className="font-medium">{index+1}. {scene.title}</h4>
    <Field label="场景目标" value={scene.purpose}/><Field label="必须推进" value={scene.mustAdvance.join("\n")}/><Field label="保留内容" value={scene.mustPreserve.join("\n")}/>
    <Field label="入场状态" value={scene.entryState}/><Field label="离场状态" value={scene.exitState}/><Field label="阻力" value={scene.resistance}/><Field label="转折" value={scene.turn}/><Field label="情绪变化" value={scene.emotionalShift}/><Field label="读者收获" value={scene.readerValue}/><Field label="避免扩展" value={scene.forbiddenExpansion.join("\n")}/><Field label="目标字数" value={scene.targetWordCount}/>
  </section>)}</section>;
}

export function ReviewDetail({book,review}:{book:WorkspaceBook;review:SavedReview}) {
  const chapter=review.plan ?? review.execution;
  return <article className="mx-auto max-w-[42rem] px-2 pb-8 sm:px-6" aria-label="本阶段创作结果">
    <p className="mb-3 text-xs text-muted-foreground">查看本阶段结果</p><h2 className="mb-4 text-2xl font-semibold">{review.label}</h2>
    {review.error ? <p role="alert" className="text-sm text-destructive">{review.error}</p> : review.notice ? <p role="status" className="text-sm leading-6 text-muted-foreground">{review.notice}</p> : <>
      {chapter ? <><h3 className="mb-3 text-lg font-medium">第 {review.plan?.chapterOrder ?? review.execution?.order} 章 · {chapter.title}</h3>
        {review.plan ? <><Field label="章节概要" value={review.plan.summary}/><Field label="剧情目标" value={review.plan.purpose}/><Field label="核心事件" value={review.plan.exclusiveEvent}/><Field label="结尾状态" value={review.plan.endingState}/></> : null}
        <Field label="章节任务" value={chapter.taskSheet}/><Field label="目标字数" value={chapter.targetWordCount}/><Field label="需要避免" value={chapter.mustAvoid}/><Scenes value={chapter.sceneCards} targetWordCount={chapter.targetWordCount}/><Field label="写法约定" value={review.plan?.styleContract}/>
      </> : null}
      {review.type === "character_cast" ? book.materials.characters.map(person=><section key={person.id} className="border-t border-border/40 py-4"><h3 className="text-lg font-medium">{person.name}</h3><Field label="角色身份" value={person.role}/><Field label="性格设定" value={person.personality}/><Field label="故事作用" value={person.storyFunction}/><Field label="行动目标" value={person.currentGoal}/></section>) : null}
      {review.type === "volume_strategy" ? <>
        <Field label="读者收获的推进" value={book.planning?.strategyPlan?.readerRewardLadder}/><Field label="冲突推进" value={book.planning?.strategyPlan?.escalationLadder}/><Field label="中段变化" value={book.planning?.strategyPlan?.midpointShift}/><Field label="规划说明" value={book.planning?.strategyPlan?.notes}/>
        {book.planning?.volumes.map(volume=><section key={volume.id} className="border-t border-border/40 py-4"><h3 className="text-lg font-medium">{volume.title}</h3><Field label="本卷故事" value={volume.summary}/><Field label="开篇抓手" value={volume.openingHook}/><Field label="读者期待" value={volume.mainPromise}/><Field label="主要压力" value={volume.primaryPressureSource}/><Field label="本卷看点" value={volume.coreSellingPoint}/><Field label="推进方式" value={volume.escalationMode}/><Field label="主角变化" value={volume.protagonistChange}/><Field label="中段风险" value={volume.midVolumeRisk}/><Field label="本卷高潮" value={volume.climax}/><Field label="本卷兑现" value={volume.payoffType}/><Field label="下卷引线" value={volume.nextVolumeHook}/><Field label="重新出发" value={volume.resetPoint}/><Field label="待兑现内容" value={volume.openPayoffs?.join("\n")}/></section>)}
      </> : null}
      {review.chapters?.map(row=><section key={row.id} className="border-t border-border/40 py-5"><h3 className="mb-4 text-lg font-medium">第 {row.order} 章 · {row.title}</h3><p className="whitespace-pre-wrap font-serif leading-8">{row.content}</p></section>)}
    </>}
  </article>;
}
