import {VolumeSummaryText} from "./reading/VolumeSummaryEmphasis";
import {parseChapterScenePlan} from "@ai-novel/shared/types/chapterLengthControl";
import type {SavedReview} from "./review";
import {readableChapter, type WorkspaceBook} from "./model";
import {ReadingDisplaySettings, readingTextStyle, type ReadingDisplayPreferences} from "./reading";
import {OutlinePreparationReview} from "./OutlinePreparationReview";
import {Button} from "@/components/ui/button";
import {AssetSection, SavedFields} from "./assets/sections";

function Field({label,value}:{label:string;value?:string|number|null}) {
  return value != null && value !== "" ? <section className="py-2"><h3 className="mb-1 text-sm font-semibold">{label}</h3><p className="whitespace-pre-wrap break-words text-sm leading-7 text-foreground/80">{value}</p></section> : null;
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

export function ReviewDetail({book,review,readingDisplay,onReadingDisplayChange,onOpenChapter,onEditChapter}:{book:WorkspaceBook;review:SavedReview;readingDisplay:ReadingDisplayPreferences;onReadingDisplayChange:(next:ReadingDisplayPreferences)=>void;onOpenChapter?:(chapterId:string)=>void;onEditChapter?:(chapterId:string)=>void}) {
  const reviewPlans = review.plans ?? (review.plan ? [review.plan] : []);
  const latest = onOpenChapter && !review.chapters?.length
    ? book.chapters.filter(readableChapter).sort((a,b)=>b.order-a.order)[0] : undefined;
  return <article className="mx-auto max-w-[42rem] px-2 pb-8 sm:px-6" aria-label="本阶段创作结果">
    <p className="mb-3 text-xs text-muted-foreground">查看本阶段结果</p>
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-2xl font-semibold">{review.label}</h2>
      {latest ? <Button size="sm" variant="outline" onClick={()=>onOpenChapter?.(latest.id)}>查看最新正文（第 {latest.order} 章）</Button> : null}
      {review.chapters?.length ? <ReadingDisplaySettings preferences={readingDisplay} onChange={onReadingDisplayChange} previewText={review.chapters[0].content}/> : null}
    </div>
    {review.error ? <p role="alert" className="text-sm text-destructive">{review.error}</p> : review.notice ? <p role="status" className="text-sm leading-6 text-muted-foreground">{review.notice}</p> : <>
      <OutlinePreparationReview book={book} review={review}/>
      {reviewPlans.map((chapter,index) => <details open={index===0} key={chapter.id} className="border-t border-border/40 py-3">
        <summary className="cursor-pointer text-lg font-medium">第 {chapter.chapterOrder} 章 · {chapter.title}</summary>
        <div className="py-4"><SavedFields lead fields={[["剧情目标",chapter.purpose],["章节概要",chapter.summary],["核心事件",chapter.exclusiveEvent],["结尾状态",chapter.endingState]]}/></div>
        <Field label="章节任务" value={chapter.taskSheet}/><Field label="目标字数" value={chapter.targetWordCount}/><Field label="需要避免" value={chapter.mustAvoid}/>
        <Scenes value={chapter.sceneCards} targetWordCount={chapter.targetWordCount}/><Field label="写法约定" value={chapter.styleContract}/>
      </details>)}
      {review.executions?.map((execution,index) => <details open={index===0} key={execution.id} className="border-t border-border/40 py-3">
        <summary className="cursor-pointer text-lg font-medium">第 {execution.order} 章 · {execution.title}</summary>
        <Field label="章节任务" value={execution.taskSheet}/><Field label="目标字数" value={execution.targetWordCount}/><Field label="需要避免" value={execution.mustAvoid}/><Scenes value={execution.sceneCards} targetWordCount={execution.targetWordCount}/>
      </details>)}
      {review.type === "character_cast" ? book.materials.characters.map(person=><section key={person.id} className="border-t border-border/40 py-4"><h3 className="text-lg font-medium">{person.name}</h3><Field label="角色身份" value={person.role}/><Field label="性格设定" value={person.personality}/><Field label="故事作用" value={person.storyFunction}/><Field label="行动目标" value={person.currentGoal}/></section>) : null}
      {review.type === "volume_strategy" ? <>
        {book.planning?.strategyPlan ? <AssetSection title="全书推进思路" open={!book.planning.volumes.length}>
          <SavedFields fields={[["读者收获的推进",book.planning.strategyPlan.readerRewardLadder],["冲突推进",book.planning.strategyPlan.escalationLadder],["中段变化",book.planning.strategyPlan.midpointShift],["规划说明",book.planning.strategyPlan.notes]]}/>
        </AssetSection> : null}
        {book.planning?.volumes.map(volume=><section key={volume.id} className="border-t border-border/40 py-4">
          <h3 className="mb-3 text-xl font-semibold">{volume.title}</h3>
          <SavedFields lead fields={[["本卷故事",volume.summary,<VolumeSummaryText id={volume.id} text={volume.summary}/>],["读者期待",volume.mainPromise],["主要压力",volume.primaryPressureSource]]}/>
          <AssetSection title="本卷推进与收束"><SavedFields fields={[["开篇抓手",volume.openingHook],["本卷看点",volume.coreSellingPoint],["推进方式",volume.escalationMode],["主角变化",volume.protagonistChange],["中段风险",volume.midVolumeRisk],["本卷高潮",volume.climax],["本卷兑现",volume.payoffType],["下卷引线",volume.nextVolumeHook],["重新出发",volume.resetPoint],["待兑现内容",volume.openPayoffs?.join("\n")]]}/></AssetSection>
        </section>)}
      </> : null}
      {review.chapters?.map(row=><section key={row.id} className="border-t border-border/40 py-5"><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h3 className="text-lg font-medium">第 {row.order} 章 · {row.title}</h3>{onEditChapter ? <Button size="sm" variant="outline" onClick={()=>onEditChapter(row.id)}>编辑正文</Button> : null}</div><p className="whitespace-pre-wrap break-words leading-[2.15] tracking-wide text-foreground/90" style={readingTextStyle(readingDisplay)}>{row.content}</p></section>)}
    </>}
  </article>;
}
