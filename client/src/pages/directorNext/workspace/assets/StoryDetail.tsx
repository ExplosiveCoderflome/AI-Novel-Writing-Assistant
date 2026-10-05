import type {DirectorWorkspaceMaterials} from "@ai-novel/shared/types/director/workspace";
import {AssetSection,SavedFields,SavedList} from "./sections";

export function StoryDetail({materials}: {materials: DirectorWorkspaceMaterials}) {
  const {story} = materials;
  return <div className="divide-y divide-border/40">
    <section className="py-5"><SavedFields fields={[["故事简介",materials.description],["核心看点",story.coreSellingPoint],["读者期待",story.readingPromise],["主角带来的体验",story.protagonistFantasy],["开篇方向",story.first30ChapterPromise]]}/></section>
    <AssetSection title="阶段期待与成长路线" open><SavedFields fields={[["前 3 章要兑现什么",story.chapter3Payoff],["前 10 章要兑现什么",story.chapter10Payoff],["前 30 章要兑现什么",story.chapter30Payoff],["冲突如何升级",story.escalationLadder],["重要关系怎样推进",story.relationshipMainline]]}/></AssetSection>
    <AssetSection title="创作边界"><SavedList label="必须遵守的边界" items={story.absoluteRedLines}/>{!story.absoluteRedLines?.length ? <p className="text-sm text-muted-foreground">尚未保存创作边界。</p> : null}</AssetSection>
  </div>;
}
