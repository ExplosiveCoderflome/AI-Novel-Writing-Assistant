import type {DirectorWorldMaterials} from "@ai-novel/shared/types/director/workspace";
import {AssetSection,NamedAsset,SavedFields,SavedList} from "./sections";

export function WorldDetail({world}: {world: DirectorWorldMaterials | null}) {
  if (!world) return <p className="py-5 text-sm leading-7 text-muted-foreground">本书尚未保存世界设定。世界规则、势力与地点会在这里展示。</p>;
  const {structure,storySlice} = world;
  const forces = new Map(structure?.forces.map(item => [item.id,item.name]));
  const factions = new Map(structure?.factions.map(item => [item.id,item.name]));
  const locations = new Map(structure?.locations.map(item => [item.id,item.name]));
  const names = (ids: string[] | undefined, table: Map<string,string>) => ids?.map(id => table.get(id) ?? "归属待核对").join("、");
  const relationCount = (structure?.relations.forceRelations.length ?? 0) + (structure?.relations.locationControls.length ?? 0) + (structure?.relations.locationConnections?.length ?? 0);
  const layers = world.legacyLayers;
  const legacyFields: [string,string|null|undefined][] = layers ? [
    ["世界背景",layers.background],["地理环境",layers.geography],["力量体系",layers.magicSystem],["权力与制度",layers.politics],
    ["文化与生活",layers.cultures],["种族",layers.races],["信仰",layers.religions],["技术",layers.technology],
    ["历史",layers.history],["经济",layers.economy],["阵营资料",layers.factions],["冲突",layers.conflicts],["规则资料",layers.axioms],
  ] : [];
  return <div className="divide-y divide-border/40">
    <section className="space-y-4 py-5">
      <p className="text-xs text-muted-foreground">{world.source === "novel" ? "本书专属设定" : world.source === "library" ? "关联世界资料" : "已保存的世界资料"}</p>
      {world.warnings?.map(warning => <p key={warning} role="alert" className="text-sm leading-7 text-destructive">{warning}</p>)}
      <SavedFields fields={[["世界概况",world.summary],["世界特色",structure?.profile.identity],["故事氛围",structure?.profile.tone],["核心冲突",structure?.profile.coreConflict]]}/>
      <SavedList label="主题" items={structure?.profile.themes}/>
      <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground" aria-label="世界资料数量">
        <span>核心规则 {structure?.rules.axioms.length ?? 0}</span><span>阵营 {structure?.factions.length ?? 0}</span>
        <span>势力 {structure?.forces.length ?? 0}</span><span>地点 {structure?.locations.length ?? 0}</span>
      </div>
    </section>
    <AssetSection title="世界规则与代价" count={structure?.rules.axioms.length ?? 0} open>
      {structure?.rules.summary ? <p className="whitespace-pre-wrap text-sm leading-7">{structure.rules.summary}</p> : null}
      {structure?.rules.axioms.map(rule => <NamedAsset key={rule.id} name={rule.name}><SavedFields fields={[
        ["规则说明",rule.summary],["使用代价",rule.cost],["不可越过的边界",rule.boundary],["规则如何生效",rule.enforcement],
      ]}/></NamedAsset>)}
      {!structure?.rules.axioms.length ? <p className="text-sm text-muted-foreground">尚未保存核心规则。</p> : null}
      <SavedList label="世界禁忌" items={structure?.rules.taboo}/><SavedList label="共同后果" items={structure?.rules.sharedConsequences}/>
    </AssetSection>
    <AssetSection title="阵营与势力" count={(structure?.factions.length ?? 0)+(structure?.forces.length ?? 0)}>
      {structure?.factions.map(faction => <NamedAsset key={faction.id} name={faction.name}>
        <SavedFields fields={[["阵营立场",faction.position],["信念与主张",faction.doctrine],["代表势力",names(faction.representativeForceIds,forces)]]}/>
        <SavedList label="目标" items={faction.goals}/><SavedList label="行事方式" items={faction.methods}/>
      </NamedAsset>)}
      {structure?.forces.map(force => <NamedAsset key={force.id} name={force.name}>
        <SavedFields fields={[["势力概况",force.summary],["所属阵营",force.factionId ? factions.get(force.factionId) ?? "归属待核对" : null],
          ["势力类型",force.type],["力量基础",force.baseOfPower],["当前目标",force.currentObjective],["给人物的压力",force.pressure],
          ["故事作用",force.narrativeRole],["领导者",force.leader],["控制地点",names(force.controlledLocationIds,locations)]]}/>
        <SavedList label="掌握的资源" items={force.resources}/>
      </NamedAsset>)}
      {!structure?.factions.length && !structure?.forces.length ? <p className="text-sm text-muted-foreground">尚未保存阵营与势力。</p> : null}
    </AssetSection>
    <AssetSection title="地点与通行" count={structure?.locations.length ?? 0}>
      {structure?.locations.map(location => <NamedAsset key={location.id} name={location.name}><SavedFields fields={[
        ["地点概况",location.summary],["所在区域",location.region],["地形",location.terrain],["故事用途",location.narrativeFunction],
        ["人物面临的风险",location.risk],["进入条件",location.entryConstraint],["离开代价",location.exitCost],
        ["控制势力",names(location.controllingForceIds,forces)],
      ]}/></NamedAsset>)}
      {!structure?.locations.length ? <p className="text-sm text-muted-foreground">尚未保存故事地点。</p> : null}
    </AssetSection>
    <AssetSection title="关系与冲突" count={relationCount}>
      {structure?.relations.forceRelations.map(relation => <NamedAsset key={relation.id} name={`${forces.get(relation.sourceForceId) ?? "势力待核对"} → ${forces.get(relation.targetForceId) ?? "势力待核对"}`}>
        <SavedFields fields={[["双方关系",relation.relation],["冲突张力",relation.tension],["关系说明",relation.detail]]}/>
      </NamedAsset>)}
      {structure?.relations.locationControls.map(relation => <NamedAsset key={relation.id} name={`${forces.get(relation.forceId) ?? "势力待核对"} · ${locations.get(relation.locationId) ?? "地点待核对"}`}>
        <SavedFields fields={[["控制关系",relation.relation],["关系说明",relation.detail]]}/>
      </NamedAsset>)}
      {structure?.relations.locationConnections?.map(relation => <NamedAsset key={relation.id} name={`${locations.get(relation.sourceLocationId) ?? "地点待核对"} → ${locations.get(relation.targetLocationId) ?? "地点待核对"}`}>
        <SavedFields fields={[["通行方式",relation.connectionType],["距离",relation.distanceHint],["故事用途",relation.narrativeUse]]}/>
      </NamedAsset>)}
      {!relationCount ? <p className="text-sm text-muted-foreground">尚未保存地点或势力之间的关系。</p> : null}
    </AssetSection>
    <AssetSection title="本书使用范围" open>
      {storySlice ? <>
        <p className="text-xs leading-6 text-muted-foreground">已保存的写作范围，用于说明本书选用的规则、势力和地点。</p>
        <SavedFields fields={[["本书舞台",storySlice.coreWorldFrame],["可展开的范围",storySlice.storyScopeBoundary]]}/>
        {storySlice.appliedRules.map(rule => <NamedAsset key={rule.id} name={rule.name}><SavedFields fields={[["规则",rule.summary],["对本书的影响",rule.whyItMatters]]}/></NamedAsset>)}
        {storySlice.activeForces.map(force => <NamedAsset key={force.id} name={force.name}><SavedFields fields={[["本书作用",force.roleInStory],["施压方式",force.pressure],["势力概况",force.summary]]}/></NamedAsset>)}
        {storySlice.activeLocations.map(location => <NamedAsset key={location.id} name={location.name}><SavedFields fields={[["剧情用途",location.storyUse],["风险",location.risk],["地点概况",location.summary]]}/></NamedAsset>)}
        {storySlice.activeElements.map(element => <NamedAsset key={element.id} name={element.label}><SavedFields fields={[["用途与说明",element.summary]]}/></NamedAsset>)}
        <SavedList label="可展开冲突" items={storySlice.conflictCandidates}/><SavedList label="压力来源" items={storySlice.pressureSources}/>
        <SavedList label="悬念来源" items={storySlice.mysterySources}/><SavedList label="故事发展方向" items={storySlice.suggestedStoryAxes}/>
        <SavedList label="适合切入的事件" items={storySlice.recommendedEntryPoints}/><SavedList label="不可使用的搭配" items={storySlice.forbiddenCombinations}/>
      </> : <p className="text-sm leading-7 text-muted-foreground">尚未保存本书使用范围。已有世界设定可在上方查阅。</p>}
    </AssetSection>
    {legacyFields.some(([,value]) => value?.trim()) ? <AssetSection title="其他已保存背景资料"><SavedFields fields={legacyFields}/></AssetSection> : null}
  </div>;
}
