import type {DirectorCharacterMaterials} from "@ai-novel/shared/types/director/workspace";
import {Button} from "@/components/ui/button";
import {AssetSection,SavedFields} from "./sections";

export function CharacterDetail({character, onCharacter}: {character: DirectorCharacterMaterials; onCharacter: (id:string)=>void}) {
  return <div className="divide-y divide-border/40">
    <section className="space-y-4 py-5"><SavedFields fields={[["角色身份",character.role],["身份标签",character.identityLabel],["所属阵营",character.factionLabel],["立场",character.stanceLabel],["与主角的关系",character.relationToProtagonist],["故事作用",character.storyFunction],["性格设定",character.personality]]}/>
      <Button onClick={()=>onCharacter(character.id)}>查看变化记录</Button><p className="text-xs leading-6 text-muted-foreground">档案展示保存的设定；变化记录可按阅读章节查看。</p>
    </section>
    <AssetSection title="经历与行动动机" open><SavedFields fields={[["人物经历",character.background],["想要达成的目标",character.outerGoal],["内心真正需要什么",character.innerNeed],["恐惧",character.fear],["过去的创伤",character.wound],["错误信念",character.misbelief],["不能越过的底线",character.moralLine]]}/></AssetSection>
    <AssetSection title="外貌与表达方式"><SavedFields fields={[["第一印象",character.firstImpression],["外貌",character.appearance],["体态",character.physique],["衣着",character.attireStyle],["标志性细节",character.signatureDetail],["说话方式",character.voiceTexture],["气质与存在感",character.presenceImpression],["实力",character.powerLevel],["境界",character.realm]]}/></AssetSection>
    <AssetSection title="秘密与后续成长（可能涉及后文）"><SavedFields fields={[["隐藏秘密",character.secret],["成长方向",character.development],["起点",character.arcStart],["中途转折",character.arcMidpoint],["关键抉择",character.arcClimax],["成长终点",character.arcEnd]]}/></AssetSection>
  </div>;
}
